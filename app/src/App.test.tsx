import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App.js";
import { SCENARIOS, type Scenario } from "./lib/fixtures.js";
import type { PipelineResult } from "./lib/pipeline.js";

vi.mock("./lib/clarusData.js", () => ({
  loadClarusScenarios: vi.fn(),
  loadClarusScenarioByMmsi: vi.fn(),
  CLARUS_URL: "https://clarus-d5d.pages.dev",
}));

vi.mock("./lib/pipeline.js", () => ({
  initPipeline: vi.fn().mockResolvedValue(undefined),
  runPipeline: vi.fn(),
}));

import { loadClarusScenarios, loadClarusScenarioByMmsi } from "./lib/clarusData.js";
import { runPipeline } from "./lib/pipeline.js";

const LIVE_SCENARIOS: Scenario[] = [
  { ...SCENARIOS[0], mmsi: 477123456, behavioralScore: 15, aisGaps: 0, clarusUrl: "https://clarus-d5d.pages.dev" },
  { ...SCENARIOS[1], mmsi: 366123456, behavioralScore: 82, aisGaps: 14, clarusUrl: "https://clarus-d5d.pages.dev" },
  { ...SCENARIOS[2], mmsi: 235123456, behavioralScore: 41, aisGaps: 3, clarusUrl: "https://clarus-d5d.pages.dev" },
];

const MOCK_RESULT: PipelineResult = {
  filled: {
    voyage_id: "V001", template: "fal1",
    fields: { cargo_description: { value: "Bulk grain", confidence: 0.95, flagged: false, source: "direct" } },
    review_required: false,
  },
  alerts: [],
  html: "<table><tr><td>FAL Form 1</td></tr></table>",
  auditRecord: {
    device_id: "demo", sequence: 1, timestamp_ms: 0,
    payload_hash: [], signature: [], prev_record_hash: [],
  },
  payloadHash: "deadbeef",
  durationMs: 50,
};

const FORTUNE_STAR: Scenario = {
  ...SCENARIOS[1],
  mmsi: 563012345,
  behavioralScore: 72,
  aisGaps: 12,
  clarusUrl: "https://clarus-d5d.pages.dev",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadClarusScenarios).mockResolvedValue(LIVE_SCENARIOS);
  vi.mocked(loadClarusScenarioByMmsi).mockResolvedValue(null);
  vi.mocked(runPipeline).mockResolvedValue(MOCK_RESULT);
  window.history.replaceState({}, "", "/");
});

describe("App — no mmsi param", () => {
  it("shows the voyage selector after clarus loads", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
    });
    expect(screen.getByText("MV Horizon")).toBeInTheDocument();
  });

  it("shows loading indicator while clarus is fetching", () => {
    // Never resolves during this test — loading state persists
    vi.mocked(loadClarusScenarios).mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText(/Loading live vessel data from clarus/)).toBeInTheDocument();
  });

  it("falls back to static scenarios if clarus errors", async () => {
    vi.mocked(loadClarusScenarios).mockRejectedValue(new Error("network error"));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
    });
    // Static scenarios have no behavioralScore — no risk pills
    expect(screen.queryByText(/Risk \d+\/100/)).not.toBeInTheDocument();
  });
});

describe("App — ?mmsi= deep-link", () => {
  it("auto-runs pipeline when mmsi matches a live scenario", async () => {
    window.history.replaceState({}, "", "/?mmsi=477123456");
    render(<App />);
    await waitFor(() => {
      expect(vi.mocked(runPipeline)).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(runPipeline)).toHaveBeenCalledWith(LIVE_SCENARIOS[0].csv);
  });

  it("shows the result panel directly without showing the selector", async () => {
    window.history.replaceState({}, "", "/?mmsi=366123456");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("FAL Form 1 — General Declaration")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "documaris" })).not.toBeInTheDocument();
  });

  it("queries Parquet directly when mmsi is not in the top-3 selector scenarios", async () => {
    // MV Fortune Star (563012345) is not in LIVE_SCENARIOS — direct lookup fires
    vi.mocked(loadClarusScenarioByMmsi).mockResolvedValue(FORTUNE_STAR);
    window.history.replaceState({}, "", "/?mmsi=563012345");
    render(<App />);
    await waitFor(() => {
      expect(vi.mocked(loadClarusScenarioByMmsi)).toHaveBeenCalledWith("563012345");
    });
    await waitFor(() => {
      expect(vi.mocked(runPipeline)).toHaveBeenCalledWith(FORTUNE_STAR.csv);
    });
  });

  it("shows the selector when mmsi is not found in Parquet either", async () => {
    vi.mocked(loadClarusScenarioByMmsi).mockResolvedValue(null);
    window.history.replaceState({}, "", "/?mmsi=000000000");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
    });
    expect(vi.mocked(runPipeline)).not.toHaveBeenCalled();
  });
});

describe("App — result header clarus link", () => {
  it("links to clarus with ?mmsi= appended when scenario has mmsi", async () => {
    window.history.replaceState({}, "", "/?mmsi=477123456");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("View risk profile in clarus →")).toBeInTheDocument();
    });
    const link = screen.getByText("View risk profile in clarus →").closest("a")!;
    expect(link.getAttribute("href")).toBe("https://clarus-d5d.pages.dev?mmsi=477123456");
  });
});
