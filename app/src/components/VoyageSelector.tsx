import { SCENARIOS, type Scenario } from "../lib/fixtures.js";

interface Props {
  onSelect: (s: Scenario) => void;
}

const SEVERITY_BADGE: Record<string, string> = {
  "0 alerts": "badge-ok",
  "1 alert": "badge-warn",
};

export function VoyageSelector({ onSelect }: Props) {
  return (
    <div className="selector">
      <div className="selector-header">
        <h1>documaris</h1>
        <p className="subtitle">
          AI-powered port call documentation · PIER71-11 demo
        </p>
      </div>
      <div className="cards">
        {SCENARIOS.map((s) => (
          <button key={s.id} className="card" onClick={() => onSelect(s)}>
            <div className="card-top">
              <span className="scenario-id">{s.id}</span>
              <span
                className={`badge ${SEVERITY_BADGE[`${s.expectedAlerts} alert${s.expectedAlerts === 1 ? "" : "s"}`] ?? "badge-warn"}`}
              >
                {s.expectedAlerts === 0
                  ? "0 alerts"
                  : `${s.expectedAlerts} alert`}
              </span>
            </div>
            <div className="vessel-name">{s.vesselName}</div>
            <div className="vessel-imo">{s.vesselImo}</div>
            <p className="card-desc">{s.description}</p>
            <div className="card-cta">Generate FAL Form 1 →</div>
          </button>
        ))}
      </div>
    </div>
  );
}
