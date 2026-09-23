import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function betterAuthDevPlugin() {
  return {
    name: "better-auth-dev",
    async configureServer(server) {
      // Google + Better Auth cookies are host-only. 127.0.0.1 and localhost
      // are different sites, which produces state_mismatch on the callback.
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host || "";
        if (host.startsWith("127.0.0.1")) {
          const port = host.includes(":") ? host.split(":")[1] : "5173";
          res.statusCode = 302;
          res.setHeader("Location", `http://localhost:${port}${req.url || "/"}`);
          res.end();
          return;
        }
        next();
      });

      const { toNodeHandler } = await import("better-auth/node");
      const { auth } = await import("./server/auth.ts");
      const { handleNeonEntity } = await import("./server/neon-entities.ts");
      const { handleNeonFunction } = await import("./server/neon-functions.ts");
      const { handleAdminUsers } = await import("./server/admin-users.ts");
      const handler = toNodeHandler(auth);
      server.middlewares.use(async (req, res, next) => {
        const url = req.originalUrl || req.url || "";
        if (url.startsWith("/api/auth")) {
          req.url = url;
          return handler(req, res);
        }
        if ((url.split("?")[0] || "") === "/api/admin/users") {
          return handleAdminUsers(req, res);
        }

        const parsed = new URL(url, "http://localhost");
        const entityMatch = parsed.pathname.match(/^\/api\/apps\/[^/]+\/entities\/([^/]+)(?:\/(.*))?$/);
        if (entityMatch) {
          return handleNeonEntity(req, res, decodeURIComponent(entityMatch[1]), entityMatch[2] || "", parsed.searchParams);
        }

        const fnMatch = parsed.pathname.match(/^\/api\/apps\/[^/]+\/functions\/([^/]+)$/);
        if (fnMatch) {
          const handled = await handleNeonFunction(req, res, decodeURIComponent(fnMatch[1]));
          if (handled) return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    logLevel: "info",
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
    plugins: [
      betterAuthDevPlugin(),
      base44({
        // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
        // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
        legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === "true",
        hmrNotifier: true,
        navigationNotifier: true,
        analyticsTracker: true,
        visualEditAgent: true,
      }),
      react(),
    ],
  };
});