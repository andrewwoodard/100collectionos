import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMainSiteApplicationWebhook } from "../../server/main-site-application.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleMainSiteApplicationWebhook(req, res);
}
