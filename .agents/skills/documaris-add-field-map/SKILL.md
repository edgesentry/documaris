---
name: documaris-add-field-map
description: Add or update a port call document field map. Use when adding a new form type or updating field sources.
license: Apache-2.0
compatibility: Requires Python >=3.12 and uv for schema validation
metadata:
  repo: documaris
---

Field maps live in `field_maps/`. Each file maps a document form to indago data sources.

## Field map structure

```json
{
  "form": "fal_form_1",
  "version": "IMO FAL.2/Circ.127",
  "fields": [
    {
      "field_id": "vessel_name",
      "label": "Name of ship",
      "fill_type": "direct",
      "source": "vessel.name"
    }
  ]
}
```

Fill types:

| Type | Meaning |
|------|---------|
| `direct` | Copied verbatim from indago source path |
| `computed` | Derived from multiple indago fields |
| `llm_summarise` | LLM condenses a long source value |
| `llm_translate` | LLM translates to target language |
| `llm_infer` | LLM infers value from surrounding context |
| `agent_entry` | PII entered locally — no server source |

## After adding a field map

```bash
uv run pytest tests/ -v
```

The contract tests will automatically check that all `direct` fields resolve in the mock vessel record.
