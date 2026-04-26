# documaris — Architecture

- **Date:** 2026-04-26 (updated from 2026-04-24)
- **Status:** Core design defined; R2 schema contract and PII boundary pending sign-off
- **Delivery:** Native desktop app (macOS / Windows / Linux); local open-source AI model (Apache 2.0 / MIT, model TBD)
- **Key invariants:** vessel/voyage/cargo data pulled from documaris R2 bucket (maridb copies into it); crew PII supplied by user locally; only BLAKE3 hash transits the network

---

## System overview

```
  ┌─────────────────────────────────────────────────────┐
  │  REMOTE (maridb)                                    │
  │  vessel · voyage · cargo · events                   │
  │  → copies required data to documaris R2 bucket      │
  └───────────────────────┬─────────────────────────────┘
                          │ push (maridb job)
                          ▼
  ┌─────────────────────────────────────────────────────┐
  │  REMOTE (documaris R2 bucket — read-only for app)   │
  │    vessels / voyages / cargo / events (Parquet/JSON) │
  └───────────────────────┬─────────────────────────────┘
                          │ download on first run / refresh
                          ▼
  ┌─────────────────────────────────────────────────────┐
  │  LOCAL (documaris native app)                       │
  │                                                     │
  │  Local cache (documaris R2 snapshot)                │
  │    vessels / voyages / cargo / events               │
  │                             +                       │
  │  User-provided crew JSON (PII — never leaves app)   │
  │                             │                       │
  │            documaris pipeline                       │
  │   1. Data Fetch  (from local cache)                 │
  │   2. Field Mapping                                  │
  │   3. AI Fill  (local OSS model, bundled/downloaded) │
  │   4. Trust Layer  (BLAKE3 + Ed25519, local key)     │
  │   5. Regulatory Alert                               │
  │   6. Render → PDF  (native PDF library)             │
  │                             │                       │
  │   ┌─────────────────────────┴──────────────────┐   │
  │   ▼                                            ▼   │
  │  PDF → local file system    Local audit log        │
  │                             (append-only, tamper-  │
  │                              evident; agent's own  │
  │                              record, always avail) │
  └───────────────────────────────┬─────────────────────┘
                                  │ AuditRecord (no PII, no raw content)
                                  │ queued locally if offline
                                  ▼
  ┌─────────────────────────────────────────────────────┐
  │  REMOTE (maridb audit log — append-only)            │
  │  Same AuditRecord; synced via edgesentry-audit      │
  │  store-and-forward. Queryable by authorities,       │
  │  P&I Clubs, and agents for root cause analysis.     │
  └─────────────────────────────────────────────────────┘
```

---

## Layer 1 — Data Fetch

documaris reads exclusively from its own Cloudflare R2 bucket. maridb is responsible for copying the data documaris needs into this bucket. This keeps the dependency clean: maridb serves multiple applications (arktrace, documaris, and future products) and adding direct cross-app R2 bucket access would create tight coupling between consumers.

**Responsibility split:**

| Responsibility | Owner |
|---|---|
| Ingesting raw vessel, voyage, cargo, and AIS data | maridb |
| Transforming and writing data to the documaris R2 bucket | maridb (copy job) |
| Reading from the documaris R2 bucket | documaris app only |
| Schema of the documaris R2 bucket | Agreed jointly at M0; owned by documaris |

**documaris R2 layout (target schema — copy job implemented by maridb):**
```
s3://documaris-bucket/
  vessels/vessel_id=IMO1234567/data.parquet   ← name, flag, IMO, GT, LOA, certificates
  voyages/voyage_id=V20260424/data.parquet    ← departure/arrival port, ETA, ETD
  cargo/voyage_id=V20260424/data.parquet      ← HS codes, quantities, DG flags, BL refs
  events/vessel_id=IMO1234567/2026-04-24.json ← AIS position fixes, port entry/exit
```

