# documaris — Roadmap

- **Date:** 2026-04-26 (updated from 2026-04-26)
- **Status:** Core design defined; R2 schema contract and PII boundary pending sign-off
- **Delivery:** Native desktop app; local open-source AI model (Apache 2.0 / MIT, model TBD)
- **PIER71 application deadline:** 15 June 2026
- **Secondary opportunity:** PIER71-02 (Cybersecurity — natural Phase 2 extension via edgesentry-audit)
- **Dark-horse opportunity:** PIER71-20 (Fire Safety — NLP manifest screening, Phase 3 adjacent product)

---

## PIER71 demo scenarios

The PIER71 demo is built around four test cases (TC1–TC4) demonstrated in sequence as a single unscripted walkthrough, plus one Phase 2 scenario (TC5) for post-PIER71 development.

| # | Test case | Scope | What it proves | Milestone gate |
|---|---|---|---|---|
| **TC1** | One-click generation from structured data | PIER71 MVP | Automation — the manual re-entry problem is solved | M2 |
| **TC2** | Regulatory alert blocks a non-compliant submission | PIER71 MVP | Compliance checking before submission, not after rejection | M3 |
| **TC3** | Low-confidence AI field triggers human review | PIER71 MVP | Human Agency & Oversight — AI proposes, human decides (AI Verify alignment) | M2 |
| **TC4** | Agent traces a manual override in the audit log | PIER71 MVP | Human override vs AI error — mathematically distinguished, no PII | M2 |
| **TC5** | Unstructured input traced to H(Raw) | Phase 2 | Audit chain extends to raw input bytes before any AI processing | Phase 2 |

**Demo flow (TC1 → TC3 → TC2 → TC4):**
```
TC1: "Here is how a full port call package is generated in one click."
  ↓
TC3: "When the AI is uncertain, the system stops and asks the agent to check."
  ↓
TC2: "When a compliance rule is violated, generation is blocked before submission."
  ↓
TC4: "If a question arises after submission, the agent can trace exactly what happened —
      without storing any personal data."
```

### TC1 — One-click generation from structured data (PIER71 MVP)

**Input:** Parquet vessel/voyage/cargo data fetched from documaris R2 bucket for a specific voyage ID.

**Expected behaviour:** "Generate" button → FAL Form 1 + FAL Form 5 + Singapore package in < 60 seconds. BLAKE3 hash of the final PDF embedded in XMP metadata (`/DocumentHash`).

**Audit log:** `edgesentry-audit` seals the `DocumentAuditPayload` (Class C). Log records `vessel_id` / `voyage_id` (source data references traceable to maridb snapshot), `ai_field_values`, `llm_confidence_flags`, `audit_hash`.

---

### TC2 — Regulatory alert blocks a non-compliant submission (PIER71 MVP)

**Input:** Vessel with an expired BWM D-2 certificate.

**Expected behaviour:** HIGH alert fires at generation time. Export button blocked. The violated rule is displayed in the UI and surfaced in the PDF cover sheet.

**Audit log:** `regulatory_alerts`: rule violated, severity HIGH, submission blocked. Agent cannot export without resolving the alert.

---

### TC3 — Low-confidence AI field triggers human review (PIER71 MVP)

**Input:** Voyage with an ambiguous cargo manifest — AI-generated `brief_cargo_description` has confidence score < 0.80.

**Expected behaviour:** Field highlighted amber. Export blocked. Reviewer must explicitly Accept or Correct the field before the PDF can be exported.

**Audit log:** `llm_confidence_flags`: AI confidence score per field + reviewer action (accepted / corrected). No reason code required — action alone is recorded.

---

### TC4 — Post-incident audit: manual override identified (PIER71 MVP)

**Scenario:** After port entry, authority flags a mismatch between the FAL Form 1 cargo declaration and the bill of lading. Agent runs `documaris verify <pdf>`.

**Result:** `fields_modified` shows: AI generated `brief_cargo_description` = "industrial machinery (HS 8428)" correctly; a specific user manually changed it to "general cargo" at timestamp T.

**What this proves:** AI error and human override are mathematically distinguishable. **No Class A PII is stored in the audit log** — the proof uses only Class C (operational) data. documaris protects crew privacy while maintaining full accountability for document content decisions.

**Audit log:** `fields_modified`: field name · AI before value · reviewer after value · editor identity · timestamp. No passport numbers, crew names, or any Class A data.

---

### TC5 — Unstructured input: H(Raw) audit chain (Phase 2)

**Input:** WhatsApp passport photo (JPEG) + chat message: "1 new crew joined. Name: Alex Wong."

