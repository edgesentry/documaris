# documaris

**Democratising maritime compliance through an Open Source core.**

documaris automates the port call documentation that commercial vessels must submit to port authorities worldwide. Ship agents and masters currently re-key the same vessel, voyage, and cargo data into multiple forms — under time pressure, in port-specific formats, in multiple languages. documaris generates those documents from a single data source, checks them for regulatory conflicts before submission, and produces a cryptographically verifiable audit trail.

Built for the [PIER71 Smart Port Challenge 2026](https://pier71.sg) — Innovation Opportunity PIER71-11 (AI-Powered Port Call Documentation).

---

## What it does

1. **Pulls vessel, voyage, and cargo data** from [maridb](../maridb)'s data lake (Cloudflare R2)
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
maridb        data ingestion + transformation → Cloudflare R2
arktrace      shadow fleet analysis + AIS watchlist (reads from maridb)
documaris     port call document generation (reads from maridb)
edgesentry    physical inspection layer (enters Phase 3)
```

---

## Documentation

| Document | Contents |
|---|---|
| [docs/background.md](docs/background.md) | What documaris is, the problem it solves, business model, and competitive differentiators |
| [docs/architecture.md](docs/architecture.md) | Six-layer pipeline design, Trust Layer, Regulatory Alert, WASM offline render, Compliance and Operations Policy |
| [docs/roadmap.md](docs/roadmap.md) | Sprint milestones (M0–M5) to PIER71 submission, PoC KPI targets, phase roadmap beyond PIER71 |
| [docs/pier71-evaluation-mapping.md](docs/pier71-evaluation-mapping.md) | Maps all 10 PIER71 deck evaluation criteria to specific doc sections |

---

## Status

Core design defined. R2 schema contract and PII boundary with maridb pending sign-off.
Sprint underway — live demo URL goes live at Milestone 0 (Week 1).

**PIER71 application deadline: 15 June 2026**
