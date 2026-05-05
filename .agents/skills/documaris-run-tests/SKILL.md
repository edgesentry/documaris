---
name: documaris-run-tests
description: Run the documaris test suite. Use when changing field maps, schemas, or pipeline logic to verify contracts are satisfied.
license: Apache-2.0
compatibility: Requires Python >=3.12 and uv; Node.js >=20 for Vitest
metadata:
  repo: documaris
---

## Schema + field map contract tests (pytest)

```bash
uv run pytest tests/ -v
```

Validates:
- `mock/vessel_V001.json` conforms to `schemas/vessel_record.json`
- No PII keys in server-side data paths
- All `direct` fields in FAL Form 1 field map resolve in mock data
- Agent-entry (PII) fields have no server sources

## App unit tests (Vitest)

```bash
cd app && npm test
```

Covers: VoyageSelector, AlertList, AuditPanel, FieldAnalysis, clarusData, pipeline.
