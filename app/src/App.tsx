import { useState, useCallback, useEffect } from "react";
import { VoyageSelector } from "./components/VoyageSelector.js";
import { AlertList } from "./components/AlertList.js";
import { AuditPanel } from "./components/AuditPanel.js";
import { FieldAnalysis } from "./components/FieldAnalysis.js";
import { runPipeline, runBcaPipeline, type PipelineResult, type BcaPipelineResult } from "./lib/pipeline.js";
import { SCENARIOS, BCA_SCENARIOS, type Scenario, type BcaScenario } from "./lib/fixtures.js";
import { loadClarusScenarios, loadClarusScenarioByMmsi } from "./lib/clarusData.js";

type Phase =
  | { tag: "select"; scenarios: Scenario[]; loadingClarus: boolean }
  | { tag: "generating"; scenario: Scenario; scenarios: Scenario[] }
  | { tag: "result"; scenario: Scenario; scenarios: Scenario[]; result: PipelineResult }
  | { tag: "error"; message: string; scenarios: Scenario[] };

type BcaPhase =
  | { tag: "select" }
  | { tag: "generating"; scenario: BcaScenario }
  | { tag: "result"; scenario: BcaScenario; result: BcaPipelineResult }
  | { tag: "error"; message: string };

export default function App() {
  const [mode, setMode] = useState<"maritime" | "bca">("maritime");
  const [phase, setPhase] = useState<Phase>({
    tag: "select",
    scenarios: SCENARIOS,
    loadingClarus: true,
  });
  const [bcaPhase, setBcaPhase] = useState<BcaPhase>({ tag: "select" });

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

    // Load the 3 selector scenarios in parallel with the MMSI lookup (if any).
    // If a specific MMSI is requested, query the Parquet for that vessel directly
    // rather than relying on it being in the pre-selected top-3.
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

  const handleBcaSelect = useCallback(async (scenario: BcaScenario) => {
    setBcaPhase({ tag: "generating", scenario });
    try {
      const result = await runBcaPipeline(scenario.csv);
      setBcaPhase({ tag: "result", scenario, result });
    } catch (e) {
      setBcaPhase({ tag: "error", message: String(e) });
    }
  }, []);

  const modeTabs = (
    <div className="mode-tabs">
      <button
        className={mode === "maritime" ? "active" : ""}
        onClick={() => setMode("maritime")}
      >
        Maritime — FAL Form 1
      </button>
      <button
        className={mode === "bca" ? "active" : ""}
        onClick={() => setMode("bca")}
      >
        BCA Green Mark — Section 4
      </button>
    </div>
  );

  // ── BCA mode ────────────────────────────────────────────────────────────────

  if (mode === "bca") {
    if (bcaPhase.tag === "select") {
      return (
        <div className="selector">
          {modeTabs}
          <div className="selector-header">
            <h1>documaris</h1>
            <p className="subtitle">BCA Green Mark — Section 4 Energy Efficiency</p>
          </div>
          <div className="cards">
            {BCA_SCENARIOS.map((s) => (
              <button key={s.id} className="card" onClick={() => handleBcaSelect(s)}>
                <div className="card-top">
                  <span className="scenario-id">{s.id}</span>
                  <span className={`badge ${s.expectedAlerts === 0 ? "badge-ok" : "badge-warn"}`}>
                    {s.expectedAlerts === 0 ? "0 alerts" : `${s.expectedAlerts} alert${s.expectedAlerts > 1 ? "s" : ""}`}
                  </span>
                </div>
                <div className="vessel-name">{s.buildingName}</div>
                <div className="vessel-imo">{s.outletId}</div>
                <p className="card-desc">{s.description}</p>
                <div className="card-cta">Generate BCA Green Mark Section 4 →</div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (bcaPhase.tag === "generating") {
      return (
        <div className="loading">
          {modeTabs}
          <div className="spinner" />
          <p>Generating BCA Green Mark Section 4 for <strong>{bcaPhase.scenario.buildingName}</strong>…</p>
          <p className="loading-sub">Parsing → filling fields → compliance check → sealing AuditRecord</p>
        </div>
      );
    }

    if (bcaPhase.tag === "error") {
      return (
        <div className="error-screen">
          {modeTabs}
          <h2>Pipeline error</h2>
          <pre>{bcaPhase.message}</pre>
          <button onClick={() => setBcaPhase({ tag: "select" })}>
            ← Back
          </button>
        </div>
      );
    }

    const { scenario: bcaScenario, result: bcaResult } = bcaPhase;

    return (
      <div className="result">
        {modeTabs}
        <header className="result-header">
          <button
            className="back-btn"
            onClick={() => setBcaPhase({ tag: "select" })}
          >
            ← Back
          </button>
          <div className="result-title">
            <span className="scenario-chip">{bcaScenario.id}</span>
            <span>{bcaScenario.buildingName}</span>
            <span className="imo">{bcaScenario.outletId}</span>
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
