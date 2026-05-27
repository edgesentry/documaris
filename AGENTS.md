# AGENTS

Multi-profile document generation and compliance automation platform. documaris produces regulatory compliance documents from structured sensor or operational data, checks them against profile-specific rules, and signs them with a cryptographic audit trail.

Supported profiles: `fal-form-1` / `fal-form-5` (maritime port call, PIER71), `sg-bca-greenmark` (BCA Green Mark Section 4, BEAMP), `port-cyber-clearance` (Cap Vista cyber clearance from indago `*_facts.json`). Same pipeline core — only the parser, field map, HTML template, and rules differ per profile.

## Responsibility boundary

documaris is the **operator-facing UI and compliance document platform**.

```
documaris owns:
  - Compliance document generation (FAL forms, BCA Green Mark reports)
  - Operator portfolio UI (browser-side, DuckDB WASM, zero server cost)
  - Browser-side ZKP attestation verification (@noble/hashes/blake3)

documaris does NOT own:
  - Proof data or WORM chain storage (→ clarus R2)
  - B2B verification endpoints (→ clarus /api/verify)
  - ZKP proof generation (→ clarus edge daemon)
  - Domain-agnostic crypto primitives (→ edgesentry-rs eds-zkp)
```

Generated compliance documents embed `verify_url` pointing to `clarus.edgesentry.io/api/verify`
so recipients can independently verify without going through documaris.

## Related repos

| Repo | Role | Relationship |
|------|------|-------------|
| [indago](https://github.com/edgesentry/indago) | Data layer | Writes vessel/voyage/cargo Parquet to documaris R2 bucket — documaris reads from it |
| [edgesentry-rs](https://github.com/edgesentry/edgesentry-rs) | Audit chain | Trust Layer reuses `edgesentry-audit` crate (BLAKE3 + Ed25519) |
| [arktrace](https://github.com/edgesentry/arktrace) | Shadow fleet detection | Shares the same vessel entity (MMSI); documaris closes the compliance loop |
| [clarus](https://github.com/edgesentry/clarus) | Data + verification layer | Owns WORM chain, ZKP proofs, and B2B `/api/verify` endpoint — documaris reads from it |

## Directory map

| Path | Purpose |
|------|---------|
| `app/` | React + DuckDB WASM web app (Vite, TypeScript strict) |
| `app/src/components/` | UI components — VoyageSelector, AlertList, AuditPanel, FieldAnalysis, PortfolioView, OperatorView |
| `app/src/lib/pipeline.ts` | Core pipeline — `runPipeline()` (maritime) and `runBcaPipeline()` (BCA); same `check/seal/build_audit_payload` calls |
| `app/src/lib/clarusData.ts` | Fetches vessel data from clarus R2 via DuckDB WASM |
| `app/src/lib/bcaData.ts` | Fetches BCA outlet data from `documaris-dev-public-analytics` R2 via DuckDB WASM; `loadPortfolio()`, `loadOperatorSites()` |
| `functions/data/[[path]].js` | Cloudflare Pages Function — serves `documaris-dev-public-analytics` R2 at `/data/analytics/*` |
| `scripts/generate-bca-fixtures.ts` | Generates synthetic BCA outlet Parquet (45 sites, 3 operators) and uploads to R2 |
| `field_maps/` | JSON field map contracts per form type |
| `fixtures/clearance/` | indago `*_facts.json` for port cyber clearance (hold/clean) |
| `templates/port-cyber-clearance.md` | W5 spec; HTML in edgesentry-rs `edgesentry-document/templates/` |
| `dist/` | Sample clearance HTML for Cap Vista deck (G5) |
| `schemas/` | JSON Schema for indago vessel record contract |
| `mock/` | Sample vessel records for local testing |
| `tests/` | pytest — schema contract + field map validation |

## Key design decisions

| Decision | Detail |
|----------|--------|
| DuckDB WASM | All SQL runs in-browser — no server-side query engine |
| PII boundary | Crew PII (`agent_entry` fields) entered locally, never transits the network — only BLAKE3 hash is sent |
| Field maps as JSON | Form-to-source contracts are data, not code — new forms added without changing pipeline |
| Trust Layer | Reuses `edgesentry-audit` (BLAKE3 + Ed25519) — same audit chain format as clarus |
| Multi-profile architecture | `check()`, `build_audit_payload()`, `seal()` are profile-agnostic. Only `parse_*_csv()`, `fill_*()`, `render_html(template)` differ per profile. Adding a new regulated sector = new parser + template + rules JSON, no pipeline changes. |
| `above_threshold` compliance check | Fires when a numeric field exceeds a threshold (e.g. EUI > 115). Complements `not_null` / `not_expired`. Alert message includes actual value and target for human readability. |
| indago R2 dependency | App reads vessel Parquet from R2; indago must have populated the bucket before demo |
| BCA R2 bucket | `documaris-dev-public-analytics` — served via Pages Function at `/data/analytics/*`. Populated by `scripts/generate-bca-fixtures.ts` (`npm run generate-bca` for remote, `generate-bca:local` for local dev). |

## External dependency map

| Symptom | Owner | Where |
|---------|-------|-------|
| Empty vessel selector | indago pipeline not run | [indago](https://github.com/edgesentry/indago) |
| Missing AIS track data | indago AIS ingest not run | [indago](https://github.com/edgesentry/indago) |
| Audit chain verify fails | edgesentry-audit version mismatch | [edgesentry-rs](https://github.com/edgesentry/edgesentry-rs) |
| Empty BCA portfolio (remote) | `scripts/generate-bca-fixtures.ts` not run with `--remote` | run `npm run generate-bca` in `scripts/` |
| Empty BCA portfolio (local) | local R2 not populated | run `npm run generate-bca:local` in `scripts/` |
| BCA compliance alerts not firing | WASM out of date after edgesentry-rs changes | rebuild WASM and copy to `app/src/wasm-pkg/` |

## Coding conventions

- TypeScript strict mode (`tsconfig.json`)
- No unused locals or parameters
- Python: `uv run` for all commands; pytest for schema/contract tests
- Docs: use Mermaid for diagrams — see [CONTRIBUTING.md](CONTRIBUTING.md#diagrams)

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
