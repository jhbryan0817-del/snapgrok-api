import type { Metadata } from "next";
import { headers } from "next/headers";
import { ZenaianClerkProvider } from "./clerk-provider";
import { MotionEnhancer } from "./motion-enhancer";
import { SiteFooter } from "./site-footer";
import { EB_Garamond } from "next/font/google";
import "./globals.css";

const siteOrigin = configuredSiteOrigin();
const title = "Zenaian | AI-Powered Education Tool";
const description = "Zenaian is a fast, reliable, and private Chrome MCQ assistant with secure website-based account management.";
const socialImage = `${siteOrigin}/og-zenaian.png`;

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-eb-garamond",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title,
  description,
  icons: { icon: "/zenaian-logo.png", shortcut: "/zenaian-logo.png" },
  openGraph: {
    title,
    description,
    type: "website",
    url: siteOrigin,
    images: [{ url: socialImage, width: 1536, height: 1024, alt: "Zenaian — Ask in silence. Stay focused." }],
  },
  twitter: { card: "summary_large_image", title, description, images: [socialImage] },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce");
  if (!nonce) {
    throw new Error("The request CSP nonce is missing.");
  }
  return (
    <html lang="en">
      <body className={ebGaramond.variable}>
        <MotionEnhancer />
        <ZenaianClerkProvider nonce={nonce}>
          {children}
          <SiteFooter />
        </ZenaianClerkProvider>
      </body>
    </html>
  );
}

function configuredSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) throw new Error("NEXT_PUBLIC_SITE_URL is required.");
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute URL."); }
  const localDevelopment = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localDevelopment) throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("NEXT_PUBLIC_SITE_URL must contain only the site origin.");
  if (process.env.NODE_ENV === "production" && url.hostname !== "www.zenaian.com") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use https://www.zenaian.com in production.");
  }
  return url.origin;
}
