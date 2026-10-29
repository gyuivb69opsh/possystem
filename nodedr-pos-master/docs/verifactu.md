# Spain VERI\*FACTU

**Status: implemented, not certified.** NODEDR POS now keeps the records Spain's anti-fraud rules require and can report them to the tax agency (AEAT). It has **not** been run against the live AEAT portal, and NODEDR INFOTECH PRIVATE LIMITED has **not** issued the *Declaración Responsable* that the law requires from the software producer. Do not tell a customer it is "compliant" until both are done.

Background: Real Decreto 1007/2023 and Orden HAC/1177/2024. AEAT's note (updated 13 October 2026) gives 1 January 2027 for corporate-income-tax payers and 1 July 2027 for everyone else; check AEAT for the current position.

## What it does

With VERI\*FACTU switched on (**Settings → VERI\*FACTU**):

| Event | Record |
|---|---|
| A bill with goods is completed | A simplified invoice (`F2`) is added to the chain in the same database transaction as the sale. If the record cannot be produced, the whole bill is rolled back (stock, customer balances and loyalty included). |
| Goods are returned (from the Returns screen, or on a bill) | A corrective simplified invoice (`R5`, by difference, negative amounts) pointing at the original invoice. |
| A bill with no goods (only a due payment) or a zero total | Nothing. |

- **Chained, non-alterable log.** Each record carries the SHA-256 fingerprint (*huella*) of its own fields and of the previous record. SQLite triggers refuse `DELETE`, any change to a record's amounts, XML or hash, and any record that does not continue the chain. Only the submission outcome (status, CSV, errors, attempts) can change.
- **Separate chains** per tax ID and per environment (test and production never mix). Numbers are gap-free (`T1-000001`; corrections `RT1-000001`). The series and NIF are locked once records exist.
- **Receipts.** Every layout prints "Factura simplificada <number>", "QR tributario:", the QR code (ISO 18004, error correction M, about 35 mm) and "Factura verificable en la sede electrónica de la AEAT / VERI\*FACTU": the 80 mm HTML and PDF receipts, the A4 invoice, and the direct-USB ESC/POS job (native `GS ( k` QR, module size 6 ≈ 33 mm on 203 dpi paper). In Spain mode the receipts say IVA and show the NIF instead of CGST/SGST and GSTIN.
- **Reporting.** A background job sends pending records to AEAT in chain order over mutual TLS with the shop's own certificate (`.p12`/`.pfx`, stored AES-256-GCM encrypted), respects AEAT's waiting interval, retries transport errors every 5 minutes and records every answer (accepted, accepted with errors, rejected, CSV). *Send now* triggers a run, *Export XML* downloads every record as one AEAT request body, *Check chain* recomputes every hash.

## Setting up

1. Company settings: currency **EUR**, a legal name. Tax settings: turn tax on and give every product its real IVA rate (0, 2, 4, 5, 7.5, 10 or 21; anything else is refused rather than guessed).
2. The server operator sets `VERIFACTU_PRODUCER_ID` (the software producer's identifier, at most 20 characters). Optional: `VERIFACTU_PRODUCER_NAME`, `VERIFACTU_PRODUCER_COUNTRY` (default `IN`), `VERIFACTU_PRODUCER_ID_TYPE` (default `04`), `VERIFACTU_SYSTEM_ID` (2 characters, default `NP`).
3. Settings → VERI\*FACTU: enter the shop NIF/CIF, choose **Test**, pick a series, switch it on, upload the certificate.
4. Run sales in **Test** and confirm AEAT accepts them in its pre-production portal before switching to **Production** (a new chain).

Prices are tax-inclusive. The invoice total is the bill's total after discounts and loyalty, and IVA is backed out per rate.

## What has and has not been verified

Verified in this repository (`backend/test/verifactu.*.test.js`):
- The three worked hash examples in AEAT's hash specification v0.1.2 and the QR encoding example in the QR specification v0.5.0.
- The XML of `F2` and `R5` records validates against AEAT's published schema (`SuministroLR.xsd`) using a Java schema validator.
- Through the real server and SQLite: numbered records, the QR on the HTML receipt, both PDF layouts, the ESC/POS QR bytes, corrective records for returns (including a bill that sells and returns at once), gap-free numbering under concurrent sales, the append-only triggers, rollback of a bill whose record cannot be produced, certificate upload and encryption (secrets never returned by the API), and the XML export.
- The submission cycle against a fake sender (accepted, rejected, accepted-with-errors, transport failure and retry, AEAT's waiting interval), and a mutual-TLS client that presents the `.p12` certificate to a local HTTPS server that requires one.

**Not verified:**
- Any exchange with AEAT's real servers. The field-level rules AEAT applies beyond the schema (its error catalogue) are only learned that way.
- Printing on a physical thermal printer: the QR bytes are tested, the printed size and scannability are not.
- Complete invoices (`F1`) for customers who ask for one with their NIF, cancellation records and corrections of a *rejected* submission (*subsanación*) are not implemented. Simplified invoices are allowed in retail up to EUR 400 and hospitality up to EUR 3,000; larger sales need an `F1`.
- A return of a sale made before VERI\*FACTU was switched on produces no record, because there is no invoice to rectify.
- The *Declaración Responsable*, a legal statement by the producer that software cannot generate.
