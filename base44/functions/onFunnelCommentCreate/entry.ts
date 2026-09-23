import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Fired by entity automation: FunnelComment create.
// When mentioned_user_ids is non-empty, sends a branded email to each mentioned
// user (except the comment's own author) via DB-backed EmailTemplate.
// Slug: admin-funnel-comment-mention.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const comment = body.data;

    if (!comment || !comment.id) {
      return Response.json({ ok: true, skipped: 'no data' });
    }

    if (!comment.mentioned_user_ids || comment.mentioned_user_ids.length === 0) {
      return Response.json({ ok: true, skipped: 'no mentions' });
    }

    const partnerName = comment.partner_name || 'a partner';
    const commentPreview = (comment.content || '').slice(0, 200);
    const threadUrl = `/PartnerFunnelTracker?partnerId=${comment.partner_id}`;
    const fullUrl = `https://100c-os.base44.app/PartnerFunnelTracker?partnerId=${comment.partner_id}`;

    let notified = 0;

    for (const userId of comment.mentioned_user_ids) {
      const users = await base44.asServiceRole.entities.User.filter({ id: userId });
      const user = users[0];
      if (!user) continue;

      if (comment.author_email && user.email && comment.author_email === user.email) continue;

      const dedupKey = `${comment.id}__mention__${user.id}`;
      const existing = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
      if (existing.length > 0) continue;

      await base44.asServiceRole.entities.PortalNotification.create({
        recipient_email: user.email,
        recipient_role: 'admin',
        type: 'general',
        title: `You were tagged on ${partnerName}`,
        message: commentPreview,
        is_read: false,
        dedup_key: dedupKey,
        link: threadUrl,
      });

      const context = {
        partner: { partner_name: partnerName },
        comment: {
          author_name: comment.author_name || comment.author_email || 'Someone',
          preview: commentPreview,
        },
        thread_url: fullUrl,
      };

      try {
        await sendTemplatedEmail(base44, 'admin-funnel-comment-mention', context, { to: user.email });
      } catch (e) {
        console.warn(`[onFunnelCommentCreate] email failed for ${user.email}:`, e?.message);
      }

      notified++;
    }

    return Response.json({ ok: true, notified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});