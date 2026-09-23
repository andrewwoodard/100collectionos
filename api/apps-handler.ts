import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAppsRequest } from "../server/apps-http.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleAppsRequest(req, res);
}
