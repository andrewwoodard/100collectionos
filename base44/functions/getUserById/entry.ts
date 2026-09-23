import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Only admins can look up arbitrary users
    if (caller.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.filter({ id: userId });
    const user = users?.[0];
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    // Return only safe fields — no auth tokens, etc.
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});