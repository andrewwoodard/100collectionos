import { getNeonPool, json } from "./neon-db.js";
import { requireAdmin } from "./require-session.js";
import { buildAdminEmail } from "./admin-email.js";

const MOCK_CONTEXT = {
  partner: {
    partner_name: "Test Partner Co",
    primary_contact_name: "Sarah Mitchell",
    primary_contact_email: "sarah@testpartnerco.com",
    market: "Nags Head",
    region: "NC",
  },
  property: {
    property_name: "Test Villa Estate",
    location: "Nags Head, NC",
    location_full: "Nags Head, NC, United States",
    bedrooms: 5,
    bathrooms: 4,
    listing_url: "https://vrbo.com/12345",
    first_photo: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1200&auto=format&fit=crop&q=80",
  },
  submission: {
    revision_message: "Photos need to be higher resolution and better lit. Please resubmit with professional photography.",
    admin_notes: "",
    partner_facing_message: "Photos need to be higher resolution and better lit. Please resubmit with professional photography.",
  },
  invoice: { amount: 498, license_number: "T100-2026-0042", renewal_date: "August 16, 2026" },
  application: {
    first_name: "Sarah",
    last_name: "Mitchell",
    full_name: "Sarah Mitchell",
    email: "sarah@testpartnerco.com",
    company_name: "Test Partner Co",
    submitted_properties_count: 12,
  },
  homeowner: {
    first_name: "Emma",
    home_name: "Windswept Cottage",
    properties: ["Windswept Cottage", "Duneside Villa", "Marsh Wren Retreat"],
    properties_count: 3,
    location: "Cherry Grove Beach, SC",
  },
  candidate: { name: "Jane Applicant", email: "jane.applicant@email.com", job_title: "Guest Services Manager" },
  teammate: { name: "Sarah Mitchell", email: "sarah.mitchell@testpartnerco.com", role: "Marketing" },
  inviter: { name: "Buck Cumbo" },
  reviewed_by: { name: "Buck Cumbo" },
};

const CATEGORY_ORDER = [
  "Partner-facing",
  "Homeowner-facing",
  "Candidate-facing",
  "Invitation acceptance",
  "Admin — Partner actions",
  "Admin — Financial",
  "Admin — Digests",
  "Offboarding",
  "Auto-reply",
];

function sortByCategory(a: any, b: any) {
  const ia = CATEGORY_ORDER.indexOf(a.category);
  const ib = CATEGORY_ORDER.indexOf(b.category);
  if (ia === -1 && ib === -1) return String(a.category || "").localeCompare(String(b.category || ""));
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

function getNestedValue(obj: any, path: string) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function substituteVars(text: unknown, context: any) {
  if (!text) return "";
  return String(text).replace(/\{\{([^}]+)\}\}/g, (_match, path) => {
    const value = getNestedValue(context, String(path).trim());
    if (value == null) return "";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
}

function substituteDataRows(rows: any, context: any) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    label: substituteVars(row.label, context),
    value: substituteVars(row.value == null ? "" : String(row.value), context),
  }));
}

function withUtm(url: string, slug: string) {
  if (!url) return url;
  try {
    const parsed = new URL(url, "https://portal.the100collection.com");
    if (!parsed.searchParams.get("utm_source")) parsed.searchParams.set("utm_source", "email");
    if (!parsed.searchParams.get("utm_medium")) parsed.searchParams.set("utm_medium", slug);
    if (!parsed.searchParams.get("utm_campaign")) parsed.searchParams.set("utm_campaign", slug);
    return parsed.toString();
  } catch {
    return url;
  }
}

