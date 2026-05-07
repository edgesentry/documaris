# documaris

**Democratising maritime compliance through an Open Source core.**

documaris automates the port call documentation that commercial vessels must submit to port authorities worldwide. Ship agents and masters currently re-key the same vessel, voyage, and cargo data into multiple forms — under time pressure, in port-specific formats, in multiple languages. documaris generates those documents from a single data source, checks them for regulatory conflicts before submission, and produces a cryptographically verifiable audit trail.

Built for the [PIER71 Smart Port Challenge 2026](https://pier71.sg) — Innovation Opportunity PIER71-11 (AI-Powered Port Call Documentation).

---

## What it does

1. **Pulls vessel, voyage, and cargo data** from [indago](https://github.com/edgesentry/indago)'s data lake (Cloudflare R2)
2. **Fills port call forms** using field maps and an LLM — free-text fields, translations, and inferred values handled automatically
3. **Checks for regulatory conflicts** against a per-port knowledge base before generating the PDF — expired certificates, missed pre-notification windows, and DG restrictions surface as HIGH/MEDIUM/LOW alerts
4. **Renders PDFs** server-side for non-PII forms; entirely in-browser via WASM for crew data (FAL Form 5) — crew PII never transits the server
5. **Signs every document** with a BLAKE3 hash + Ed25519 signature and appends an AIS Voyage Evidence Summary — the full package is cryptographically verifiable

---

## Document scope (PIER71 MVP)

| Tier | Form | Status |
|---|---|---|
| Open source (MIT) | IMO FAL Form 1 — General Declaration | MVP |
| Open source (MIT) | IMO FAL Form 5 — Crew List | MVP |
| Commercial | Singapore port entry package (MPA Port+, ICA, TradeNet, SFA) | MVP |
| Phase 2 roadmap | Japan port entry package (NACCS — Hakata / Tokyo) | Post-PIER71 |

---

## Product stack

```
indago        data ingestion + transformation → Cloudflare R2
arktrace      shadow fleet analysis + AIS watchlist (reads from indago)
documaris     port call document generation (reads from indago)
edgesentry    physical inspection layer (enters Phase 3)
```

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ref-background.md](docs/ref-background.md) | What documaris is, the problem it solves, business model, and competitive differentiators |
| [docs/ref-architecture.md](docs/ref-architecture.md) | Six-layer pipeline design, Trust Layer, Regulatory Alert, WASM offline render, Compliance and Operations Policy |
| [docs/roadmap/index.md](docs/roadmap/index.md) | Sprint milestones (M0–M5) to PIER71 submission, PoC KPI targets, phase roadmap beyond PIER71 |
| [docs/ref-pier71-evaluation.md](docs/ref-pier71-evaluation.md) | Maps all 10 PIER71 deck evaluation criteria to specific doc sections |

---

## Platform integration

documaris is one of two products in the EdgeSentry platform. Both operate on the **same vessel entity**.

```
clarus (physical port safety)              documaris (port call documentation)
─────────────────────────────              ───────────────────────────────────
Near-miss detection · Physics alerts       FAL Form 1 · BWM certificate check
Tamper-proof audit records                 Compliance alerts · Audit record
https://clarus.edgesentry.io/live          https://documaris.edgesentry.io/analysis/
         │                                          │
         └──────────── same vessel (MMSI) ──────────┘
```

### Cross-link deep-link API

Both products accept a `?mmsi=<mmsi>` URL parameter that auto-selects a vessel:

| URL | Behaviour |
|-----|-----------|
| `https://documaris.edgesentry.io/analysis/?mmsi=563012345` | Fetches vessel from clarus Parquet, runs FAL Form 1 pipeline immediately — selector screen skipped |
| `https://clarus.edgesentry.io/live?mmsi=563012345` | Auto-selects the vessel in the port safety operations monitor |

On the documaris result panel, **"View port safety record in clarus →"** links to the vessel's operations monitor (with `?mmsi=` appended). On the clarus operations monitor, **"View port call documents in documaris →"** links forward to the FAL Form 1.

See [`edgesentry-commercial/docs/strategy/platform-story.md`](https://github.com/edgesentry/edgesentry-commercial) for the full platform narrative.

---

## Status

Live demo: **[documaris.edgesentry.io](https://documaris.edgesentry.io/analysis/)**

**PIER71 application deadline: 15 June 2026**
