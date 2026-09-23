import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const event_type = body?.event_type;
    const entity_id = body?.entity_id;

    // Delete event: remove the row from Supabase
    if (event_type === "delete" && entity_id) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/job_postings?id=eq.${entity_id}`,
        {
          method: "DELETE",
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
          },
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ error: err }, { status: 500 });
      }
      return Response.json({ success: true, action: "deleted", id: entity_id });
    }

    // Single-record sync (create/update): use provided data, or fetch by id
    let jobs: any[] = [];
    if (entity_id) {
      const job = body?.data || (await base44.asServiceRole.entities.JobPosting.filter({ id: entity_id }))[0];
      if (job) jobs = [job];
    } else {
      // Manual full sync (no event context)
      jobs = await base44.asServiceRole.entities.JobPosting.list();
    }

    if (jobs.length === 0) {
      return Response.json({ success: true, synced: 0 });
    }

    const rows = jobs.map(j => ({
      id: j.id,
      partner_id: j.partner_id || null,
      partner_name: j.partner_name || null,
      title: j.title,
      location: j.location || null,
      job_type: j.job_type || "full_time",
      department: j.department || null,
      description: j.description || null,
      requirements: j.requirements || null,
      compensation: j.compensation || null,
      application_email: j.application_email || null,
      application_url: j.application_url || null,
      status: j.status || "active",
      closes_at: j.closes_at || null,
      created_date: j.created_date || new Date().toISOString(),
      updated_date: j.updated_date || new Date().toISOString(),
      created_by_id: j.created_by_id || null,
    }));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/job_postings`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify(rows),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { status: 500 });
    }

    return Response.json({ success: true, synced: rows.length });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});