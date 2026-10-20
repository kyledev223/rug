import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_TAGLINE, DISCLAIMER } from "@/lib/config";
import { Nav } from "@/components/Nav";
import { Ticker } from "@/components/Ticker";
import { Footer } from "@/components/Footer";
import { Providers } from "@/components/Providers";
import { WalletButton } from "@/components/wallet/WalletButton";

const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["500", "700"], display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: `Paste a Solana token mint and get an evidence-backed risk report. ${DISCLAIMER}`,
  openGraph: { siteName: APP_NAME, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mono.variable} ${grotesk.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <div aria-hidden>
          <div className="bg-grid" />
          <div className="bg-glow" />
          <div className="bg-scan" />
          <div className="bg-noise" />
        </div>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-paper focus:p-2">
          Skip to content
        </a>
        <Providers>
          <Nav wallet={<WalletButton />} />
          <Ticker />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
