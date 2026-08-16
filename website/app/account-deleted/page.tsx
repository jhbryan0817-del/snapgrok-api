"use client";

import { useAuth, useClerk } from "@clerk/react";
import { useEffect, useState } from "react";
import { BrandLogo } from "../brand-logo";

type StoredReceipt = { requestId: string; state: string };

export default function AccountDeletedPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [receipt, setReceipt] = useState<StoredReceipt | null>(null);

  useEffect(() => {
    setReceipt(readStoredReceipt());
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void signOut({ redirectUrl: "/account-deleted" }).catch(() => {
      // The server may already have deleted the Clerk user. Reloading forces
      // Clerk to discard any unusable cached frontend session.
      window.location.replace("/account-deleted");
    });
  }, [isLoaded, isSignedIn, signOut]);

  return (
    <main className="account-page">
      <section className="privacy-delete-modal" aria-labelledby="deletion-receipt-title">
        <div className="privacy-delete-receipt">
          <BrandLogo compact />
          <span className="privacy-delete-receipt-mark" aria-hidden="true">✓</span>
          <h1 id="deletion-receipt-title">Deletion request received</h1>
          <p>
            Zenaian access is blocked immediately. Active-system deletion
            normally completes within 24 hours if a provider retry is needed.
          </p>
          {receipt ? (
            <dl>
              <div><dt>Receipt</dt><dd>{receipt.requestId}</dd></div>
              <div><dt>State</dt><dd>{receipt.state}</dd></div>
            </dl>
          ) : null}
          <a className="privacy-modal-primary" href="/">Return home</a>
        </div>
      </section>
    </main>
  );
}

function readStoredReceipt(): StoredReceipt | null {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem("zenaianDeletionReceipt") || "null",
    );
    if (
      !value ||
      !/^[0-9a-f-]{36}$/i.test(String(value.requestId || "")) ||
      !/^(blocked|partial|complete)$/.test(String(value.state || ""))
    ) {
      return null;
    }
    return { requestId: String(value.requestId), state: String(value.state) };
  } catch {
    return null;
  }
}
