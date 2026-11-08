import type { NextConfig } from "next";
import path from "node:path";

/// Security headers appliqués globalement à toutes les routes du player.
///
/// CSP : seulement en production. En dev, Next Fast Refresh utilise des
/// inline scripts + `eval()` qui violeraient la policy ; on ne veut pas
/// dégrader la DX en assouplissant la prod policy. La CSP prod est stricte :
/// pas d'inline scripts (Next built-output n'en a pas), juste `wasm-unsafe-eval`
/// si jamais une dep en a besoin. `style-src 'unsafe-inline'` reste requis
/// tant que beaucoup de composants utilisent `style={{...}}` inline — à
/// durcir plus tard via nonces.
///
/// HSTS : 2 ans + includeSubDomains + preload. À ne mettre QU'en prod sinon
/// http://localhost serait downgradé. Idem CSP.
const isProd = process.env.NODE_ENV === "production";

const SECURITY_HEADERS = [
  ...(isProd
    ? [
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "img-src 'self' data: https:",
            // 'unsafe-inline' nécessaire pour Next 16 App Router : le runtime
            // injecte des scripts inline pour le bootstrap RSC et la
            // hydratation. Solution propre = nonces via proxy.ts, mais
            // Next 16.2.6 a un bug avec standalone + outputFileTracingRoot
            // qui empêche le proxy d'être chargé (middleware-manifest vide).
            // À remplacer par "'nonce-...' 'strict-dynamic'" quand corrigé.
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
          ].join("; "),
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
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

const nextConfig: NextConfig = {
  // `next dev --webpack` au lieu de Turbopack : Turbopack 16.2.6 spawne
  // beaucoup de workers V8 et OOM au démarrage sur cette machine. Webpack
  // est plus lent à recharger mais stable côté mémoire.
  experimental: {
    webpackMemoryOptimizations: true,
  },
  output: "standalone",
  // Le repo a un package-lock.json à la racine (pour `prisma generate`) et
  // un autre dans player/. Sans ça, Next choisit la racine comme workspace
  // root et trace des fichiers hors de l'app.
  outputFileTracingRoot: path.join(__dirname),
  // Accès depuis le LAN (ex. tablette en 10.5.0.2) au dev server. Next 16
  // bloque par défaut tout host !== localhost pour /_next/* en dev.
  allowedDevOrigins: ["10.5.0.2"],
  // Prisma reste un externe Node : pas bundlé, require() à runtime, ce qui
  // laisse Node trouver @prisma/client + .prisma/client dans le node_modules
  // local de l'app.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // On retire l'en-tête `X-Powered-By: Next.js` pour ne pas signaler la
  // version du framework dans les responses (signal de moindre coût, mais
  // facile à enlever).
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Security headers sur toutes les routes.
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        // sw.js doit toujours être revalidé sinon un user reste bloqué
        // sur un vieux service worker après un deploy.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
