import { useState, useCallback, useEffect } from "react";
import { VoyageSelector } from "./components/VoyageSelector.js";
import { AlertList } from "./components/AlertList.js";
import { AuditPanel } from "./components/AuditPanel.js";
import { FieldAnalysis } from "./components/FieldAnalysis.js";
import { PortfolioView } from "./components/PortfolioView.js";
import { OperatorView } from "./components/OperatorView.js";
import { AttestationView } from "./components/AttestationView.js";
import { runPipeline, runBcaPipeline, type PipelineResult, type BcaPipelineResult } from "./lib/pipeline.js";
import { SCENARIOS, type Scenario } from "./lib/fixtures.js";
import { loadClarusScenarios, loadClarusScenarioByMmsi } from "./lib/clarusData.js";
import {
  loadPortfolio,
  loadOperatorSites,
  siteSummaryToBcaScenario,
  type OperatorSummary,
  type SiteSummary,
} from "./lib/bcaData.js";
import type { BcaScenario } from "./lib/fixtures.js";

type Phase =
  | { tag: "select"; scenarios: Scenario[]; loadingClarus: boolean }
  | { tag: "generating"; scenario: Scenario; scenarios: Scenario[] }
  | { tag: "result"; scenario: Scenario; scenarios: Scenario[]; result: PipelineResult }
  | { tag: "error"; message: string; scenarios: Scenario[] };

type BcaPhase =
  | { tag: "portfolio"; operators: OperatorSummary[]; loading: boolean }
  | { tag: "operator"; operator: OperatorSummary; sites: SiteSummary[]; loading: boolean }
  | { tag: "generating"; site: SiteSummary }
  | { tag: "result"; site: SiteSummary; result: BcaPipelineResult }
  | { tag: "error"; message: string; back: "portfolio" | "operator"; operator?: OperatorSummary };

function modeFromUrl(): "maritime" | "bca" {
  return new URLSearchParams(location.search).get("mode") === "bca" ? "bca" : "maritime";
}

