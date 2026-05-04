import type { Scenario } from "../lib/fixtures.js";

interface Props {
  scenarios: Scenario[];
  loadingClarus: boolean;
  onSelect: (s: Scenario) => void;
}

export function VoyageSelector({ scenarios, loadingClarus, onSelect }: Props) {
  return (
    <div className="selector">
      <div className="selector-header">
        <h1>documaris</h1>
        <p className="subtitle">
          AI-powered port call documentation · PIER71-11 demo
        </p>
        {loadingClarus && (
          <p className="clarus-loading">Loading live vessel data from clarus…</p>
        )}
      </div>
      <div className="cards">
        {scenarios.map((s) => (
          <button key={s.id} className="card" onClick={() => onSelect(s)}>
            <div className="card-top">
              <span className="scenario-id">{s.id}</span>
              <span className={`badge ${s.expectedAlerts === 0 ? "badge-ok" : "badge-warn"}`}>
                {s.expectedAlerts === 0 ? "0 alerts" : `${s.expectedAlerts} alert`}
              </span>
            </div>
            <div className="vessel-name">{s.vesselName}</div>
            <div className="vessel-imo">{s.vesselImo}</div>
            {s.behavioralScore !== undefined && (
              <div className="clarus-signals">
                <span className={`risk-pill ${s.behavioralScore > 60 ? "risk-high" : s.behavioralScore > 30 ? "risk-mid" : "risk-low"}`}>
                  Risk {Math.round(s.behavioralScore)}/100
                </span>
                {s.aisGaps !== undefined && s.aisGaps > 0 && (
                  <span className="signal-pill">AIS gaps {s.aisGaps}</span>
                )}
                <span className="clarus-badge">live · clarus</span>
              </div>
            )}
            <p className="card-desc">{s.description}</p>
            <div className="card-cta">Generate FAL Form 1 →</div>
          </button>
        ))}
      </div>
    </div>
  );
}
