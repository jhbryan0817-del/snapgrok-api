"use client";

import { useAuth, useClerk, useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import { useEffect, useRef, useState } from "react";
import {
  deletePrivacyAccount,
  getPrivacyExport,
  PrivacyApiError,
  type DeleteAccountConfirmation,
  type DeleteAccountReceipt,
} from "../privacy-api";
import { clearExtensionAccessBeforeSignOut } from "../sign-out";

const DELETE_CONFIRMATIONS = [
  {
    key: "immediateLoss",
    text: "I understand that deletion immediately ends my remaining Zenaian access and unused question allowance.",
  },
  {
    key: "renewalCancellation",
    text: "I understand that Zenaian will request cancellation of future Whop renewal, but account deletion is not a refund request.",
  },
  {
    key: "legalRetention",
    text: "I understand that narrow transaction or complaint records may be retained separately when required by law.",
  },
  {
    key: "irreversible",
    text: "I understand that deletion from active systems is irreversible and that rolling provider backups age out on their own schedules.",
  },
] as const;

type ConfirmationKey = (typeof DELETE_CONFIRMATIONS)[number]["key"];
type ConfirmationState = Record<ConfirmationKey, boolean>;

type PrivacyReverificationHint = {
  clerk_error: {
    type: "forbidden";
    reason: "reverification-error";
    metadata: {
      reverification: {
        level: "first_factor";
        afterMinutes: number;
      };
    };
  };
};

const EMPTY_CONFIRMATIONS: ConfirmationState = {
  immediateLoss: false,
  renewalCancellation: false,
  legalRetention: false,
  irreversible: false,
};

export function PrivacyPanel() {
  const { getToken } = useAuth();
  const loadPrivacyExport = useReverification(() =>
    authenticatedPrivacyAction(
      () => getToken({ skipCache: true }),
      getPrivacyExport,
    ));
  const [activeAction, setActiveAction] = useState<"export" | null>(null);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function downloadData() {
    setError("");
    setActiveAction("export");
    try {
      const exportData = await loadPrivacyExport();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `zenaian-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      // WebKit may not begin consuming a synthetic download synchronously.
      // Keep the object URL alive briefly, then release it.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (nextError) {
      setError(privacyErrorMessage(nextError));
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="account-privacy-section" aria-labelledby="account-privacy-title">
      <div className="account-privacy-heading">
        <div>
          <span className="section-kicker">PRIVACY DETAILS</span>
          <h2 id="account-privacy-title">Your data and account</h2>
        </div>
        <p>Download a JSON copy of your account data or permanently delete your account.</p>
      </div>

      <div className="account-privacy-actions">
        <button type="button" onClick={() => void downloadData()} disabled={activeAction !== null}>
          {activeAction === "export" ? "Preparing..." : "Download JSON"}
        </button>
        <button
          type="button"
          className="account-privacy-delete-button"
          onClick={() => setDeleteOpen(true)}
        >
          Delete account
        </button>
      </div>

      {error ? <p className="account-privacy-error" role="alert">{error}</p> : null}

      {deleteOpen ? (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
        />
      ) : null}
    </section>
  );
}

function DeleteAccountModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const deleteWithReverification = useReverification(
    (confirmation: DeleteAccountConfirmation) =>
      authenticatedPrivacyAction(
        () => getToken({ skipCache: true }),
        (token) => deletePrivacyAccount(token, confirmation),
      ),
  );
  const [confirmations, setConfirmations] = useState(EMPTY_CONFIRMATIONS);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<DeleteAccountReceipt | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting && !receipt) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, receipt, submitting]);

  const allConfirmed = Object.values(confirmations).every(Boolean);
  const canDelete = allConfirmed && confirmText === "DELETE" && !submitting;

  async function submitDeletion() {
    if (!canDelete) return;
    setError("");
    setSubmitting(true);
    try {
      const nextReceipt = await deleteWithReverification({
        confirmImmediateLoss: true,
        confirmRenewalCancellation: true,
        confirmLegalRetention: true,
        confirmIrreversible: true,
        confirmText: "DELETE",
      });
      setReceipt(nextReceipt);
      window.sessionStorage.setItem(
        "zenaianDeletionReceipt",
        JSON.stringify(nextReceipt),
      );
      // The API has already deleted the remote Clerk user at this point. Start
      // a hard-navigation fallback before asking that now-invalid session for
      // another token or waiting for Clerk sign-out, because either SDK call
      // may remain pending after remote deletion.
      const deletionRedirectFallback = window.setTimeout(
        () => window.location.replace("/account-deleted"),
        2_500,
      );
      try {
        await clearExtensionAccessBeforeSignOut(() =>
          getToken({ skipCache: true }));
        await signOut({ redirectUrl: "/account-deleted" });
      } catch {
        // A deleted remote Clerk user can make token cleanup or local sign-out
        // report an error even though the session must still be discarded.
      } finally {
        window.clearTimeout(deletionRedirectFallback);
        // Clerk may report an already-deleted remote user while clearing the
        // local session. A hard navigation guarantees that stale account UI
        // cannot trap the user on the authenticated account screen.
        window.location.replace("/account-deleted");
      }
    } catch (nextError) {
      setError(privacyErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="privacy-modal-backdrop">
      <section
        className="privacy-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-delete-title"
        aria-describedby="privacy-delete-description"
      >
        {receipt ? (
          <div className="privacy-delete-receipt">
            <span className="privacy-delete-receipt-mark" aria-hidden="true">✓</span>
            <h2 id="privacy-delete-title">Deletion request received</h2>
            <p id="privacy-delete-description">
              Further Zenaian service access is blocked immediately. Active-system
              deletion normally completes within 24 hours; any required provider
              retry remains blocked from restoring access.
            </p>
            <dl>
              <div><dt>Receipt</dt><dd>{receipt.requestId}</dd></div>
              <div><dt>State</dt><dd>{receipt.state}</dd></div>
            </dl>
            <a className="privacy-modal-primary" href="/">Return home</a>
          </div>
        ) : (
          <>
            <div className="privacy-modal-heading">
              <div>
                <span className="section-kicker">PERMANENT ACTION</span>
                <h2 id="privacy-delete-title">Delete your Zenaian account?</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="privacy-modal-close"
                onClick={onClose}
                disabled={submitting}
                aria-label="Close deletion confirmation"
              >
                ×
              </button>
            </div>
            <p id="privacy-delete-description" className="privacy-modal-intro">
              This immediately ends your access and remaining allowance. Review
              and confirm every consequence before continuing.
            </p>

            <div className="privacy-delete-confirmations">
              {DELETE_CONFIRMATIONS.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    checked={confirmations[item.key]}
                    onChange={(event) => setConfirmations((current) => ({
                      ...current,
                      [item.key]: event.target.checked,
                    }))}
                    disabled={submitting}
                  />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>

            <label className="privacy-delete-typed-confirmation">
              <span>Type <strong>DELETE</strong> to confirm</span>
              <input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
                aria-label="Type DELETE to confirm account deletion"
              />
            </label>

            {error ? <p className="account-privacy-error" role="alert">{error}</p> : null}

            <div className="privacy-modal-actions">
              <button type="button" onClick={onClose} disabled={submitting}>Keep account</button>
              <button
                type="button"
                className="privacy-modal-destructive"
                onClick={() => void submitDeletion()}
                disabled={!canDelete}
              >
                {submitting ? "Submitting..." : "Permanently delete account"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function privacyErrorMessage(error: unknown): string {
  if (isReverificationCancelledError(error)) {
    return "Verification was canceled. Your privacy request was not sent.";
  }
  if (
    error instanceof PrivacyApiError &&
    error.code === "AUTH_REVERIFICATION_REQUIRED"
  ) {
    return "Please verify your identity, then retry this privacy request.";
  }
  if (error instanceof PrivacyApiError) {
    if (error.status >= 500) {
      return [
        error.message,
        `Error code: ${error.code}.`,
        ...(error.requestId ? [`Reference: ${error.requestId}.`] : []),
      ].join(" ");
    }
    return error.message;
  }
  return "The privacy request could not be completed. Please try again.";
}

async function authenticatedPrivacyAction<T>(
  getFreshToken: () => Promise<string | null>,
  action: (token: string) => Promise<T>,
): Promise<T | PrivacyReverificationHint> {
  try {
    const token = await getFreshToken();
    if (!token) {
      throw new PrivacyApiError(
        401,
        "AUTH_REQUIRED",
        "Please sign in again before using privacy controls.",
      );
    }
    return await action(token);
  } catch (error) {
    if (
      error instanceof PrivacyApiError &&
      error.code === "AUTH_REVERIFICATION_REQUIRED"
    ) {
      return privacyReverificationHint(
        error.reverificationAfterMinutes || 10,
      );
    }
    throw error;
  }
}

function privacyReverificationHint(
  afterMinutes: number,
): PrivacyReverificationHint {
  return {
    clerk_error: {
      type: "forbidden",
      reason: "reverification-error",
      metadata: {
        reverification: {
          level: "first_factor",
          afterMinutes,
        },
      },
    },
  };
}
