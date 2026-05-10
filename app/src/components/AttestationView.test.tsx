import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
// @ts-ignore
import { blake3 } from "@noble/hashes/blake3.js";
import { AttestationView } from "./AttestationView.js";
import type { OperatorSummary } from "../lib/bcaData.js";
import type { GreenMarkAttestation } from "../lib/attestation.js";

function b64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function validProofBytes(att: GreenMarkAttestation): string {
  const json  = JSON.stringify(att);
  const bytes = new TextEncoder().encode(json);
  return b64Encode(blake3(bytes));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAttestation(overrides: Partial<GreenMarkAttestation> = {}): GreenMarkAttestation {
  return {
    site_id: "MCH-OUTLET-042",
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
        framework:    "mock",
        program_id:   "bca-green-mark-2021-v1-mock",
        proof_bytes:  validProofBytes(att),   // correct blake3 → proof_valid: true
        public_values: btoa(JSON.stringify(att)),
      }
    } : {}),
  };
}

function makeRegistry(operatorId = "MCH-OPERATOR-001", siteId = "MCH-OUTLET-042") {
  return {
    version: "1",
    sites: [{ site_id: siteId, name: siteId, operator_id: operatorId, profile: "sg-bca-greenmark" }],
  };
}

/**
 * Mock fetch for all URLs the component touches:
 *   registry/bca-sites.json  → returns a one-site registry
 *   data/raw/zkp-latest/...  → 404 (falls through to audit-summary)
 *   api/audit-summary        → returns one run at seq 0
 *   data/audit/...           → returns the given audit record
 */
function mockFetch(att?: GreenMarkAttestation) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("registry/bca-sites.json")) {
      return { ok: true, json: async () => makeRegistry() };
    }
    if (url.includes("zkp-latest")) {
      return { ok: false, status: 404 };
    }
    if (url.includes("audit-summary")) {
      return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
    }
    const record = att ? makeRecord(0, att) : makeRecord(0);
    return { ok: true, json: async () => record };
  }));
}

const OPERATORS: OperatorSummary[] = [
  {
    operator_id: "MCH-OPERATOR-001",
    operator_name: "MCH-OPERATOR-001",
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

  it("renders the page heading and tamper-proof badge", () => {
    mockFetch();
    render(<AttestationView operators={[]} />);
    expect(screen.getByText(/BCA Green Mark/)).toBeInTheDocument();
    expect(screen.getByText(/Tamper-proof records/)).toBeInTheDocument();
  });

  it("shows loading state while fetching attestations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      // Registry resolves immediately so the portfolio fetch can start
      if (url.includes("registry/bca-sites.json")) {
        return { ok: true, json: async () => makeRegistry() };
      }
      // Everything else stays pending → component stays in loading state
      return new Promise(() => {});
    }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText(/Retrieving certification records/)).toBeInTheDocument();
    });
  });

  it("displays cert level badge when attestation is available", async () => {
    mockFetch(makeAttestation({ cert_level: "gold" }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText("Gold")).toBeInTheDocument();
    });
  });

  it("shows Certified status for all_criteria_pass: true", async () => {
    mockFetch(makeAttestation({ all_criteria_pass: true }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText(/✓ Certified/)).toBeInTheDocument();
    });
  });

  it("shows Below standard status for all_criteria_pass: false", async () => {
    mockFetch(makeAttestation({ all_criteria_pass: false, cert_level: "not_certified" }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText(/Below standard/)).toBeInTheDocument();
    });
  });

  it("shows all sites pass banner when every site is compliant", async () => {
    mockFetch(makeAttestation({ all_criteria_pass: true }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText(/meet the BCA Green Mark standard/)).toBeInTheDocument();
    });
  });

  it("shows partial pass count when some sites fail", async () => {
    mockFetch(makeAttestation({ all_criteria_pass: false, cert_level: "not_certified" }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText(/0 of 1 sites meet/)).toBeInTheDocument();
    });
  });

  it("shows Data integrity issue status for tampered proof", async () => {
    // proof_bytes that doesn't match blake3(public_values) → proof_valid: false
    const att = makeAttestation({ all_criteria_pass: true, cert_level: "gold" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("registry/bca-sites.json"))
        return { ok: true, json: async () => makeRegistry() };
      if (url.includes("zkp-latest"))
        return { ok: false, status: 404 };
      if (url.includes("audit-summary"))
        return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
      return { ok: true, json: async () => ({
        ...makeRecord(0),
        zk_proof: {
          framework: "mock",
          program_id: "bca-green-mark-2021-v1-mock",
          proof_bytes: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // wrong hash
          public_values: btoa(JSON.stringify(att)),
        },
      })};
    }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText(/Data integrity issue/)).toBeInTheDocument();
    });
  });

  it("shows tamper alert banner when proof is invalid", async () => {
    const att = makeAttestation({ all_criteria_pass: true });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("registry/bca-sites.json"))
        return { ok: true, json: async () => makeRegistry() };
      if (url.includes("zkp-latest"))
        return { ok: false, status: 404 };
      if (url.includes("audit-summary"))
        return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
      return { ok: true, json: async () => ({
        ...makeRecord(0),
        zk_proof: {
          framework: "mock",
          program_id: "bca-green-mark-2021-v1-mock",
          proof_bytes: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          public_values: btoa(JSON.stringify(att)),
        },
      })};
    }));
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByText(/could not be verified/)).toBeInTheDocument();
    });
  });

  it("renders operator selector driven by registry", async () => {
    mockFetch();
    render(<AttestationView operators={OPERATORS} />);
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  it("shows API export link", () => {
    mockFetch();
    render(<AttestationView operators={OPERATORS} />);
    expect(screen.getByText(/Export as JSON/)).toBeInTheDocument();
  });
});
