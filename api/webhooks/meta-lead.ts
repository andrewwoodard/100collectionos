import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMetaLeadWebhook } from "../../server/meta-lead-application.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleMetaLeadWebhook(req, res);
}
