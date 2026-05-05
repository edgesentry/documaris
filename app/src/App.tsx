import { useState, useCallback, useEffect } from "react";
import { VoyageSelector } from "./components/VoyageSelector.js";
import { AlertList } from "./components/AlertList.js";
import { AuditPanel } from "./components/AuditPanel.js";
import { FieldAnalysis } from "./components/FieldAnalysis.js";
import { runPipeline, type PipelineResult } from "./lib/pipeline.js";
import { SCENARIOS, type Scenario } from "./lib/fixtures.js";
import { loadClarusScenarios, loadClarusScenarioByMmsi } from "./lib/clarusData.js";

type Phase =
  | { tag: "select"; scenarios: Scenario[]; loadingClarus: boolean }
  | { tag: "generating"; scenario: Scenario; scenarios: Scenario[] }
  | { tag: "result"; scenario: Scenario; scenarios: Scenario[]; result: PipelineResult }
  | { tag: "error"; message: string; scenarios: Scenario[] };

export default function App() {
  const [phase, setPhase] = useState<Phase>({
    tag: "select",
    scenarios: SCENARIOS,
    loadingClarus: true,
  });

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

  if (phase.tag === "select") {
    return (
      <VoyageSelector
        scenarios={phase.scenarios}
        loadingClarus={phase.loadingClarus}
        onSelect={(s) => handleSelect(s, phase.scenarios)}
      />
    );
  }

  if (phase.tag === "generating") {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Generating FAL Form 1 for <strong>{phase.scenario.vesselName}</strong>…</p>
        <p className="loading-sub">Parsing → filling fields → compliance check → sealing AuditRecord</p>
      </div>
    );
  }

  if (phase.tag === "error") {
    return (
      <div className="error-screen">
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
            <span className="risk-score" title="clarus behavioural risk score">
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
            View risk profile in clarus →
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
