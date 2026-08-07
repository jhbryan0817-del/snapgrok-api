import { BillingStatusProvider } from "../billing-status-context";
import { SiteHeader } from "../site-header";
import { PricingAction } from "./pricing-action";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "US$0",
    cadence: "forever",
    allowance: "5 questions every day",
    reset: "Resets daily",
    model: "Grok 4.3",
    modelCopy:
      "Fast, sharp reasoning for everyday questions and quick study sessions.",
    features: [
      "Full-screen and selected-area capture",
      "Custom keyboard shortcuts",
      "Optional AI context",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    id: "plus",
    name: "Plus",
    price: "US$5",
    cadence: "per month",
    allowance: "200 questions every month",
    reset: "Resets monthly",
    model: "Grok 4.3",
    modelCopy:
      "The same formidable reasoning engine, with room for your longest study days.",
    features: [
      "Everything offered in the Free plan",
      "More flexible usage",
    ],
    cta: "Choose Plus",
    featured: false,
  },
  {
    id: "ultra",
    name: "Ultra",
    price: "US$7",
    cadence: "per month",
    allowance: "300 questions every month",
    reset: "Resets monthly",
    model: "Grok 4.5",
    modelCopy:
      "Frontier-grade intelligence for brutal, multi-step problems where ordinary reasoning reaches its limit.",
    features: [
      "Our highest monthly capacity",
      "Advanced Grok 4.5 model access",
      "Built for the hardest questions",
    ],
    cta: "Choose Ultra",
    featured: true,
  },
] as const;

export default function PricingPage() {
  return (
    <main className="pricing-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader activeItem="pricing" />

      <BillingStatusProvider>
        <section className="pricing-grid shell" aria-label="Zenaian plans">
          {plans.map((plan) => (
            <article
              className={`pricing-card${plan.featured ? " pricing-card-featured" : ""}`}
              key={plan.name}
            >
              {plan.featured ? <span className="pricing-popular">MOST POPULAR</span> : null}
              <div className="pricing-card-top">
                <h2>{plan.name}</h2>
                <div className="pricing-price">
                  <strong>{plan.price}</strong>
                  <span>{plan.cadence}</span>
                </div>
              </div>

              <div className="pricing-allowance">
                <strong>{plan.allowance}</strong>
                <span>{plan.reset}</span>
              </div>

              <div className="pricing-model">
                <span>POWERED BY</span>
                <strong>{plan.model}</strong>
                <p>{plan.modelCopy}</p>
              </div>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}><span aria-hidden="true">&#10003;</span>{feature}</li>
                ))}
              </ul>

              <PricingAction
                plan={plan.id}
                label={plan.cta}
              />
            </article>
          ))}
        </section>
      </BillingStatusProvider>
    </main>
  );
}