**Expected behaviour:**
- **documaris** computes `H(Raw)` = BLAKE3(raw image bytes) and BLAKE3(raw message bytes) **before** any AI processing.
- `H(Raw)` is stored in `DocumentAuditPayload.raw_input_hashes` (Class C — only the hash, not the image or message content).
- **edgesentry-audit** receives the serialised `DocumentAuditPayload` as opaque bytes and seals it into an `AuditRecord`. The library does not compute or inspect `H(Raw)`.

**What this proves:** If OCR misread or document forgery is suspected later, the system can present the hash of the exact bytes it received — proving what input it was given, independent of the AI's interpretation.

**Audit log:** `raw_input_hashes` (H(Raw) per input source) → `ai_field_values` (AI extraction) → `llm_confidence_flags` → `AuditRecord`. Full chain from raw input to sealed output.

---

**Deferred to POST PIER71:**
- TC5 (Phase 2) — requires vision-capable local model and unstructured ingestion pipeline
- Offline operation — differentiator but adds demo complexity; deferred
- AIS Voyage Evidence — narrative value but not required for TC1–TC4
- PoC full measurement (20 cases) → 5 representative cases at M3 is sufficient
- Remote audit store sync (R2 audit bucket) — local audit log is sufficient for the demo
- Model bundling / distribution strategy — ship it working; packaging is post-PIER71

---

## Sprint milestones (6–7 weeks to PIER71 submission)

**Build principle:** every milestone produces something runnable. No "build first, demo later." From M1 onwards the native app is progressively enriched. For PIER71, the demo is a downloadable macOS build or a screen recording.

---

### Milestone 0 — Decision sprint + skeleton (Week 1)

**Gate:** three hard decisions made; skeleton runs.

**Decisions (must be made this week — everything else blocks on these):**

| Decision | Options | Blocking |
|---|---|---|
| Native app framework | Tauri (Rust/WebView) · egui · iced | M1 UI wiring |
| Local AI model | Apache 2.0 / MIT model with JP support + structured JSON output | M1 AI fill |
| R2 schema contract | Parquet partition layout agreed with maridb | M1 field map + maridb#49 copy job |

**Deliverables:**
- `mock/vessel_V001.json` — single vessel + voyage + cargo record matching agreed schema
- `field_maps/fal_form_1_field_map.json` — every FAL Form 1 field mapped to maridb source, fill type, AI-fill flag
- Native app skeleton: window opens, loads mock data, no crash
- Crew PII exclusion from documaris R2 bucket confirmed in maridb pipeline spec

---

### Milestone 1 — FAL Form 1 pipeline (Week 2)

**Demo state:** "Generate FAL Form 1" button → PDF on local file system in < 1 second from mock data.

#### Must
- `templates/fal/fal_form_1.html` — A4, pixel-accurate against IMO FAL Form 1
- End-to-end: button → mock Parquet → DuckDB → field map → AI fill → Tera → PDF render → local save

#### Should
- FAL Form 5 path: user selects local crew JSON → merged with vessel/voyage → PDF rendered locally (PII stays in app process)

#### Could (carry to M2 if needed)
- Offline mode: disconnect network → generation still works from local cache

---

### Milestone 2 — Trust Layer + confidence gate + audit trace (Week 3)

**Demo gate: TC1 + TC3 + TC4 all demonstrable from this milestone.**

**TC1 demo state:** FAL 1 + FAL 5 package generated in one click; BLAKE3 hash visible on each PDF.

**TC3 demo state:** vessel with a vague cargo entry → `brief_cargo_description` field shows amber flag (confidence < 0.80) → export blocked → reviewer confirms or corrects → export proceeds.

**TC4 demo state:** `documaris verify <pdf>` returns the full audit trace — what the AI wrote, confidence score, whether the reviewer accepted or corrected, timestamp — in human-readable form.

**Deliverables:**

- FAL Form 5 field map (variable crew size)
- Multi-document output: `documaris generate port-call-package --vessel <id>`
- **Trust Layer:**
  - `edgesentry-audit` path dep; BLAKE3 hash on PDF; hash embedded in XMP `/DocumentHash`
  - `DocumentAuditPayload` constructed by documaris (vessel_id, voyage_id, ai_field_values, llm_confidence_flags, fields_modified) → serialised → `edgesentry-audit` `seal(bytes)` → `AuditRecord`
  - `AuditRecord` + payload written to local append-only audit log (always, immediately)
- **Confidence gate UI:**
  - Fields with confidence < 0.80 → amber flag in review UI → PDF export blocked
  - Reviewer must explicitly accept or correct each flagged field
  - Decision recorded in `llm_confidence_flags`
- **`documaris verify <pdf>` CLI:**
  - Reads hash from PDF XMP → queries local audit log → returns human-readable trace
  - Output shows: AI-generated value, confidence, reviewer action, timestamp, source data references

