import { createAuthClient } from "better-auth/client";
import { customSessionClient, magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
  plugins: [customSessionClient(), magicLinkClient()],
  fetchOptions: {
    credentials: "include",
  },
});
