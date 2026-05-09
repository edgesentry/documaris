import { describe, it, expect } from "vitest";
import { certLevelLabel, certLevelColor, type GreenMarkAttestation, type ZkProof } from "./attestation.js";

// ── certLevelLabel ─────────────────────────────────────────────────────────────

describe("certLevelLabel", () => {
  it("returns human-readable labels for all cert levels", () => {
    expect(certLevelLabel("platinum")).toBe("Platinum");
    expect(certLevelLabel("gold_plus")).toBe("GoldPlus");
    expect(certLevelLabel("gold")).toBe("Gold");
    expect(certLevelLabel("certified")).toBe("Certified");
    expect(certLevelLabel("not_certified")).toBe("Not Certified");
  });
});

// ── certLevelColor ─────────────────────────────────────────────────────────────

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

// ── decodeAttestation (inline re-implementation for testability) ───────────────

function decodeAttestation(proof: ZkProof): GreenMarkAttestation | null {
  try {
    return JSON.parse(atob(proof.public_values)) as GreenMarkAttestation;
  } catch {
    return null;
  }
}

function makeProof(att: GreenMarkAttestation): ZkProof {
  return {
    framework: "mock",
    program_id: "bca-green-mark-2021-v1-mock",
    proof_bytes: "dGVzdA==",
    public_values: btoa(JSON.stringify(att)),
  };
}

describe("decodeAttestation", () => {
  const att: GreenMarkAttestation = {
    site_id: "MCH-OUTLET-042",
    eui_kwh_m2: 105.0,
    cert_level: "gold",
    all_criteria_pass: true,
    cop_pass: true,
    lpd_pass: true,
    period_start_ms: 1_000_000,
    period_end_ms: 2_000_000,
  };

  it("round-trips a GreenMarkAttestation through base64 JSON", () => {
    const proof = makeProof(att);
    const decoded = decodeAttestation(proof);
    expect(decoded).not.toBeNull();
    expect(decoded!.cert_level).toBe("gold");
    expect(decoded!.all_criteria_pass).toBe(true);
    expect(decoded!.site_id).toBe("MCH-OUTLET-042");
    expect(decoded!.eui_kwh_m2).toBe(105.0);
  });

  it("returns null for invalid base64", () => {
    const bad = { ...makeProof(att), public_values: "!!!not-base64!!!" };
    expect(decodeAttestation(bad)).toBeNull();
  });

  it("returns null for valid base64 but non-JSON", () => {
    const bad = { ...makeProof(att), public_values: btoa("not json") };
    expect(decodeAttestation(bad)).toBeNull();
  });

  it("preserves all attestation fields", () => {
    const proof = makeProof(att);
    const decoded = decodeAttestation(proof)!;
    expect(decoded.cop_pass).toBe(true);
    expect(decoded.lpd_pass).toBe(true);
    expect(decoded.period_start_ms).toBe(1_000_000);
  });

  it("violation attestation decodes correctly", () => {
    const violation: GreenMarkAttestation = { ...att, all_criteria_pass: false, cop_pass: false, cert_level: "not_certified" };
    const decoded = decodeAttestation(makeProof(violation))!;
    expect(decoded.all_criteria_pass).toBe(false);
    expect(decoded.cert_level).toBe("not_certified");
  });
});