> **Schema contract (M0):** the documaris R2 partition layout is the interface contract between maridb and documaris. It must be agreed before Milestone 0 completes. maridb's existing R2 output (AIS and vessel scoring data for arktrace) uses a different schema; the copy job for documaris is a separate pipeline that maridb must implement without modifying its existing outputs.

DuckDB runs in-process (Rust `duckdb` crate, `bundled` feature) to JOIN across Parquet files with a single SQL query and output a flat JSON record. The `object_store` crate (`aws` feature) handles S3-compatible download from the documaris R2 bucket; swapping to a local file system for development requires no code change.

**Crew PII is never stored in R2.** It is provided by the user directly inside the native app and never leaves the local machine (see Layer 6 and the privacy boundary section).

**Key dependencies:**
```toml
object_store = { version = "0.10", features = ["aws"] }
duckdb       = { version = "1.1", features = ["bundled"] }
tokio        = { version = "1", features = ["full"] }
```

---

## Layer 2 — Field Mapping

Each document type has a `field_map.json` that maps every form field to its maridb source and specifies how it should be filled:

```json
{
  "form_field": "brief_cargo_description",
  "source": "maridb.cargo.manifest_summary",
  "type": "llm_summarise",
  "llm_required": true,
  "llm_prompt": "Summarise the cargo manifest in one line suitable for IMO FAL Form 1 field 13."
}
```

Field types: `direct` (copy as-is) · `llm_summarise` · `llm_translate` · `llm_infer` · `computed`.

This schema is the formal contract between maridb's data layout and documaris's form templates. It must be agreed before Milestone 0 begins. Field source paths use the `maridb.*` namespace (e.g. `maridb.cargo.manifest_summary`).

---

## Layer 3 — AI Fill

The AI fill layer is decoupled from any specific model or delivery mechanism behind a Rust trait:

```rust
#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn fill_field(&self, req: &FieldFillRequest) -> Result<FieldFillResponse, LlmError>;
    async fn extract_image(&self, image: &[u8], schema_hint: &str) -> Result<Value, LlmError>;
}
```

Swapping local vs. cloud, or native app vs. server, is a `config.toml` change; no code change required.

> **⚠ Implementation under review:** The specific model selection (local open-source model vs. cloud API) and delivery mechanism (native app vs. web app) are being evaluated. Options under consideration include distributing a permissively licensed (Apache 2.0 / MIT) model with the application to eliminate cloud API costs and network dependencies. Model names and provider details will be specified once the architecture decision is finalised.

**Capability requirements (delivery-mechanism-independent):**

| Task | Requirement |
|---|---|
| Direct field copy | No AI needed |
| Cargo summary, FAL free-text | Multilingual text generation (English / Japanese) |
| Japanese field fill / translation | Japanese language support required |
| Regulatory conflict detection | Structured JSON output with confidence score |
| Japanese handwriting OCR + hanko (Phase 2) | Vision / multimodal capability required |
| Long-context multi-document reasoning | Extended context window required |

All prompts request structured JSON output with a `confidence` field. Low-confidence fields surface as UI warnings and are never silently auto-submitted.

---

## Layer 4 — Trust Layer

Implemented by reusing **`edgesentry-audit`** — the shared Rust crate from `edgesentry-rs` (`blake3 = "1.5"`, `ed25519-dalek = "2.1"`). No new crypto code is written in documaris.

```toml
[dependencies]
edgesentry-audit = { path = "../edgesentry-rs/crates/edgesentry-audit" }
```

**Dual-copy append-only audit log — neither copy can be modified:**

Every document generation event produces an `AuditRecord` that is written to two independent, append-only stores simultaneously. No raw document content or PII is stored in either — only the actions taken and the cryptographic fingerprints.

