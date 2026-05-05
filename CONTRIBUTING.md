# Contributing

## Scope

documaris is the **document generation and compliance layer** of the EdgeSentry platform. It reads vessel data from maridb and produces port call documents with regulatory checking and a cryptographic audit trail.

Do not add data ingestion, AIS processing, or shadow fleet detection logic here — those belong in [maridb](https://github.com/edgesentry/maridb) and [arktrace](https://github.com/edgesentry/arktrace) respectively.

## Layering

| Layer | Where | What belongs there |
|-------|-------|-------------------|
| Data ingestion + AIS | maridb | Vessel/voyage/cargo/AIS pipeline → R2 |
| Shadow fleet detection | arktrace | Causal inference, watchlist |
| Document generation | this repo | Field maps, compliance checking, PDF render, audit trail |
| Physical inspection | edgesentry-rs | Sensor data, physics engine |

## Language

English is the single source of truth for all documentation.

## Documentation rules

1. **README.md** — human-facing, high-level only
2. **AGENTS.md** — agent-facing: directory map, design decisions, external deps, skills
3. **Agent Skills** — step-by-step procedures (`npx skills add edgesentry/documaris`)
4. **`docs/`** — reference material only (architecture, background, personas, roadmap)
5. **No duplication** — each fact lives in exactly one place
6. **No cargo doc territory** — don't duplicate types, fields, or method signatures from code

### File naming

All files under `docs/` use `kebab-case.md` with role prefixes:

| Prefix | Use for |
|--------|---------|
| `ref-` | Design references, architecture, background, regulatory mappings |
| `ui-` | UI/UX specifications and personas |
| `roadmap/` | Roadmap documents (subdirectory) |

### Skill-first policy

Before adding a procedure to `docs/`, create a Skill instead. Only reference material (facts, schemas, design decisions) goes in `docs/`.

## Field maps

Field maps in `field_maps/` are the source of truth for form-to-data mapping. After any change, run `uv run pytest tests/` to verify contracts.

## Agent Skills

Skills use the `documaris-` prefix, follow the [agentskills.io](https://agentskills.io/specification) spec, and live in `.agents/skills/`.

## Issues

Add every new issue to the relevant [project board](https://github.com/orgs/edgesentry/projects) with a priority set.

| Label | Meaning |
|-------|---------|
| `priority:P0` | Blocks a release or core functionality |
| `priority:P1` | High value, scheduled near-term |
| `priority:P2` | Valuable but deferrable |
