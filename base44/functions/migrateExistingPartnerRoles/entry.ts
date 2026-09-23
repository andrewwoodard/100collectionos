import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// One-shot migration: sets partner_role = 'owner' for all existing partner users
// where partner_role is null/undefined. Safe to run multiple times — only updates
// users who don't already have a partner_role set.
//
// Triggered manually or as a scheduled one-time migration.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    // Fetch all users (paginate to cover large datasets)
    let allUsers = [];
    let batch = await base44.asServiceRole.entities.User.list('-created_date', 500);
    allUsers = allUsers.concat(batch);

    // Filter to partner-role users without a partner_role
    const toMigrate = allUsers.filter(u =>
      u.role === 'partner' && !u.partner_role
    );

    let migrated = 0;
    for (const u of toMigrate) {
      try {
        await base44.asServiceRole.entities.User.update(u.id, { partner_role: 'owner' });
        migrated++;
      } catch (e) {
        console.warn(`Failed to migrate ${u.email}:`, e.message);
      }
    }

    // Audit entry
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: user.email,
        actor_role: 'admin',
        action: 'partner_role_migration',
        entity_type: 'User',
        details: `Migrated ${migrated} partner users to partner_role=owner.`,
      });
    } catch {}

    return Response.json({
      ok: true,
      totalUsers: allUsers.length,
      partnerUsers: allUsers.filter(u => u.role === 'partner').length,
      migrated,
      skipped: toMigrate.length - migrated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}