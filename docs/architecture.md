# documaris — Architecture

**Date:** 2026-04-24
**Status:** Core design defined; R2 schema contract and PII boundary pending sign-off

---

## System overview

```
                     ┌──────────────────────────────────┐
                     │               maridb              │
                     │  vessel · voyage · cargo · events │
                     │  (ingestion + transformation)     │
                     └─────────────────┬────────────────┘
                                       │ Parquet / JSON (DuckLake)
                                       ▼
                     ┌──────────────────────────────────┐
                     │      Cloudflare R2 (DuckLake)    │
                     │  vessels/   voyages/   cargo/    │
                     │  events/   (no crew PII)         │
                     └─────────────────┬────────────────┘
                                       │ S3-compatible
                                       ▼
                     ┌──────────────────────────────────┐
                     │         documaris pipeline        │
                     │  1. Data Fetch                    │
                     │  2. Field Mapping                 │
                     │  3. LLM Fill                      │
                     │  4. Trust Layer                   │
                     │  5. Regulatory Alert              │
                     │  6. Render → PDF                  │
                     └────────────┬───────────┬─────────┘
                                  │           │
                      server-side PDF    browser-side PDF
                      (non-PII forms)    (crew PII — WASM)
                                  │           │
                                  ▼           ▼
                            audit log    local download
                            (hash only)  (no server upload)
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

> **Note:** this schema is a design target. The R2 partition layout must be agreed between maridb and documaris as part of the Milestone 0 schema contract. maridb's current R2 output (MMSI-based shadow fleet watchlist data) differs from the vessel/voyage/cargo document model required here.

DuckDB runs in-process (Rust `duckdb` crate, `bundled` feature) to JOIN across Parquet files with a single SQL query and output a flat JSON record. The `object_store` crate (`aws` feature) handles S3-compatible R2 download; swapping to a local file system for development requires no code change.

**Crew PII is never stored in R2.** It is loaded client-side in the browser and never transits the documaris server (see Layer 6 and the privacy boundary section).

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

## Layer 3 — LLM Fill

The LLM layer is decoupled from any specific provider behind a Rust trait:

```rust
#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn fill_field(&self, req: &FieldFillRequest) -> Result<FieldFillResponse, LlmError>;
    async fn extract_image(&self, image: &[u8], schema_hint: &str) -> Result<Value, LlmError>;
}
```

Swapping local vs. cloud is a `config.toml` change; no code change required.

**Prototype tier — shared llama-server:**

The shared `llama-server` (llama.cpp) runs on an OpenAI-compatible endpoint at `http://localhost:8080`. documaris reuses this process — previously co-located with arktrace, now to be confirmed as part of the maridb dev environment setup. Default model: **Qwen2.5-7B-Instruct-Q4_K_M** — strong multilingual model covering English and Japanese.

Vision/OCR tasks (Japanese form digitisation, hanko detection) run a second llama-server instance on `:8081` using **Gemma 4 E4B** (`gemma-4-E4B-it-Q4_K_M.gguf` + `--mmproj` projection file). Gemma 4 is natively multimodal across all variants, released 2026-04-02.

**Production tier — Claude API:**

Specific tasks are promoted to `claude-sonnet-4-6` only when local model quality is demonstrably insufficient after prompt tuning:

| Task | Local (Qwen2.5-7B / Gemma 4 E4B) | Claude API |
|---|---|---|
| Direct field copy | Not needed | Not needed |
| Cargo summary, FAL free-text | ✓ sufficient | Overkill |
| Japanese field fill / translation | ✓ validate on NACCS samples | Fallback only |
| Regulatory conflict detection | Test first; try Qwen2.5-14B before promoting | Fallback if 14B insufficient |
| Japanese handwriting OCR + hanko | **Gemma 4 E4B** (`:8081`) | `claude-sonnet-4-6` fallback for severely degraded fax |
| Long-context multi-document reasoning | — | `claude-sonnet-4-6` |

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

documaris also auto-generates an **AIS Voyage Evidence Summary** companion document — a natural-language summary of the vessel's AIS track (departure port/time, transit, arrival, port stay duration), generated from maridb's AIS event Parquet data via Qwen2.5-7B and signed with the same Ed25519 key as the primary document. This turns a form generator into a verifiable audit instrument: false declarations become detectable.

**TrustSG / IMDA alignment:** the Trust Layer directly addresses two TrustSG pillars — Authenticity (Ed25519 signature proves the document originated from verified vessel data) and Integrity (BLAKE3 hash + append-only audit log proves no post-generation modification). This positions documaris as national-grade trust infrastructure for maritime document exchange, not a convenience tool.

---

## Layer 5 — Regulatory Alert

At generation time, the LLM cross-references the vessel snapshot against a per-port JSON regulatory knowledge base and returns a structured conflict list:

```
vessel_snapshot  +  port_regulatory_kb
                          │
                          ▼ LLM conflict check
                          │
               ── HIGH ───┼── block submission
               ── MEDIUM ─┼── warn; Reviewer override with reason code, audit-logged
               ── LOW ────┼── informational note in PDF cover sheet
```

