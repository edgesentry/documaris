import { useState } from "react";
import type { OperatorSummary } from "../lib/bcaData.js";

interface Props {
  operators: OperatorSummary[];
  loading: boolean;
  onSelect: (operator: OperatorSummary) => void;
}

export function PortfolioView({ operators, loading, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = operators.filter((op) =>
    op.operator_name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="selector">
        <div className="selector-header">
          <h1>documaris</h1>
          <p className="subtitle">BCA Green Mark Portfolio</p>
        </div>
        <div className="loading">
          <div className="spinner" />
          <p>Loading portfolio from R2…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="selector">
      <div className="selector-header">
        <h1>documaris</h1>
        <p className="subtitle">BCA Green Mark Portfolio</p>
      </div>

      <div className="portfolio-search">
        <input
          type="text"
          className="portfolio-search-input"
          placeholder="Search operators…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search operators"
        />
      </div>

      <div className="portfolio-cards">
        {filtered.map((op) => (
          <button
            key={op.operator_id}
            className="card portfolio-card"
            onClick={() => onSelect(op)}
          >
            <div className="portfolio-card-name">{op.operator_name}</div>
            <div className="portfolio-card-meta">{op.site_count} sites</div>

            <div className="portfolio-card-signals">
              <span className="portfolio-signal-ok">
                ● {op.compliant_count} compliant
              </span>
              {op.needs_action_count > 0 && (
                <span className="portfolio-signal-warn">
                  ⚠ {op.needs_action_count} needs action
                </span>
              )}
            </div>

            <div className="portfolio-card-metrics">
              <span>Avg EUI: {op.avg_eui} kWh/m²</span>
              <span>Avg score: {op.avg_compliance_score}/100</span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: "#888", padding: "16px" }}>No operators match "{search}"</p>
        )}
      </div>
    </div>
  );
}
