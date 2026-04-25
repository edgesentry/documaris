# documaris — PIER71 Evaluation Criteria Mapping

**Date:** 2026-04-24
**Innovation Opportunities applied for:** PIER71-11 (primary) · PIER71-02 (secondary) · PIER71-10 (secondary)

This document maps each of the 10 deck evaluation criteria from the PIER71 SPC Accelerate 2026 application form to the relevant sections of the documaris documentation and demo.

---

## Criteria map

| # | Evaluation criterion | Where documaris addresses it | Key evidence |
|---|---|---|---|
| 1 | **Severity & Urgency** | `background.md` — The problem | 140,000+ Singapore vessel calls/year; port detentions cost US$50,000–500,000; manual re-keying is the norm across all four comparison platforms |
| 2 | **Market Size & Growth** | `background.md` — Market sizing | Singapore SAM: SGD 3.6M–7.0M/year (1,000 ship agents × SGD 300/month subscription, or 140,000 calls/year × SGD 50/call). TAM: IDP US$43.92B by 2034 (33.6% CAGR); Maritime Software US$2.86B by 2035. SAM is conservative and Singapore-only; Phase 2 (Japan, additional ports) expands it. |
| 3 | **Competitive Advantage** | `background.md` — Four core differentiators + Competitive Evidence Matrix | Evidence Matrix records review date and finding ("not stated in public docs") for 3 representative platform categories (voyage management ERP, vessel compliance management, port agency operations). Four capability axes. PoC targets: creation time −56%, rework rate −50%, reported at M3. |
| 4 | **Technology Maturity** | `architecture.md` — full pipeline; `roadmap.md` — M0–M2 | Core design defined; all technology choices are production-proven (Rust, DuckDB, WeasyPrint, WASM, BLAKE3, Ed25519); R2 schema contract and PII boundary pending sign-off; live demo URL operational from M0 Day 1 |
| 5 | **Real-World Validation & Execution** | `roadmap.md` — M3 PoC measurement; `customers.md` — validation plan | M3 PoC: 20 sample Singapore port calls with ≥ 1 named Singapore ship agent; target creation time 32 min → 14 min (−56%), rework rate 18% → 9% (−50%), Regulatory Alert precision ≥ 90%; MPA Port+ pilot candidate identified by name at M3; measured values in `poc/singapore_kpi_report.md` |
| 6 | **Operational Scalability** | `architecture.md` — Data Fetch layer, Cargo Workspace | Stateless pipeline reads from Cloudflare R2 (S3-compatible); DuckDB in-process query scales horizontally with no shared state; WASM render runs on the client, eliminating server load for crew PII forms |
| 7 | **Industry Relevance of Business Model** | `background.md` — Business model (Open Core); `customers.md` — use case ranking | Open 1 + Open 2 (MIT free) are the acquisition funnel that establishes trust with ship agents before the Commercial Singapore package is introduced — agents use the free FAL forms first, then upgrade to the Singapore subscription. Commercial Singapore (SGD 3.6M–7.0M SAM) aligns directly with MPA's Port+ digitalisation mandate and the 140,000 annual call volume. Japan is Phase 2 after Singapore pilot is validated. |
| 8 | **IP & Defensibility** | `architecture.md` — Trust Layer; Compliance Operations Policy (MVP) | Cryptographic audit trail (BLAKE3 + Ed25519 + AIS voyage evidence) is a proprietary trust layer not replicable by form-filling tools. Compliance Operations Policy defines data classification, retention periods, role-based approval gates (confidence < 0.80, HIGH alert), audit log schema, and incident response SLAs — implemented as code, not a declaration, creating an auditable compliance posture that raises switching costs. Singapore regulatory KB is a maintained proprietary asset. OSS core increases network effects. |
| 9 | **Domain Mastery** | `customers.md` — use case ranking; `architecture.md` — Layer 2 (field mapping) | Field maps reflect IMO FAL Convention Annex field-by-field knowledge; regulatory KB seeded with real MPA Port Marine Circulars; AIS voyage evidence architecture reflects understanding of MPA's false-declaration enforcement concerns; arktrace → documaris integration closes the shadow fleet detection ↔ port compliance loop — a connection no competitor can replicate |
| 10 | **Addresses selected Innovation Opportunities** | See IO alignment table below | |

---

## Innovation Opportunity alignment

| IO | Title | How documaris addresses it |
|---|---|---|
| **PIER71-11** | AI-Powered Port Call Documentation | Core product: LLM-assisted generation of FAL Form 1, FAL Form 5, and Singapore port entry package from maridb vessel/voyage/cargo data; Regulatory Alert layer adds AI-powered compliance checking at generation time |
| **PIER71-02** | Managing Cybersecurity Risks and Incidences | Privacy by Design / WASM: crew PII never transits the server; cryptographic document signing (Ed25519) and tamper-evident audit trail (BLAKE3 + append-only log) address document integrity and non-repudiation; aligns with IMDA TrustSG Authenticity + Integrity pillars |
| **PIER71-10** | Digital Twins for Vessel Performance and Safety | AIS Voyage Evidence Summary: documaris auto-generates a cryptographically signed voyage narrative from maridb's AIS event Parquet data, creating a verifiable digital record of each port call; maridb's DuckLake (vessel/voyage/cargo/events Parquet) is the underlying data layer; arktrace provides the shadow fleet analysis layer above it |

---

## Notes on notation

External PIER71 challenge documents (available at [pier71.sg/smart-port-challenge-2026](https://pier71.sg/smart-port-challenge-2026/)) use the notation `PIER7-02` for the cybersecurity opportunity. This proposal uses **PIER71-02** throughout for consistency with the numbering convention applied to all other opportunities (PIER71-01, PIER71-10, PIER71-11). Both refer to the same innovation opportunity: *Managing Cybersecurity Risks and Incidences*.

---

*See also: [`background.md`](background.md) · [`architecture.md`](architecture.md) · [`roadmap.md`](roadmap.md)*
