import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { repo, filePath, branch, commitMessage, content } = await req.json();

    if (!repo || !filePath || !commitMessage || !content) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    // Check if file already exists to get its SHA
    const checkRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }
    );

    const body = {
      message: commitMessage,
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

    const data = await pushRes.json();

    if (!pushRes.ok) {
      return Response.json({ error: data.message || 'GitHub API error' }, { status: pushRes.status });
    }

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});