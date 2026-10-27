/**
 * Classic Supabase (the100collection.com) REST helpers.
 * Neon holds a mirror of propertiesbase44; gallery/public publishes must dual-write both.
 */

function supabaseConfig() {
  const url = process.env.BASE44_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.BASE44_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  return { url: url.replace(/\/$/, ""), key };
}

export function hasRemoteSupabase() {
  const { url, key } = supabaseConfig();
  return Boolean(url && key);
}

export async function supabaseRest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  if (!url || !key) throw new Error("Supabase credentials are not configured");
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message =
      (data && (data.message || data.error_description || data.error)) ||
      text ||
      `Supabase ${res.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

function parseImages(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((u) => String(u || "").trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((u) => String(u || "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Build a PostgREST-safe payload from a Neon propertiesbase44 row. */
export function rowToRemotePayload(row: Record<string, any>) {
  if (!row) return null;
  const id = String(row.id ?? row.row_id ?? "");
  if (!id) return null;
  const images = parseImages(row.images);
  const vrmImages = parseImages(row.vrm_images);
  const propdescription =
    row.propdescription == null
      ? null
      : typeof row.propdescription === "string"
        ? row.propdescription
        : JSON.stringify(row.propdescription);

  return {
    id,
    row_id: Number(row.row_id) || Number(id) || Date.now(),
    name: row.name ?? null,
    destination: row.destination ?? null,
    url: row.url ?? null,
    vrm_url: row.vrm_url ?? null,
    bedrooms: row.bedrooms ?? null,
    bathrooms: row.bathrooms != null ? String(row.bathrooms) : null,
    occupancy: row.occupancy ?? null,
    house_type: row.house_type ?? null,
    partner_name: row.partner_name ?? null,
    partner_id: row.partner_id ?? null,
    address: row.address ?? null,
    location_city: row.location_city ?? null,
    location_state: row.location_state ?? null,
    location_country: row.location_country ?? null,
    propdescription,
    excerpt: row.excerpt ?? null,
    text: row.text ?? null,
    headline: row.headline ?? null,
    unique_feature: row.unique_feature ?? null,
    why_onehundred: row.why_onehundred ?? null,
    best_fit_guest: row.best_fit_guest ?? null,
    design_style_notes: row.design_style_notes ?? null,
    status: row.status ?? null,
    active: row.active ?? null,
    portal_visible: row.portal_visible ?? null,
    onboarding_status: row.onboarding_status ?? null,
    photography_status: row.photography_status ?? null,
    launch_date: row.launch_date ?? null,
    images: images.length ? images : row.images ?? null,
    vrm_images: vrmImages.length ? vrmImages : row.vrm_images ?? null,
    property_image: row.property_image || images[0] || null,
    photo_count: row.photo_count != null ? String(row.photo_count) : images.length ? String(images.length) : null,
    created_at: row.created_at || new Date().toISOString(),
    pet_friendly: row.pet_friendly ?? null,
    pet_policy_url: row.pet_policy_url ?? null,
    filtered_amenities: (() => {
      if (row.filtered_amenities == null) return null;
      if (typeof row.filtered_amenities === "string") {
        try {
          return JSON.parse(row.filtered_amenities);
        } catch {
          return row.filtered_amenities;
        }
      }
      return row.filtered_amenities;
    })(),
  };
}

function normName(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Neon and classic Supabase can diverge on id vs row_id (e.g. Neon id=1018 for
 * Duneside while classic has id=1782 / row_id=1018, and a different property
 * occupying classic id=1018). Pick the remote row carefully — never overwrite
 * an unrelated property that happens to share an id.
 */
function pickRemoteMatch(
  candidates: Array<Record<string, any>>,
  payload: Record<string, any>
) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const wantId = String(payload.id);
  const wantRowId = String(payload.row_id);
  const wantName = normName(payload.name);

  const byIdAndName = candidates.find(
    (c) => String(c.id) === wantId && (!wantName || normName(c.name) === wantName)
  );
  if (byIdAndName) return byIdAndName;

  const byRowIdAndName = candidates.find(
    (c) => String(c.row_id) === wantRowId && (!wantName || normName(c.name) === wantName)
  );
  if (byRowIdAndName) return byRowIdAndName;

  const byName = wantName
    ? candidates.find((c) => normName(c.name) === wantName)
    : null;
  if (byName) return byName;

  // Last resort: exact id only when unique among candidates.
  const idMatches = candidates.filter((c) => String(c.id) === wantId);
  if (idMatches.length === 1) return idMatches[0];
  const rowMatches = candidates.filter((c) => String(c.row_id) === wantRowId);
  if (rowMatches.length === 1) return rowMatches[0];

  return null;
}

/**
 * Upsert a Neon propertiesbase44 row onto classic Supabase so the public site sees it.
 * Non-fatal when credentials are missing (returns { skipped: true }).
 */
export async function mirrorPropertiesbase44ToRemote(row: Record<string, any>) {
  if (!hasRemoteSupabase()) {
    return { skipped: true as const, reason: "Supabase credentials missing" };
  }
  const payload = rowToRemotePayload(row);
  if (!payload?.id) {
    return { skipped: true as const, reason: "No row id" };
  }

  const existing = await supabaseRest(
    `propertiesbase44?or=(id.eq.${encodeURIComponent(payload.id)},row_id.eq.${encodeURIComponent(String(payload.row_id))})&select=id,row_id,name,destination&limit=20`
  );
  const match = pickRemoteMatch(existing, payload);

  const patchRemote = async (targetId: string, fields: Record<string, any>) => {
    try {
      return await supabaseRest(`propertiesbase44?id=eq.${encodeURIComponent(targetId)}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Classic schema may lag Neon — retry without newer optional columns.
      if (/filtered_amenities|pet_policy_url|column|schema cache/i.test(msg)) {
        const {
          filtered_amenities: _fa,
          pet_policy_url: _ppu,
          ...legacy
        } = fields;
        return await supabaseRest(`propertiesbase44?id=eq.${encodeURIComponent(targetId)}`, {
          method: "PATCH",
          body: JSON.stringify(legacy),
        });
      }
      throw err;
    }
  };

  if (match) {
    const targetId = String(match.id || match.row_id);
    // Keep the remote primary key stable — rewriting id/row_id collides with
    // other rows when Neon and classic IDs have drifted.
    const { id: _id, row_id: _rowId, ...fields } = payload;
    const patched = await patchRemote(targetId, fields);
    return { skipped: false as const, action: "updated" as const, row: Array.isArray(patched) ? patched[0] : patched };
  }

  // Also try name match when id/row_id lookup missed (drifted keys).
  if (payload.name) {
    const byName = await supabaseRest(
      `propertiesbase44?name=eq.${encodeURIComponent(String(payload.name))}&select=id,row_id,name,destination&limit=10`
    );
    const nameMatch = pickRemoteMatch(byName, payload);
    if (nameMatch) {
      const targetId = String(nameMatch.id || nameMatch.row_id);
      const { id: _id, row_id: _rowId, ...fields } = payload;
      const patched = await patchRemote(targetId, fields);
      return { skipped: false as const, action: "updated" as const, row: Array.isArray(patched) ? patched[0] : patched };
    }
  }

  const created = await supabaseRest("propertiesbase44", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return { skipped: false as const, action: "created" as const, row: Array.isArray(created) ? created[0] : created };
}

