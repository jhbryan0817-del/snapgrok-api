import { BrandLogo } from "./brand-logo";
import "./recovery.css";

type RecoveryPageProps = {
  label: string;
  title: string;
  detail: string;
  onRetry?: () => void;
};

// Recovery must also render when the root layout or authentication provider fails.
export function RecoveryPage({ label, title, detail, onRetry }: RecoveryPageProps) {
  return (
    <main className="recovery-page">
      <header className="recovery-header">
        <a href="/" aria-label="Zenaian home"><BrandLogo /></a>
        <a className="recovery-account-link" href="/account">Open account</a>
      </header>
      <section className="recovery-content" aria-labelledby="recovery-title">
        <div className="recovery-card">
          <span className="recovery-label">{label}</span>
          <h1 id="recovery-title">{title}</h1>
          <p>{detail}</p>
          <div className="recovery-actions">
            {onRetry ? <button type="button" onClick={onRetry}>Try again</button> : null}
            <a className={onRetry ? "recovery-secondary-link" : "recovery-primary-link"} href="/">Return home</a>
          </div>
          <a className="recovery-support-link" href="mailto:support@zenaian.com">Contact support</a>
        </div>
      </section>
    </main>
  );
}
