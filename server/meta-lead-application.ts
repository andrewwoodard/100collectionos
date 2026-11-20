import { getNeonPool, json, readBody } from "./neon-db.js";
import {
  asString,
  mapMainSiteApplication,
  pickField,
  saveInboundApplication,
  secretsMatch,
} from "./main-site-application.js";

/**
 * Meta (Facebook / Instagram) Instant Form leads -> CMS Applications area,
 * delivered by a Zapier "Webhooks by Zapier -> POST" step.
 *
 * Auth:   X-Webhook-Secret: <META_LEAD_WEBHOOK_SECRET>   (or Authorization: Bearer <secret>)
 * Body:   JSON or form-encoded (Zapier's default). Field names are matched loosely, so the
 *         raw Facebook Lead Ads titles ("Full Name", "Phone Number", "Lead ID"...) work as-is.
 * Query:  ?track=property_manager | property_owner   (optional; otherwise inferred)
 */

// Normalized (lowercase, no spaces/_/-) keys we map explicitly; everything else becomes "extra answers".
const KNOWN_KEYS = new Set(
  [
    "email", "emailaddress", "fullname", "name", "firstname", "lastname", "phone", "phonenumber",
    "company", "companyname", "businessname", "city", "state", "zip", "zipcode", "postcode",
    "country", "leadid", "leadgenid", "formid", "formname", "campaignid", "campaignname",
    "adsetid", "adsetname", "adid", "adname", "platform", "createdtime", "isorganic",
    "track", "type", "applicanttype", "formtype", "pageid", "pagename", "data", "lead",
    "id", "partnername", "retaileritemid", "vehicle", "customdisclaimerresponses",
  ]
);

const LOOKS_LIKE_URL = /^(https?:\/\/)?[^\s/]+\.[a-z]{2,}(\/\S*)?$/i;

function norm(key: string) {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

function parseBody(raw: string): Record<string, any> | null {
  const text = raw.trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    // Zapier's default payload type is form-encoded.
    if (text.includes("=")) {
      const out: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(text)) out[k] = v;
      return out;
    }
    return null;
  }
}

function cleanPhone(value: string) {
  // Meta prefixes phone numbers with "p:" (e.g. "p:+14155551234").
  return value.replace(/^\s*p:\s*/i, "").trim();
}

function normalizeTrack(value: string): "property_manager" | "property_owner" | "" {
  const v = value.toLowerCase();
  if (/(vrm|manager|property_manager)/.test(v)) return "property_manager";
  if (/(owner|homeowner|property_owner)/.test(v)) return "property_owner";
  return "";
}

