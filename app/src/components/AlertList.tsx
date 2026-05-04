import type { ComplianceAlert } from "../lib/pipeline.js";

interface Props {
  alerts: ComplianceAlert[];
}

const SEVERITY_CLASS: Record<string, string> = {
  HIGH: "alert-high",
  MEDIUM: "alert-medium",
  LOW: "alert-low",
};

export function AlertList({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="alert-empty">
        <span className="check-icon">✓</span> 0 compliance alerts — document
        cleared for submission
      </div>
    );
  }

  return (
    <div className="alert-list">
      {alerts.map((a, i) => (
        <div key={i} className={`alert-item ${SEVERITY_CLASS[a.severity] ?? ""}`}>
          <div className="alert-header">
            <span className="alert-severity">{a.severity}</span>
            <span className="alert-rule">{a.rule_id}</span>
          </div>
          <p className="alert-message">{a.message}</p>
          <p className="alert-regulation">{a.regulation}</p>
        </div>
      ))}
    </div>
  );
}
