import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  certLevelLabel,
  certLevelColor,
  fetchSiteAttestation,
  fetchPortfolioAttestation,
  type GreenMarkAttestation,
} from "./attestation.js";

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

// New format: top-level attestation field (clarus#124+)
function makeRecord(seq: number, att?: GreenMarkAttestation) {
  return {
    sequence: seq,
    timestamp_ms: 1_778_000_000_000 + seq * 1000,
    rule_id: "EUI_GOLD_EXCEEDED",
    record_hash_hex: "a".repeat(64),
    ...(att ? { attestation: att } : {}),
  };
}

// Legacy format: zk_proof.public_values (pre-clarus#124)
function makeLegacyRecord(seq: number, att?: GreenMarkAttestation) {
  if (!att) return { sequence: seq, timestamp_ms: 1_778_000_000_000 + seq * 1000 };
  return {
    sequence: seq,
    timestamp_ms: 1_778_000_000_000 + seq * 1000,
    record_hash_hex: "a".repeat(64),
    zk_proof: {
      framework:     "mock",
      program_id:    "bca-green-mark-2021-v1-mock",
      proof_bytes:   btoa("unused"),
      public_values: btoa(JSON.stringify(att)),
    },
  };
}

// ── certLevelLabel ────────────────────────────────────────────────────────────

describe("certLevelLabel", () => {
  it("returns human-readable labels for all cert levels", () => {
    expect(certLevelLabel("platinum")).toBe("Platinum");
    expect(certLevelLabel("gold_plus")).toBe("GoldPlus");
    expect(certLevelLabel("gold")).toBe("Gold");
    expect(certLevelLabel("certified")).toBe("Certified");
    expect(certLevelLabel("not_certified")).toBe("Not Certified");
  });
});

// ── certLevelColor ────────────────────────────────────────────────────────────

describe("certLevelColor", () => {
  it("returns green for platinum and gold_plus", () => {
    expect(certLevelColor("platinum")).toBe("#3fb950");
    expect(certLevelColor("gold_plus")).toBe("#3fb950");
  });

  it("returns amber for gold and certified", () => {
    expect(certLevelColor("gold")).toBe("#d29922");
    expect(certLevelColor("certified")).toBe("#d29922");
  });

  it("returns red for not_certified", () => {
    expect(certLevelColor("not_certified")).toBe("#f85149");
  });
});

// ── fetchSiteAttestation — new format ─────────────────────────────────────────

describe("fetchSiteAttestation — new format (top-level attestation)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function mockFetch(summaryBody: object, recordBodies: Record<string, object | null>) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("compliance-latest") || url.includes("zkp-latest")) return { ok: false };
      if (url.includes("/api/audit-summary")) {
        return { ok: true, json: async () => summaryBody };
      }
      const key = url.split("/data/audit/")[1];
      const body = key ? recordBodies[key] : null;
      if (body === null || body === undefined) return { ok: false };
      return { ok: true, json: async () => body };
    }));
  }

  it("returns attestation when latest record has top-level attestation field", async () => {
    const att = makeAttestation({ cert_level: "platinum", all_criteria_pass: true });
    mockFetch(
      { runs: [{ run_id: "1000", record_count: 6, last_seq: 5 }] },
      { "chains/SITE-A/1000/00000000000000000005.json": makeRecord(5, att) }
    );

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attestation).not.toBeNull();
    expect(result.attestation!.cert_level).toBe("platinum");
    expect(result.attestation!.all_criteria_pass).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.proof_valid).toBeNull();
    expect(result.record_hash).toBe("a".repeat(64));
  });

  it("scans backwards and finds attestation in earlier record", async () => {
    const att = makeAttestation({ cert_level: "gold" });
    mockFetch(
      { runs: [{ run_id: "1000", record_count: 6, last_seq: 5 }] },
      {
        "chains/SITE-A/1000/00000000000000000005.json": makeRecord(5),
        "chains/SITE-A/1000/00000000000000000004.json": makeRecord(4, att),
      }
    );

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attestation?.cert_level).toBe("gold");
  });

  it("returns error:no_runs when summary has empty runs", async () => {
    mockFetch({ runs: [] }, {});
    const result = await fetchSiteAttestation("SITE-EMPTY");
    expect(result.attestation).toBeNull();
    expect(result.error).toBe("no runs");
  });

  it("returns error when no attestation found in any recent record", async () => {
    mockFetch(
      { runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] },
      { "chains/SITE-A/1000/00000000000000000000.json": makeRecord(0) }
    );

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attestation).toBeNull();
    expect(result.error).toBe("no attestation in recent records");
  });

  it("returns error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network error"))));
    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attestation).toBeNull();
    expect(result.error).toContain("network error");
  });

  it("attested_at is a Date derived from record.timestamp_ms", async () => {
    const att = makeAttestation();
    const ts = 1_778_000_000_000;
    mockFetch(
      { runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] },
      { "chains/SITE-A/1000/00000000000000000000.json": { ...makeRecord(0, att), timestamp_ms: ts } }
    );

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attested_at).toBeInstanceOf(Date);
    expect(result.attested_at!.getTime()).toBe(ts);
  });
});

