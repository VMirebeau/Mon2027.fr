import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // "server-only" est un sentinel Next que vitest ne sait pas résoudre.
      // On l'alias vers un module vide pour les tests — il sert juste à
      // faire échouer un import client de modules serveur, pas à fournir
      // une API.
      "server-only": new URL(
        "./src/test/server-only-stub.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    globals: true,
    exclude: ["node_modules", ".next", "e2e"],
    // Les tests métier sont purs (libs), pas besoin d'environment DOM.
    // Si un jour on ajoute des tests de composants React, override en
    // jsdom au niveau du fichier via `// @vitest-environment jsdom`.
  },
});
