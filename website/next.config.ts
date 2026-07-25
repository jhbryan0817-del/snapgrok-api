import type { NextConfig } from "next";

const clerkFrontendApiOrigin = requiredHttpsOrigin(
  process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL,
  "NEXT_PUBLIC_CLERK_FRONTEND_API_URL",
);
const contentSecurityPolicy = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
  `script-src 'self' 'unsafe-inline' ${clerkFrontendApiOrigin} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https://img.clerk.com", "font-src 'self' data:",
  `connect-src 'self' ${clerkFrontendApiOrigin} https://clerk-telemetry.com https://*.clerk-telemetry.com`,
  "frame-src 'self' https://challenges.cloudflare.com", "worker-src 'self' blob:", "manifest-src 'self'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() { return [{ source: "/(.*)", headers: securityHeaders }]; },
};
export default nextConfig;

function requiredHttpsOrigin(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS origin without a path.`);
  }
  return url.origin;
}