```
PDF binary
    │
    ▼ compute_payload_hash(pdf_bytes)  → BLAKE3 Hash32
    │
    ▼ sign_record(vessel_id, seq, ts, prev_hash, doc_type, ai_field_values, key_hex)
    │  → AuditRecord {
    │       seq,                    ← sequence number (gaps detectable)
    │       payload_hash,           ← BLAKE3 of final PDF
    │       prev_record_hash,       ← hash of previous record (chain)
    │       signature,              ← Ed25519 over the full record
    │       generated_by,           ← user identity
    │       generated_at,           ← ISO 8601 timestamp
    │       vessel_id, voyage_id,   ← source data references (no raw data)
    │       ai_field_values,        ← AI-generated text per field (Class C only, no PII)
    │       llm_confidence_flags,   ← per-field confidence + reviewer action
    │       fields_modified,        ← before/after for reviewer edits
    │       regulatory_alerts,      ← alerts raised, severity, resolution
    │    }
    │
    ├──→ [1] LOCAL audit log (native app, append-only SQLite/flat file)
    │        Agent's own tamper-evident record; persists on their device.
    │        Always written first; available immediately, even offline.
    │
    ├──→ hash hex embedded in PDF XMP metadata (/DocumentHash)
    │
    └──→ [2] REMOTE audit log (maridb, append-only, cloud)
             Synced via edgesentry-audit store-and-forward.
             Queryable by authorities and P&I Clubs via verify endpoint.
             Written when connectivity is available; never blocks generation.
```

**Tamper-evidence is structural, not policy:**
- **Hash chain:** each record includes `prev_record_hash`. Inserting, modifying, or deleting any record breaks all subsequent hashes in the chain — detectable by any party holding a copy.
- **Ed25519 signature:** each record is signed with the operator's key. Modifying a record breaks its signature.
- **Dual copy:** the local log and the remote log can be cross-verified against each other. An attacker would need to compromise both simultaneously to suppress evidence.
- **Sequence numbers:** gaps in the sequence are detectable — records cannot be silently dropped.

**What the audit log records (no PII, full action trace):**

| What happened | What's recorded |
|---|---|
| Document generated | who, when, which vessel/voyage (by ID), document type |
| AI filled a field | what text was generated, confidence score |
| Reviewer accepted a low-confidence field | that they accepted it, the confidence at the time |
| Reviewer corrected a field | before value, after value, editor identity |
| Regulatory alert raised | severity, rule triggered, resolution action |
| MEDIUM alert overridden | reason code entered by reviewer, their identity |
| Document hash embedded in PDF | the hash (not the document content) |

**Root cause analysis:** agents and authorities can query either copy to reconstruct the exact sequence of actions that produced a document — without retrieving any crew PII. Whether a port rejection was caused by an AI error, a reviewer override, post-generation tampering, or a source data issue is answerable from the audit log alone.

**Verification:** `GET /audit/verify?hash=<blake3_hex>` → `{ "verified": true, chain_intact: true, … }`

documaris also auto-generates an **AIS Voyage Evidence Summary** companion document — a natural-language summary of the vessel's AIS track (departure port/time, transit, arrival, port stay duration), generated from maridb's AIS event Parquet data via the AI fill layer and signed with the same Ed25519 key as the primary document. This turns a form generator into a verifiable audit instrument: false declarations become detectable.

**TrustSG / IMDA alignment:** the Trust Layer directly addresses two TrustSG pillars — Authenticity (Ed25519 signature proves the document originated from verified vessel data) and Integrity (BLAKE3 hash + append-only audit log proves no post-generation modification). This positions documaris as national-grade trust infrastructure for maritime document exchange, not a convenience tool.

---

## Layer 5 — Regulatory Alert

At generation time, the AI fill layer cross-references the vessel snapshot against a per-port JSON regulatory knowledge base and returns a structured conflict list:

```
vessel_snapshot  +  port_regulatory_kb
                          │
                          ▼ LLM conflict check
                          │
               ── HIGH ───┼── block submission
               ── MEDIUM ─┼── warn; Reviewer override with reason code, audit-logged
               ── LOW ────┼── informational note in PDF cover sheet
```

