"""W5 — port cyber clearance facts contract and optional eds render smoke."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
FIELD_MAP = ROOT / "field_maps" / "port_cyber_clearance_field_map.json"
FIXTURES = ROOT / "fixtures" / "clearance"
DIST = ROOT / "dist"

REQUIRED_FACT_KEYS = frozenset(
    {
        "vessel_key",
        "port_call_id",
        "outcome",
        "decision_hash",
        "rules_fired",
        "paths",
        "cve_ids",
        "disclaimer",
    }
)


@pytest.fixture(scope="module")
def field_map():
    return json.loads(FIELD_MAP.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "facts_file,expected_outcome",
    [
        ("vessel-hold_facts.json", "hold"),
        ("vessel-clean_facts.json", "pass"),
    ],
)
def test_facts_fixture_contract(facts_file: str, expected_outcome: str) -> None:
    data = json.loads((FIXTURES / facts_file).read_text(encoding="utf-8"))
    assert REQUIRED_FACT_KEYS <= set(data)
    assert data["outcome"] == expected_outcome
    assert len(data["decision_hash"]) == 64


def test_field_map_declares_template_id(field_map: dict) -> None:
    assert field_map["_template_id"] == "port-cyber-clearance"
    keys = {f["field_key"] for f in field_map["fields"]}
    assert "OUTCOME" in keys
    assert "VERIFY_URL" in keys
    assert "DECISION_HASH" in keys


def test_dist_sample_html_exists_when_generated() -> None:
    hold_html = DIST / "vessel-hold_port-cyber-clearance.html"
    clean_html = DIST / "vessel-clean_port-cyber-clearance.html"
    if not hold_html.is_file():
        pytest.skip("run scripts/render-clearance-samples.sh to generate dist/")
    assert "HOLD" in hold_html.read_text(encoding="utf-8")
    assert "PASS" in clean_html.read_text(encoding="utf-8")


@pytest.mark.integration
def test_eds_render_clearance_smoke(tmp_path: Path) -> None:
    eds = os.environ.get("EDS_BIN") or shutil.which("eds")
    if not eds:
        pytest.skip("eds not on PATH")
    probe = subprocess.run(
        [eds, "document", "render-clearance", "--help"],
        capture_output=True,
        check=False,
    )
    if probe.returncode != 0:
        pytest.skip("eds lacks document render-clearance (build edgesentry-rs W5)")

    out = tmp_path / "hold.html"
    subprocess.run(
        [
            eds,
            "document",
            "render-clearance",
            "--facts",
            str(FIXTURES / "vessel-hold_facts.json"),
            "--verify-url",
            "https://verify.example/test",
            "--out",
            str(out),
        ],
        check=True,
    )
    html = out.read_text(encoding="utf-8")
    assert "vessel-hold" in html
    assert "https://verify.example/test" in html
