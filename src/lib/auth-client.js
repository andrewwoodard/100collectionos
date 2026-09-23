import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
  fetchOptions: {
    credentials: "include",
  },
});