No hard-coded rule logic; the AI model evaluates natural-language rule descriptions against vessel data. The knowledge base is updated by a combination of automated port-notice monitoring and manual review.

Example rules: BWM D-2 certificate validity, crew document expiry windows within port-specific minimum periods, DG cargo restrictions under current port circulars, quarantine pre-notification window compliance.

This layer shifts documaris from "document automation tool" (commoditised) to **"compliance advisor"** (high switching cost). A single avoided port detention justifies an annual subscription many times over.

---

## Layer 6 — Render

All forms — including those containing crew PII — are rendered inside the native app. There is no server-side rendering path and no split between PII and non-PII forms. The server-side / client-side duality that a browser-based approach required is eliminated.

```
vessel/voyage JSON (local cache)    crew JSON (user-provided, local only)
              │                                    │
              └─────────────────┬──────────────────┘
                                ▼
         Field map → Tera template → HTML → native PDF renderer
                                ▼
                     Trust Layer: BLAKE3 hash embedded in XMP
                                 Ed25519 signature applied
                                ▼
                     PDF → local file system (Save dialog)
                                │
              ┌─────────────────┴──────────────────┐
              ▼                                     ▼
  [1] LOCAL audit log                   [2] REMOTE audit log
  (native app, append-only)             (maridb, append-only)
  Written immediately.                  Queued if offline;
  Agent's own tamper-evident            synced on reconnect
  record; always available.             via edgesentry-audit
                                        store-and-forward.
```

**Offline-first:** The entire pipeline — data fetch cache, AI fill model, PDF render, signing key, and local audit log write — runs without a network connection. A ship's steel engine room with no signal is a supported environment. The remote audit log sync is the only network-dependent step, and it is queued with store-and-forward (via edgesentry-audit) until connectivity resumes. The local audit log is always written first, so the agent's own tamper-evident record is available immediately regardless of connectivity.

**Privacy:** Because everything runs inside the native app process, there is no server-side code path at all for document generation. The privacy guarantee is structurally enforced, not a matter of configuration. Veson Nautical, ShipNet, and Helm CONNECT all require active server connectivity to render documents; documaris eliminates that dependency entirely.

---

## OCR / Reverse Ingestion (Phase 2 — post-PIER71 roadmap)

```
smartphone photo (JPEG)
    │
    ▼ vision-capable AI model (local, multimodal — model TBD)
      "Extract fields from this Japanese maritime form. Return structured JSON."
    │
    ▼ JSON extraction with per-field confidence + hanko_verification:
      {
        "vessel_name": { "value": "...", "confidence": "high" },
        "hanko_verification": {
          "detected": true,
          "clarity_score": 0.87,
          "overlap_score": 0.12,
          "naccs_risk": "low"
        }
      }
    │
    ▼ Intermediate JSON review UI (native app)
      All fields editable; low-confidence fields highlighted
      Hanko-Confidence Score meter + NACCS risk indicator
      "Confirm and proceed" gate before NACCS format conversion
    │
    ▼ NACCS-formatted output
```

The **Hanko-Confidence Score** (0.0–1.0) detects the presence, clarity, and text-overlap of a hanko stamp, predicting NACCS automated-check rejection risk. This directly addresses Japan's paper-authentication culture and closes the trust gap between paper and digital workflows. No competing maritime software offers this.

---

## Compliance and Operations Policy

### Data classification

| Class | Contents | Examples | Server storage | Retention |
|---|---|---|---|---|
| **Class A — PII** | Personal data directly identifying an individual | Crew name, passport number, date of birth, nationality | None — local processing only | 0 days — not stored by design |
| **Class B — Sensitive** | Vessel compliance status and risk-relevant flags | Certificate validity, incident flags, DG declarations | Cloudflare R2 (maridb-controlled, access-logged) | Per maridb data policy |
| **Class C — Operational** | Vessel/voyage/cargo metadata with no personal identifiers; AI-generated field values (non-PII) | IMO number, flag, GT, voyage dates, cargo HS codes, document hashes, AI-generated cargo description text, AI confidence scores per field | R2 + documaris audit log | Audit hashes: 365 days; generation logs: 180 days; error logs: 30 days (redacted) |

