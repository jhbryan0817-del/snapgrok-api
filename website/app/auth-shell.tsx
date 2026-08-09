import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page auth-page-simple">
      <SiteHeader />
      <section className="auth-simple-layout" aria-labelledby="auth-welcome-title">
        <p className="auth-simple-welcome" id="auth-welcome-title">
          Welcome to Zenaian.
        </p>
        <div className="auth-simple-card">
          <div className="clerk-surface">{children}</div>
        </div>
      </section>
    </main>
  );
}
