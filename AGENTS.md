# AGENTS

Maritime document generation and compliance automation platform. documaris produces port call documentation packages from structured vessel data, checks them for regulatory conflicts, and signs them with a cryptographic audit trail.

## Related repos

| Repo | Role | Relationship |
|------|------|-------------|
| [maridb](https://github.com/edgesentry/maridb) | Data layer | Writes vessel/voyage/cargo Parquet to documaris R2 bucket — documaris reads from it |
| [edgesentry-rs](https://github.com/edgesentry/edgesentry-rs) | Audit chain | Trust Layer reuses `edgesentry-audit` crate (BLAKE3 + Ed25519) |
| [arktrace](https://github.com/edgesentry/arktrace) | Shadow fleet detection | Shares the same vessel entity (MMSI); documaris closes the compliance loop |
| [clarus](https://github.com/edgesentry/clarus) | Vessel risk intelligence | Sister product — `?mmsi=` deep-link cross-navigation |

## Directory map

| Path | Purpose |
|------|---------|
| `app/` | React + DuckDB WASM web app (Vite, TypeScript strict) |
| `app/src/components/` | UI components — VoyageSelector, AlertList, AuditPanel, FieldAnalysis |
| `app/src/lib/pipeline.ts` | Core document generation pipeline |
| `app/src/lib/clarusData.ts` | Fetches vessel data from clarus R2 via DuckDB WASM |
| `field_maps/` | JSON field map contracts per form type |
| `schemas/` | JSON Schema for maridb vessel record contract |
| `mock/` | Sample vessel records for local testing |
| `tests/` | pytest — schema contract + field map validation |

## Key design decisions

| Decision | Detail |
|----------|--------|
| DuckDB WASM | All SQL runs in-browser — no server-side query engine |
| PII boundary | Crew PII (`agent_entry` fields) entered locally, never transits the network — only BLAKE3 hash is sent |
| Field maps as JSON | Form-to-source contracts are data, not code — new forms added without changing pipeline |
| Trust Layer | Reuses `edgesentry-audit` (BLAKE3 + Ed25519) — same audit chain format as clarus |
| maridb R2 dependency | App reads vessel Parquet from R2; maridb must have populated the bucket before demo |

## External dependency map

| Symptom | Owner | Where |
|---------|-------|-------|
| Empty vessel selector | maridb pipeline not run | [maridb](https://github.com/edgesentry/maridb) |
| Missing AIS track data | maridb AIS ingest not run | [maridb](https://github.com/edgesentry/maridb) |
| Audit chain verify fails | edgesentry-audit version mismatch | [edgesentry-rs](https://github.com/edgesentry/edgesentry-rs) |

## Coding conventions

- TypeScript strict mode (`tsconfig.json`)
- No unused locals or parameters
- Python: `uv run` for all commands; pytest for schema/contract tests

## Commit convention

Conventional Commits (`fix:`, `feat:`, `feat!:`)

## Docs

- Background: `docs/ref-background.md`
- Architecture: `docs/ref-architecture.md`
- Customers: `docs/ref-customers.md`
- Roadmap: `docs/roadmap/index.md`
- PIER71 evaluation: `docs/ref-pier71-evaluation.md`

## Agent Skills

```bash
npx skills add edgesentry/documaris
```

| Skill | Trigger |
|-------|---------|
| `/documaris-run-app` | Developing the web app; testing form generation locally |
| `/documaris-run-tests` | Changing field maps or schemas; verifying contracts |
| `/documaris-deploy` | Releasing a new version to Cloudflare Pages |
| `/documaris-add-field-map` | Adding a new form type or updating field sources |
