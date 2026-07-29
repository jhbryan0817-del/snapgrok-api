import type { Metadata } from "next";
import { headers } from "next/headers";
import { SneakSolveClerkProvider } from "./clerk-provider";
import { SiteFooter } from "./site-footer";
import "./globals.css";

const siteOrigin = configuredSiteOrigin();
const title = "SneakSolve — Ask in silence";
const description = "SneakSolve is a fast, reliable, and private Chrome MCQ assistant with secure website-based account management.";
const socialImage = `${siteOrigin}/sneaksolve-how-it-works.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title,
  description,
  icons: { icon: "/sneaksolve-icons/default.png", shortcut: "/sneaksolve-icons/default.png" },
  openGraph: {
    title,
    description,
    type: "website",
    url: siteOrigin,
    images: [{ url: socialImage, width: 1536, height: 1024, alt: "SneakSolve landing page" }],
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
        <SneakSolveClerkProvider nonce={nonce}>
          {children}
          <SiteFooter />
        </SneakSolveClerkProvider>
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
  if (process.env.NODE_ENV === "production" && url.hostname !== "www.sneaksolve.com") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use https://www.sneaksolve.com in production.");
  }
  return url.origin;
}
