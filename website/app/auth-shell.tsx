import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page auth-page-simple">
      <SiteHeader />
      <section className="auth-simple-layout" aria-label="Zenaian account access">
        <div className="clerk-surface">{children}</div>
      </section>
    </main>
  );
}
