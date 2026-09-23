// Client-side variable substitution for live preview.
// Mirrors the server-side substituteVars in renderFromTemplate.ts.

export const MOCK_CONTEXT = {
  partner: {
    partner_name: 'Test Partner Co',
    primary_contact_name: 'Sarah Mitchell',
    primary_contact_email: 'sarah@testpartnerco.com',
    market: 'Nags Head',
    region: 'NC',
  },
  property: {
    property_name: 'Test Villa Estate',
    location: 'Nags Head, NC',
    location_full: 'Nags Head, NC, United States',
    bedrooms: 5,
    bathrooms: 4,
    listing_url: 'https://vrbo.com/12345',
    first_photo: 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1200&auto=format&fit=crop&q=80',
  },
  submission: {
    revision_message: 'Photos need to be higher resolution and better lit.',
    admin_notes: '',
    partner_facing_message: 'Photos need to be higher resolution and better lit.',
  },
  invoice: {
    amount: 498,
    license_number: 'T100-2026-0042',
    renewal_date: 'August 16, 2026',
  },
  application: {
    first_name: 'Sarah',
    last_name: 'Mitchell',
    full_name: 'Sarah Mitchell',
    email: 'sarah@testpartnerco.com',
    company_name: 'Test Partner Co',
    submitted_properties_count: 12,
  },
  homeowner: {
    first_name: 'Emma',
    home_name: 'Windswept Cottage',
    properties: ['Windswept Cottage', 'Duneside Villa', 'Marsh Wren Retreat'],
    properties_count: 3,
    location: 'Cherry Grove Beach, SC',
  },
  candidate: {
    name: 'Jane Applicant',
    email: 'jane.applicant@email.com',
    job_title: 'Guest Services Manager',
  },
  teammate: {
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@testpartnerco.com',
    role: 'Marketing',
  },
  inviter: { name: 'Buck Cumbo' },
  reviewed_by: { name: 'Buck Cumbo' },
};

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function substituteVars(text, context) {
  if (!text) return '';
  return String(text).replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path.trim());
    if (value == null) return '';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  });
}

export function buildPayloadFromForm(formValues, context) {
  const ctx = context || MOCK_CONTEXT;
  const sub = (text) => substituteVars(text, ctx);

  const dataRows = (formValues.data_rows || []).filter(r => r && r.label).map(r => ({
    label: sub(r.label),
    value: sub(r.value == null ? '' : String(r.value)),
  }));

  const whatHappensNext = (formValues.what_happens_next || []).filter(s => s && s.title).map((s, i) => ({
    number: s.number != null ? sub(String(s.number)) : String(i + 1),
    title: sub(s.title),
    body: sub(s.body || ''),
  }));

  const sections = (formValues.sections || []).filter(s => s && s.title).map(sec => ({
    title: sub(sec.title),
    dataRows: (sec.data_rows || sec.dataRows || []).filter(r => r && r.label).map(r => ({
      label: sub(r.label),
      value: sub(r.value == null ? '' : String(r.value)),
    })),
  }));

  return {
    eventType: sub(formValues.event_tag) || '',
    urgency: formValues.urgency || 'default',
    headline: sub(formValues.headline) || '',
    subheadline: sub(formValues.subheadline) || '',
    contextBlock: sub(formValues.context_block) || '',
    dataRows,
    sections,
    callout: sub(formValues.callout) || '',
    ctaLabel: sub(formValues.cta_label) || '',
    ctaUrl: sub(formValues.cta_url) || '',
    secondaryCtaLabel: sub(formValues.secondary_cta_label) || '',
    secondaryCtaUrl: sub(formValues.secondary_cta_url) || '',
    footerNote: sub(formValues.footer_note) || '',
    subject: sub(formValues.subject) || '',
    heroImage: formValues.hero_image_url || '',
    whatHappensNext,
    socialProof: sub(formValues.social_proof) || '',
    replyPrompt: formValues.reply_prompt_enabled !== false,
  };
}