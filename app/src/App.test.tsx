import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App.js";
import { SCENARIOS, type Scenario } from "./lib/fixtures.js";
import type { PipelineResult, BcaPipelineResult } from "./lib/pipeline.js";
import type { OperatorSummary, SiteSummary } from "./lib/bcaData.js";

vi.mock("./lib/clarusData.js", () => ({
  loadClarusScenarios: vi.fn(),
  loadClarusScenarioByMmsi: vi.fn(),
  CLARUS_URL: "https://clarus-d5d.pages.dev",
}));

vi.mock("./lib/bcaData.js", () => ({
  loadPortfolio: vi.fn(),
  loadOperatorSites: vi.fn(),
  loadBcaScenarios: vi.fn(),
  siteSummaryToBcaScenario: vi.fn(),
}));

vi.mock("./lib/pipeline.js", () => ({
  initPipeline: vi.fn().mockResolvedValue(undefined),
  runPipeline: vi.fn(),
  runBcaPipeline: vi.fn(),
}));

import { loadClarusScenarios, loadClarusScenarioByMmsi } from "./lib/clarusData.js";
import { loadPortfolio, loadOperatorSites, siteSummaryToBcaScenario } from "./lib/bcaData.js";
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

// ── BCA mock data ─────────────────────────────────────────────────────────────

const MOCK_PORTFOLIO: OperatorSummary[] = [
  {
    operator_id: "ACM",
    operator_name: "Acme Facilities",
    site_count: 20,
    compliant_count: 12,
    needs_action_count: 8,
    avg_eui: 112.3,
    avg_compliance_score: 74,
  },
  {
    operator_id: "BPG",
    operator_name: "Beta Property Group",
    site_count: 15,
    compliant_count: 9,
    needs_action_count: 6,
    avg_eui: 118.5,
    avg_compliance_score: 68,
  },
];

const MOCK_SITES: SiteSummary[] = [
  {
    outlet_id: "ACM-001",
    building_name: "Acme Facilities — Tampines Hub",
    building_type: "Retail / Community",
    operator_id: "ACM",
    operator_name: "Acme Facilities",
    eui_kwh_m2: 108.5,
    chiller_cop: 0.61,
    lpd_w_m2: 13.2,
    water_l_m2: 380.0,
    green_mark_target: "Platinum",
    compliance_score: 92,
    alert_count: 0,
    period_start: "2025-01-01",
    period_end: "2025-12-31",
    gross_floor_area_m2: 3200,
    certifying_body: "BCA",
  },
  {
    outlet_id: "ACM-002",
    building_name: "Acme Facilities — Woodlands Civic Centre",
    building_type: "Retail / Community",
    operator_id: "ACM",
    operator_name: "Acme Facilities",
    eui_kwh_m2: 122.0,
    chiller_cop: 0.68,
    lpd_w_m2: 16.5,
    water_l_m2: 420.0,
    green_mark_target: "Gold+",
    compliance_score: 55,
    alert_count: 2,
    period_start: "2025-01-01",
    period_end: "2025-12-31",
    gross_floor_area_m2: 2800,
    certifying_body: "BCA",
  },
];

const MOCK_BCA_SCENARIO = {
  id: "BC1" as const,
  label: "Platinum",
  buildingName: "Acme Facilities — Tampines Hub",
  outletId: "ACM-001",
  description: "All Section 4 metrics within Platinum targets. Score: 92/100.",
  expectReviewRequired: false,
  expectedAlerts: 0,
  csv: "outlet_id,building_name,building_type,period_start,period_end,gross_floor_area_m2,eui_kwh_m2,chiller_cop,lpd_w_m2,water_l_m2,green_mark_target,certifying_body\nACM-001,Acme Facilities — Tampines Hub,Retail / Community,2025-01-01,2025-12-31,3200,108.5,0.61,13.2,380,Platinum,BCA",
  complianceScore: 92,
  alertCount: 0,
  euiKwhM2: 108.5,
  chillerCop: 0.61,
  lpdWM2: 13.2,
};

const MOCK_BCA_RESULT: BcaPipelineResult = {
  filled: {
    voyage_id: "ACM-001",
    template: "sg-bca-greenmark",
    fields: {
      EUI_KWH_M2: { value: "108.5", confidence: 0.95, flagged: false, source: "direct" },
    },
    review_required: false,
  },
  alerts: [],
  html: "<table><tr><td>BCA Green Mark Section 4</td></tr></table>",
  htmlWithAttestation: "<table><tr><td>BCA Green Mark Section 4</td></tr></table>",
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
  vi.mocked(loadPortfolio).mockResolvedValue(MOCK_PORTFOLIO);
  vi.mocked(loadOperatorSites).mockResolvedValue(MOCK_SITES);
  vi.mocked(siteSummaryToBcaScenario).mockReturnValue(MOCK_BCA_SCENARIO);
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
      expect(screen.getByText(/BCA Green Mark Portfolio/)).toBeInTheDocument();
    });
  });

  it("returns to maritime mode when Maritime tab is clicked", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => expect(screen.getByText(/BCA Green Mark Portfolio/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Maritime — FAL Form 1"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
    });
  });
});

