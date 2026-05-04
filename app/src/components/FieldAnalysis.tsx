import type { FilledDocument, FieldValue } from "../lib/pipeline.js";

interface Props {
  filled: FilledDocument;
}

const SOURCE_LABEL: Record<string, string> = {
  Llm: "AI",
  Direct: "Direct",
  Derived: "Computed",
};

const SOURCE_CLASS: Record<string, string> = {
  Llm: "source-ai",
  Direct: "source-direct",
  Derived: "source-derived",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.8 ? "conf-high" : value >= 0.5 ? "conf-mid" : "conf-low";
  return (
    <div className="conf-bar-wrap">
      <div className={`conf-bar ${cls}`} style={{ width: `${pct}%` }} />
      <span className="conf-label">{pct}%</span>
    </div>
  );
}

function FieldRow({
  name,
  fv,
}: {
  name: string;
  fv: FieldValue;
}) {
  const isAi = fv.source === "Llm";
  const flagged = fv.flagged;

  return (
    <tr className={flagged ? "row-flagged" : isAi ? "row-ai" : ""}>
      <td className="field-name">{name}</td>
      <td>
        <span className={`source-badge ${SOURCE_CLASS[fv.source] ?? "source-direct"}`}>
          {SOURCE_LABEL[fv.source] ?? fv.source}
        </span>
      </td>
      <td className="field-value">
        {fv.value ?? <span className="null-value">—</span>}
      </td>
      <td>
        {isAi ? (
          <ConfidenceBar value={fv.confidence} />
        ) : (
          <span className="conf-na">—</span>
        )}
      </td>
      <td>
        {flagged && <span className="flag-badge">⚠ review</span>}
      </td>
    </tr>
  );
}

export function FieldAnalysis({ filled }: Props) {
  const entries = Object.entries(filled.fields);
  const aiFields = entries.filter(([, v]) => v.source === "Llm");
  const flaggedFields = entries.filter(([, v]) => v.flagged);

  return (
    <div className="field-analysis">
      <div className="fa-summary">
        <span className="fa-stat">
          <span className="fa-num">{entries.length}</span> fields total
        </span>
        <span className="fa-stat ai">
          <span className="fa-num">{aiFields.length}</span> AI-filled
        </span>
        {flaggedFields.length > 0 && (
          <span className="fa-stat flagged">
            <span className="fa-num">{flaggedFields.length}</span> need review
          </span>
        )}
      </div>

      <table className="fa-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Source</th>
            <th>Value</th>
            <th>Confidence</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, fv]) => (
            <FieldRow key={name} name={name} fv={fv} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
