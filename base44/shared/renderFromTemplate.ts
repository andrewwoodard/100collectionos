// Shared module: render an email from a database-backed EmailTemplate record.
// Used by getEmailPreview (for admin previews) and by sending functions
// (sendPropertyEmail, sendActivationEmail, etc.) at runtime.
//
// Flow:
//   1. Fetch EmailTemplate by slug (status: active)
//   2. Substitute {{variable}} tokens throughout all text fields
//   3. Pass substituted values to buildAdminEmail
//   4. Return { subject, html, text }
//
// If the template is not found, logs a warning and returns a minimal
// error email so admins are alerted.

import { withUtm } from './attribution.ts';

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

function substituteVars(text, context) {
  if (!text) return '';
  return String(text).replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path.trim());
    if (value == null) return '';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  });
}

function substituteDataRows(rows, context) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    label: substituteVars(r.label, context),
    value: substituteVars(r.value == null ? '' : String(r.value), context),
  }));
}

function substituteWhatHappensNext(items, context) {
  if (!Array.isArray(items)) return [];
  return items.map(s => ({
    number: s.number != null ? substituteVars(String(s.number), context) : undefined,
    title: substituteVars(s.title, context),
    body: substituteVars(s.body, context),
  }));
}

function substituteSections(sections, context) {
  if (!Array.isArray(sections)) return [];
  return sections.map(sec => ({
    title: substituteVars(sec.title, context),
    dataRows: substituteDataRows(sec.data_rows || sec.dataRows || [], context),
  }));
}

// Build the buildAdminEmail payload from an EmailTemplate record + context.
// Exported so getEmailPreview can also use it for list/describe operations.
export function buildPayloadFromTemplate(tpl, context) {
  const ctx = context || {};
  return {
    eventType: substituteVars(tpl.event_tag, ctx) || '',
    urgency: tpl.urgency || 'default',
    headline: substituteVars(tpl.headline, ctx) || '',
    subheadline: substituteVars(tpl.subheadline, ctx) || '',
    contextBlock: substituteVars(tpl.context_block, ctx) || '',
    dataRows: substituteDataRows(tpl.data_rows, ctx),
    sections: substituteSections(tpl.sections, ctx),
    callout: substituteVars(tpl.callout, ctx) || '',
    ctaLabel: substituteVars(tpl.cta_label, ctx) || '',
    ctaUrl: substituteVars(tpl.cta_url, ctx) || '',
    secondaryCtaLabel: substituteVars(tpl.secondary_cta_label, ctx) || '',
    secondaryCtaUrl: substituteVars(tpl.secondary_cta_url, ctx) || '',
    footerNote: substituteVars(tpl.footer_note, ctx) || '',
    subject: substituteVars(tpl.subject, ctx) || '',
    heroImage: tpl.hero_image_url || '',
    whatHappensNext: substituteWhatHappensNext(tpl.what_happens_next, ctx),
    socialProof: substituteVars(tpl.social_proof, ctx) || '',
    replyPrompt: tpl.reply_prompt_enabled !== false,
  };
}

// Main entry: render an email from a template slug + context.
// base44 = SDK client (from createClientFromRequest)
// slug = template slug (e.g. 'property-approved')
// context = { partner, property, submission, invoice, application, homeowner, candidate, ... }
export async function renderFromTemplate(base44, slug, context) {
  const ctx = context || {};

  // Fetch the template by slug (active only)
  const templates = await base44.asServiceRole.entities.EmailTemplate.filter({
    slug,
    status: 'active',
  });

  if (!templates || templates.length === 0) {
    console.warn(`[renderFromTemplate] No active EmailTemplate found for slug: ${slug}`);
    return {
      subject: `Template not found: ${slug}`,
      html: `<p>An email template with slug "${slug}" was not found. Please create it in Admin > Email Previews.</p>`,
      text: `Template not found: ${slug}`,
      template_found: false,
    };
  }

  const tpl = templates[0];
  const payload = buildPayloadFromTemplate(tpl, ctx);

  // Auto-tag primary + secondary CTA URLs with UTM params so any signup that
  // follows an email click is attributed back to this template.
  if (payload.ctaUrl) payload.ctaUrl = withUtm(payload.ctaUrl, slug, slug);
  if (payload.secondaryCtaUrl) payload.secondaryCtaUrl = withUtm(payload.secondaryCtaUrl, slug, slug);

  // Call buildAdminEmail to generate the HTML
  const res = await base44.asServiceRole.functions.invoke('buildAdminEmail', payload);
  const data = res?.data || res;

  return {
    subject: payload.subject || payload.headline,
    html: data.html || '',
    text: data.text || '',
    template_found: true,
    template_name: tpl.name,
    template_category: tpl.category,
    template_urgency: tpl.urgency,
    template_description: tpl.description,
  };
}