// ── fetchSiteAttestation — legacy fallback ────────────────────────────────────

describe("fetchSiteAttestation — legacy fallback (zk_proof.public_values)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("falls back to zk_proof.public_values for pre-clarus#124 records", async () => {
    const att = makeAttestation({ cert_level: "certified" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("compliance-latest") || url.includes("zkp-latest")) return { ok: false };
      if (url.includes("/api/audit-summary")) {
        return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
      }
      return { ok: true, json: async () => makeLegacyRecord(0, att) };
    }));

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attestation?.cert_level).toBe("certified");
    expect(result.verified).toBe(true);
  });
});

// ── fetchPortfolioAttestation ─────────────────────────────────────────────────

describe("fetchPortfolioAttestation", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("aggregates multiple sites and computes all_pass", async () => {
    const att1 = makeAttestation({ site_id: "SITE-1", all_criteria_pass: true, cert_level: "gold" });
    const att2 = makeAttestation({ site_id: "SITE-2", all_criteria_pass: true, cert_level: "platinum" });

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("compliance-latest") || url.includes("zkp-latest")) return { ok: false };
      const siteId = url.includes("SITE-1") ? "SITE-1" : "SITE-2";
      if (url.includes("/api/audit-summary")) {
        return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
      }
      const att = siteId === "SITE-1" ? att1 : att2;
      return { ok: true, json: async () => makeRecord(0, att) };
    }));

    const portfolio = await fetchPortfolioAttestation("OP-001", ["SITE-1", "SITE-2"]);
    expect(portfolio.all_pass).toBe(true);
    expect(portfolio.pass_count).toBe(2);
    expect(portfolio.total_count).toBe(2);
    expect(portfolio.sites).toHaveLength(2);
  });

  it("all_pass is false when any site fails criteria", async () => {
    const passing = makeAttestation({ all_criteria_pass: true });
    const failing = makeAttestation({ all_criteria_pass: false, cert_level: "not_certified" });

    let callIndex = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("compliance-latest") || url.includes("zkp-latest")) return { ok: false };
      if (url.includes("/api/audit-summary")) {
        return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
      }
      const att = callIndex++ === 0 ? passing : failing;
      return { ok: true, json: async () => makeRecord(0, att) };
    }));

    const portfolio = await fetchPortfolioAttestation("OP-001", ["SITE-1", "SITE-2"]);
    expect(portfolio.all_pass).toBe(false);
    expect(portfolio.pass_count).toBe(1);
  });

  it("all_pass is false when no sites provided", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const portfolio = await fetchPortfolioAttestation("OP-001", []);
    expect(portfolio.all_pass).toBe(false);
    expect(portfolio.total_count).toBe(0);
  });

  it("generated_at is a recent Date", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ runs: [] }) })));
    const before = Date.now();
    const portfolio = await fetchPortfolioAttestation("OP-001", ["SITE-1"]);
    const after = Date.now();
    expect(portfolio.generated_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(portfolio.generated_at.getTime()).toBeLessThanOrEqual(after);
  });
});
