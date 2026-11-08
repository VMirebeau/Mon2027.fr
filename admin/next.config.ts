import type { NextConfig } from "next";
import path from "node:path";

/// Security headers — CSP seulement en production (le dev Next utilise des
/// inline scripts + eval pour Fast Refresh).
const isProd = process.env.NODE_ENV === "production";

const SECURITY_HEADERS = [
  ...(isProd
    ? [
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "img-src 'self' data:",
            // 'unsafe-inline' indispensable : Next 16 App Router injecte des
            // scripts inline (amorçage RSC, hydratation). Sans lui, aucune
            // page de l'admin n'était hydratée en prod (formulaires en mode
            // dégradé, menus inertes) — constaté le 2026-11-07. Les nonces
            // exigeraient le proxy, que Next 16.2.6 ne charge pas en build
            // standalone (cf. player/next.config.ts). Le reste de la CSP
            // (connect/form-action/base-uri/frame-ancestors) reste strict.
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
          ].join("; "),
        },
      ]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

// En prod, l'admin est servi sous mon2027.fr/admin (path-based, derrière le
// même reverse-proxy que le player). basePath est conditionnel via env var
// pour ne pas casser le dev local (admin reste sur http://localhost:2027/).
const basePath = process.env.NEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
  // `next dev --webpack` au lieu de Turbopack : Turbopack 16.2.6 spawne
  // beaucoup de workers V8 et OOM au démarrage sur cette machine. Webpack
  // est plus lent à recharger mais stable côté mémoire.
  experimental: {
    webpackMemoryOptimizations: true,
  },
  output: "standalone",
  // Sans ça, Next prend la racine du repo (qui contient prisma/ + player/)
  // comme tracing root et place le standalone sous /standalone/admin/.
  // En épinglant __dirname, le standalone est aplati directement.
  outputFileTracingRoot: path.join(__dirname),
  // Prisma reste un externe Node : pas bundlé, require() à runtime, ce qui
  // laisse Node trouver @prisma/client + .prisma/client dans le node_modules
  // local de l'app.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
