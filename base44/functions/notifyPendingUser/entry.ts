import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Called by the /portal/pending page on mount.
// Fires an admin notification (in-app + branded email) exactly once per user.
// Idempotency: sendAdminNotification dedup_key + pending_notification_sent_at on User.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const displayName = user.full_name || user.email;
    const dedupKey = `${user.id}__pending_link`;

    const res = await base44.functions.invoke('sendAdminNotification', {
      eventType: 'NEW USER PENDING',
      template_slug: 'admin-portal-access-request',
      template_context: { user: { full_name: user.full_name, email: user.email, id: user.id } },
      urgency: 'default',
      headline: `${displayName} needs a partner link`,
      subheadline: 'A new user signed up but is not yet linked to a partner.',
      contextBlock: `${displayName} just signed up for The 100 Collection Partner Portal but is not yet linked to a partner. Open Partners to review and assign them.`,
      dataRows: [
        { label: 'Name', value: user.full_name || '—' },
        { label: 'Email', value: user.email },
      ],
      ctaLabel: 'Review in Partners',
      ctaUrl: 'https://100c-os.base44.app/Partners',
      subject: `New user pending — ${user.email}`,
      dedup_key: dedupKey,
      portalNotification: {
        type: 'general',
        title: 'New user pending link',
        message: `${user.email} signed up and needs to be linked to a partner.`,
        link: '/Partners',
      },
    });

    // Mark email as sent on the user record (separate from dedup for resilience)
    if (!res?.data?.skipped) {
      try {
        await base44.asServiceRole.entities.User.update(user.id, {
          pending_notification_sent_at: new Date().toISOString(),
        });
      } catch (e) {
        console.log('Could not set pending_notification_sent_at:', e.message);
      }
    }

    return Response.json({ ok: true, result: res?.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});