function payloadFromTemplate(tpl: any, context: any) {
  const ctx = context || {};
  const payload = {
    eventType: substituteVars(tpl.event_tag, ctx),
    urgency: tpl.urgency || "default",
    headline: substituteVars(tpl.headline, ctx),
    subheadline: substituteVars(tpl.subheadline, ctx),
    contextBlock: substituteVars(tpl.context_block, ctx),
    dataRows: substituteDataRows(tpl.data_rows, ctx),
    sections: (Array.isArray(tpl.sections) ? tpl.sections : []).map((sec: any) => ({
      title: substituteVars(sec.title, ctx),
      dataRows: substituteDataRows(sec.data_rows || sec.dataRows || [], ctx),
      ctaLabel: substituteVars(sec.cta_label || sec.ctaLabel, ctx),
      ctaUrl: substituteVars(sec.cta_url || sec.ctaUrl, ctx),
    })),
    callout: substituteVars(tpl.callout, ctx),
    ctaLabel: substituteVars(tpl.cta_label, ctx),
    ctaUrl: substituteVars(tpl.cta_url, ctx),
    secondaryCtaLabel: substituteVars(tpl.secondary_cta_label, ctx),
    secondaryCtaUrl: substituteVars(tpl.secondary_cta_url, ctx),
    footerNote: substituteVars(tpl.footer_note, ctx),
    subject: substituteVars(tpl.subject, ctx),
    heroImage: tpl.hero_image_url || "",
    whatHappensNext: (Array.isArray(tpl.what_happens_next) ? tpl.what_happens_next : []).map((step: any) => ({
      number: step.number != null ? substituteVars(String(step.number), ctx) : undefined,
      title: substituteVars(step.title, ctx),
      body: substituteVars(step.body, ctx),
    })),
    socialProof: substituteVars(tpl.social_proof, ctx),
    replyPrompt: tpl.reply_prompt_enabled !== false,
  };
  if (payload.ctaUrl) payload.ctaUrl = withUtm(payload.ctaUrl, tpl.slug || "email");
  if (payload.secondaryCtaUrl) payload.secondaryCtaUrl = withUtm(payload.secondaryCtaUrl, tpl.slug || "email");
  return payload;
}

async function listTemplates() {
  const { rows } = await getNeonPool().query(
    `SELECT id, data FROM base44.email_template ORDER BY created_date DESC NULLS LAST LIMIT 200`
  );
  return rows.map((row) => ({ id: row.id, ...(row.data || {}) })).sort(sortByCategory);
}

export async function handleBuildAdminEmail(req: any, res: any, body: any) {
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });
  const built = buildAdminEmail(body || {});
  if (built.error && !built.html) return json(res, 500, built);
  return json(res, 200, built);
}

export async function handleGetEmailPreview(req: any, res: any, body: any) {
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  if (body?.action === "list") {
    const templates = await listTemplates();
    return json(res, 200, {
      variations: templates.map((tpl) => ({
        slug: tpl.slug,
        name: tpl.name,
        category: tpl.category,
        urgency: tpl.urgency,
        description: tpl.description,
        status: tpl.status,
        trigger_function: tpl.trigger_function,
      })),
      total: templates.length,
    });
  }

  const variationSlug = String(body?.variationSlug || "").trim();
  if (!variationSlug) {
    return json(res, 400, { error: 'variationSlug is required (or pass action: "list")' });
  }

  const { rows } = await getNeonPool().query(
    `SELECT id, data FROM base44.email_template
     WHERE data->>'slug' = $1
     ORDER BY created_date DESC NULLS LAST
     LIMIT 1`,
    [variationSlug]
  );
  if (!rows[0]) {
    return json(res, 404, {
      error: `No EmailTemplate found for slug: ${variationSlug}.`,
      slug: variationSlug,
      not_found: true,
    });
  }

  const tpl = { id: rows[0].id, ...(rows[0].data || {}) };
  const payload = payloadFromTemplate(tpl, body?.context || MOCK_CONTEXT);
  const built = buildAdminEmail(payload);
  return json(res, 200, {
    slug: tpl.slug,
    name: tpl.name,
    category: tpl.category,
    urgency: tpl.urgency,
    description: tpl.description,
    status: tpl.status,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });
}
