# Compliance and Operations Policy

- **Date:** 2026-04-26
- **Status:** Core design defined; PII boundary pending sign-off

---

## Data classification

| Class | Contents | Examples | Server storage | Retention |
|---|---|---|---|---|
| **Class A — PII** | Personal data directly identifying an individual | Crew name, passport number, date of birth, nationality | None — local processing only | 0 days — not stored by design |
| **Class B — Sensitive** | Vessel compliance status and risk-relevant flags | Certificate validity, incident flags, DG declarations | Cloudflare R2 (indago-controlled, access-logged) | Per indago data policy |
| **Class C — Operational** | Vessel/voyage/cargo metadata with no personal identifiers; AI-generated field values (non-PII) | IMO number, flag, GT, voyage dates, cargo HS codes, document hashes, AI-generated cargo description text, AI confidence scores per field | indago R2 (read by app) + append-only R2 audit bucket (AuditRecord + DocumentAuditPayload); immugate in future | Audit records: 365 days; generation logs: 180 days; error logs: 30 days (redacted) |

## Data flow boundary

```
LOCAL (documaris native app):
  ├─ Class A (PII)     — crew data supplied by user; never transmitted
  ├─ Class B/C         — vessel/voyage/cargo pulled from indago R2, cached locally
  ├─ AI model          — bundled/downloaded; runs fully offline
  ├─ Regulatory KB     — bundled; updated via app update mechanism
  └─ PDF output        — written to local file system only

REMOTE read (documaris R2 bucket, S3-compatible — read-only for app):
  └─ vessel/voyage/cargo Parquet — copied here by indago; downloaded on
     first run and on refresh; no PII ever stored here

REMOTE write (tamper-proof audit store — append-only R2 bucket (MVP) → immugate (future), append-only):
  └─ AuditRecord (BLAKE3 hash, Ed25519 signature, seq, ts)
     + DocumentAuditPayload (Class C — no PII, no raw PDF content)
       vessel_id, voyage_id, doc_type, generated_by, generated_at,
       ai_field_values, llm_confidence per field, fields_modified,
       regulatory_alerts
     (queued locally by edgesentry-audit store-and-forward if offline)
```

## Processing and storage rules

- **Class A** is processed inside the native app only. It is never transmitted to any remote system. No network call contains Class A data — verifiable by code inspection.
- **Class B / C** is downloaded from indago R2 and processed locally inside the app. It is not re-uploaded to any documaris server.
- The only remote write is the AuditRecord + DocumentAuditPayload (Class C) to the tamper-proof audit store (append-only R2 bucket, MVP). No document content and no PII is stored remotely.

## Access control

| Role | Permissions |
|---|---|
| **Operator** | Generate documents; view own audit records |
| **Reviewer** | All Operator permissions; override MEDIUM alerts (with reason code); confirm low-confidence fields |
| **Admin** | All Reviewer permissions; manage regulatory KB; access full generation logs |

All document-generation events and manual field edits are audit-logged with role, user identity, timestamp, and field class. Quarterly access review conducted by security owner; unused accounts deprovisioned.

## Responsibility boundary

| Responsibility | Owner |
|---|---|
| Hash audit trail, template management, regulatory KB maintenance | documaris |
| Original PII management (crew records, travel documents) | Customer (ship agent / operator) |
| Final submission to port authority | Customer |
| Regulatory KB accuracy for new port circulars (human review gate) | documaris |

## Human-in-the-loop gates

| Condition | Gate | Override |
|---|---|---|
| LLM field confidence < 0.80 | Field highlighted amber; PDF export blocked | Reviewer confirms or corrects — required |
| Regulatory Alert — HIGH | PDF export blocked | **Not permitted** — resolution required |
| Regulatory Alert — MEDIUM | Warning shown; export allowed | Reviewer may override with mandatory reason code; override audit-logged |
| OCR `obscured_fields` (Phase 2) | Field flagged red; export disabled | Manual field entry required |

## Audit trail per document

Every generated document records the following in the indago append-only audit log. No Class A (PII) data is included — crew names, passport numbers, and personal identifiers are never written to the log. All entries are Class C (operational) and support root cause analysis of submission errors and disputes without storing any personal data.

| Field | Value | Root cause use |
|---|---|---|
| `generated_by` | User identity | Who ran the generation |
| `generated_at` | ISO 8601 timestamp | When — cross-reference with port rejection timestamp |
| `vessel_id` / `voyage_id` | indago source references | Which data snapshot was used; look up in indago for the exact values at generation time |
| `audit_hash` | BLAKE3 hash of final PDF binary | Was the submitted PDF the same as the generated PDF? Hash mismatch = tampered after generation |
| `signature` | Ed25519 signature | Is the document authentic — from a valid documaris instance? |
| `ai_field_values` | AI-generated text per field (Class C only — no PII fields included) | What exactly did the AI write? Cross-check against source data to identify AI summarisation errors |
| `llm_confidence_flags` | Per-field confidence score; whether reviewer accepted or corrected | Which fields were uncertain; did the reviewer override a low-confidence output without correcting it? |
| `fields_modified` | Field names edited in human review step, before/after values, editor identity | Was the submitted content what the AI generated, or did a reviewer change it? |
| `regulatory_alerts` | Alerts raised, severity, resolution action, reason code | Were compliance warnings present? Were MEDIUM alerts overridden and why? |

**Root cause analysis scenario:** a port authority rejects FAL Form 1 because the cargo description doesn't match the manifest. The agent queries `GET /audit/verify?hash=<blake3_hex>` and finds: `brief_cargo_description` was AI-generated at confidence 0.73 (below 0.80 → amber flag shown); the reviewer accepted without correction; the AI wrote "containerised electronics" while the indago source (`voyage_id=V20260424`) recorded "2,400 units mobile phones". Root cause identified without storing any crew PII: AI produced a low-confidence summary and the reviewer did not verify it.

Retrievable via `GET /audit/verify?hash=<blake3_hex>`.

## Incident response (minimum SLA)

| Event | Target |
|---|---|
| Detection to triage | < 4 hours |
| Customer notification for confirmed data incident | < 24 hours |
| Post-incident review report | Within 5 business days |

## Regulatory compliance

| Regulation | Mechanism |
|---|---|
| Singapore PDPA | Class A processed inside native app only; no cross-border transfer of PII; no documaris server receives crew data |
| Japan APPI | Same local processing; Phase 2 OCR runs a local model — no PII transmitted to any cloud service |
| GDPR (EU-flagged vessels) | Local processing satisfies data minimisation; no Class A data stored or transmitted |

This policy defines data classification, retention periods, role-based approval gates, audit log contents, and incident response SLAs as implementation requirements — making compliance posture operationally auditable rather than a matter of declaration.
