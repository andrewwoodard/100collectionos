import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAppsRequest } from "../server/apps-http.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

// AI property add / image-heavy updates can exceed the default serverless budget.
export const maxDuration = 60;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleAppsRequest(req, res);
}
