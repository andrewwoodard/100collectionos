import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// One-off migration: removes "View listing: {{property.listing_url}}" and
// personal-name signoffs ({{reviewed_by.name}}, {{inviter.name}}, {{admin.name}})
// from EmailTemplate footer_note fields. Run once after updating seedEmailTemplates.
// Idempotent — safe to run multiple times.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const templates = await base44.asServiceRole.entities.EmailTemplate.filter({}, '-created_date', 200);
    const updated = [];

    for (const tpl of templates) {
      if (!tpl.footer_note) continue;

      let newNote = tpl.footer_note;
      const original = newNote;

      // Remove "View listing: {{property.listing_url}}" or "· View listing: ..." portions
      newNote = newNote.replace(/\s*·?\s*View listing:\s*\{\{[^}]+\}\}/g, '');
      newNote = newNote.replace(/\s*·?\s*View listing:\s*\S+/g, '');

      // Replace personal-name signoffs on automated templates
      // {{reviewed_by.name}}, {{inviter.name}}, {{admin.name}} → The 100 Collection Team
      newNote = newNote.replace(/^—\s*\{\{(?:reviewed_by|inviter|admin)\.name\}\}$/g, '— The 100 Collection Team');
      newNote = newNote.replace(/^\{\{(?:reviewed_by|inviter|admin)\.name\}\}$/g, '— The 100 Collection Team');

      // Clean up trailing whitespace/periods left behind
      newNote = newNote.replace(/\.\s*$/g, (match, offset, str) => {
        // Only trim trailing period if it's a double period (leftover from removal)
        return str.slice(0, offset).endsWith('.') ? '' : match;
      });
      newNote = newNote.trim();

      // If footer is "Cheers to the beginning of a great partnership." without a team signoff, add one
      if (newNote === 'Cheers to the beginning of a great partnership.' && !newNote.includes('The 100 Collection Team')) {
        newNote = 'Cheers to the beginning of a great partnership. — The 100 Collection Team';
      }

      if (newNote !== original) {
        await base44.asServiceRole.entities.EmailTemplate.update(tpl.id, {
          footer_note: newNote,
          last_edited_by: user.email,
          last_edited_at: new Date().toISOString(),
        });
        updated.push({ slug: tpl.slug, old: original, new: newNote });
      }
    }

    return Response.json({ ok: true, updated_count: updated.length, updates: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});