function prettyQuestion(key: string) {
  const text = key.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function mapMetaLead(rawBody: Record<string, any>, queryTrack = "") {
  // Zapier sometimes nests fields; flatten one level.
  const payload: Record<string, any> = {
    ...rawBody,
    ...(rawBody.data && typeof rawBody.data === "object" ? rawBody.data : {}),
    ...(rawBody.lead && typeof rawBody.lead === "object" ? rawBody.lead : {}),
  };

  const pick = (...keys: string[]) => pickField(payload, ...keys);

  const first = pick("first_name", "First Name");
  const last = pick("last_name", "Last Name");
  const fullName =
    pick("full_name", "Full Name", "name") || [first, last].filter(Boolean).join(" ").trim();
  const email = pick("email", "Email", "Email Address");
  const phone = cleanPhone(pick("phone", "Phone Number", "phone_number"));
  const company = pick("company_name", "Company Name", "company", "business_name");
  const city = pick("city", "City");
  const state = pick("state", "State");
  const propertyAddress = pick("rental_property_address", "property_address", "Rental Property Address");
  const listingLink = pick("website_or_listing_link", "listing_url", "Website or Listing Link");
  const location = [city, state].filter(Boolean).join(", ") || propertyAddress;

  // Meta/Zapier sends the lead id as plain "id".
  const leadId = pick("lead_id", "Lead ID", "leadgen_id") || asString(payload.id);
  const formName = pick("form_name", "Form Name");
  const meta = {
    lead_id: leadId || null,
    form_id: pick("form_id", "Form ID") || null,
    form_name: formName || null,
    campaign_id: pick("campaign_id", "Campaign ID") || null,
    campaign_name: pick("campaign_name", "Campaign Name") || null,
    adset_id: pick("adset_id", "Adset ID", "ad_set_id") || null,
    adset_name: pick("adset_name", "Adset Name", "ad_set_name") || null,
    ad_id: pick("ad_id", "Ad ID") || null,
    ad_name: pick("ad_name", "Ad Name") || null,
    platform: pick("platform", "Platform") || null,
    created_time: pick("created_time", "Created Time") || null,
    is_organic: pick("is_organic", "Is Organic") || null,
  };

  // Everything that isn't a known field is a custom instant-form question: keep the answers.
  const extras: { question: string; answer: string }[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (KNOWN_KEYS.has(norm(key))) continue;
    if (/^raw__/i.test(key)) continue; // Meta repeats every answer as raw__<field>
    if (value === null || value === undefined || typeof value === "object") continue;
    const answer = asString(value);
    if (!answer) continue;
    extras.push({
      question: prettyQuestion(key),
      answer: answer.length > 500 ? `${answer.slice(0, 500)}…` : answer,
    });
    if (extras.length >= 25) break;
  }

  const propertyCountAnswer = extras.find(({ question }) =>
    /(how many|number of|#|count).*(propert|unit|home|rental|listing)|(propert|unit|listing)s?.*(how many|number|count)/i.test(
      question
    )
  )?.answer;

  // Track: ?track= wins, then an explicit field, then the form name ("100C Owner Application").
  const track =
    normalizeTrack(queryTrack) ||
    normalizeTrack(pick("track", "type", "applicant_type")) ||
    normalizeTrack(formName) ||
    "";

  const mapped = mapMainSiteApplication({
    email,
    full_name: fullName,
    phone,
    company_name: company,
    market: location,
    property_count: propertyCountAnswer || "",
    message: extras.length ? extras.map((e) => `${e.question}: ${e.answer}`).join("\n") : "",
    // Owner track: carry the rental address / listing link as the submitted property.
    ...(propertyAddress || listingLink
      ? {
          properties: [
            {
              name: propertyAddress,
              url: LOOKS_LIKE_URL.test(listingLink) ? listingLink : "",
              details: LOOKS_LIKE_URL.test(listingLink) ? "" : listingLink,
            },
          ],
        }
      : {}),
    // detectTrack() reads these.
    ...(track ? { type: track === "property_manager" ? "vrm" : "homeowner" } : {}),
    form_type: formName,
  });
  if ("error" in mapped) return mapped;

  const label = `Meta Instant Form — ${meta.form_name || meta.campaign_name || "Lead Ad"}`;
  mapped.application.source = "meta_instant_form";
  mapped.application.source_label = label;
  mapped.application.how_heard = mapped.application.how_heard || "Facebook / Instagram lead ad";
  mapped.application.attribution = {
    first_touch: null,
    last_touch: null,
    session_touch: null,
    source_label: label,
    utm_source: "meta",
    utm_medium: "paid_social",
    utm_campaign: meta.campaign_name,
    utm_content: meta.ad_name,
    inbound: "meta_instant_form_zapier",
    meta,
  };

  return { ...mapped, leadId };
}

export async function handleMetaLeadWebhook(req: any, res: any) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const expected = String(process.env.META_LEAD_WEBHOOK_SECRET || "").trim();
    if (!expected) {
      console.error("[meta-lead] META_LEAD_WEBHOOK_SECRET is not set");
      return json(res, 503, { error: "Webhook is not configured" });
    }

    const authHeader = String(req.headers?.authorization || "");
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const provided = String(req.headers?.["x-webhook-secret"] || bearer || "").trim();
    if (!provided || !secretsMatch(provided, expected)) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const body = parseBody(await readBody(req));
    if (!body) return json(res, 400, { error: "Body must be JSON or form-encoded fields" });

    const queryTrack = new URL(req.url || "/", "http://localhost").searchParams.get("track") || "";
    const mapped = mapMetaLead(body, queryTrack);
    if ("error" in mapped) return json(res, 400, { error: mapped.error });

    const pool = getNeonPool();
    const { id, created } = await saveInboundApplication(pool, mapped, {
      createdBy: "meta-lead-webhook",
      sourceName: "Meta instant form",
      dedupPrefix: "meta_lead_application",
      leadId: mapped.leadId || undefined,
    });

    return json(res, 200, {
      ok: true,
      id,
      created,
      applicant_type: mapped.track,
      email: mapped.email,
    });
  } catch (error: any) {
    console.error("[meta-lead]", error);
    return json(res, 500, { error: error?.message || "Webhook error" });
  }
}