No hard-coded rule logic; the LLM evaluates natural-language rule descriptions against vessel data. The knowledge base is updated by a combination of automated port-notice monitoring and manual review.

Example rules: BWM D-2 certificate validity, crew document expiry windows within port-specific minimum periods, DG cargo restrictions under current port circulars, quarantine pre-notification window compliance.

This layer shifts documaris from "document automation tool" (commoditised) to **"compliance advisor"** (high switching cost). A single avoided port detention justifies an annual subscription many times over.

---

## Layer 6 — Render

Two render paths, determined by data sensitivity:

**Server-side (non-PII forms):**
```
Field map JSON → Tera/Jinja2 template → HTML → WeasyPrint → PDF
                                                                │
                                                         Trust Layer hash embedded
                                                                │
                                                         returned as file download
```

**Browser-side / WASM (FAL Form 5 — crew PII):**
```
vessel/voyage JSON (maridb)      crew JSON (local file)
              │                         │
              └────────────┬────────────┘
                           ▼
              Typst-WASM or pdf-lib (runs in browser tab)
                           │
                           ▼
              PDF assembled in memory → local download
                           │
                           ▼ hash only (no PII)
              POST to maridb audit log
```

Recommended WASM engine: **Typst WASM** (Rust-native, Japanese font support via Noto, same template syntax as server-side, ~4 MB bundle). **pdf-lib** (JS, ~800 KB) for prototype speed.

**Offline-First PWA:**

A Service Worker caches the WASM bundle, vessel/voyage JSON snapshot, and form templates on first load. FAL Form 5 can then be generated entirely offline — inside a ship's steel engine room with no signal — with the document hash queued for audit log sync when connectivity resumes. Veson Nautical, ShipNet, and Helm CONNECT all require active server connectivity to render documents; the WASM path eliminates that dependency for crew PII forms.

---

## OCR / Reverse Ingestion (Phase 2 — post-PIER71 roadmap)

```
smartphone photo (JPEG)
    │
    ▼ Gemma 4 E4B via llama-server --mmproj (local, :8081)
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
    ▼ Intermediate JSON review UI (browser)
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
| **Class A — PII** | Personal data directly identifying an individual | Crew name, passport number, date of birth | None — client-side only (WASM) | 0 days — not stored by design |
| **Class B — Sensitive** | Vessel compliance status and risk-relevant flags | Certificate validity, incident flags, DG declarations | Cloudflare R2 (maridb-controlled, access-logged) | Per maridb data policy |
| **Class C — Operational** | Vessel/voyage/cargo metadata with no personal identifiers | IMO number, flag, GT, voyage dates, cargo HS codes, document hashes | R2 + documaris audit log | Audit hashes: 365 days; generation logs: 180 days; error logs: 30 days (redacted) |

### Data flow boundary

```
TRUSTED ZONE (server):   Class B/C — vessel, voyage, cargo, regulatory KB, audit records

PII ZONE (client-only):  Class A — crew names, passport numbers, DOB
                          loaded from local file; WASM-rendered in browser
                          only hash transits to server — no Class A code path on server
```

### Processing and storage rules

- **Class A** is processed client-side only (WASM path). It is never transmitted to or persisted on the documaris server. No Class A code path exists on the server — verifiable by code inspection.
- **Class B / C** may be processed server-side for document generation and compliance checking.
- The server stores only hash-only audit artifacts (BLAKE3 hash, Ed25519 signature, generation metadata — no document content).

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
| Singapore PDPA | Class A processed client-side only; no cross-border transfer to documaris servers |
| Japan APPI | Same client-side processing; Claude API OCR (Phase 2) conditional on Anthropic Data Processing Agreement |
| GDPR (EU-flagged vessels) | Client-side processing satisfies data minimisation; no Class A data stored server-side |

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
| Backend pipeline | Rust (`documaris-core` + `documaris-cli` crates); Python FastAPI for rapid prototype |
| LLM — text (prototype) | llama-server + Qwen2.5-7B-Instruct-Q4_K_M (`:8080`, shared — maridb dev environment) |
| LLM — vision / OCR (prototype) | llama-server + Gemma 4 E4B + mmproj (`:8081`) |
| LLM — production | Claude API `claude-sonnet-4-6` (promoted per task, config swap) |
| PDF render — server | WeasyPrint (HTML/CSS → PDF) |
| PDF render — browser | Typst WASM (production) · pdf-lib (prototype) |
| Template engine | Tera (Rust) / Jinja2 (Python) — same syntax |
| Document hashing + signing | `edgesentry-audit` path dep — BLAKE3 + Ed25519 |
| Data fetch | `object_store` crate, `aws` feature (S3-compatible R2) |
| In-process query | DuckDB (`duckdb` crate, `bundled` feature) |
| Regulatory KB | JSON per port + LLM eval at generation time |
| Offline-first | PWA Service Worker + Cache API + IndexedDB |
| Data lake | Cloudflare R2 (S3-compatible; maridb writes, documaris reads) |

---

*See also: [`background.md`](background.md) · [`roadmap.md`](roadmap.md)*
*Full technical detail per layer: `_outputs/document-generation-architecture.md`*