### Data flow boundary

```
LOCAL (documaris native app):
  ├─ Class A (PII)     — crew data supplied by user; never transmitted
  ├─ Class B/C         — vessel/voyage/cargo pulled from maridb R2, cached locally
  ├─ AI model          — bundled/downloaded; runs fully offline
  ├─ Regulatory KB     — bundled; updated via app update mechanism
  └─ PDF output        — written to local file system only

REMOTE read (documaris R2 bucket, S3-compatible — read-only for app):
  └─ vessel/voyage/cargo Parquet — copied here by maridb; downloaded on
     first run and on refresh; no PII ever stored here

REMOTE write (maridb audit log, append-only):
  └─ BLAKE3 hash + Ed25519 signature + generation metadata
     + AI-generated field values (Class C — no PII)
     + field edit history (before/after for reviewer changes)
     + llm_confidence per field + regulatory_alerts
     (no crew PII; no raw PDF content; queued locally if offline)
```

### Processing and storage rules

- **Class A** is processed inside the native app only. It is never transmitted to any remote system. No network call contains Class A data — verifiable by code inspection.
- **Class B / C** is downloaded from maridb R2 and processed locally inside the app. It is not re-uploaded to any documaris server.
- The only remote write is the audit log entry: BLAKE3 hash + Ed25519 signature + generation metadata. No document content is stored remotely.

### Access control

| Role | Permissions |
|---|---|
| **Operator** | Generate documents; view own audit records |
| **Reviewer** | All Operator permissions; override MEDIUM alerts (with reason code); confirm low-confidence fields |
| **Admin** | All Reviewer permissions; manage regulatory KB; access full generation logs |

All document-generation events and manual field edits are audit-logged with role, user identity, timestamp, and field class. Quarterly access review conducted by security owner; unused accounts deprovisioned.

### Responsibility boundary

| Responsibility | Owner |
|---|---|
| Hash audit trail, template management, regulatory KB maintenance | documaris |
| Original PII management (crew records, travel documents) | Customer (ship agent / operator) |
| Final submission to port authority | Customer |
| Regulatory KB accuracy for new port circulars (human review gate) | documaris |

### Human-in-the-loop gates

| Condition | Gate | Override |
|---|---|---|
| LLM field confidence < 0.80 | Field highlighted amber; PDF export blocked | Reviewer confirms or corrects — required |
| Regulatory Alert — HIGH | PDF export blocked | **Not permitted** — resolution required |
| Regulatory Alert — MEDIUM | Warning shown; export allowed | Reviewer may override with mandatory reason code; override audit-logged |
| OCR `obscured_fields` (Phase 2) | Field flagged red; export disabled | Manual field entry required |

### Audit trail per document

Every generated document records the following in the maridb append-only audit log. No Class A (PII) data is included — crew names, passport numbers, and personal identifiers are never written to the log. All entries are Class C (operational) and support root cause analysis of submission errors and disputes without storing any personal data.

| Field | Value | Root cause use |
|---|---|---|
| `generated_by` | User identity | Who ran the generation |
| `generated_at` | ISO 8601 timestamp | When — cross-reference with port rejection timestamp |
| `vessel_id` / `voyage_id` | maridb source references | Which data snapshot was used; look up in maridb for the exact values at generation time |
| `audit_hash` | BLAKE3 hash of final PDF binary | Was the submitted PDF the same as the generated PDF? Hash mismatch = tampered after generation |
| `signature` | Ed25519 signature | Is the document authentic — from a valid documaris instance? |
| `ai_field_values` | AI-generated text per field (Class C only — no PII fields included) | What exactly did the AI write? Cross-check against source data to identify AI summarisation errors |
| `llm_confidence_flags` | Per-field confidence score; whether reviewer accepted or corrected | Which fields were uncertain; did the reviewer override a low-confidence output without correcting it? |
| `fields_modified` | Field names edited in human review step, before/after values, editor identity | Was the submitted content what the AI generated, or did a reviewer change it? |
| `regulatory_alerts` | Alerts raised, severity, resolution action, reason code | Were compliance warnings present? Were MEDIUM alerts overridden and why? |

