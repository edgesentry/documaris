# documaris — Background

**Date:** 2026-04-24
**Status:** Core design defined; R2 schema contract and PII boundary pending sign-off
**PIER71 application deadline:** 15 June 2026

---

## What documaris is

documaris is a maritime document generation and compliance automation platform. It consumes structured vessel, voyage, and cargo data from maridb's data lake and automatically produces the port call documentation packages that commercial vessels must submit to port authorities worldwide.

**Tagline:** *"Democratising maritime compliance through an Open Source core."*

The platform is being built as the primary entry to the **PIER71 Smart Port Challenge 2026** (organised by MPA Singapore), targeting Innovation Opportunity PIER71-11 (*AI-Powered Port Call Documentation*), with secondary alignments to PIER71-02 (Cybersecurity) and PIER71-10 (Digital Twins).

---

## The problem

When a vessel arrives at port, the master and ship agent face an administrative wall: crew lists, cargo manifests, customs declarations, health forms, and quarantine notices — each port demanding its own unique format, language, and submission window. The same data is manually re-keyed across multiple systems, under time pressure, precisely when crew attention is needed for safety-critical operations. Errors trigger port detentions (commonly US$50,000–500,000 in demurrage and penalties). Agents are trapped in reactive firefighting with no tooling that understands port-specific compliance requirements.

Port of Singapore alone handles 140,000+ vessel calls per year. Each call requires a coordinated submission to MPA, ICA, Singapore Customs (TradeNet), and SFA — in distinct formats with tight pre-arrival windows. Existing platforms (Veson Nautical, ShipNet, Helm CONNECT) provide voyage management or ERP features but do not automate port-specific document assembly, do not detect regulatory conflicts before submission, and require active server connectivity to operate.

---

## Product ecosystem

documaris is the "paper layer" in a four-product stack:

| Product | Role |
|---|---|
| **maridb** | Data layer — vessel/voyage/cargo/AIS ingestion and transformation pipelines; Parquet/JSON data lake on Cloudflare R2 |
| **arktrace** | Analytics layer — shadow fleet analysis, causal inference scoring, AIS-based watchlist; analyst dashboard (DuckDB-WASM) |
| **edgesentry** | Physical layer — robotic inspection, sensor deployment, audit firmware (Rust, `edgesentry-rs`) |
| **documaris** | Document layer — port call package generation, compliance checking, PDF rendering |

maridb is the shared data foundation. documaris reads vessel/voyage/cargo/AIS data from maridb's R2. arktrace reads the same underlying data for shadow fleet analysis and scoring. In Phase 1 and 2, both operate without hardware; edgesentry enters in Phase 3.

```
Phase 1 & 2:
  maridb ──→ documaris   (vessel/voyage/cargo/AIS → port call documents)
  maridb ──→ arktrace    (AIS/sanctions/trade → shadow fleet analysis)

Phase 3 & 4:
  edgesentry ──→ maridb ──→ documaris
                       └──→ arktrace
```

---

## Business model — Open Core

| Tier | Forms | Licence | PIER71 scope |
|---|---|---|---|
| **Open 1** | IMO FAL Form 1 — General Declaration | MIT — published before PIER71 submission | ✓ MVP |
| **Open 2** | IMO FAL Form 5 — Crew List | MIT — published before PIER71 submission | ✓ MVP |
| **Commercial** | Singapore port entry package (MPA Port+, ICA, TradeNet, SFA) | Closed — subscription | ✓ MVP |
| Phase 2 roadmap | Japan port entry package (NACCS — Hakata / Tokyo) | Closed — subscription or per port-call | Post-PIER71 |

Internationally standardised forms are free; highly localised, port-specific formats are paid. The open source release doubles as an industry contribution signal to MPA Singapore, the PIER71 programme sponsor and the priority institutional pilot target. Japan localisation is a validated Phase 2 opportunity, excluded from the PIER71 MVP scope to keep the sprint achievable.

---

## Market sizing

