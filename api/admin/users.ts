import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAdminUsers } from "../../server/admin-users.ts";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleAdminUsers(req, res);
}
