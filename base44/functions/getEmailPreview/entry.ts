import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { renderFromTemplate, buildPayloadFromTemplate } from '../../shared/renderFromTemplate.ts';
import { MOCK_CONTEXT } from '../../shared/emailTemplateMockContext.ts';

// Email template preview generator.
// Reads from the EmailTemplate entity (database-backed) so edits in the
// admin UI are immediately reflected in previews.
//
// Two modes:
//   { action: 'list' }  → returns { variations: [{ slug, name, category, urgency, description, status }] }
//   { variationSlug }   → returns { subject, html, text, category, urgency, description }
//
// If the EmailTemplate entity has no records (not yet seeded), returns an
// empty list so the admin UI can prompt to run the seed function.

const CATEGORY_ORDER = [
  'Partner-facing',
  'Homeowner-facing',
  'Candidate-facing',
  'Invitation acceptance',
  'Admin — Partner actions',
  'Admin — Financial',
  'Admin — Digests',
  'Offboarding',
  'Auto-reply',
];

function sortByCategory(a, b) {
  const ia = CATEGORY_ORDER.indexOf(a.category);
  const ib = CATEGORY_ORDER.indexOf(b.category);
  if (ia === -1 && ib === -1) return a.category.localeCompare(b.category);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // List mode: return the catalog of variations from the entity
    if (body.action === 'list') {
      const templates = await base44.asServiceRole.entities.EmailTemplate.filter({}, '-created_date', 200);
      const sorted = (templates || []).sort(sortByCategory);
      return Response.json({
        variations: sorted.map(t => ({
          slug: t.slug,
          name: t.name,
          category: t.category,
          urgency: t.urgency,
          description: t.description,
          status: t.status,
          trigger_function: t.trigger_function,
        })),
        total: sorted.length,
      });
    }

    const { variationSlug } = body;
    if (!variationSlug) {
      return Response.json({ error: 'variationSlug is required (or pass action: "list")' }, { status: 400 });
    }

    // Preview mode: fetch the template and render it with mock context
    const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ slug: variationSlug }, '-created_date', 1);

    if (!templates || templates.length === 0) {
      return Response.json({
        error: `No EmailTemplate found for slug: ${variationSlug}. Run the seedEmailTemplates function to create templates.`,
        slug: variationSlug,
        not_found: true,
      }, { status: 404 });
    }

    const tpl = templates[0];

    // If archived, still render but flag it
    const result = await renderFromTemplate(base44, variationSlug, MOCK_CONTEXT);

    return Response.json({
      slug: tpl.slug,
      name: tpl.name,
      category: tpl.category,
      urgency: tpl.urgency,
      description: tpl.description,
      status: tpl.status,
      subject: result.subject,
      html: result.html,
      text: result.text,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}