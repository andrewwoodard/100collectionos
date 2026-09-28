import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins/custom-session";
import { magicLink } from "better-auth/plugins";
import { Pool } from "pg";
import { deliverMagicLinkEmail, deliverPasswordResetEmail } from "./reset-email.js";
import { applyPortalProfile, resolvePortalProfile } from "./portal-profile.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const PORTAL_ORIGIN = "https://portal.theonehundredcollection.com";
const VERCEL_ORIGIN = "https://100collectionos.vercel.app";

function authFallbackURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL) return PORTAL_ORIGIN;
  return "http://localhost:5173";
}

const authPool = new Pool({
  connectionString: databaseUrl,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});
authPool.on("error", (error) => {
  console.warn("[auth-db] idle client error", error.message);
});

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  // Resolve the OAuth redirect URI and cookies from the request host so
  // portal.theonehundredcollection.com does not start Google login with a
  // 100collectionos.vercel.app callback (that drops the state cookie).
  baseURL: {
    allowedHosts: [
      "portal.theonehundredcollection.com",
      "100collectionos.vercel.app",
      "*.vercel.app",
      "localhost:*",
      "127.0.0.1:*",
    ],
    protocol: "auto",
    fallback: authFallbackURL(),
  },
  database: authPool,
  trustedOrigins: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    PORTAL_ORIGIN,
    VERCEL_ORIGIN,
  ],
  advanced: {
    trustedProxyHeaders: Boolean(process.env.VERCEL),
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await deliverPasswordResetEmail({ user, url });
    },
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
    // Local only: Vite is often opened as 127.0.0.1 while BETTER_AUTH_URL
    // and the Google redirect URI are localhost. Those are different cookie
    // jars, so the signed OAuth state cookie never comes back.
    skipStateCookieCheck: (process.env.BETTER_AUTH_URL || "").startsWith("http://localhost"),
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "partner",
        input: false,
      },
      partner_role: {
        type: "string",
        defaultValue: "owner",
        input: false,
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        const result = await deliverMagicLinkEmail({ email, url });
        if (!result.ok) {
          throw new Error("error" in result && result.error ? result.error : "Failed to send sign-in link");
        }
      },
    }),
    customSession(async ({ user, session }) => {
      try {
        const profile = await resolvePortalProfile(user.email || "");
        return {
          user: applyPortalProfile(user, profile),
          session,
        };
      } catch (error) {
        console.warn("[auth] portal profile lookup failed", (error as Error).message);
        return { user, session };
      }
    }),
  ],
});
