import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { SnapGrokClerkProvider } from "./clerk-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const origin = await requestOrigin();
  const title = "SnapGrok — Capture the question. Keep your focus.";
  const description =
    "SnapGrok is a secure Chrome MCQ capture assistant with website-based sign-in and account management.";
  const socialImage = `${origin}/og-account-v2.png`;

  return {
    title,
    description,
    icons: {
      icon: "/snapgrok-icons/default.png",
      shortcut: "/snapgrok-icons/default.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: origin,
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "SnapGrok secure account experience" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SnapGrokClerkProvider>{children}</SnapGrokClerkProvider>
      </body>
    </html>
  );
}

async function requestOrigin() {
  const requestHeaders = await headers();
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the current request host.
    }
  }

  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProto === "http" ? "http" : "https";
  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return `${protocol}://${host}`;
  }
  return "http://localhost:3000";
}
