import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled daily at 6am. Checks all LicenseRecords for upcoming renewals
// (30/14/7 days out) and expired-but-still-active licenses.
// Fires notifyAdminsLicenseRenewal / notifyAdminsLicenseExpired for each match.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allLicenses = await base44.asServiceRole.entities.LicenseRecord.list('-created_date', 1000);

    const remindersSent = [];
    const expiriesFlagged = [];

    for (const lic of allLicenses) {
      if (!lic.license_end_date) continue;
      const endDate = new Date(lic.license_end_date);
      if (isNaN(endDate.getTime())) continue;

      const msDiff = endDate.getTime() - today.getTime();
      const daysUntil = Math.round(msDiff / (1000 * 60 * 60 * 24));

      const annualFee = typeof lic.annual_fee === 'number' ? lic.annual_fee
        : (typeof lic.base_fee === 'number' ? lic.base_fee : null);

      const common = {
        license_id: lic.id,
        partner_name: lic.partner_name,
        property_name: lic.property_name,
        license_number: lic.license_number,
        annual_fee: annualFee,
        renewal_date: lic.license_end_date,
        auto_renew: !!(lic.transfer_history && lic.transfer_history.length),
      };

      // Upcoming renewals at 30 / 14 / 7 days
      if ([30, 14, 7].includes(daysUntil)) {
        try {
          await base44.functions.invoke('notifyAdminsLicenseRenewal', {
            ...common,
            days_until: daysUntil,
          });
          remindersSent.push({ id: lic.id, days: daysUntil });
        } catch (e) {
          console.warn('[checkUpcomingRenewals] renewal notify failed for', lic.id, e.message);
        }
      }

      // Expired: end date in the past AND still marked active
      if (daysUntil < 0 && lic.license_status === 'active') {
        try {
          await base44.functions.invoke('notifyAdminsLicenseExpired', {
            license_id: lic.id,
            partner_name: lic.partner_name,
            property_name: lic.property_name,
            license_number: lic.license_number,
            expired_on: lic.license_end_date,
            days_overdue: Math.abs(daysUntil),
          });
          expiriesFlagged.push({ id: lic.id, days_overdue: Math.abs(daysUntil) });
        } catch (e) {
          console.warn('[checkUpcomingRenewals] expiry notify failed for', lic.id, e.message);
        }
      }
    }

    const summary = {
      checked: allLicenses.length,
      reminders_sent: remindersSent.length,
      expiries_flagged: expiriesFlagged.length,
      reminders: remindersSent,
      expiries: expiriesFlagged,
    };
    console.log('[checkUpcomingRenewals] done', JSON.stringify(summary));
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});