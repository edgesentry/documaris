# Port Cyber Clearance — template specification (W5)

Cap Vista MVP gate **G5**. Rendered HTML lives in `edgesentry-rs`:

`crates/edgesentry-document/templates/port-cyber-clearance.html`

## Input

indago `*_facts.json` from:

```bash
uv run python pipelines/port_clearance_eval.py evaluate vessel-hold --write
```

## Sections (certificate)

| # | Section | Source |
|---|---------|--------|
| 1 | Executive summary | `outcome`, `vessel_key`, `port_call_id`, rule/path counts |
| 2 | Rules fired | `rules_fired[]` (id, title, severity, requirements) |
| 3 | Cited vulnerability paths | `paths[]` (rule_ids, summary, graph nodes) |
| 4 | Decision integrity | `decision_hash` |
| 5 | Independent verification | `verify_url` (CLI arg; W6 → clarus) |
| — | Disclaimer | `disclaimer` |

## Render CLI

```bash
eds document render-clearance \
  --facts fixtures/clearance/vessel-hold_facts.json \
  --verify-url "https://verify.edgesentry.io/clearance/poc" \
  --out dist/vessel-hold_port-cyber-clearance.html
```

Sample HTML for deck embed: `dist/*.html` (generate via `scripts/render-clearance-samples.sh`).

## PDF

Open HTML in a browser → Print → Save as PDF (same as documaris maritime forms).

## Related

- W3 facts: [indago](https://github.com/edgesentry/indago) `pipelines/maritime_cyber/eval.py`
- W4 audit: [edgesentry-rs](https://github.com/edgesentry/edgesentry-rs) `eds audit sign-clearance`
- Field map: [`field_maps/port_cyber_clearance_field_map.json`](../field_maps/port_cyber_clearance_field_map.json)
