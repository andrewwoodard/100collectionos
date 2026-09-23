import type { IncomingMessage, ServerResponse } from "node:http";
import { handleImageIngest } from "../../server/blob-http.js";

export const maxDuration = 60;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleImageIngest(req, res);
}
