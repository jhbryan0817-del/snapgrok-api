"use client";

import { RecoveryPage } from "./recovery-page";

export default function GlobalErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Unable to load | Zenaian</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body style={{ margin: 0 }}>
        <RecoveryPage label="PLEASE TRY AGAIN" title="Zenaian couldn’t load" detail="Please try again in a moment. You can also return home or contact Zenaian support." onRetry={reset} />
      </body>
    </html>
  );
}
