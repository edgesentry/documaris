import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VoyageSelector } from "./VoyageSelector.js";
import { SCENARIOS, type Scenario } from "../lib/fixtures.js";

const LIVE_SCENARIOS: Scenario[] = [
  {
    ...SCENARIOS[0],
    mmsi: 477123456,
    behavioralScore: 15,
    aisGaps: 0,
    clarusUrl: "https://clarus-d5d.pages.dev",
  },
  {
    ...SCENARIOS[1],
    mmsi: 366123456,
    behavioralScore: 82,
    aisGaps: 14,
    clarusUrl: "https://clarus-d5d.pages.dev",
  },
  {
    ...SCENARIOS[2],
    mmsi: 235123456,
    behavioralScore: 41,
    aisGaps: 3,
    clarusUrl: "https://clarus-d5d.pages.dev",
  },
];

describe("VoyageSelector", () => {
  it("renders all three scenario cards", () => {
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.getByText("MV Horizon")).toBeInTheDocument();
    expect(screen.getByText("MV Pacific Star")).toBeInTheDocument();
    expect(screen.getByText("MV Venture")).toBeInTheDocument();
  });

  it("renders TC1, TC2, TC3 labels", () => {
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.getByText("TC1")).toBeInTheDocument();
    expect(screen.getByText("TC2")).toBeInTheDocument();
    expect(screen.getByText("TC3")).toBeInTheDocument();
  });

  it("renders documaris heading", () => {
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
  });

  it("calls onSelect with the correct scenario when a card is clicked", () => {
    const onSelect = vi.fn();
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("MV Horizon").closest("button")!);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(SCENARIOS[0]);
  });

  it("calls onSelect with TC2 scenario when Pacific Star is clicked", () => {
    const onSelect = vi.fn();
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("MV Pacific Star").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(SCENARIOS[1]);
  });

  it("renders 'Generate FAL Form 1' CTA on each card", () => {
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.getAllByText(/Generate FAL Form 1/)).toHaveLength(3);
  });

  it("shows loading message when loadingClarus is true", () => {
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={true} onSelect={vi.fn()} />);
    expect(screen.getByText(/Loading live vessel data from clarus/)).toBeInTheDocument();
  });

  it("does not show loading message when loadingClarus is false", () => {
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/Loading live vessel data/)).not.toBeInTheDocument();
  });
});

describe("VoyageSelector — clarus live data signals", () => {
  it("shows risk pill when behavioralScore is present", () => {
    render(<VoyageSelector scenarios={LIVE_SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.getAllByText(/Risk \d+\/100/)).toHaveLength(3);
  });

  it("shows 'live · clarus' badge for each scenario with a score", () => {
    render(<VoyageSelector scenarios={LIVE_SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.getAllByText("live · clarus")).toHaveLength(3);
  });

  it("does not show risk pills when behavioralScore is absent (static fixtures)", () => {
    render(<VoyageSelector scenarios={SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/Risk \d+\/100/)).not.toBeInTheDocument();
    expect(screen.queryByText("live · clarus")).not.toBeInTheDocument();
  });

  it("applies risk-high class for score > 60", () => {
    render(<VoyageSelector scenarios={LIVE_SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    const highPill = screen.getByText("Risk 82/100");
    expect(highPill.className).toContain("risk-high");
  });

  it("applies risk-mid class for score 31–60", () => {
    render(<VoyageSelector scenarios={LIVE_SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    const midPill = screen.getByText("Risk 41/100");
    expect(midPill.className).toContain("risk-mid");
  });

  it("applies risk-low class for score ≤ 30", () => {
    render(<VoyageSelector scenarios={LIVE_SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    const lowPill = screen.getByText("Risk 15/100");
    expect(lowPill.className).toContain("risk-low");
  });

  it("shows AIS gaps pill when aisGaps > 0", () => {
    render(<VoyageSelector scenarios={LIVE_SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.getByText("AIS gaps 14")).toBeInTheDocument();
    expect(screen.getByText("AIS gaps 3")).toBeInTheDocument();
  });

  it("does not show AIS gaps pill when aisGaps is 0", () => {
    render(<VoyageSelector scenarios={LIVE_SCENARIOS} loadingClarus={false} onSelect={vi.fn()} />);
    expect(screen.queryByText("AIS gaps 0")).not.toBeInTheDocument();
  });
});
