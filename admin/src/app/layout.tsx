import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AdminNav } from "./_components/AdminNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://mon2027.fr/admin",
  ),
  title: "Mon2027 · Contributeurs",
  description: "Espace des contributeurs de Mon2027 : élaboration collective des questions.",
  // Espace privé : jamais indexé.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Mon2027 · Admin",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <AdminNav />
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
