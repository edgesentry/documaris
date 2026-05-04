import { useState, useCallback } from "react";
import { VoyageSelector } from "./components/VoyageSelector.js";
import { AlertList } from "./components/AlertList.js";
import { AuditPanel } from "./components/AuditPanel.js";
import { runPipeline, type PipelineResult } from "./lib/pipeline.js";
import type { Scenario } from "./lib/fixtures.js";

type Phase =
  | { tag: "select" }
  | { tag: "generating"; scenario: Scenario }
  | { tag: "result"; scenario: Scenario; result: PipelineResult }
  | { tag: "error"; message: string };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ tag: "select" });

  const handleSelect = useCallback(async (scenario: Scenario) => {
    setPhase({ tag: "generating", scenario });
    try {
      const result = await runPipeline(scenario.csv);
      setPhase({ tag: "result", scenario, result });
    } catch (e) {
      setPhase({ tag: "error", message: String(e) });
    }
  }, []);

  if (phase.tag === "select") {
    return <VoyageSelector onSelect={handleSelect} />;
  }

  if (phase.tag === "generating") {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>
          Running edgesentry pipeline for <strong>{phase.scenario.vesselName}</strong>…
        </p>
        <p className="loading-sub">Parsing CSV → filling fields → checking compliance → sealing AuditRecord</p>
      </div>
    );
  }

  if (phase.tag === "error") {
    return (
      <div className="error-screen">
        <h2>Pipeline error</h2>
        <pre>{phase.message}</pre>
        <button onClick={() => setPhase({ tag: "select" })}>← Back</button>
      </div>
    );
  }

  const { scenario, result } = phase;

  return (
    <div className="result">
      <header className="result-header">
        <button className="back-btn" onClick={() => setPhase({ tag: "select" })}>
          ← Back
        </button>
        <div className="result-title">
          <span className="scenario-chip">{scenario.id}</span>
          <span>{scenario.vesselName}</span>
          <span className="imo">{scenario.vesselImo}</span>
        </div>
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
