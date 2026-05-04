import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initPipeline, runPipeline } from "./pipeline.js";
import { SCENARIOS, SG_PORT_COMPLIANCE_RULES } from "./fixtures.js";

// In Node (vitest), init() tries to fetch() the .wasm file — which isn't
// available. Pass the raw bytes from disk instead so tests run without a browser.
const __dir = dirname(fileURLToPath(import.meta.url));
const wasmBytes = readFileSync(
  join(__dir, "../wasm-pkg/edgesentry_wasm_bg.wasm")
);

beforeAll(async () => {
  await initPipeline(wasmBytes.buffer as ArrayBuffer);
});

// ── fixtures ──────────────────────────────────────────────────────────────────

describe("fixtures", () => {
  it("has three scenarios with distinct IDs", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(ids).toEqual(["TC1", "TC2", "TC3"]);
  });

  it("each scenario CSV has a header and one data row", () => {
    for (const s of SCENARIOS) {
      const lines = s.csv.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("voyage_id");
    }
  });

  it("rules JSON is valid and has four rules", () => {
    const rules = JSON.parse(SG_PORT_COMPLIANCE_RULES) as unknown[];
    expect(rules).toHaveLength(4);
  });
});

// ── TC1 — compliant voyage ────────────────────────────────────────────────────

describe("TC1 — compliant voyage", () => {
  let result: Awaited<ReturnType<typeof runPipeline>>;

  beforeAll(async () => {
    result = await runPipeline(SCENARIOS[0].csv);
  });

  it("parses MV Horizon with voyage_id V001", () => {
    expect(result.filled.voyage_id).toBe("V001");
  });

  it("review_required is false", () => {
    expect(result.filled.review_required).toBe(false);
  });

  it("produces 0 compliance alerts", () => {
    expect(result.alerts).toHaveLength(0);
  });

  it("renders FAL Form 1 HTML containing vessel name", () => {
    expect(result.html).toContain("MV Horizon");
  });

  it("seals AuditRecord with 64-char lowercase hex BLAKE3 hash", () => {
    expect(result.payloadHash).toHaveLength(64);
    expect(result.payloadHash).toMatch(/^[0-9a-f]+$/);
  });

  it("completes in under 2000 ms", () => {
    expect(result.durationMs).toBeLessThan(2000);
  });
});

// ── TC2 — BWM certificate expired ────────────────────────────────────────────

describe("TC2 — BWM certificate expired", () => {
  let result: Awaited<ReturnType<typeof runPipeline>>;

  beforeAll(async () => {
    result = await runPipeline(SCENARIOS[1].csv);
  });

  it("parses MV Pacific Star with voyage_id V002", () => {
    expect(result.filled.voyage_id).toBe("V002");
  });

  it("fires BWM_D2_EXPIRED with severity HIGH", () => {
    const bwm = result.alerts.find((a) => a.rule_id === "BWM_D2_EXPIRED");
    expect(bwm).toBeDefined();
    expect(bwm!.severity).toBe("HIGH");
  });

  it("alert includes MPA regulation citation", () => {
    const bwm = result.alerts.find((a) => a.rule_id === "BWM_D2_EXPIRED")!;
    expect(bwm.regulation).toContain("MPA");
  });

  it("still seals an AuditRecord", () => {
    expect(result.payloadHash).toHaveLength(64);
  });
});

// ── TC3 — low-confidence fields ───────────────────────────────────────────────

describe("TC3 — low-confidence fields", () => {
  let result: Awaited<ReturnType<typeof runPipeline>>;

  beforeAll(async () => {
    result = await runPipeline(SCENARIOS[2].csv);
  });

  it("parses MV Venture with voyage_id V003", () => {
    expect(result.filled.voyage_id).toBe("V003");
  });

  it("sets review_required to true", () => {
    expect(result.filled.review_required).toBe(true);
  });

  it("fires CREW_COUNT_PRESENT alert with severity HIGH", () => {
    const alert = result.alerts.find((a) => a.rule_id === "CREW_COUNT_PRESENT");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("HIGH");
  });
});

// ── audit record properties ───────────────────────────────────────────────────

describe("audit record", () => {
  it("same CSV input produces the same BLAKE3 hash", async () => {
    const r1 = await runPipeline(SCENARIOS[0].csv);
    const r2 = await runPipeline(SCENARIOS[0].csv);
    expect(r1.payloadHash).toBe(r2.payloadHash);
  });

  it("different voyages produce different hashes", async () => {
    const r1 = await runPipeline(SCENARIOS[0].csv);
    const r2 = await runPipeline(SCENARIOS[1].csv);
    expect(r1.payloadHash).not.toBe(r2.payloadHash);
  });

  it("device_id is documaris-demo", async () => {
    const r = await runPipeline(SCENARIOS[0].csv);
    expect(r.auditRecord.device_id).toBe("documaris-demo");
  });

  it("sequence is 1", async () => {
    const r = await runPipeline(SCENARIOS[0].csv);
    expect(r.auditRecord.sequence).toBe(1);
  });
});
