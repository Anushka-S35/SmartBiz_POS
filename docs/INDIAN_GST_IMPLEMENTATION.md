# Indian GST implementation status

Updated 2026-11-09. This document describes the current code in this repository. It is not a tax opinion, certification, or claim of GST compliance.

## Implemented foundation

- Migration 7 adds business GST registration type, trade name, state code, registered address, financial-year start month and invoice footer fields. It adds product HSN/SAC, supply classification and pricing mode; cess and source-reference fields to effective-dated tax rates; GSTIN/state fields for customers and suppliers; invoice and invoice-line snapshot fields; purchase tax fields; and an append-only ITC adjustment ledger.
- The migration is additive, registered in the TypeScript migration runner and Tauri SQL migration list, and has an equivalent SQL file under `packages/core/migrations/`.
- Business settings and first-run setup now persist registration status, GSTIN, trade name, registered state code and address, and the existing tax-calculation toggle. Local validation checks GSTIN format/checksum and requires the registration state/address for regular or composition registrations. The app states that local validation does not verify GSTN records.
- Product management now persists HSN/SAC, supply classification and inclusive/exclusive pricing mode. Tax-enabled taxable products require a category and HSN/SAC shape.
- Existing effective-dated category tax rates now also store cess basis points and a source reference. The billing settings expose rate creation and rate history review; existing entries remain immutable.
- `packages/core/src/gst.ts` provides decimal-safe line arithmetic for configured taxable rates, explicit supplier and place-of-supply state codes, intrastate CGST/SGST splitting, interstate IGST, inclusive/exclusive pricing, discount amounts, and cess. Exempt, nil-rated and non-GST lines calculate zero tax. Missing state codes are rejected.
- GSTIN format/checksum and HSN/SAC code-length shape checks are available as local validation helpers. They do not verify a GST registration against GSTN or confirm the correct tariff classification.

## Implemented sales workflow

- New invoice drafts snapshot supplier/customer GST identity and address, financial year, place of supply, document type, product HSN/SAC and supply/pricing category, taxable value and each tax component. Existing records are not backfilled or rewritten.
- Billing calculates configured effective rates for taxable lines, including cess and inclusive/exclusive pricing, and splits CGST/SGST for same-state supply or IGST for interstate supply. The place-of-supply state is explicitly entered for GST-registered businesses; the app does not infer the legal place of supply.
- Regular registration requires tax calculation to be enabled and blocks taxable invoices until products have HSN/SAC and a sourced rate. Composition businesses generate bill-of-supply type documents without tax calculation. Non-GST registrations use retail receipts.
- Invoice numbering allocates a local business/FY sequence. Cancellation records tax reversal components and returns record cumulative rounded tax reversals in append-only rows.
- The invoice PDF shows the stored supplier/recipient details, HSN/SAC, taxable values, component taxes, document label, totals, and configured footer. This output has not received statutory or practitioner validation.

## Remaining or unverified

- Purchase tax capture, supplier invoice date/number snapshots, tax calculation at receipt, explicit ITC eligibility decisions, blocked-credit rules, claim/reversal/reclaim services, supplier GST purchase register, and GST-aware supplier credits are not wired. Purchase GST columns and the ITC adjustment ledger are schema groundwork only.
- GST sales/purchase registers, HSN summaries, GSTR-1 and GSTR-3B preparation exports, and reconciliation reports are not implemented.
- Reverse-charge handling is not implemented. Composition restrictions beyond choosing a bill-of-supply document and suppressing GST calculation are not comprehensive.
- The local invoice sequence is not connected to a centralized numbering service and does not guarantee cross-device coordination.
- No credit/debit note document workflow, e-invoice/IRN, signed QR, e-way bill integration, government return filing connection, offline integration queue or API credential workflow exists.
- Local GSTIN/HSN shape checks are not authoritative validation. Rates, classifications, place-of-supply determination, invoice output and scheme rules still require practitioner review and verification against current government schemas and rules.
- GST flows have automated core tests but no full manual acceptance, supported-device billing/PDF review, offline scenario suite or external compliance verification.

The ITC adjustment table is only a database ledger foundation; it does not authorize or decide eligibility. Existing invoices are not backfilled or rewritten by migration 7. Their new GST snapshot columns remain at empty/default values; newly created sales documents store GST snapshots.

## Regulatory references checked

These official references support the need for rules and user decisions but do not by themselves establish that this application meets them:

- [CBIC GST Invoice Rules](https://cbic-gst.gov.in/gst-invoice-rules.html): invoice and bill-of-supply particulars, including supplier/recipient identity, numbering, date and HSN/SAC fields.
- [CBIC Input Tax Credit Rules](https://cbic-gst.gov.in/input-tax-credit-rules.html) and [CGST Act, Chapter V](https://cbic-gst.gov.in/pdf/CGST-Act-Updated-30092020.pdf): documentary conditions, eligibility, apportionment and blocked-credit rules. Eligibility cannot be inferred simply from tax paid on a purchase.
- [GST e-invoice portal mandate information](https://einvoice6.gst.gov.in/content/einvoice-mandate/): applicability depends on notified criteria and entity type; verify current applicability before implementing an integration.
- [GST e-way bill system documentation](https://docs.ewaybillgst.gov.in/) and [official FAQ](https://docs.ewaybillgst.gov.in/html/faq.html): e-way bill processing has movement, value and exception rules; the FAQ describes the general threshold while exceptions and state-specific provisions also matter.
- [GST Portal returns offline tools](https://www.gst.gov.in/download/returns): official offline tools support preparation; this application has no filing connection and must not represent prepared data as filed returns.

Before production use, an Indian GST practitioner should review the target business's registration, supplies, place-of-supply cases, classifications, invoice types, ITC policy, return mappings, e-invoice applicability and e-way bill workflows against current Acts, Rules, notifications and portal schemas.
