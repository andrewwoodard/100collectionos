import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ENTITIES = [
  'Property', 'Partner', 'Document', 'MediaAsset', 'BillingRecord',
  'Task', 'Note', 'OnboardingItem', 'ActivityLog', 'DocumentFolder',
  'MediaFolder', 'PartnerOnboarding', 'OffboardingRecord', 'PropertyChange',
  'PartnerAudit', 'PropertySubmission', 'ReviewNote', 'LicenseRecord',
  'PortalNotification', 'AuditEntry', 'PartnerApplication'
];

async function pushFile(accessToken, repo, branch, filePath, content) {
  const encodedContent = btoa(unescape(encodeURIComponent(content)));

  // Check if file exists to get SHA
  const checkRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }
  );

  const body = {
    message: `chore: sync ${filePath}`,
    content: encodedContent,
    branch,
  };

  if (checkRes.ok) {
    const existing = await checkRes.json();
    body.sha = existing.sha;
  }

  const pushRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!pushRes.ok) {
    const err = await pushRes.json();
    throw new Error(`Failed to push ${filePath}: ${err.message}`);
  }

  return await pushRes.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { repo, branch = 'main' } = await req.json();
    if (!repo) return Response.json({ error: 'Missing repo' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

    const results = [];
    const errors = [];

    for (const entityName of ENTITIES) {
      try {
        const records = await base44.asServiceRole.entities[entityName].list();
        const content = JSON.stringify(records, null, 2);
        const filePath = `data/${entityName.toLowerCase()}.json`;
        await pushFile(accessToken, repo, branch, filePath, content);
        results.push({ entity: entityName, count: records.length, status: 'ok' });
      } catch (e) {
        errors.push({ entity: entityName, error: e.message });
      }
    }

    return Response.json({ results, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});