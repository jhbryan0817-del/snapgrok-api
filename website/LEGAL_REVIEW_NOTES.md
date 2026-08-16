# Zenaian privacy and legal launch checklist

The repository implements the approved privacy architecture, but the following
operator-controlled and counsel-reviewed work cannot be completed in source
code. These items must be closed before the public documents are treated as
final production notices.

## Required before publication or commercial launch

1. Replace every operator, address, registration, CPO/privacy-responsible
   person, support-email, and effective-date placeholder in the public Privacy
   Policy, Website Terms, and Whop documents.
2. Create `privacy@zenaian.com` in Google Workspace using the approved setup:
   Business Standard, covered data-at-rest region United States, enforced 2SV,
   no personal-account forwarding, ordinary privacy email auto-delete after
   365 days, no Vault by default, and controlled export/deletion procedures.
   Then change public wording from planned configuration to actual fact.
3. In Whop Dashboard > Settings > Legal, upload the Zenaian Terms of Service,
   Privacy Policy, and Return Policy / Additional Terms. Enable **Require terms
   and conditions acceptance** and verify that the final checkout shows the
   recurring interval, base price, no trial, exclusive tax behavior, tax added
   where applicable, immediate digital access, cancellation path, and statutory
   withdrawal language.
4. Have Korean counsel validate the exact E-Commerce Act Article 17/18
   service/digital-content withdrawal measures and pre-payment disclosure.
   Account deletion must remain separate from withdrawal/refund requests.
5. Confirm Whop Tax Service / Collects and Remits configuration where intended,
   without stating that Whop assumes all Zenaian seller, tax, or consumer-law
   obligations.
6. Keep Hosting.kr/Megazone visitor-statistics packages, visitor tracking, and
   raw-log archiving disabled. Record current cPanel settings. The present
   classification is domestic Korean hosting; revise the register and Privacy
   Policy if later provider evidence establishes an overseas region.
7. Confirm the production Render plan, region, native log settings, recovery
   windows, and no third-party log warehouse; retain dated screenshots or
   exports as operational evidence.
8. Confirm xAI production responses return
   `x-zero-data-retention: true`, keep dated administrative evidence, and stop
   production analysis if the header is false or missing.
9. Run the privacy migration and deployment preflight against the production
   database. Confirm the segregated legal-retention schema exists, legacy Lemon
   Squeezy tables are absent or safely migrated, and retention/deletion workers
   are operating.
10. Match the Chrome Web Store privacy disclosures and permission
    justifications to the final extension behavior, including screenshot and
    optional instruction transfer to Zenaian/xAI, transient processing,
    generative-AI notice, and the sensitive-data warning.
11. Perform a final PIPA, E-Commerce Act, and AI Basic Act check using the law
    in force on the actual launch date.

These checks are deployment evidence and external-service configuration, not
substitutes for the automated code tests in this repository.
