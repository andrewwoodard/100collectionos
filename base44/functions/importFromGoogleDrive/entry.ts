import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId, fileName, mimeType, folderId, folderName, isFolder } = await req.json();

    // Get access token for Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    if (isFolder && folderId) {
      // Handle folder import - fetch all files in the folder
      const filesRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=trashed=false%20and%20'${folderId}'%20in%20parents&fields=files(id,name,mimeType,webViewLink)&pageSize=1000`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!filesRes.ok) {
        return Response.json({ error: 'Failed to fetch folder contents' }, { status: 500 });
      }

      const folderData = await filesRes.json();
      const files = folderData.files || [];
      const importedDocs = [];

      // Import each file in the folder
      for (const file of files) {
        const docRecord = await createDocumentRecord(
          base44,
          file.id,
          file.name,
          file.mimeType,
          accessToken
        );
        importedDocs.push(docRecord);
      }

      return Response.json({ 
        success: true, 
        folderName,
        filesImported: importedDocs.length,
        documents: importedDocs 
      });
    } else if (fileId && fileName) {
      // Handle single file import
      if (!fileId || !fileName) {
        return Response.json({ error: 'Missing fileId or fileName' }, { status: 400 });
      }

      const docRecord = await createDocumentRecord(
        base44,
        fileId,
        fileName,
        mimeType,
        accessToken
      );

      return Response.json({ success: true, document: docRecord });
    } else {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }
  } catch (error) {
    console.error('Import error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function createDocumentRecord(base44, fileId, fileName, mimeType, accessToken) {
  // Build the file URL
  let fileUrl;
  if (mimeType === 'application/vnd.google-apps.document') {
    fileUrl = `https://docs.google.com/document/d/${fileId}/edit`;
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    fileUrl = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    fileUrl = `https://docs.google.com/presentation/d/${fileId}/edit`;
  } else {
    fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
  }

  // Get file metadata
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,webViewLink`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!metaRes.ok) {
    throw new Error('Failed to fetch file metadata');
  }

  const metadata = await metaRes.json();

  // Create Document record
  return base44.entities.Document.create({
    title: metadata.name || fileName,
    file_url: fileUrl,
    doc_type: 'miscellaneous',
    status: 'draft',
    notes: `Imported from Google Drive on ${new Date().toLocaleDateString()}`,
  });
}