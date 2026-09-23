import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBlobUpload } from "../../server/blob-http.ts";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleBlobUpload(req, res);
}
