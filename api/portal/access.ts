import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePortalAccess } from "../../server/portal-access.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handlePortalAccess(req, res);
}
