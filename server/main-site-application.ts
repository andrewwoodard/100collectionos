import { timingSafeEqual } from "node:crypto";
import { getNeonPool, json, newId, readBody } from "./neon-db.js";

function asString(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function asEmail(value: unknown) {
  return asString(value).toLowerCase();
}

function asBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const v = asString(value).toLowerCase();
  return ["yes", "true", "1", "y"].includes(v);
}

function formatPhone(value: unknown) {
  const raw = asString(value);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function unwrapPayload(body: any) {
  if (!body || typeof body !== "object") return {};
  // GHL sometimes nests custom fields under customData / data / contact.
  return {
    ...body,
    ...(body.customData && typeof body.customData === "object" ? body.customData : {}),
    ...(body.data && typeof body.data === "object" ? body.data : {}),
    ...(body.contact && typeof body.contact === "object" ? body.contact : {}),
  };
}

/** First non-empty value for any of the given keys (exact, then space/case-insensitive). */
function pickField(payload: any, ...keys: string[]) {
  for (const key of keys) {
    const direct = asString(payload?.[key]);
    if (direct) return direct;
  }
  const wanted = new Set(keys.map((k) => k.toLowerCase().replace(/[\s_-]+/g, "")));
  for (const [key, value] of Object.entries(payload || {})) {
    const normalized = key.toLowerCase().replace(/[\s_-]+/g, "");
    if (!wanted.has(normalized)) continue;
    const text = asString(value);
    if (text) return text;
  }
  return "";
}

function detectTrack(payload: any) {
  const blob = [
    payload.type,
    payload.leadType,
    payload.lead_type,
    payload.applicant_type,
    payload.applicantType,
    payload.track,
    payload.formType,
    payload.form_type,
    payload.source,
    ...(Array.isArray(payload.tags) ? payload.tags : []),
  ]
    .map((v) => asString(v).toLowerCase())
    .join(" ");

  if (/\b(homeowner|property[_\s-]?owner)\b/.test(blob)) return "property_owner";
  if (/\b(vrm|property[_\s-]?manager|vacation\s+rental\s+manager)\b/.test(blob)) {
    return "property_manager";
  }
  if (Array.isArray(payload.properties) && payload.properties.length) return "property_owner";
  if (payload.companyName || payload.company_name || payload.company || payload.businessName) {
    return "property_manager";
  }
  return "property_owner";
}

function mapProperties(payload: any) {
  const rows = Array.isArray(payload.properties) ? payload.properties : [];
  return rows
    .map((row: any, index: number) => {
      const listing =
        asString(row?.url) ||
        asString(row?.listing_url) ||
        asString(row?.listingUrl) ||
        asString(row?.vrbo) ||
        asString(row?.airbnb) ||
        "";
      const name =
        asString(row?.name) ||
        asString(row?.property_name) ||
        asString(row?.propertyName) ||
        asString(row?.title) ||
        (listing ? listing : `Property ${index + 1}`);
      if (!listing && !asString(row?.name) && !asString(row?.details)) return null;
      return {
        id: newId(),
        property_name: name,
        listing_url: listing,
        notes: asString(row?.details || row?.notes || row?.description),
      };
    })
    .filter(Boolean);
}

function sourceLabelFor(track: string, payload: any) {
  const source = asString(payload.source);
  if (source) return source;
  return track === "property_manager"
    ? "The 100 Collection™ — VRM Application"
    : "The 100 Collection™ — Homeowner Application";
}

export function mapMainSiteApplication(rawBody: any) {
  const payload = unwrapPayload(rawBody);
  const track = detectTrack(payload);
  const email = asEmail(
    pickField(payload, "email", "Email", "contactEmail", "contact_email") ||
      payload.email ||
      payload.Email
  );
  const first = pickField(payload, "firstName", "first_name", "firstname", "First Name");
  const last = pickField(payload, "lastName", "last_name", "lastname", "Last Name");
  const fullName =
    pickField(payload, "Full Name", "fullName", "full_name", "fullname", "contactName", "contact_name") ||
    [first, last].filter(Boolean).join(" ").trim();
  const phone = formatPhone(
    pickField(payload, "phone", "Phone", "phoneNumber", "phone_number", "mobile", "Mobile")
  );
  const market = pickField(
    payload,
    "market",
    "Market",
    "property_locations",
    "propertyLocations",
    "location",
    "city"
  );
  const howHeard = pickField(
    payload,
    "hearAbout",
    "how_heard",
    "howHeard",
    "referral",
    "How did you hear about us",
    "How Did You Hear About Us"
  );
  const message = pickField(payload, "anythingElse", "message", "notes", "comments", "Anything Else");
  const company = pickField(
    payload,
    "companyName",
    "company_name",
    "company",
    "businessName",
    "Company Name",
    "Company"
  );
  const website = pickField(
    payload,
    "website",
    "companyWebsite",
    "company_website",
    "url",
    "Website",
    "Company Website"
  );
  const propertyCount =
    pickField(payload, "propertyCount", "property_count", "propertiesCount", "Property Count") ||
    (Array.isArray(payload.properties) ? String(payload.properties.length) : "");
  const submitted_properties = track === "property_owner" ? mapProperties(payload) : [];
  const hasDirect =
    payload.hasDirectWebsite ??
    payload.has_direct_booking_website ??
    payload.hasDirectBookingWebsite ??
    payload["Has Direct Website"] ??
    payload["has direct website"];

  if (!email || !email.includes("@")) {
    return { error: "email is required" as const };
  }
  if (!fullName) {
    return { error: "full name is required" as const };
  }

  const now = new Date().toISOString();
  const application = {
    full_name: fullName,
    email,
    phone: phone || null,
    company_name: company || null,
    website: website || null,
    property_count: propertyCount || null,
    property_locations: market || null,
    property_address: market || null,
    how_heard: howHeard || null,
    message: message || null,
    listing_url: submitted_properties[0]?.listing_url || asString(payload.listing_url || payload.listingUrl) || null,
    has_direct_booking_website: hasDirect == null || hasDirect === "" ? null : asBool(hasDirect),
    direct_booking_website: asString(payload.direct_booking_website || payload.directBookingWebsite) || null,
    social_media_links: [],
    submitted_properties,
    applicant_type: track,
    status: "pending",
    spam_score: 0,
    experiment_segment: track === "property_manager" ? "property_manager" : "homeowner",
    source: asString(payload.source) || (track === "property_manager" ? "main_site_vrm" : "main_site_homeowner"),
    source_label: sourceLabelFor(track, payload),
    attribution: {
      first_touch: null,
      last_touch: null,
      session_touch: null,
      source_label: sourceLabelFor(track, payload),
      tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
      inbound: "main_site_webhook",
    },
    updated_date: now,
  };

  return { track, application, email, fullName };
}

function secretsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function notifyAdmins(pool: ReturnType<typeof getNeonPool>, app: {
  id: string;
  full_name: string;
  email: string;
  applicant_type: string;
  property_count?: string | null;
  property_locations?: string | null;
}) {
  const typeLabel = app.applicant_type === "property_manager" ? "VRM" : "Homeowner";
  const countInfo = app.property_count ? `${app.property_count} properties` : "";
  const locationInfo = app.property_locations || "";
  const notifId = newId();
  const now = new Date().toISOString();
  const data = {
    id: notifId,
    recipient_role: "admin",
    recipient_email: "admin",
    type: "general",
    title: `New ${typeLabel.toLowerCase()} application from ${app.full_name}`,
    message: `${typeLabel} application from main site${countInfo ? ` — ${countInfo}` : ""}${locationInfo ? ` in ${locationInfo}` : ""}.`,
    submission_id: app.id,
    is_read: false,
    link: `/admin/hub?tab=applications&applicationId=${app.id}`,
    dedup_key: `main_site_application_${app.id}`,
    created_date: now,
    updated_date: now,
    created_by: "main-site-webhook",
    created_by_id: "main-site-webhook",
    is_sample: false,
  };
  await pool.query(
    `INSERT INTO base44.portal_notification (id, created_date, updated_date, created_by, created_by_id, is_sample, data, imported_at)
     VALUES ($1, now(), now(), $2, $2, false, $3::jsonb, now())
     ON CONFLICT (id) DO NOTHING`,
    [notifId, "main-site-webhook", JSON.stringify(data)]
  );
}

export async function handleMainSiteApplicationWebhook(req: any, res: any) {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Webhook-Secret");
      res.end();
      return;
    }
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const expected = String(process.env.MAIN_SITE_APPLICATION_WEBHOOK_SECRET || "").trim();
    if (!expected) {
      console.error("[main-site-application] MAIN_SITE_APPLICATION_WEBHOOK_SECRET is not set");
      return json(res, 503, { error: "Webhook is not configured" });
    }

    const authHeader = String(req.headers?.authorization || "");
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const provided = String(
      req.headers?.["x-webhook-secret"] ||
        req.headers?.["x-main-site-secret"] ||
        bearer ||
        ""
    ).trim();
    if (!provided || !secretsMatch(provided, expected)) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const raw = await readBody(req);
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { error: "Invalid JSON body" });
    }

    const mapped = mapMainSiteApplication(body);
    if ("error" in mapped) return json(res, 400, { error: mapped.error });

    const { application, email, fullName, track } = mapped;
    const pool = getNeonPool();

    // Prefer enriching an open application for the same email over creating duplicates.
    const existing = await pool.query(
      `SELECT id, data FROM base44.partner_application
       WHERE lower(data->>'email') = $1
         AND coalesce(data->>'status', 'pending') IN ('pending', 'interview_invited', 'spam_review')
       ORDER BY created_date DESC NULLS LAST
       LIMIT 1`,
      [email]
    );

    let id: string;
    let created = false;
    const now = new Date().toISOString();

    if (existing.rows[0]) {
      id = existing.rows[0].id;
      const prev = existing.rows[0].data || {};
      const merged = {
        ...prev,
        ...application,
        id,
        created_date: prev.created_date || now,
        updated_date: now,
        // Keep earlier source_label if present and new one is generic.
        source_label: application.source_label || prev.source_label || null,
        attribution: {
          ...(prev.attribution || {}),
          ...(application.attribution || {}),
        },
      };
      await pool.query(
        `UPDATE base44.partner_application
         SET data = $2::jsonb, updated_date = now()
         WHERE id = $1`,
        [id, JSON.stringify(merged)]
      );
    } else {
      id = newId();
      created = true;
      const data = {
        ...application,
        id,
        created_date: now,
        updated_date: now,
        created_by: "main-site-webhook",
        created_by_id: "main-site-webhook",
        is_sample: false,
      };
      await pool.query(
        `INSERT INTO base44.partner_application
          (id, created_date, updated_date, created_by, created_by_id, is_sample, data, imported_at)
         VALUES ($1, now(), now(), $2, $2, false, $3::jsonb, now())`,
        [id, "main-site-webhook", JSON.stringify(data)]
      );
      try {
        await notifyAdmins(pool, {
          id,
          full_name: fullName,
          email,
          applicant_type: track,
          property_count: application.property_count,
          property_locations: application.property_locations,
        });
      } catch (error) {
        console.warn("[main-site-application] admin notify failed", (error as Error).message);
      }
    }

    return json(res, 200, {
      ok: true,
      id,
      created,
      applicant_type: track,
      email,
    });
  } catch (error: any) {
    console.error("[main-site-application]", error);
    return json(res, 500, { error: error.message || "Webhook error" });
  }
}
