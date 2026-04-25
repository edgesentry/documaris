"""
Tests for the maridb schema contract and FAL Form 1 field map.

1. mock/vessel_V001.json conforms to schemas/vessel_record.json
2. Every `direct` field in field_maps/fal_form_1_field_map.json resolves against the mock record
"""

import json
from pathlib import Path

import jsonschema
import pytest

ROOT = Path(__file__).parent.parent
MOCK = ROOT / "mock" / "vessel_V001.json"
FIELD_MAP = ROOT / "field_maps" / "fal_form_1_field_map.json"
SCHEMA = ROOT / "schemas" / "vessel_record.json"


@pytest.fixture(scope="module")
def vessel_record():
    return json.loads(MOCK.read_text())


@pytest.fixture(scope="module")
def field_map():
    return json.loads(FIELD_MAP.read_text())


@pytest.fixture(scope="module")
def vessel_schema():
    return json.loads(SCHEMA.read_text())


# ---------------------------------------------------------------------------
# 1. vessel_V001.json — JSON Schema validation
# ---------------------------------------------------------------------------

class TestVesselRecord:
    def test_validates_against_schema(self, vessel_record, vessel_schema):
        """vessel_V001.json must conform to schemas/vessel_record.json."""
        jsonschema.validate(instance=vessel_record, schema=vessel_schema)

    def test_imo_format(self, vessel_record):
        assert vessel_record["vessel"]["vessel_id"] == f"IMO{vessel_record['vessel']['imo_number']}"

    def test_no_pii_fields(self, vessel_record):
        """PII field keys must not appear in the record structure (names, passports, DOB)."""
        def collect_keys(obj):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if not k.startswith("_"):  # skip metadata/note fields
                        yield k
                        yield from collect_keys(v)
            elif isinstance(obj, list):
                for item in obj:
                    yield from collect_keys(item)

        keys = {k.lower() for k in collect_keys(vessel_record)}
        pii_keys = {"passport", "date_of_birth", "dob", "crew_name", "master_name"}
        found = keys & pii_keys
        assert not found, f"PII field keys found in vessel record: {found}"

    def test_vessel_voyage_ids_consistent(self, vessel_record):
        """voyage.vessel_id must match vessel.vessel_id."""
        assert vessel_record["voyage"]["vessel_id"] == vessel_record["vessel"]["vessel_id"]

    def test_cargo_voyage_id_consistent(self, vessel_record):
        """cargo.voyage_id must match voyage.voyage_id."""
        assert vessel_record["cargo"]["voyage_id"] == vessel_record["voyage"]["voyage_id"]

    def test_ais_ids_consistent(self, vessel_record):
        assert vessel_record["ais_summary"]["vessel_id"] == vessel_record["vessel"]["vessel_id"]
        assert vessel_record["ais_summary"]["voyage_id"] == vessel_record["voyage"]["voyage_id"]

    def test_bwm_certificate_present(self, vessel_record):
        """BWM certificate is required for Regulatory Alert compliance checks."""
        certs = vessel_record["vessel"].get("certificates", {})
        assert "ballast_water_management" in certs, "BWM certificate missing from vessel record"
        bwm = certs["ballast_water_management"]
        assert bwm.get("expiry_date"), "BWM certificate expiry_date must be set"


# ---------------------------------------------------------------------------
# 2. fal_form_1_field_map.json — field resolution against mock data
# ---------------------------------------------------------------------------

def _resolve(path: str, data: dict):
    """Resolve a dot-notation path like 'vessel.imo_number' against data."""
    parts = path.split(".")
    node = data
    for part in parts:
        if part.endswith("]") and "[*" in part:
            # array wildcard e.g. cargo.items[*].description — check first item
            key = part.split("[")[0]
            node = node[key][0] if node.get(key) else None
        else:
            if not isinstance(node, dict):
                return None
            node = node.get(part)
        if node is None:
            return None
    return node


class TestFieldMapResolution:
    def test_field_map_has_fields(self, field_map):
        assert len(field_map["fields"]) > 0

    def test_all_fal_form_1_fields_present(self, field_map):
        """All 19 FAL Form 1 fields must be defined."""
        numbers = {f["fal_field_number"] for f in field_map["fields"]}
        expected = {str(i) for i in range(1, 20)}
        missing = expected - numbers
        assert not missing, f"FAL Form 1 fields missing from field map: {missing}"

    def test_direct_fields_resolve_in_mock(self, field_map, vessel_record):
        """Every field with fill_type='direct' must have a maridb_source that resolves in vessel_V001.json."""
        failures = []
        for field in field_map["fields"]:
            if field["fill_type"] != "direct":
                continue
            source = field.get("maridb_source")
            if not source:
                failures.append(f"Field {field['fal_field_number']}: fill_type=direct but maridb_source is null")
                continue
            value = _resolve(source, vessel_record)
            if value is None:
                failures.append(
                    f"Field {field['fal_field_number']} ({field['fal_field_name']}): "
                    f"maridb_source='{source}' not found in vessel_V001.json"
                )
        assert not failures, "Field map resolution failures:\n" + "\n".join(failures)

    def test_llm_fields_have_source(self, field_map):
        """LLM-required fields must specify a maridb_source to feed the prompt."""
        for field in field_map["fields"]:
            if field.get("llm_required"):
                assert field.get("maridb_source"), (
                    f"Field {field['fal_field_number']} is llm_required but has no maridb_source"
                )

    def test_agent_entry_fields_have_no_server_source(self, field_map):
        """PII / agent_entry fields must NOT have a maridb_source (they never come from the server)."""
        for field in field_map["fields"]:
            if field["fill_type"] == "agent_entry":
                assert field.get("maridb_source") is None, (
                    f"Field {field['fal_field_number']} is agent_entry but has maridb_source set — "
                    "this would create a server-side PII path"
                )

    def test_completeness_summary_matches_fields(self, field_map):
        """completeness summary counts must match the actual fields list."""
        summary = field_map["fal_form_1_completeness"]
        fields = field_map["fields"]

        counts = {"direct": 0, "computed": 0, "llm_summarise": 0, "agent_entry": 0, "constant": 0}
        for f in fields:
            counts[f["fill_type"]] = counts.get(f["fill_type"], 0) + 1

        assert summary["total_fields"] == len(fields), "total_fields mismatch"
        for fill_type, expected in counts.items():
            assert summary[fill_type] == expected, (
                f"completeness.{fill_type} says {summary[fill_type]} but actual count is {expected}"
            )
