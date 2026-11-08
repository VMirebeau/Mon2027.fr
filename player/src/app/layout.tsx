import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  DM_Mono,
  DM_Sans,
  Source_Serif_4,
} from "next/font/google";
import { InstallPrompt } from "@/components/install-prompt";
import { PwaRegister } from "@/components/pwa-register";
import { ReducedMotionConfig } from "@/components/reduced-motion-config";
import { GamificationProvider } from "@/components/gamification-provider";
import { AuthProvider } from "@/lib/use-auth";
import { loadCatalogIndex } from "@/lib/content";
import { PdfShellProvider } from "@/lib/use-pdf-shell";
import { ProgressProvider } from "@/lib/use-progress";
import "./globals.css";

// Fonts servies via next/font : self-hosted au build, preload automatique,
// pas de requête vers fonts.googleapis.com en runtime. Améliore le LCP et
// supprime le warning ESLint `no-page-custom-font`.
//
// On expose chaque font via une variable CSS pour rester compatible avec
// les `var(--font-*)` consommées dans globals.css et les inline styles.
const fontDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});
const fontBody = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
const fontMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://mon2027.fr",
  ),
  title: {
    default: "Mon2027",
    template: "%s · Mon2027",
  },
  description:
    "Teste ce que tu crois savoir sur la France. Prépare ton vote.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Mon2027",
    locale: "fr_FR",
    url: "/",
  },
  // Sans `summary_large_image`, X.com (Twitter) affiche la twitter-image en
  // petite vignette carrée tronquée — alors qu'on a une 1200×630 paysage.
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Cohérent avec --paper du shell : pas de "flash" de couleur étrangère
  // sur la status bar Android quand l'app est lancée en standalone/TWA.
  themeColor: "#FAF8F3",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const fontVars = [
    fontDisplay.variable,
    fontBody.variable,
    fontSerif.variable,
    fontMono.variable,
  ].join(" ");
  // Catalog index chargé ici (server, requête légère : juste id+theme) pour
  // alimenter le système de gamification quelle que soit la route. Sans ça,
  // `GamificationWatcher` ne tournait que dans AppShell et les pages
  // standalone (/q/[slug], /d/[shortCode]) ne déclenchaient pas la toast
  // de déblocage au moment où l'utilisateur répondait.
  const catalog = await loadCatalogIndex();
  return (
    <html lang="fr" className={fontVars}>
      <body>
        <PwaRegister />
        {/* Providers fournis au root pour que toutes les routes (/, /d/[code],
            /q/[slug], /favorites, etc.) y aient accès. ProgressProvider lit
            useAuth() pour le sync ; AuthProvider doit donc l'envelopper.
            GamificationProvider lit Progress et l'index catalogue → il vit
            sous ProgressProvider. */}
        {/* MotionConfig reducedMotion="user" : framer-motion respecte le
            réglage système « Réduire les animations ». */}
        <ReducedMotionConfig>
        <AuthProvider>
          <ProgressProvider>
            <GamificationProvider catalog={catalog}>
              <PdfShellProvider>
                {children}
                {/* InstallPrompt monté au root : il consomme useProgress pour
                    gater l'affichage sur "≥ 1 question répondue". Ne rend rien
                    tant que le browser n'a pas émis beforeinstallprompt. */}
                <InstallPrompt />
              </PdfShellProvider>
            </GamificationProvider>
          </ProgressProvider>
        </AuthProvider>
        </ReducedMotionConfig>
      </body>
    </html>
  );
}
