import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    const body = await req.json().catch(() => ({}));
    const { type, repo, owner } = body;

    if (type === 'repos') {
      const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', { headers });
      const data = await res.json();
      return Response.json({ repos: data });
    }

    if (type === 'issues') {
      const url = repo
        ? `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=30`
        : `https://api.github.com/issues?filter=all&state=open&per_page=30`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      return Response.json({ issues: data });
    }

    if (type === 'pulls') {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30`, { headers });
      const data = await res.json();
      return Response.json({ pulls: data });
    }

    if (type === 'commits') {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`, { headers });
      const data = await res.json();
      return Response.json({ commits: data });
    }

    if (type === 'user') {
      const res = await fetch('https://api.github.com/user', { headers });
      const data = await res.json();
      return Response.json({ user: data });
    }

    return Response.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});