# documaris

**Maritime document generation and compliance automation platform.**

documaris consumes structured vessel, voyage, and cargo data from the [maridb](https://github.com/edgesentry/maridb) data layer and automatically produces the port call documentation packages that commercial vessels must submit to port authorities worldwide.

## Quick links

- [Background](background.md) — product context, market positioning, open-core model
- [Architecture](architecture.md) — six-layer pipeline, data flow, compliance policy
- [Roadmap](roadmap.md) — milestones M0–M3, open questions
- [PIER71 Evaluation Mapping](pier71-evaluation-mapping.md) — alignment with Smart Port Challenge 2026 criteria

## Product stack

| Product | Role |
|---|---|
| **maridb** | Data layer — vessel/voyage/cargo/AIS ingestion and transformation. [github.com/edgesentry/maridb](https://github.com/edgesentry/maridb) |
| **arktrace** | Shadow fleet detection application — reads maridb data; causal inference scoring, analyst dashboard. [github.com/edgesentry/arktrace](https://github.com/edgesentry/arktrace) |
| **documaris** | Document layer — port call package generation, compliance checking |
| **edgesentry** | Physical layer — robotic inspection, sensor deployment |

## Source

- GitHub: [github.com/edgesentry/documaris](https://github.com/edgesentry/documaris)
- PIER71 Smart Port Challenge 2026 application deadline: **15 June 2026**