> **AIS Voyage Evidence deferred.** Adds narrative value but is not required for TC1–TC4. Moved to POST PIER71.

---

### Milestone 3 — Singapore package + Regulatory Alert (Week 4)

**Demo gate: TC2 demonstrable from this milestone.**

**TC2 demo state:** vessel with expired BWM D-2 certificate → Singapore package → HIGH alert fires → generate button blocked. A compliant vessel generates cleanly.

**Deliverables:**

- `singapore_port_entry_field_map.json` — MPA Port+ aligned fields mapped to maridb schema
- Regulatory KB seed — at least 5 real Port of Singapore rules (BWM D-2, quarantine pre-notification window, DG restrictions, crew document minimum validity periods)
- Regulatory Alert implementation: AI conflict-check at generation time; HIGH/MEDIUM/LOW severity; HIGH blocks export; alert detail surfaced in PDF cover sheet; MEDIUM override requires reason code (audit-logged)
- Demo vessel: deliberately non-compliant record with expired BWM certificate
- **PoC measurement (5 representative Singapore port call cases):**
  - Document creation time: baseline ~32 min → target < 14 min
  - Regulatory Alert precision: HIGH alerts matching real violations → target ≥ 90%
  - Results in `poc/singapore_kpi_report.md`
- MPA-connected pilot candidate identified (name + role)

> **PoC scale reduced from 20 to 5 cases.** 5 real cases with honest KPI reporting is sufficient for the PIER71 application at this stage. If baselines differ from hypotheses, delta is disclosed in the report.

---

### Milestone 4 — Demo hardening (Week 5)

**Gate: TC1 → TC3 → TC2 → TC4 run end-to-end, unscripted, without error.**

This milestone adds no new features. The entire week is spent making the four-TC demo reliable and recordable.

- Run TC1–TC4 in sequence on a realistic (not mock) vessel record
- Harden `documaris verify <pdf>` output to be readable by a non-technical reviewer
- Resolve any field mapping gaps against actual MPA Port+ form samples
- Validate regulatory KB rules against recent MPA Port Marine Circulars
- Confirm pilot engagement with M3 contact: meeting or letter of intent
- Prepare demo script (narrative, not clicks) aligned to business brief sections

---

### Milestone 5 — PIER71 submission (Weeks 6–7)

**Gate: 2-minute screen recording complete; application text submitted by 15 June 2026.**

The demo already runs. M5 is recording and narrative — no new code.

**Demo recording structure (2 minutes):**

1. **(TC1 — 30 sec)** Load a Singapore-bound vessel. Click generate. FAL 1 + FAL 5 + Singapore package appear. BLAKE3 hash visible on each PDF.
2. **(TC3 — 30 sec)** Point to the amber-flagged cargo description field. Show the confidence score. Reviewer corrects and confirms. Export proceeds.
3. **(TC2 — 30 sec)** Switch to a vessel with an expired BWM certificate. Click generate. HIGH alert fires. Export blocked. Show the compliance rule triggered.
4. **(TC4 — 30 sec)** Run `documaris verify <pdf>` on the document from TC1. Show the audit trace: AI generated `brief_cargo_description` = "industrial machinery (HS 8428)" correctly; a reviewer manually changed it to "general cargo" at timestamp T. Human override identified — not an AI error. No PII involved.

**Deliverables:**
- 2-minute screen recording (above structure)
- PIER71 application form text (from `pier71-business-brief.md` submission-ready section)
- Slide deck aligned to 15-slide structure in `pier71-evaluation-mapping.md`

---

## Phase roadmap (beyond PIER71)

| Phase | Focus | New capabilities |
|---|---|---|
| **1 — PIER71 MVP** | TC1–TC4 demo; Singapore pilot | FAL 1 + FAL 5 + Singapore package; local audit log |
| **2 — Pilot-ready** | First paying Singapore agent/operator | AIS Voyage Evidence; TC5 offline mode; remote R2 audit bucket sync; Japan package; unstructured ingestion (email/messaging secondary path); TradeTrust Phase 2; Phase 2 test cases (see below) |
| **3 — Commercial** | Japan expansion + PIER71-02 PoC | edgesentry-audit extended to shipboard OT; Hanko-Confidence Score (OCR); maridb expanded with engine/sensor logs; immugate commercial audit service |
| **4 — Platform** | Full trust platform | edgesentry + arktrace + documaris unified; PIER71-12 sensor data verification |

---

## Phase 2 test cases (post-PIER71)

These scenarios extend TC1–TC4 to cover unstructured input channels (messaging apps, email, images). They require Phase 2 capabilities: vision-capable local AI model, unstructured ingestion pipeline, and the `H(Raw)` audit extension described below.

