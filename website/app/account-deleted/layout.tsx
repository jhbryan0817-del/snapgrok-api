import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account deletion | Zenaian",
  robots: { index: false, follow: false },
};

export default function AccountDeletedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
