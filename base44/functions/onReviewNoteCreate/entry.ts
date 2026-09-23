import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { sendTemplatedEmail } from '../../shared/sendTemplatedEmail.ts';

// Fired by entity automation: ReviewNote create.
// When mentioned_user_ids is non-empty, sends a branded email to each mentioned
// user (except the note's own author) via DB-backed EmailTemplate.
// Slug: admin-review-note-mention.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const note = body.data;

    if (!note || !note.mentioned_user_ids || note.mentioned_user_ids.length === 0) {
      return Response.json({ ok: true, skipped: 'no mentions' });
    }

    const subs = await base44.asServiceRole.entities.PropertySubmission.filter({ id: note.submission_id });
    const sub = subs[0];
    if (!sub) {
      return Response.json({ ok: true, skipped: 'submission not found' });
    }

    const propertyName = sub.property_name || 'a property';
    const notePreview = (note.content || '').slice(0, 200);
    const reviewUrl = `https://the100collection.com/admin/review/${note.submission_id}`;

    let notified = 0;

    for (const userId of note.mentioned_user_ids) {
      const users = await base44.asServiceRole.entities.User.filter({ id: userId });
      const user = users[0];
      if (!user) continue;

      // Don't notify the author if they tagged themselves
      if (note.author && user.email && note.author === user.email) continue;

      const dedupKey = `${note.id}__mention__${user.id}`;
      const existing = await base44.asServiceRole.entities.PortalNotification.filter({ dedup_key: dedupKey });
      if (existing.length > 0) continue;

      await base44.asServiceRole.entities.PortalNotification.create({
        recipient_email: user.email,
        recipient_role: 'admin',
        type: 'general',
        title: `You were mentioned on ${propertyName}`,
        message: notePreview,
        submission_id: note.submission_id,
        property_name: propertyName,
        is_read: false,
        dedup_key: dedupKey,
        link: `/admin/hub?tab=submissions&submissionId=${note.submission_id}`,
      });

      const context = {
        property: { property_name: propertyName },
        note: {
          author: note.author || 'Someone',
          preview: notePreview,
        },
        review_url: reviewUrl,
      };

      try {
        await sendTemplatedEmail(base44, 'admin-review-note-mention', context, { to: user.email });
      } catch (e) {
        console.warn(`[onReviewNoteCreate] email failed for ${user.email}:`, e?.message);
      }

      notified++;
    }

    return Response.json({ ok: true, notified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});