### Phase 2 TC-A: Passport photo + messaging app → FAL Form 5 crew change

**Input:** WhatsApp message ("1 new crew joined. Name: Alex Wong. Attached passport photo.") + smartphone photo of a passport (angled, slight shadow).

**Expected behaviour:**
- Vision model extracts name and passport number from image; rank extracted from message text; both merged with existing crew list to produce updated FAL Form 5.
- **documaris** computes `H(Raw)` = BLAKE3(raw image bytes) and BLAKE3(raw message bytes) before any AI processing; stored in `DocumentAuditPayload.raw_input_hashes`. `edgesentry-audit` receives the serialised payload as opaque bytes and seals it — it does not compute or know about `H(Raw)`.

**Audit log value:** if the extracted passport number is later found incorrect, the audit log shows: (1) the raw image hash — proving which photo was used, (2) the AI's extracted value and confidence, (3) whether the reviewer accepted or corrected the OCR output. Distinguishes image quality problem from AI extraction error from reviewer oversight.

---

### Phase 2 TC-B: Incomplete email → FAL Form 1 with regulatory alert

**Input:** Gmail message: "ETA 28th April, afternoon. Coming from CNSHA."

**Expected behaviour:**
- AI infers "afternoon" → 14:00 (confidence 0.75, amber flag).
- Regulatory alert: submission deadline (24 hours before arrival) is less than 1 hour away → MEDIUM alert fires; reviewer must enter reason code to proceed.
- **documaris** computes `H(Raw)` = BLAKE3(raw email bytes) before AI processing; stored in `DocumentAuditPayload.raw_input_hashes`.

**Audit log value:** `regulatory_alerts` records the alert, the time remaining at generation, and the reviewer's reason code. `llm_confidence_flags` records the time inference at 0.75. Full traceability from raw email to submitted FAL Form 1.

---

### Phase 2 TC-C: Multilingual incident report

**Input:** Mixed-language message: "船首をBerth 4に接触。No water ingress. 相手船はSea Star. Slight damage to bow."

**Expected behaviour:**
- AI interprets Japanese ("船首" → "Bow", "接触" → "contact/collision") and English inline; produces English official incident report draft.
- All source text (Japanese and English) preserved in `ai_field_values`; translation reasoning stored as Class C data.

**Audit log value:** `ai_field_values` records both the original mixed-language input and the translated output per field. If a translation is later disputed, the exact AI interpretation is recoverable.

---

### H(Raw) — audit chain extension for unstructured input

When a document is generated from unstructured input (image, email, chat message), the audit chain must extend back to the raw input — not just the AI's interpretation of it.

```
Raw input bytes (image / email / chat)
    │
    ▼ H(Raw) = BLAKE3(raw_bytes)    ← computed before any AI processing
    │
    ▼ AI extraction / interpretation
    │
    ▼ DocumentAuditPayload {
         raw_input_hashes: [H(Raw), …],   ← links chain back to source
         ai_field_values,
         llm_confidence_flags,
         …
       }
    │
    ▼ edgesentry-audit seal(bytes) → AuditRecord
```

`H(Raw)` is a BLAKE3 hash of the original bytes, computed by documaris before any AI processing. It is stored in `DocumentAuditPayload.raw_input_hashes` as Class C data (not the content itself — only the hash). This proves which exact input produced which AI interpretation, without storing the raw image or message content on any server.

**Note:** `edgesentry-audit` does not change. It continues to receive opaque bytes and return a sealed record. `H(Raw)` is computed and stored by documaris inside `DocumentAuditPayload`.

---

## Open questions

1. **R2 schema contract** — partition layout must be agreed with maridb before M0 closes; maridb copy job (maridb#49) depends on this
2. **Crew PII exclusion from R2** — explicit maridb pipeline rule needed; if any PII lands in Parquet files the local-processing boundary breaks
3. **Native app framework** — Tauri vs. egui vs. iced; decision needed Day 1 of W1
4. **AI model selection** — Apache 2.0 / MIT; Japanese support; structured JSON output; size budget for installer; decision needed before M1 AI fill is wired
5. **Model distribution** — bundled vs. downloaded on first run; size budget for macOS .dmg
6. **Audit log location (open Q removed)** — no longer maridb; local append-only file in native app (always), R2 audit bucket (Phase 2)
7. **Regulatory KB update ownership** — manual review gate needed for port-notice scraping; who owns this operationally?
8. **Japan OCR / Hanko (Phase 2)** — deferred; local vision-capable model required; validate on Hakata Port samples before Phase 2 build

---

*See also: [`background.md`](background.md) · [`architecture.md`](architecture.md)*
