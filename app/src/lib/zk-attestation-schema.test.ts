/**
 * Contract tests: validate attestation.ts fixtures against
 * clarus/schemas/zk-attestation.json — the canonical type definition
 * owned by clarus (source of truth for both Rust and TypeScript types).
 *
 * If clarus changes GreenMarkAttestation or ZkProof, this test fails,
 * forcing a documaris update before the divergence reaches production.
 */
import { describe, it, expect, beforeAll } from "vitest";
import Ajv from "ajv/dist/2020.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { blake3 } from "@noble/hashes/blake3.js";
import type { GreenMarkAttestation, ZkProof } from "./attestation.js";

// Load schema from clarus repo (sibling directory — see AGENTS.md checkout requirement)
const schemaPath = resolve(__dirname, "../../../../clarus/schemas/zk-attestation.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

const ajv = new Ajv({ strict: true });
ajv.addSchema(schema);
const validateZkProof = ajv.compile({ $ref: "https://clarus.edgesentry.io/schemas/zk-attestation.json#/$defs/ZkProof" });
const validateAttestation = ajv.compile({ $ref: "https://clarus.edgesentry.io/schemas/zk-attestation.json#/$defs/GreenMarkAttestation" });

// ── Fixture helpers (mirror of attestation.test.ts) ───────────────────────────

function b64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

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
  const json      = JSON.stringify(att);
  const bytes     = new TextEncoder().encode(json);
  return {
    framework:     "mock",
    program_id:    "bca-green-mark-2021-v1-mock",
    proof_bytes:   b64Encode(blake3(bytes)),
    public_values: btoa(json),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("zk-attestation schema — ZkProof", () => {
  it("valid mock proof passes schema", () => {
    const proof = makeProof(makeAttestation());
    const ok = validateZkProof(proof);
    expect(ok, JSON.stringify(validateZkProof.errors)).toBe(true);
  });

  it("all three frameworks are valid enum values", () => {
    for (const framework of ["mock", "sp1", "risc0"] as const) {
      const proof = { ...makeProof(makeAttestation()), framework };
      expect(validateZkProof(proof), `framework=${framework}`).toBe(true);
    }
  });

  it("unknown framework fails schema", () => {
    const proof = { ...makeProof(makeAttestation()), framework: "groth16" };
    expect(validateZkProof(proof)).toBe(false);
  });

  it("missing proof_bytes fails schema", () => {
    const { proof_bytes: _, ...proof } = makeProof(makeAttestation());
    expect(validateZkProof(proof)).toBe(false);
  });

  it("extra fields fail schema (additionalProperties: false)", () => {
    const proof = { ...makeProof(makeAttestation()), extra: "field" };
    expect(validateZkProof(proof)).toBe(false);
  });
});

describe("zk-attestation schema — GreenMarkAttestation", () => {
  it("valid Gold attestation passes schema", () => {
    const att = makeAttestation();
    expect(validateAttestation(att), JSON.stringify(validateAttestation.errors)).toBe(true);
  });

  it("all cert levels are valid", () => {
    const levels = ["not_certified", "certified", "gold", "gold_plus", "platinum"] as const;
    for (const cert_level of levels) {
      const att = makeAttestation({ cert_level });
      expect(validateAttestation(att), `cert_level=${cert_level}`).toBe(true);
    }
  });

  it("unknown cert level fails schema", () => {
    const att = { ...makeAttestation(), cert_level: "diamond" };
    expect(validateAttestation(att)).toBe(false);
  });

  it("negative eui_kwh_m2 fails schema", () => {
    const att = makeAttestation({ eui_kwh_m2: -1 });
    expect(validateAttestation(att)).toBe(false);
  });

  it("missing required field fails schema", () => {
    const { cop_pass: _, ...att } = makeAttestation();
    expect(validateAttestation(att)).toBe(false);
  });

  it("extra fields fail schema (additionalProperties: false)", () => {
    const att = { ...makeAttestation(), extra: "field" };
    expect(validateAttestation(att)).toBe(false);
  });

  it("violation attestation (not_certified, all_criteria_pass=false) passes schema", () => {
    const att = makeAttestation({ cert_level: "not_certified", all_criteria_pass: false });
    expect(validateAttestation(att), JSON.stringify(validateAttestation.errors)).toBe(true);
  });
});
