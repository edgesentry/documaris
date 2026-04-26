# documaris — Roadmap

- **Date:** 2026-04-26 (updated from 2026-04-24)
- **Status:** Core design defined; R2 schema contract and PII boundary pending sign-off; AI model selection and local-processing delivery mechanism under review
- **PIER71 application deadline:** 15 June 2026
- **Secondary opportunity:** PIER71-02 (Cybersecurity — natural Phase 2 extension via edgesentry-audit)
- **Dark-horse opportunity:** PIER71-20 (Fire Safety — NLP manifest screening, Phase 3 adjacent product)

---

## Sprint milestones (6–7 weeks to PIER71 submission)

**Live demo principle:** the demo URL is live from Day 1 and progressively enriched at each milestone. Every milestone produces something showable. There is no "build first, demo later" phase — each week's output is the demo.

---

### Milestone 0 — Schema contract + live URL (Week 1)

**Deliverables:** `mock/vessel_V001.json` + `field_maps/fal_form_1_field_map.json` + live demo URL (placeholder page)

- Deploy a live URL (Cloudflare Pages or equivalent) on Day 1 — even a landing page with the tagline and a "generating..." placeholder establishes the demo anchor point and forces deployment infrastructure to be solved early
- Define a single vessel + voyage + cargo mock record matching the maridb DuckLake Parquet schema
- Map every FAL Form 1 field to its maridb source, fill type, and AI-fill-required flag
- Cross-check every field against IMO FAL Convention Annex for completeness
- Agree R2 partition layout with maridb (schema contract: which fields live in which Parquet file); confirm crew PII explicitly excluded from R2

---

### Milestone 1 — FAL Form 1 template + pipeline (Week 2)

**Demo state after this milestone:** live URL shows "Generate FAL Form 1" button → PDF downloads in < 1 second from mock data.

#### Must (milestone gate)
- `templates/fal/fal_form_1.html` — A4, pixel-accurate against the official IMO FAL Form 1 PDF, WeasyPrint-compatible CSS
- Server-side pipeline wired to live URL: button click → mock Parquet → DuckDB → field map → AI fill → Tera → WeasyPrint → PDF download

#### Should (target if template is confirmed correct by mid-week)
- Local processing path for crew PII forms (delivery mechanism TBD — native app or WASM): no server round-trip for FAL Form 5 render

#### Could (stretch — carry to M2 if needed)
- Offline-first: forms generate without a live connection after first use

---

### Milestone 2 — FAL Form 5 + Trust Layer + AIS Evidence (Week 3)

**Demo state after this milestone:** live URL generates a full port call package (FAL 1 + FAL 5 + AIS Evidence); each PDF displays its BLAKE3 hash; verify link confirms authenticity in < 1 second.

**Deliverables:** Port call package (FAL 1 + FAL 5 + AIS Voyage Evidence) sharing one integrity hash; `documaris verify <pdf>` CLI; maridb audit log entry visible

- FAL Form 5 field map (variable crew size)
- Multi-document output: `documaris generate port-call-package --vessel <id>`
- Trust Layer: `edgesentry-audit` path dep; BLAKE3 hash on PDF output; hash embedded in XMP metadata; `AuditRecord` written to maridb audit log
- AIS Voyage Evidence: DuckDB query on maridb R2 AIS events → AI fill natural-language voyage summary → signed companion document appended to the package

---

### Milestone 3 — Singapore package + Regulatory Alert + PoC measurement (Week 4)

**Demo state after this milestone:** live URL adds "Singapore port entry package" button; a pre-loaded non-compliant vessel triggers a visible HIGH alert that blocks the generate button. PoC KPI report published.

**Deliverables:** `singapore_port_entry_field_map.json` + Regulatory Alert demo on a deliberately non-compliant vessel + PoC KPI report + subscription pricing model draft

- Collect MPA Port+ and TradeNet form templates; map fields to maridb schema
- Build seed regulatory knowledge base for Port of Singapore (BWM D-2, quarantine windows, DG restrictions)
- Implement Regulatory Alert: AI conflict-check at generation time; HIGH/MEDIUM/LOW severity; HIGH blocks submission; conflicts surfaced in PDF cover sheet
- Demo: expired BWM certificate vessel → HIGH alert triggered
- **PoC measurement (20 sample Singapore port call cases):**
  - Average document creation time: baseline 32 min → target 14 min (56% reduction)
  - Port-authority rework / rejection rate: baseline 18% → target 9% (50% reduction)
  - Regulatory Alert precision: fraction of HIGH alerts that correspond to a real compliance rule violation (target ≥ 90%)
  - Results published as `poc/singapore_kpi_report.md`
