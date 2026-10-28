import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14';
import { sendResendEmailDirect } from '../../shared/resendEmail.ts';
import { BRAND_DISPLAY_NAME } from '../../shared/brandName.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const partnerName = String(body?.partner_name || '').trim();
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) {
      return Response.json({ error: `No Stripe customer found for ${email}` }, { status: 404 });
    }

    const invoiceList = await stripe.invoices.list({
      customer: customer.id,
      status: 'open',
      limit: 20,
    });
    const openInvoices = invoiceList.data || [];
    if (!openInvoices.length) {
      return Response.json({
        error: 'No open invoices to remind about for this Stripe customer.',
        email,
        customer_id: customer.id,
      }, { status: 400 });
    }

    const resent = [];
    for (const inv of openInvoices) {
      try {
        const sent = await stripe.invoices.sendInvoice(inv.id);
        resent.push({ id: sent.id, number: sent.number || inv.number || null, ok: true });
      } catch (e) {
        resent.push({
          id: inv.id,
          number: inv.number || null,
          ok: false,
          error: e?.message || 'Stripe sendInvoice failed',
        });
      }
    }

    const fmt = (cents) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
    const totalDue = openInvoices.reduce((sum, inv) => sum + (inv.amount_due ?? inv.total ?? 0), 0);
    const greetingName = partnerName || customer.name || 'there';
    const rowsHtml = openInvoices.map((inv) => {
      const label = inv.number || inv.id;
      const amount = fmt(inv.amount_due ?? inv.total ?? 0);
      const link = inv.hosted_invoice_url
        ? `<a href="${inv.hosted_invoice_url}" style="color:#C9A96E;text-decoration:none;font-weight:600;">Pay invoice</a>`
        : '—';
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-family:monospace;font-size:13px;color:#64748B;">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:14px;font-weight:600;color:#0D1B2A;">${amount}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;">${link}</td>
      </tr>`;
    }).join('');

    const content = `
<p style="margin:0 0 16px;">Hi ${greetingName},</p>
<p style="margin:0 0 16px;">This is a friendly reminder that you have <strong>${openInvoices.length}</strong> open invoice${openInvoices.length === 1 ? '' : 's'} with ${BRAND_DISPLAY_NAME} totaling <strong>${fmt(totalDue)}</strong>.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">${rowsHtml}</table>
<p style="margin:0 0 16px;">Please use the pay links above at your earliest convenience. If you have already paid or have questions, just reply to this email.</p>
<p style="margin:0;color:#64748B;font-size:13px;">Sent to your Stripe billing email (${email}).</p>`;

    const text = [
      `Hi ${greetingName},`,
      '',
      `This is a friendly reminder that you have ${openInvoices.length} open invoice(s) with ${BRAND_DISPLAY_NAME} totaling ${fmt(totalDue)}.`,
      '',
      ...openInvoices.map((inv) => {
        const label = inv.number || inv.id;
        const amount = fmt(inv.amount_due ?? inv.total ?? 0);
        return `- ${label}: ${amount}${inv.hosted_invoice_url ? ` — ${inv.hosted_invoice_url}` : ''}`;
      }),
      '',
      'If you have already paid or have questions, just reply to this email.',
    ].join('\n');

    const emailResult = await sendResendEmailDirect(base44, {
      to: email,
      subject: `Payment reminder — ${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}`,
      content,
      text,
    });

    if (!emailResult.ok && !emailResult.skipped) {
      return Response.json({
        error: emailResult.error || 'Failed to send reminder email',
        stripe_resent: resent,
      }, { status: 500 });
    }

    return Response.json({
      ok: true,
      email,
      customer_id: customer.id,
      open_invoice_count: openInvoices.length,
      total_due_cents: totalDue,
      stripe_resent: resent,
      email_skipped: Boolean(emailResult.skipped),
      email_id: emailResult.id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
