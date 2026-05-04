import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuditPanel } from "./AuditPanel.js";
import type { AuditRecord } from "../lib/pipeline.js";

const HASH = "a".repeat(64);

const makeRecord = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  device_id: "documaris-demo",
  sequence: 1,
  timestamp_ms: 1700000000000,
  payload_hash: Array.from({ length: 32 }, (_, i) => i),
  signature: Array.from({ length: 64 }, () => 0),
  prev_record_hash: Array.from({ length: 32 }, () => 0),
  ...overrides,
});

describe("AuditPanel", () => {
  it("shows first 16 chars of BLAKE3 hash followed by ellipsis", () => {
    render(<AuditPanel record={makeRecord()} payloadHash={HASH} durationMs={42} />);
    expect(screen.getByText(`${"a".repeat(16)}…`)).toBeInTheDocument();
  });

  it("shows device_id", () => {
    render(<AuditPanel record={makeRecord()} payloadHash={HASH} durationMs={42} />);
    expect(screen.getByText("documaris-demo")).toBeInTheDocument();
  });

  it("shows sequence number", () => {
    render(<AuditPanel record={makeRecord({ sequence: 7 })} payloadHash={HASH} durationMs={42} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows duration in ms", () => {
    render(<AuditPanel record={makeRecord()} payloadHash={HASH} durationMs={123} />);
    expect(screen.getByText("123 ms")).toBeInTheDocument();
  });

  it("shows sealed timestamp as ISO string", () => {
    render(<AuditPanel record={makeRecord({ timestamp_ms: 1700000000000 })} payloadHash={HASH} durationMs={0} />);
    expect(screen.getByText("2023-11-14T22:13:20.000Z")).toBeInTheDocument();
  });

  it("shows tamper-proof label", () => {
    render(<AuditPanel record={makeRecord()} payloadHash={HASH} durationMs={0} />);
    expect(screen.getByText(/Tamper-proof AuditRecord sealed/)).toBeInTheDocument();
  });

  it("shows Ed25519 note", () => {
    render(<AuditPanel record={makeRecord()} payloadHash={HASH} durationMs={0} />);
    expect(screen.getByText(/Ed25519/)).toBeInTheDocument();
  });
});
