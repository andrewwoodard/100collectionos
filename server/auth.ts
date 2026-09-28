import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { customSession } from "better-auth/plugins/custom-session";
import { magicLink } from "better-auth/plugins";
import { Pool } from "pg";
import {
  clearMustChangePassword,
  ensurePasswordMigrationSchema,
  verifyBase44Password,
} from "./base44-password.js";
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
void ensurePasswordMigrationSchema((sql) => authPool.query(sql)).catch((error) => {
  console.warn("[auth] mustChangePassword column", error.message);
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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const path = ctx.path || "";
      if (path.includes("/change-password")) {
        const body = ctx.body as { currentPassword?: string; newPassword?: string };
        if (body.currentPassword && body.newPassword && body.currentPassword === body.newPassword) {
          throw APIError.from("BAD_REQUEST", {
            code: "PASSWORD_UNCHANGED",
            message: "Choose a different password than the one you just used.",
          });
        }
        return;
      }
      if (!path.includes("/sign-in/email")) return;
      const email = String((ctx.body as { email?: string })?.email || "")
        .trim()
        .toLowerCase();
      const password = String((ctx.body as { password?: string })?.password || "");
      if (!email || !password) return;

      const userRecord = await ctx.context.internalAdapter.findUserByEmail(email, {
        includeAccounts: true,
      });
      if (!userRecord?.user) return;

      const credential = (userRecord.accounts || []).find(
        (account) => account.providerId === "credential" && account.accountId === userRecord.user.id
      );
      if (credential?.password) return;

      try {
        const matched = await verifyBase44Password(email, password);
        if (!matched) return;

        const hash = await ctx.context.password.hash(password);
        if (credential) {
          await ctx.context.internalAdapter.updateAccount(credential.id, { password: hash });
        } else {
          await ctx.context.internalAdapter.linkAccount({
            userId: userRecord.user.id,
            providerId: "credential",
            accountId: userRecord.user.id,
            password: hash,
          });
        }
        await ctx.context.internalAdapter.updateUser(userRecord.user.id, {
          mustChangePassword: true,
        });
        console.info("[auth] accepted an existing Base44 password; password change required");
      } catch (error) {
        console.warn("[auth] Base44 password migration failed", (error as Error).message);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path?.includes("/change-password") && !ctx.path?.includes("/reset-password")) return;
      const session = ctx.context.session as { user?: { id?: string }; session?: { userId?: string } } | undefined;
      const userId = session?.user?.id || session?.session?.userId;
      if (userId) await clearMustChangePassword(userId);
    }),
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await deliverPasswordResetEmail({ user, url });
    },
    onPasswordReset: async ({ user }) => {
      if (user?.id) await clearMustChangePassword(user.id);
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
      mustChangePassword: {
        type: "boolean",
        defaultValue: false,
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