/** Flat partners row for classic Supabase (public site inactive filter). */
export function partnerToRemotePayload(partner: Record<string, any>, partnerId: string) {
  return {
    id: String(partnerId),
    partner_name: partner.partner_name || null,
    company_name: partner.company_name || partner.partner_name || null,
    primary_contact_name: partner.primary_contact_name || "",
    primary_contact_email: partner.primary_contact_email || "",
    primary_contact_phone: partner.primary_contact_phone || null,
    market: partner.market || null,
    region: partner.region || null,
    partner_type: partner.partner_type || null,
    status: partner.status || null,
    onboarding_stage: partner.onboarding_stage || null,
    contract_status: partner.contract_status || null,
    billing_status: partner.billing_status || null,
    assigned_internal_owner: partner.assigned_internal_owner || null,
    start_date: partner.start_date || null,
    go_live_date: partner.go_live_date || null,
    renewal_date: partner.renewal_date || null,
    notes: partner.notes || null,
    tags: Array.isArray(partner.tags) ? partner.tags : [],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Upsert partners onto classic Supabase so the100collection.com can hide
 * inactive partners via partners.status. Non-fatal when credentials missing.
 */
export async function mirrorPartnerToRemote(partner: Record<string, any>, partnerId: string) {
  if (!hasRemoteSupabase()) {
    return { skipped: true as const, reason: "Supabase credentials missing" };
  }
  const payload = partnerToRemotePayload(partner, partnerId);
  if (!payload.partner_name) {
    return { skipped: true as const, reason: "No partner_name" };
  }

  // Minimal patch for status-driven public-site hide (avoids unknown-column errors).
  const statusOnly = {
    partner_name: payload.partner_name,
    company_name: payload.company_name,
    status: payload.status,
    updated_at: payload.updated_at,
  };

  const write = async (path: string, method: "PATCH" | "POST", fields: Record<string, any>) => {
    try {
      return await supabaseRest(path, { method, body: JSON.stringify(fields) });
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Retry with status-focused payload if schema rejects optional columns.
      if (method === "PATCH" && /column|schema cache|Could not find/i.test(msg)) {
        return await supabaseRest(path, { method, body: JSON.stringify(statusOnly) });
      }
      throw err;
    }
  };

  const byId = await supabaseRest(
    `partners?id=eq.${encodeURIComponent(payload.id)}&select=id&limit=1`
  );
  if (Array.isArray(byId) && byId[0]?.id) {
    const { id: _id, ...fields } = payload;
    const patched = await write(`partners?id=eq.${encodeURIComponent(String(byId[0].id))}`, "PATCH", fields);
    return { skipped: false as const, action: "updated" as const, row: Array.isArray(patched) ? patched[0] : patched };
  }

  const byName = await supabaseRest(
    `partners?partner_name=eq.${encodeURIComponent(String(payload.partner_name))}&select=id&limit=1`
  );
  if (Array.isArray(byName) && byName[0]?.id) {
    const { id: _id, ...fields } = payload;
    const patched = await write(`partners?id=eq.${encodeURIComponent(String(byName[0].id))}`, "PATCH", fields);
    return { skipped: false as const, action: "updated" as const, row: Array.isArray(patched) ? patched[0] : patched };
  }

  try {
    const created = await write("partners", "POST", { ...payload, created_at: new Date().toISOString() });
    return { skipped: false as const, action: "created" as const, row: Array.isArray(created) ? created[0] : created };
  } catch (err: any) {
    // Last resort: status-only insert may still fail without id; rethrow original.
    throw err;
  }
}

/**
 * Hide a partner's VRM card(s) on classic Supabase (showproperties / onboarded).
 */
export async function hidePartnerVrmsOnRemote(partnerName: string) {
  if (!hasRemoteSupabase() || !partnerName) {
    return { skipped: true as const, reason: "missing credentials or name" };
  }
  const patched = await supabaseRest(
    `vrms?or=(partner_name.eq.${encodeURIComponent(partnerName)},name.eq.${encodeURIComponent(partnerName)})`,
    {
      method: "PATCH",
      body: JSON.stringify({
        showproperties: false,
        onboarded: false,
        is_onboarded: false,
      }),
    }
  );
  return {
    skipped: false as const,
    action: "updated" as const,
    count: Array.isArray(patched) ? patched.length : patched ? 1 : 0,
  };
}

/**
 * Bulk-set properties inactive on classic Supabase by partner_name.
 * Matches exact name and common "… Vacation Rentals" / prefix variants.
 */
export async function deactivatePartnerPropertiesOnRemote(partnerName: string) {
  if (!hasRemoteSupabase() || !partnerName) {
    return { skipped: true as const, reason: "missing credentials or name" };
  }
  const name = String(partnerName).trim();
  const alt = name.replace(/\s+vacation\s+rentals$/i, "").trim();
  const names = [...new Set([name, alt, `${alt} Vacation Rentals`].filter(Boolean))];
  const or = names.map((n) => `partner_name.eq.${encodeURIComponent(n)}`).join(",");
  const patched = await supabaseRest(`propertiesbase44?or=(${or})`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "inactive",
      active: false,
      portal_visible: false,
    }),
  });
  return {
    skipped: false as const,
    action: "updated" as const,
    count: Array.isArray(patched) ? patched.length : patched ? 1 : 0,
  };
}
