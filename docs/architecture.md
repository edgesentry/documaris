# documaris — Architecture

- **Date:** 2026-04-26 (updated from 2026-04-24)
- **Status:** Core design defined; R2 schema contract and PII boundary pending sign-off
- **Delivery:** Native desktop app (macOS / Windows / Linux); local open-source AI model (Apache 2.0 / MIT, model TBD)
- **Key invariants:** vessel/voyage/cargo data pulled from maridb R2; crew PII supplied by user locally; only BLAKE3 hash transits the network

---

## System overview

```
  ┌─────────────────────────────────────────────────────┐
  │  REMOTE (maridb)                                    │
  │  vessel · voyage · cargo · events                   │
  │  → writes to Cloudflare R2 (Parquet / JSON)         │
  └───────────────────────┬─────────────────────────────┘
                          │ download on first run / refresh
                          ▼
  ┌─────────────────────────────────────────────────────┐
  │  LOCAL (documaris native app)                       │
  │                                                     │
  │  Local cache (maridb R2 snapshot)                   │
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
  │             PDF → local file system                 │
  └─────────────────────────────┬───────────────────────┘
                                │ hash only (no PII, no content)
                                ▼
  ┌─────────────────────────────────────────────────────┐
  │  REMOTE (maridb audit log — append-only)            │
  │  BLAKE3 hash + Ed25519 signature + generation meta  │
  │  (queued locally if offline; synced on reconnect)   │
  └─────────────────────────────────────────────────────┘
```

---

## Layer 1 — Data Fetch

maridb owns all data ingestion and transformation pipelines — vessel registry, voyage management, cargo manifests, and AIS event streams. It writes to Cloudflare R2 in DuckLake format (Parquet for structured records, JSON for event streams). documaris reads directly from maridb's R2 bucket — no REST API in the hot path.

**R2 layout (target schema — to be implemented by maridb):**
```
s3://maridb-bucket/
  vessels/vessel_id=IMO1234567/data.parquet   ← name, flag, IMO, GT, LOA, certificates
  voyages/voyage_id=V20260424/data.parquet    ← departure/arrival port, ETA, ETD
  cargo/voyage_id=V20260424/data.parquet      ← HS codes, quantities, DG flags, BL refs
  events/vessel_id=IMO1234567/2026-04-24.json ← AIS position fixes, port entry/exit
```

> **Note:** this schema is a design target. The R2 partition layout must be agreed between maridb and documaris as part of the Milestone 0 schema contract. maridb's current R2 output is structured around AIS and vessel scoring data consumed by arktrace (the shadow fleet detection application at [github.com/edgesentry/arktrace](https://github.com/edgesentry/arktrace)); the vessel/voyage/cargo document model required by documaris is a separate schema that maridb must implement.

DuckDB runs in-process (Rust `duckdb` crate, `bundled` feature) to JOIN across Parquet files with a single SQL query and output a flat JSON record. The `object_store` crate (`aws` feature) handles S3-compatible R2 download; swapping to a local file system for development requires no code change.

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

**Signing flow:**
```
PDF binary
    │
    ▼ compute_payload_hash(pdf_bytes)  → BLAKE3 Hash32
    │
    ▼ sign_record(vessel_id, seq, ts, pdf_bytes, prev_hash, "fal_form_1", key_hex)
    │  → AuditRecord { payload_hash, signature, prev_record_hash, … }
    │
    ├──→ hash hex embedded in PDF XMP metadata (/DocumentHash)
    │
    └──→ AuditRecord written to maridb audit log (append-only)
```

**Verification:** `GET /audit/verify?hash=<blake3_hex>` → `{ "verified": true, … }`

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
                                ▼
                   hash + signature → maridb audit log
                   (queued if offline; synced on reconnect)
```

**Offline-first:** The entire pipeline — data fetch cache, AI fill model, PDF render, and signing key — runs without a network connection. A ship's steel engine room with no signal is a supported environment. The audit log hash write is the only network-dependent step, and it is queued with store-and-forward (via edgesentry-audit) until connectivity resumes.

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
| **Class A — PII** | Personal data directly identifying an individual | Crew name, passport number, date of birth | None — local processing only | 0 days — not stored by design |
| **Class B — Sensitive** | Vessel compliance status and risk-relevant flags | Certificate validity, incident flags, DG declarations | Cloudflare R2 (maridb-controlled, access-logged) | Per maridb data policy |
| **Class C — Operational** | Vessel/voyage/cargo metadata with no personal identifiers | IMO number, flag, GT, voyage dates, cargo HS codes, document hashes | R2 + documaris audit log | Audit hashes: 365 days; generation logs: 180 days; error logs: 30 days (redacted) |

### Data flow boundary

```
LOCAL (documaris native app):
  ├─ Class A (PII)     — crew data supplied by user; never transmitted
  ├─ Class B/C         — vessel/voyage/cargo pulled from maridb R2, cached locally
  ├─ AI model          — bundled/downloaded; runs fully offline
  ├─ Regulatory KB     — bundled; updated via app update mechanism
  └─ PDF output        — written to local file system only

REMOTE read (maridb R2, S3-compatible):
  └─ vessel/voyage/cargo Parquet — downloaded on first run and on refresh;
     no PII ever stored here

REMOTE write (maridb audit log, append-only):
  └─ BLAKE3 hash + Ed25519 signature + generation metadata
     (no document content; no PII; queued locally if offline)
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

Every generated document records the following in the maridb append-only audit log:

| Field | Value |
|---|---|
| `generated_by` | User identity |
| `generated_at` | ISO 8601 timestamp |
| `fields_modified` | Field names edited in human review step, with before/after values and editor identity |
| `llm_confidence_flags` | Fields that triggered confidence < 0.80 warning and how they were resolved |
| `regulatory_alerts` | Alerts raised, severity, and resolution action |
| `audit_hash` | BLAKE3 hash of final PDF binary |
| `signature` | Ed25519 signature |

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
| Data fetch | `object_store` crate, `aws` feature (S3-compatible R2 download) |
| In-process query | DuckDB (`duckdb` crate, `bundled` feature) |
| Local data cache | App-local directory; vessel/voyage/cargo Parquet snapshots from R2 |
| Regulatory KB | JSON per port, bundled with app; AI eval at generation time |
| Audit log sync | edgesentry-audit store-and-forward; queued locally when offline |
| Data lake | Cloudflare R2 (S3-compatible; maridb writes, documaris reads) |

---

*See also: [`background.md`](background.md) · [`roadmap.md`](roadmap.md)*
*Full technical detail per layer: `_outputs/document-generation-architecture.md`*