**Root cause analysis scenario:** a port authority rejects FAL Form 1 because the cargo description doesn't match the manifest. The agent queries `GET /audit/verify?hash=<blake3_hex>` and finds: `brief_cargo_description` was AI-generated at confidence 0.73 (below 0.80 → amber flag shown); the reviewer accepted without correction; the AI wrote "containerised electronics" while the maridb source (`voyage_id=V20260424`) recorded "2,400 units mobile phones". Root cause identified without storing any crew PII: AI produced a low-confidence summary and the reviewer did not verify it.

Retrievable via `GET /audit/verify?hash=<blake3_hex>`.

### Incident response (minimum SLA)

| Event | Target |
|---|---|
| Detection to triage | < 4 hours |
| Customer notification for confirmed data incident | < 24 hours |
| Post-incident review report | Within 5 business days |

### Regulatory compliance

| Regulation | Mechanism |
|---|---|
| Singapore PDPA | Class A processed inside native app only; no cross-border transfer of PII; no documaris server receives crew data |
| Japan APPI | Same local processing; Phase 2 OCR runs a local model — no PII transmitted to any cloud service |
| GDPR (EU-flagged vessels) | Local processing satisfies data minimisation; no Class A data stored or transmitted |

This policy defines data classification, retention periods, role-based approval gates, audit log contents, and incident response SLAs as implementation requirements — making compliance posture operationally auditable rather than a matter of declaration.

---

## Cargo Workspace

The full monorepo lives at `/edgesentry/`. One workspace root makes `edgesentry-audit` available to documaris without publishing:

```toml
# /edgesentry/Cargo.toml
[workspace]
members = [
    "edgesentry-rs/crates/eds",
    "edgesentry-rs/crates/edgesentry-audit",
    "edgesentry-rs/crates/edgesentry-bridge",
    "edgesentry-rs/crates/edgesentry-inspect",
    "documaris/crates/documaris-core",
    "documaris/crates/documaris-cli",
]
```

One `Cargo.lock` for the entire repo; all products share dependency versions.

---

## Technology stack summary

| Component | Technology |
|---|---|
| App delivery | Native desktop app (macOS / Windows / Linux); distributable installer |
| Core pipeline | Rust (`documaris-core` + `documaris-cli` crates) |
| AI fill — text | Local open-source model, Apache 2.0 / MIT licence (model TBD); bundled or downloaded on first run; runs fully offline via `LlmProvider` trait |
| AI fill — vision / OCR (Phase 2) | Local multimodal model (model TBD) |
| PDF render | Native PDF library (all forms, including PII; single render path) |
| Template engine | Tera (Rust) |
| Document hashing + signing | `edgesentry-audit` path dep — BLAKE3 + Ed25519 |
| Data fetch | `object_store` crate, `aws` feature (S3-compatible; reads from documaris R2 bucket only) |
| In-process query | DuckDB (`duckdb` crate, `bundled` feature) |
| Local data cache | App-local directory; vessel/voyage/cargo Parquet snapshots from documaris R2 |
| Regulatory KB | JSON per port, bundled with app; AI eval at generation time |
| Audit log sync | edgesentry-audit store-and-forward; queued locally when offline |
| Data lake | Cloudflare R2 — documaris bucket (maridb copy job writes; documaris app reads) |

---

*See also: [`background.md`](background.md) · [`roadmap.md`](roadmap.md)*
*Full technical detail per layer: `_outputs/document-generation-architecture.md`*
