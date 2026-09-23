import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { deliverPasswordResetEmail } from "./reset-email.ts";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: new Pool({ connectionString: databaseUrl }),
  trustedOrigins: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://100collectionos.vercel.app",
  ],
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
});
