"use client";

import { Component, type ReactNode } from "react";

type BillingPanelBoundaryProps = {
  children: ReactNode;
};

type BillingPanelBoundaryState = {
  failed: boolean;
};

export class BillingPanelBoundary extends Component<
  BillingPanelBoundaryProps,
  BillingPanelBoundaryState
> {
  state: BillingPanelBoundaryState = { failed: false };

  static getDerivedStateFromError(): BillingPanelBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="billing-panel" aria-labelledby="billing-panel-fallback-title">
          <div className="billing-panel-heading">
            <div>
              <span className="section-kicker">PLAN &amp; USAGE</span>
              <h2 id="billing-panel-fallback-title">SneakSolve plan</h2>
            </div>
          </div>
          <p className="billing-panel-state">
            Plan details could not be displayed. Your account and extension
            access are still available. Please reload this page to try again.
          </p>
          <div className="billing-panel-actions">
            <a href="/pricing">View plan upgrades</a>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
