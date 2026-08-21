import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource/eb-garamond/latin-600.css";
import { ZenaianClerkProvider } from "./clerk-provider";
import { MotionEnhancer } from "./motion-enhancer";
import { SiteFooter } from "./site-footer";
import "./globals.css";
import "./v6-14-1.css";

const siteOrigin = configuredSiteOrigin();
const title = "Zenaian | Study Smarter, Score Higher";
const description = "Zenaian is a fast, reliable, and private Chrome MCQ assistant with secure website-based account management.";
const socialImage = `${siteOrigin}/og-zenaian.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  applicationName: "Zenaian",
  title,
  description,
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/favicon.svg",
    apple: "/zenaian-search-icon-v2.png",
  },
  openGraph: {
    title,
    description,
    siteName: "Zenaian",
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
      <body>
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