| Market | 2025 | Projected | CAGR |
|---|---|---|---|
| Intelligent Document Processing | US$3.22B | US$43.92B by 2034 | 33.6% |
| Maritime Software | — | US$2.86B by 2035 | — |
| Maritime Cybersecurity | US$4.25B | US$15.22B by 2033 | 13.6% |

---

## Four core differentiators (PIER71 MVP scope)

**Comparison basis:** publicly available product specifications and demos for representative maritime voyage management and port agency platforms, reviewed April 2026.

**PoC measurement plan:** 20 sample Singapore port call cases, measured at M3 (Week 4). Baseline figures are from ship agent interviews; targets are documented here before measurement.

| # | Differentiator | Evidence basis and measurable target |
|---|---|---|
| 1 | **Verifiable Audit Trail** | Review of April 2026 public specs and available demos for representative platforms in the category found no feature that embeds a cryptographic hash linked to independently-sourced voyage data in generated PDFs. documaris: BLAKE3 hash + Ed25519 signature embedded in PDF XMP metadata + AIS Voyage Evidence Summary co-signed with the same key. Verification endpoint returns result in < 1 second. |
| 2 | **Regulatory Alert at Generation Time** | Representative platforms in the category do not perform automated pre-submission compliance checking; conflict detection is left to the human agent. documaris: LLM cross-checks vessel snapshot against per-port regulatory KB before rendering; HIGH severity blocks generation. PoC target: rework / port-authority rejection rate 18% → 9% (50% reduction). Measured value to be submitted at M3. |
| 3 | **Privacy by Design / WASM** | Representative platforms in the category centralise all form data including crew PII on their servers (confirmed against April 2026 public specs). documaris: crew PII rendered entirely in-browser via WASM; only a BLAKE3 hash transits the server. Architecture is verifiable by code inspection — no server-side PII code path exists. Addresses PIER71-11 and PIER71-02 simultaneously. |
| 4 | **Offline-First PWA** | Representative platforms in the category require active server connectivity to render documents (confirmed against April 2026 public specs). documaris: WASM bundle + vessel/voyage JSON cached by Service Worker on first load; FAL Form 5 generates without a live connection; hash syncs on reconnect. PoC target: full offline generation in < 10 seconds. Average document creation time baseline 32 min → target 14 min (56% reduction). Measured value to be submitted at M3. |

---

## Competitive Evidence Matrix

**Comparison scope:** document generation workflow for port-call operations.  
**Method:** public documentation review + trial/demo verification where available.  
**Sample:** 3 representative platforms covering voyage management ERP, vessel compliance management, and port agency operations — reviewed April 2026.

| Platform category | Offline form generation | Cryptographic PDF audit proof | Pre-submission regulatory conflict check | Checked on |
|---|---|---|---|---|
| Voyage management ERP (representative) | Not stated in public docs | Not stated in public docs | Not stated in public docs | 2026-04-24 |
| Vessel compliance management (representative) | Not stated in public docs | Not stated in public docs | Not stated in public docs | 2026-04-24 |
| Port agency operations platform (representative) | Not stated in public docs | Not stated in public docs | Not stated in public docs | 2026-04-24 |
| **documaris** (MVP target) | **Yes** — WASM path for FAL Form 5; Service Worker cache; operates without server connection | **Yes** — BLAKE3 hash + Ed25519 embedded in PDF XMP; `GET /audit/verify?hash=` | **Yes** — Regulatory Alert HIGH/MEDIUM/LOW; HIGH blocks export, override not permitted | 2026-04-24 |

**Notes:**
- Platform categories are representative of the tools ship agents use today for port call administration. Specific product names are available on request.
- "Not stated in public docs" means no explicit claim was found in publicly available documentation at the check date. It does not assert the capability is absent.
- If deeper documentation for any platform contradicts the above, the relevant cell will be updated and the check date refreshed.

---

*See also: [`architecture.md`](architecture.md) · [`roadmap.md`](roadmap.md)*
