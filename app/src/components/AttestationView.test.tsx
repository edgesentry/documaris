import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AttestationView } from "./AttestationView.js";
import type { OperatorSummary } from "../lib/bcaData.js";
import type { GreenMarkAttestation } from "../lib/attestation.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAttestation(overrides: Partial<GreenMarkAttestation> = {}): GreenMarkAttestation {
  return {
    site_id: "MCH-OUTLET-BCA",
    eui_kwh_m2: 105.0,
    cert_level: "gold",
    all_criteria_pass: true,
    cop_pass: true,
    lpd_pass: true,
    period_start_ms: 1_000_000,
    period_end_ms: 2_000_000,
    ...overrides,
  };
}

function makeRecord(seq: number, att?: GreenMarkAttestation) {
  return {
    sequence: seq,
    timestamp_ms: 1_778_000_000_000,
    rule_id: "EUI_GOLD_EXCEEDED",
    record_hash_hex: "a".repeat(64),
    ...(att ? {
      zk_proof: {
        framework: "mock",
        program_id: "bca-green-mark-2021-v1-mock",
        proof_bytes: "dGVzdA==",
        public_values: btoa(JSON.stringify(att)),
      }
    } : {}),
  };
}

function mockClarusFetch(att?: GreenMarkAttestation) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/api/audit-summary")) {
      return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
    }
    const record = att ? makeRecord(0, att) : makeRecord(0);
    return { ok: true, json: async () => record };
  }));
}

const OPERATORS: OperatorSummary[] = [
  {
    operator_id: "MCH-OUTLET-BCA",
    operator_name: "MCH-OUTLET-BCA",
    site_count: 1,
    compliant_count: 1,
    needs_action_count: 0,
    avg_eui: 105,
    avg_compliance_score: 90,
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AttestationView", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the page heading and WORM badge", () => {
    mockClarusFetch();
    render(<AttestationView operators={[]} />);
    expect(screen.getByText(/BCA Green Mark/)).toBeInTheDocument();
    expect(screen.getByText(/WORM-sealed/)).toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    // Never resolve to keep it loading
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AttestationView operators={OPERATORS} />);
    expect(screen.getByText(/Fetching ZKP attestations/)).toBeInTheDocument();
  });

  it("displays cert level badge when attestation is available", async () => {
    mockClarusFetch(makeAttestation({ cert_level: "gold", all_criteria_pass: true }));
    render(<AttestationView operators={OPERATORS} />);

    await waitFor(() => {
      expect(screen.getByText("Gold")).toBeInTheDocument();
    });
  });

  it("shows PASS for all_criteria_pass: true", async () => {
    mockClarusFetch(makeAttestation({ all_criteria_pass: true }));
    render(<AttestationView operators={OPERATORS} />);

    await waitFor(() => {
      expect(screen.getByText(/✓ PASS/)).toBeInTheDocument();
    });
  });

  it("shows FAIL for all_criteria_pass: false", async () => {
    mockClarusFetch(makeAttestation({ all_criteria_pass: false, cert_level: "not_certified" }));
    render(<AttestationView operators={OPERATORS} />);

    await waitFor(() => {
      expect(screen.getByText(/✗ FAIL/)).toBeInTheDocument();
    });
  });

  it("shows portfolio summary banner when attestation loads", async () => {
    mockClarusFetch(makeAttestation({ all_criteria_pass: true }));
    render(<AttestationView operators={OPERATORS} />);

    await waitFor(() => {
      expect(screen.getByText(/Portfolio compliant/)).toBeInTheDocument();
    });
  });

  it("shows partial pass banner when some sites fail", async () => {
    mockClarusFetch(makeAttestation({ all_criteria_pass: false, cert_level: "not_certified" }));
    render(<AttestationView operators={OPERATORS} />);

    await waitFor(() => {
      expect(screen.getByText(/0\/1 sites passing/)).toBeInTheDocument();
    });
  });

  it("shows operator_id in summary banner", async () => {
    mockClarusFetch(makeAttestation());
    render(<AttestationView operators={OPERATORS} />);

    await waitFor(() => {
      expect(screen.getByText(/Operator: MCH-OUTLET-BCA/)).toBeInTheDocument();
    });
  });

  it("renders operator selector when operators list is provided", () => {
    mockClarusFetch();
    render(<AttestationView operators={OPERATORS} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows API link for the selected operator", () => {
    mockClarusFetch();
    render(<AttestationView operators={OPERATORS} />);
    expect(screen.getByText(/\/api\/bca-portfolio\//)).toBeInTheDocument();
  });
});
