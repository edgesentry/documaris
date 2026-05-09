import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  certLevelLabel,
  certLevelColor,
  fetchSiteAttestation,
  fetchPortfolioAttestation,
  type GreenMarkAttestation,
  type ZkProof,
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

function makeProof(att: GreenMarkAttestation): ZkProof {
  return {
    framework: "mock",
    program_id: "bca-green-mark-2021-v1-mock",
    proof_bytes: "dGVzdA==",
    public_values: btoa(JSON.stringify(att)),
  };
}

function makeAuditRecord(seq: number, att?: GreenMarkAttestation) {
  return {
    sequence: seq,
    timestamp_ms: 1_778_000_000_000 + seq * 1000,
    rule_id: "EUI_GOLD_EXCEEDED",
    record_hash_hex: "a".repeat(64),
    ...(att ? { zk_proof: makeProof(att) } : {}),
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

// ── decode (inline re-implementation for unit tests) ──────────────────────────

function decodeAttestation(proof: ZkProof): GreenMarkAttestation | null {
  try {
    return JSON.parse(atob(proof.public_values)) as GreenMarkAttestation;
  } catch {
    return null;
  }
}

describe("decodeAttestation (base64 JSON round-trip)", () => {
  it("round-trips a GreenMarkAttestation through base64 JSON", () => {
    const att = makeAttestation();
    const decoded = decodeAttestation(makeProof(att));
    expect(decoded).not.toBeNull();
    expect(decoded!.cert_level).toBe("gold");
    expect(decoded!.all_criteria_pass).toBe(true);
    expect(decoded!.site_id).toBe("MCH-OUTLET-042");
    expect(decoded!.eui_kwh_m2).toBe(105.0);
  });

  it("returns null for invalid base64", () => {
    const bad: ZkProof = { ...makeProof(makeAttestation()), public_values: "!!!not-base64!!!" };
    expect(decodeAttestation(bad)).toBeNull();
  });

  it("returns null for valid base64 but non-JSON", () => {
    const bad: ZkProof = { ...makeProof(makeAttestation()), public_values: btoa("not json") };
    expect(decodeAttestation(bad)).toBeNull();
  });

  it("preserves all attestation fields", () => {
    const att = makeAttestation({ cop_pass: false, period_start_ms: 999 });
    const decoded = decodeAttestation(makeProof(att))!;
    expect(decoded.cop_pass).toBe(false);
    expect(decoded.period_start_ms).toBe(999);
  });

  it("violation attestation decodes correctly", () => {
    const att = makeAttestation({ all_criteria_pass: false, cert_level: "not_certified" });
    const decoded = decodeAttestation(makeProof(att))!;
    expect(decoded.all_criteria_pass).toBe(false);
    expect(decoded.cert_level).toBe("not_certified");
  });
});

// ── fetchSiteAttestation ──────────────────────────────────────────────────────

describe("fetchSiteAttestation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(summaryBody: object, recordBodies: Record<string, object | null>) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/audit-summary")) {
        return { ok: true, json: async () => summaryBody };
      }
      const key = url.split("/data/audit/")[1];
      const body = key ? recordBodies[key] : null;
      if (body === null || body === undefined) return { ok: false };
      return { ok: true, json: async () => body };
    }));
  }

  it("returns attestation when latest record has zk_proof", async () => {
    const att = makeAttestation({ cert_level: "platinum", all_criteria_pass: true });
    const record = makeAuditRecord(5, att);

    mockFetch(
      { runs: [{ run_id: "1000", record_count: 6, last_seq: 5 }] },
      { "chains/SITE-A/1000/00000000000000000005.json": record }
    );

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attestation).not.toBeNull();
    expect(result.attestation!.cert_level).toBe("platinum");
    expect(result.all_criteria_pass ?? result.attestation!.all_criteria_pass).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.record_hash).toBe("a".repeat(64));
  });

  it("scans backwards and finds zk_proof in earlier record", async () => {
    const att = makeAttestation({ cert_level: "gold" });
    // seq 5 has no proof, seq 4 has proof
    mockFetch(
      { runs: [{ run_id: "1000", record_count: 6, last_seq: 5 }] },
      {
        "chains/SITE-A/1000/00000000000000000005.json": makeAuditRecord(5), // no proof
        "chains/SITE-A/1000/00000000000000000004.json": makeAuditRecord(4, att),
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

  it("returns error when no zk_proof found in any recent record", async () => {
    mockFetch(
      { runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] },
      { "chains/SITE-A/1000/00000000000000000000.json": makeAuditRecord(0) }
    );

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attestation).toBeNull();
    expect(result.error).toBe("no zk_proof in recent records");
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
    const record = { ...makeAuditRecord(0, att), timestamp_ms: ts };

    mockFetch(
      { runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] },
      { "chains/SITE-A/1000/00000000000000000000.json": record }
    );

    const result = await fetchSiteAttestation("SITE-A");
    expect(result.attested_at).toBeInstanceOf(Date);
    expect(result.attested_at!.getTime()).toBe(ts);
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
      const siteId = url.includes("SITE-1") ? "SITE-1" : "SITE-2";
      if (url.includes("/api/audit-summary")) {
        return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
      }
      const att = siteId === "SITE-1" ? att1 : att2;
      return { ok: true, json: async () => makeAuditRecord(0, att) };
    }));

    const portfolio = await fetchPortfolioAttestation("OP-001", ["SITE-1", "SITE-2"]);
    expect(portfolio.all_pass).toBe(true);
    expect(portfolio.pass_count).toBe(2);
    expect(portfolio.total_count).toBe(2);
    expect(portfolio.sites).toHaveLength(2);
  });

  it("all_pass is false when any site fails", async () => {
    const passing = makeAttestation({ all_criteria_pass: true });
    const failing = makeAttestation({ all_criteria_pass: false, cert_level: "not_certified" });

    let callIndex = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("zkp-latest")) return { ok: false };
      if (url.includes("/api/audit-summary")) {
        return { ok: true, json: async () => ({ runs: [{ run_id: "1000", record_count: 1, last_seq: 0 }] }) };
      }
      const att = callIndex++ === 0 ? passing : failing;
      return { ok: true, json: async () => makeAuditRecord(0, att) };
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