- Identify MPA-connected pilot candidate via PIER71 programme (name + role confirmed)

> **Customer validation dependency:** The baseline figures (32 min, 18%) are stated as hypotheses derived from informal ship agent interviews. M3 is the first milestone where these are measured against real port call cases. If baselines differ materially from the hypotheses, PoC targets will be revised and the delta disclosed in the KPI report. See [`customers.md`](customers.md) for the full list of unvalidated assumptions.

---

### Milestone 4 — Singapore polish + demo prep (Week 5)

**Demo state after this milestone:** live URL is demo-ready — realistic vessel data, offline mode confirmed, all four differentiators exercisable in a single unscripted walkthrough.

**Deliverables:** End-to-end Singapore package demo on a real or realistic vessel record; all four differentiators exercisable in one flow

- Polish Singapore field map against actual MPA Port+ form samples; resolve any field mapping gaps
- Extend regulatory KB with at least 5 real Port of Singapore rules (validate against recent MPA circulars)
- Harden the Trust Layer verify endpoint; ensure `documaris verify <pdf>` returns a human-readable result suitable for showing to a port officer
- PWA offline demo (carry from M1 Could): confirm FAL Form 5 generates offline and hash syncs on reconnect
- Confirm pilot engagement with identified M3 contact: secure a meeting or letter of intent

---

### Milestone 5 — PIER71 submission polish (Weeks 6–7)

**Demo state:** already live since M1; this milestone polishes presentation, records the screen capture, and finalises the application text. No last-minute scramble.

**Deliverables:** 2-minute screen recording of the live demo + PIER71 application draft ready for submission (deadline: 15 June 2026)

The live URL already demonstrates all four differentiators. M5 work is polish and narrative, not new features:

1. **Data → Documents** — maridb R2 data → one click → FAL 1 + FAL 5 + Singapore package + AIS Evidence
2. **Verifiable Audit Trail** — hash shown post-generation; `verify` endpoint confirms document against AIS voyage record in < 1 second
3. **Regulatory Alert** — non-compliant vessel (expired BWM certificate) triggers HIGH alert on Singapore package, blocking submission
4. **Offline-First** — no connection → FAL Form 5 from local data in 10 seconds; hash queued for sync

Polish PDF output to IMO layout standard. Prepare PIER71 application text.

---

## Phase roadmap (beyond PIER71)

| Phase | Milestone | Products |
|---|---|---|
| 1 — PIER71 MVP (now) | FAL Form 1 + FAL Form 5 (OSS) + Singapore package; PIER71 demo build | maridb + documaris |
| 2 — Private entity | First paying Singapore ship agent or operator; Japan package + Reverse Ingestion / Hanko-Confidence Score | maridb + documaris |
| 3 — Hardware partner | Integrate hardware partner (connectivity or onboard ERP vendor) to enrich maridb data | maridb + documaris + partner hardware |
| 4 — Full solution | edgesentry physical inspection layer feeds maridb → documaris reporting loop; inspection reports part of port call package | maridb + arktrace + documaris + edgesentry |

---

## Open questions

1. **R2 partition layout contract** — needs agreement between maridb and documaris before M0; documaris field maps depend on this schema; maridb's current R2 layout (MMSI-based watchlist data) differs from the vessel/voyage/cargo document model required — maridb must implement the new layout
2. **Crew PII exclusion from R2** — needs an explicit maridb pipeline rule; if any PII lands in R2 Parquet files, the local-processing privacy boundary breaks
3. **Audit log location in maridb** — documaris writes AuditRecords to maridb's append-only log; the schema and table location for document audit records within maridb need to be agreed as part of the M0 schema contract
4. **DuckDB `bundled` compile time** — adds ~2 min to CI builds and ~10 MB to binary; acceptable for prototype; evaluate system DuckDB for production CI
5. **Local delivery mechanism** — native app vs. WASM vs. other approach under review; decision needed before M1 Should milestone can be specified; affects cache and distribution strategy
6. **AI model selection** — permissively licensed (Apache 2.0 / MIT) local model vs. cloud API under evaluation; decision needed before M1 pipeline is finalised; model must support Japanese and produce structured JSON output
7. **Regulatory KB update ownership** — automated port-notice scraping introduces hallucination risk; manual review gate needed; who owns this operationally?
8. **Japan OCR / Hanko (Phase 2)** — deferred from PIER71 MVP; requires a vision-capable local model; model selection and accuracy on Hakata Port samples to be validated before Phase 2 build begins

---

*See also: [`background.md`](background.md) · [`architecture.md`](architecture.md)*
*Full use case specifications and prototype stack decisions: `_outputs/document-generation-plan.md`*
