import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertList } from "./AlertList.js";
import type { ComplianceAlert } from "../lib/pipeline.js";

const makeAlert = (overrides: Partial<ComplianceAlert> = {}): ComplianceAlert => ({
  rule_id: "BWM_D2_EXPIRED",
  severity: "HIGH",
  field: "bwm_certificate_expiry",
  message: "Rule 'BWM_D2_EXPIRED' failed check 'not_expired' on field 'bwm_certificate_expiry'",
  regulation: "BWM Convention Regulation D-2; MPA Port Circular No. 19 of 2023",
  voyage_id: "V002",
  ...overrides,
});

describe("AlertList — empty", () => {
  it("shows 0 alerts message when list is empty", () => {
    render(<AlertList alerts={[]} />);
    expect(screen.getByText(/0 compliance alerts/)).toBeInTheDocument();
    expect(screen.getByText(/cleared for submission/)).toBeInTheDocument();
  });

  it("does not render any alert-item when empty", () => {
    const { container } = render(<AlertList alerts={[]} />);
    expect(container.querySelectorAll(".alert-item")).toHaveLength(0);
  });
});

describe("AlertList — with alerts", () => {
  it("renders one row per alert", () => {
    const alerts = [makeAlert(), makeAlert({ rule_id: "CREW_COUNT_PRESENT", severity: "HIGH" })];
    const { container } = render(<AlertList alerts={alerts} />);
    expect(container.querySelectorAll(".alert-item")).toHaveLength(2);
  });

  it("displays rule_id", () => {
    render(<AlertList alerts={[makeAlert()]} />);
    expect(screen.getByText("BWM_D2_EXPIRED")).toBeInTheDocument();
  });

  it("displays severity", () => {
    render(<AlertList alerts={[makeAlert()]} />);
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("displays regulation citation", () => {
    render(<AlertList alerts={[makeAlert()]} />);
    expect(screen.getByText(/MPA Port Circular/)).toBeInTheDocument();
  });

  it("applies alert-high class for HIGH severity", () => {
    const { container } = render(<AlertList alerts={[makeAlert({ severity: "HIGH" })]} />);
    expect(container.querySelector(".alert-high")).toBeInTheDocument();
  });

  it("applies alert-medium class for MEDIUM severity", () => {
    const { container } = render(<AlertList alerts={[makeAlert({ severity: "MEDIUM" })]} />);
    expect(container.querySelector(".alert-medium")).toBeInTheDocument();
  });
});
