import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, spreadsheetId, range, sheetName } = await req.json();
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    const authHeader = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    if (action === 'getMetadata') {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties,sheets.properties`,
        { headers: authHeader }
      );
      const data = await res.json();
      if (!res.ok) return Response.json({ error: data.error?.message || 'Failed to get metadata' }, { status: res.status });
      return Response.json({ metadata: data });
    }

    if (action === 'getSheetData') {
      const tabRange = sheetName ? `${sheetName}` : range || 'Sheet1';
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabRange)}`,
        { headers: authHeader }
      );
      const data = await res.json();
      if (!res.ok) return Response.json({ error: data.error?.message || 'Failed to read sheet' }, { status: res.status });
      return Response.json({ values: data.values || [], range: data.range });
    }

    if (action === 'getDownloadUrl') {
      const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
      return Response.json({ downloadUrl: exportUrl });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});