export default function App() {
  const [mode, setMode] = useState<"maritime" | "bca">(modeFromUrl);
  const [phase, setPhase] = useState<Phase>({
    tag: "select",
    scenarios: SCENARIOS,
    loadingClarus: true,
  });
  const [bcaPhase, setBcaPhase] = useState<BcaPhase>({ tag: "portfolio", operators: [], loading: true });

  const switchMode = (next: "maritime" | "bca") => {
    setMode(next);
    const url = new URL(location.href);
    if (next === "maritime") url.searchParams.delete("mode");
    else url.searchParams.set("mode", next);
    history.replaceState(null, "", url.toString());
  };

  // Load portfolio on mount (and whenever BCA tab is first activated)
  useEffect(() => {
    loadPortfolio()
      .then((operators) => {
        setBcaPhase({ tag: "portfolio", operators, loading: false });
      })
      .catch(() => {
        setBcaPhase({ tag: "portfolio", operators: [], loading: false });
      });
  }, []);

  // Load live vessel data from clarus; auto-select if ?mmsi= param is present.
  useEffect(() => {
    const paramMmsi = new URLSearchParams(location.search).get("mmsi");

    async function autoSelect(scenario: Scenario, scenarios: Scenario[]) {
      setPhase({ tag: "generating", scenario, scenarios });
      try {
        const result = await runPipeline(scenario.csv);
        setPhase({ tag: "result", scenario, scenarios, result });
      } catch (e) {
        setPhase({ tag: "error", message: String(e), scenarios });
      }
    }

    const scenariosPromise = loadClarusScenarios();
    const mmsiPromise = paramMmsi ? loadClarusScenarioByMmsi(paramMmsi) : Promise.resolve(null);

    Promise.all([scenariosPromise, mmsiPromise])
      .then(([live, byMmsi]) => {
        const target = byMmsi ?? (paramMmsi ? live.find((s) => String(s.mmsi) === paramMmsi) : null);
        if (target) {
          autoSelect(target, live);
        } else {
          setPhase((p) => p.tag === "select" ? { ...p, scenarios: live, loadingClarus: false } : p);
        }
      })
      .catch(() => {
        setPhase((p) => p.tag === "select" ? { ...p, loadingClarus: false } : p);
      });
  }, []);

  const handleSelect = useCallback(async (scenario: Scenario, scenarios: Scenario[]) => {
    setPhase((p) => ({ tag: "generating", scenario, scenarios: "scenarios" in p ? p.scenarios : scenarios }));
    try {
      const result = await runPipeline(scenario.csv);
      setPhase((p) => ({ tag: "result", scenario, scenarios: "scenarios" in p ? p.scenarios : scenarios, result }));
    } catch (e) {
      setPhase((p) => ({ tag: "error", message: String(e), scenarios: "scenarios" in p ? p.scenarios : scenarios }));
    }
  }, []);

  const handleOperatorSelect = useCallback(async (operator: OperatorSummary) => {
    setBcaPhase({ tag: "operator", operator, sites: [], loading: true });
    try {
      const sites = await loadOperatorSites(operator.operator_id);
      setBcaPhase({ tag: "operator", operator, sites, loading: false });
    } catch (e) {
      setBcaPhase({ tag: "error", message: String(e), back: "portfolio" });
    }
  }, []);

  const handleSiteSelect = useCallback(async (site: SiteSummary, operator: OperatorSummary) => {
    setBcaPhase({ tag: "generating", site });
    try {
      const scenario: BcaScenario = siteSummaryToBcaScenario(site);
      const result = await runBcaPipeline(scenario.csv, site.outlet_id);
      setBcaPhase({ tag: "result", site, result });
    } catch (e) {
      setBcaPhase({ tag: "error", message: String(e), back: "operator", operator });
    }
  }, []);

  const modeTabs = (
    <div className="mode-tabs">
      <button
        className={mode === "maritime" ? "active" : ""}
        onClick={() => switchMode("maritime")}
      >
        Maritime — FAL Form 1
      </button>
      <button
        className={mode === "bca" ? "active" : ""}
        onClick={() => switchMode("bca")}
      >
        BCA Green Mark — Section 4
      </button>
    </div>
  );

  // ── BCA mode ────────────────────────────────────────────────────────────────

  if (mode === "bca") {
    if (bcaPhase.tag === "portfolio") {
      // When operators haven't loaded from R2 yet (local dev / direct ?mode=bca link),
      // show AttestationView standalone so ZKP demo is immediately accessible.
      if (!bcaPhase.loading && bcaPhase.operators.length === 0) {
        return (
          <div>
            {modeTabs}
            <AttestationView operators={[]} />
          </div>
        );
      }
      return (
        <div>
          {modeTabs}
          <PortfolioView
            operators={bcaPhase.operators}
            loading={bcaPhase.loading}
            onSelect={handleOperatorSelect}
          />
        </div>
      );
    }

    if (bcaPhase.tag === "operator") {
      return (
        <div>
          {modeTabs}
          <OperatorView
            operator={bcaPhase.operator}
            sites={bcaPhase.sites}
            loading={bcaPhase.loading}
            onSelectSite={(site) => handleSiteSelect(site, bcaPhase.operator)}
            onBack={() => loadPortfolio()
              .then((operators) => setBcaPhase({ tag: "portfolio", operators, loading: false }))
              .catch(() => setBcaPhase({ tag: "portfolio", operators: [], loading: false }))
            }
          />
          <AttestationView operators={[bcaPhase.operator]} />
        </div>
      );
    }

    if (bcaPhase.tag === "generating") {
      return (
        <div className="loading">
          {modeTabs}
          <div className="spinner" />
          <p>Generating BCA Green Mark Section 4 for <strong>{bcaPhase.site.building_name}</strong>…</p>
          <p className="loading-sub">Parsing → filling fields → compliance check → sealing AuditRecord</p>
        </div>
      );
    }

    if (bcaPhase.tag === "error") {
      const goBack = () => {
        if (bcaPhase.back === "operator" && bcaPhase.operator) {
          loadOperatorSites(bcaPhase.operator.operator_id)
            .then((sites) => setBcaPhase({ tag: "operator", operator: bcaPhase.operator!, sites, loading: false }))
            .catch(() => setBcaPhase({ tag: "operator", operator: bcaPhase.operator!, sites: [], loading: false }));
        } else {
          loadPortfolio()
            .then((operators) => setBcaPhase({ tag: "portfolio", operators, loading: false }))
            .catch(() => setBcaPhase({ tag: "portfolio", operators: [], loading: false }));
        }
      };

      return (
        <div className="error-screen">
          {modeTabs}
          <h2>Pipeline error</h2>
          <pre>{bcaPhase.message}</pre>
          <button onClick={goBack}>
            ← Back
          </button>
        </div>
      );
    }

    // bcaPhase.tag === "result"
    const { site: bcaSite, result: bcaResult } = bcaPhase;

    return (
      <div className="result">
        {modeTabs}
        <header className="result-header">
          <button
            className="back-btn"
            onClick={() =>
              loadPortfolio()
                .then((operators) => setBcaPhase({ tag: "portfolio", operators, loading: false }))
                .catch(() => setBcaPhase({ tag: "portfolio", operators: [], loading: false }))
            }
          >
            ← Portfolio
          </button>
          <div className="result-title">
            <span className="scenario-chip">{bcaSite.outlet_id}</span>
            <span>{bcaSite.building_name}</span>
            <span className="imo">{bcaSite.operator_name}</span>
          </div>
          <button className="pdf-btn" onClick={() => window.print()}>
            ⬇ Download PDF
          </button>
          {bcaResult.filled.review_required && (
            <div className="review-banner">
              ⚠ review_required — one or more fields need human confirmation before submission
            </div>
          )}
        </header>

        <div className="result-body">
          <div className="result-left">
            <section className="section">
              <h2>Compliance alerts</h2>
              <AlertList alerts={bcaResult.alerts} />
            </section>

            <section className="section">
              <h2>Audit record</h2>
              <AuditPanel
                record={bcaResult.auditRecord}
                payloadHash={bcaResult.payloadHash}
                durationMs={bcaResult.durationMs}
              />
            </section>
          </div>

          <div className="result-right">
            <section className="section">
              <h2>AI field analysis</h2>
              <FieldAnalysis filled={bcaResult.filled} />
            </section>

            <section className="section fal-section" style={{ marginTop: 24 }}>
              <h2>BCA Green Mark — Section 4</h2>
              <div
                className="fal-form"
                dangerouslySetInnerHTML={{ __html: bcaResult.html }}
              />
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ── Maritime mode ───────────────────────────────────────────────────────────

  if (phase.tag === "select") {
    return (
      <div>
        {modeTabs}
        <VoyageSelector
          scenarios={phase.scenarios}
          loadingClarus={phase.loadingClarus}
          onSelect={(s) => handleSelect(s, phase.scenarios)}
        />
      </div>
    );
  }

  if (phase.tag === "generating") {
    return (
      <div className="loading">
        {modeTabs}
        <div className="spinner" />
        <p>Generating FAL Form 1 for <strong>{phase.scenario.vesselName}</strong>…</p>
        <p className="loading-sub">Parsing → filling fields → compliance check → sealing AuditRecord</p>
      </div>
    );
  }

  if (phase.tag === "error") {
    return (
      <div className="error-screen">
        {modeTabs}
        <h2>Pipeline error</h2>
        <pre>{phase.message}</pre>
        <button onClick={() => setPhase({ tag: "select", scenarios: phase.scenarios, loadingClarus: false })}>
          ← Back
        </button>
      </div>
    );
  }

  const { scenario, result } = phase;

  return (
    <div className="result">
      {modeTabs}
      <header className="result-header">
        <button
          className="back-btn"
          onClick={() => setPhase({ tag: "select", scenarios: phase.scenarios, loadingClarus: false })}
        >
          ← Back
        </button>
        <div className="result-title">
          <span className="scenario-chip">{scenario.id}</span>
          <span>{scenario.vesselName}</span>
          <span className="imo">{scenario.vesselImo}</span>
          {scenario.behavioralScore !== undefined && (
            <span className="risk-score" title="clarus port safety score">
              Risk {Math.round(scenario.behavioralScore)}/100
            </span>
          )}
        </div>
        {scenario.clarusUrl && (
          <a
            className="clarus-link"
            href={scenario.mmsi ? `${scenario.clarusUrl}?mmsi=${scenario.mmsi}` : scenario.clarusUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View port safety record in clarus →
          </a>
        )}
        <button className="pdf-btn" onClick={() => window.print()}>
          ⬇ Download PDF
        </button>
        {result.filled.review_required && (
          <div className="review-banner">
            ⚠ review_required — one or more fields need human confirmation before submission
          </div>
        )}
      </header>

      <div className="result-body">
        <div className="result-left">
          <section className="section">
            <h2>Compliance alerts</h2>
            <AlertList alerts={result.alerts} />
          </section>

          <section className="section">
            <h2>Audit record</h2>
            <AuditPanel
              record={result.auditRecord}
              payloadHash={result.payloadHash}
              durationMs={result.durationMs}
            />
          </section>
        </div>

        <div className="result-right">
          <section className="section">
            <h2>AI field analysis</h2>
            <FieldAnalysis filled={result.filled} />
          </section>

          <section className="section fal-section" style={{ marginTop: 24 }}>
            <h2>FAL Form 1 — General Declaration</h2>
            <div
              className="fal-form"
              dangerouslySetInnerHTML={{ __html: result.html }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