// ── BCA mode — portfolio view ─────────────────────────────────────────────────

describe("App — BCA portfolio view", () => {
  async function switchToBca() {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => expect(screen.getByText(/BCA Green Mark Portfolio/)).toBeInTheDocument());
  }

  it("shows portfolio view when BCA tab is clicked", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText("Acme Facilities")).toBeInTheDocument();
    });
    expect(screen.getByText("Beta Property Group")).toBeInTheDocument();
  });

  it("calls loadPortfolio on mount", async () => {
    render(<App />);
    await waitFor(() => expect(vi.mocked(loadPortfolio)).toHaveBeenCalledOnce());
  });

  it("shows site count and metrics for each operator", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText("20 sites")).toBeInTheDocument();
    });
    expect(screen.getByText("15 sites")).toBeInTheDocument();
  });

  it("shows compliant count for operators", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText(/12 compliant/)).toBeInTheDocument();
    });
  });

  it("shows needs_action count when > 0", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText(/8 needs action/)).toBeInTheDocument();
    });
  });

  it("shows avg EUI and score", async () => {
    await switchToBca();
    await waitFor(() => {
      expect(screen.getByText(/Avg EUI: 112.3 kWh\/m²/)).toBeInTheDocument();
    });
  });
});

// ── BCA mode — operator view ──────────────────────────────────────────────────

describe("App — BCA operator view", () => {
  async function navigateToOperator() {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => expect(screen.getByText("Acme Facilities")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Acme Facilities"));
    await waitFor(() => expect(vi.mocked(loadOperatorSites)).toHaveBeenCalledWith("ACM"));
  }

  it("shows operator sites when an operator is selected", async () => {
    await navigateToOperator();
    await waitFor(() => {
      expect(screen.getByText("Acme Facilities — Tampines Hub")).toBeInTheDocument();
    });
    expect(screen.getByText("Acme Facilities — Woodlands Civic Centre")).toBeInTheDocument();
  });

  it("shows search bar in operator view", async () => {
    await navigateToOperator();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search sites…")).toBeInTheDocument();
    });
  });

  it("shows back button in operator view", async () => {
    await navigateToOperator();
    await waitFor(() => {
      expect(screen.getByText("← Portfolio")).toBeInTheDocument();
    });
  });

  it("shows filter pills in operator view", async () => {
    await navigateToOperator();
    await waitFor(() => {
      // "Platinum" appears as both a filter pill button and a site card badge span
      const platinumEls = screen.getAllByText("Platinum");
      expect(platinumEls.length).toBeGreaterThanOrEqual(1);
      // Verify at least one is the pill button
      expect(platinumEls.some((el) => el.tagName === "BUTTON")).toBe(true);
    });
    // Gold+ appears only in the filter pills (second site has Gold+ target)
    expect(screen.getAllByText("Gold+").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Gold").length).toBeGreaterThanOrEqual(1);
  });

  it("shows compliance scores on site cards", async () => {
    await navigateToOperator();
    await waitFor(() => {
      expect(screen.getByText(/Score 92\/100/)).toBeInTheDocument();
    });
  });
});

// ── BCA mode — document generation ───────────────────────────────────────────

describe("App — BCA document generation", () => {
  async function generateBcaDoc() {
    render(<App />);
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BCA Green Mark — Section 4"));
    await waitFor(() => expect(screen.getByText("Acme Facilities")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Acme Facilities"));
    await waitFor(() => expect(screen.getByText("Acme Facilities — Tampines Hub")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Acme Facilities — Tampines Hub"));
    await waitFor(() => expect(screen.getByText("BCA Green Mark — Section 4")).toBeInTheDocument());
  }

  it("calls runBcaPipeline with the selected site's CSV", async () => {
    await generateBcaDoc();
    expect(vi.mocked(runBcaPipeline)).toHaveBeenCalledOnce();
    expect(vi.mocked(runBcaPipeline)).toHaveBeenCalledWith(MOCK_BCA_SCENARIO.csv, expect.any(String));
  });

  it("shows the BCA Section 4 document heading in result", async () => {
    await generateBcaDoc();
    await waitFor(() => {
      const headings = screen.getAllByText("BCA Green Mark — Section 4");
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
      expect(screen.getByText("ACM-001")).toBeInTheDocument();
    });
  });
});
