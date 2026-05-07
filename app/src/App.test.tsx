import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App.js";
import { SCENARIOS, BCA_SCENARIOS, type Scenario, type BcaScenario } from "./lib/fixtures.js";
import type { PipelineResult, BcaPipelineResult } from "./lib/pipeline.js";

vi.mock("./lib/clarusData.js", () => ({
  loadClarusScenarios: vi.fn(),
  loadClarusScenarioByMmsi: vi.fn(),
  CLARUS_URL: "https://clarus-d5d.pages.dev",
}));

vi.mock("./lib/bcaData.js", () => ({
  loadBcaScenarios: vi.fn(),
}));

vi.mock("./lib/pipeline.js", () => ({
  initPipeline: vi.fn().mockResolvedValue(undefined),
  runPipeline: vi.fn(),
  runBcaPipeline: vi.fn(),
}));

import { loadClarusScenarios, loadClarusScenarioByMmsi } from "./lib/clarusData.js";
import { loadBcaScenarios } from "./lib/bcaData.js";
import { runPipeline, runBcaPipeline } from "./lib/pipeline.js";

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

const LIVE_BCA_SCENARIOS: BcaScenario[] = [
  {
    ...BCA_SCENARIOS[0],
    complianceScore: 92,
    alertCount: 0,
    euiKwhM2: 108.5,
    chillerCop: 0.61,
    lpdWM2: 13.2,
  },
  {
    ...BCA_SCENARIOS[1],
    complianceScore: 55,
    alertCount: 1,
    euiKwhM2: 122.0,
    chillerCop: 0.63,
    lpdWM2: 14.1,
  },
];

const MOCK_BCA_RESULT: BcaPipelineResult = {
  filled: {
    voyage_id: "MCH-OUTLET-042",
    template: "sg-bca-greenmark",
    fields: {
      EUI_KWH_M2: { value: "108.5", confidence: 0.95, flagged: false, source: "direct" },
    },
    review_required: false,
  },
  alerts: [],
  html: "<table><tr><td>BCA Green Mark Section 4</td></tr></table>",
  auditRecord: {
    device_id: "documaris-demo", sequence: 1, timestamp_ms: 0,
    payload_hash: [], signature: [], prev_record_hash: [],
  },
  payloadHash: "abcd1234",
  durationMs: 45,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadClarusScenarios).mockResolvedValue(LIVE_SCENARIOS);
  vi.mocked(loadClarusScenarioByMmsi).mockResolvedValue(null);
  vi.mocked(loadBcaScenarios).mockResolvedValue(LIVE_BCA_SCENARIOS);
  vi.mocked(runPipeline).mockResolvedValue(MOCK_RESULT);
  vi.mocked(runBcaPipeline).mockResolvedValue(MOCK_BCA_RESULT);
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
      expect(screen.getByText("View port safety record in clarus →")).toBeInTheDocument();
    });
    const link = screen.getByText("View port safety record in clarus →").closest("a")!;
    expect(link.getAttribute("href")).toBe("https://clarus-d5d.pages.dev?mmsi=477123456");
  });
});

describe("App — PDF export", () => {
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
  });

  it("renders the Download PDF button on the result panel", async () => {
    window.history.replaceState({}, "", "/?mmsi=477123456");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Download PDF/)).toBeInTheDocument();
    });
  });

  it("calls window.print() when Download PDF is clicked", async () => {
    window.history.replaceState({}, "", "/?mmsi=477123456");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Download PDF/)).toBeInTheDocument();
    });
    screen.getByText(/Download PDF/).click();
    expect(printSpy).toHaveBeenCalledOnce();
  });

  it("does not show Download PDF button on the selector screen", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Download PDF/)).not.toBeInTheDocument();
  });
});

// ── BCA mode — tab switching ──────────────────────────────────────────────────

describe("App — BCA mode tab", () => {
  it("switches to BCA mode when the tab is clicked", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => {
      expect(screen.getByText(/BCA Green Mark — Section 4 Energy Efficiency/)).toBeInTheDocument();
    });
  });

  it("returns to maritime mode when Maritime tab is clicked", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => expect(screen.getByText(/BCA Green Mark — Section 4 Energy Efficiency/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Maritime — FAL Form 1"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
    });
  });
});

// ── BCA mode — live data loading ─────────────────────────────────────────────

describe("App — BCA live data from R2", () => {
  async function switchToBca() {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => expect(screen.getByText(/BCA Green Mark — Section 4 Energy Efficiency/)).toBeInTheDocument());
  }

  it("calls loadBcaScenarios on mount", async () => {
    render(<App />);
    await waitFor(() => expect(vi.mocked(loadBcaScenarios)).toHaveBeenCalledOnce());
  });

  it("shows live outlet data from R2 in BCA selector", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText("Acme Facilities — Tampines Hub")).toBeInTheDocument();
    });
  });

  it("shows compliance score on live outlet cards", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText(/Score 92\/100/)).toBeInTheDocument();
    });
  });

  it("shows EUI/COP/LPD metrics on live outlet cards", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText(/EUI 108.5 kWh\/m²/)).toBeInTheDocument();
    });
  });

  it("falls back to static BCA_SCENARIOS if R2 errors", async () => {
    vi.mocked(loadBcaScenarios).mockRejectedValue(new Error("R2 unavailable"));
    await switchToBca();
    await waitFor(() => {
      // Static BC1 scenario is shown
      expect(screen.getByText("Acme Facilities — Tampines Hub")).toBeInTheDocument();
    });
    // No live score shown (static scenario has no complianceScore)
    expect(screen.queryByText(/Score \d+\/100/)).not.toBeInTheDocument();
  });
});

// ── BCA mode — document generation ───────────────────────────────────────────

describe("App — BCA document generation", () => {
  async function generateBcaDoc() {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => expect(screen.getByText(/BCA Green Mark — Section 4 Energy Efficiency/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Acme Facilities — Tampines Hub")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Acme Facilities — Tampines Hub"));
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
  }

  it("calls runBcaPipeline with the selected outlet CSV", async () => {
    await generateBcaDoc();
    expect(vi.mocked(runBcaPipeline)).toHaveBeenCalledOnce();
    expect(vi.mocked(runBcaPipeline)).toHaveBeenCalledWith(LIVE_BCA_SCENARIOS[0].csv);
  });

  it("shows the BCA Section 4 document heading in result", async () => {
    await generateBcaDoc();
    await waitFor(() => {
      const headings = screen.getAllByText("BCA Green Mark — Section 4");
      // At least 2: the tab button + the result section h2
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows Download PDF button on BCA result panel", async () => {
    await generateBcaDoc();
    await waitFor(() => {
      expect(screen.getByText(/Download PDF/)).toBeInTheDocument();
    });
  });

  it("shows outlet ID in the result header", async () => {
    await generateBcaDoc();
    await waitFor(() => {
      expect(screen.getByText("MCH-OUTLET-042")).toBeInTheDocument();
    });
  });
});
