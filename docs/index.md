# documaris

**Maritime document generation and compliance automation platform.**

documaris consumes structured vessel, voyage, and cargo data from the [maridb](https://github.com/edgesentry/maridb) data layer and automatically produces the port call documentation packages that commercial vessels must submit to port authorities worldwide.

## Quick links

- [ref-background.md](ref-background.md) — product context, market positioning, open-core model
- [ref-architecture.md](ref-architecture.md) — six-layer pipeline, data flow, compliance policy
- [ref-customers.md](ref-customers.md) — customer segments, use cases, unvalidated hypotheses
- [roadmap/index.md](roadmap/index.md) — milestones M0–M5, demo test cases
- [ref-pier71-evaluation.md](ref-pier71-evaluation.md) — alignment with Smart Port Challenge 2026 criteria

## Product stack

| Product | Role |
|---|---|
| [maridb](https://github.com/edgesentry/maridb) | Data layer — vessel/voyage/cargo/AIS ingestion and transformation |
| [arktrace](https://github.com/edgesentry/arktrace) | Shadow fleet detection — reads maridb data; causal inference scoring |
| **documaris** | Document layer — port call package generation, compliance checking |
| [clarus](https://github.com/edgesentry/clarus) | Vessel risk intelligence — same vessel entity, `?mmsi=` deep-link |
| [edgesentry-rs](https://github.com/edgesentry/edgesentry-rs) | Physical layer — audit chain (BLAKE3 + Ed25519) |
