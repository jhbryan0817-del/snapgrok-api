import type { NextConfig } from "next";

requiredHttpsOrigin(
  process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL,
  "NEXT_PUBLIC_CLERK_FRONTEND_API_URL",
  "clerk.sneaksolve.com",
);
requiredSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);

const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const privateRouteHeaders = [
  { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0, must-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Surrogate-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/account/:path*", headers: privateRouteHeaders },
      { source: "/sign-in/:path*", headers: privateRouteHeaders },
      { source: "/sign-up/:path*", headers: privateRouteHeaders },
    ];
  },
};

export default nextConfig;

function requiredHttpsOrigin(value: string | undefined, name: string, productionHostname: string): string {
  if (!value) throw new Error(`${name} is required.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS origin without a path.`);
  }
  if (process.env.NODE_ENV === "production" && url.hostname !== productionHostname) {
    throw new Error(`${name} must use https://${productionHostname} in production.`);
  }
  return url.origin;
}

function requiredSiteOrigin(value: string | undefined): string {
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL is required.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute URL."); }
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must contain only the site origin.");
  }
  if (process.env.NODE_ENV === "production" && url.hostname !== "www.sneaksolve.com") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use https://www.sneaksolve.com in production.");
  }
  return url.origin;
}
