import { useState, useEffect } from "react";
import {
  fetchPortfolioAttestation,
  certLevelLabel,
  certLevelColor,
  type PortfolioAttestation,
  type SiteAttestation,
  type CertLevel,
} from "../lib/attestation.js";
import type { OperatorSummary } from "../lib/bcaData.js";

// ── Demo site mapping ─────────────────────────────────────────────────────────
// Maps documaris operator_ids to the clarus site_ids that have ZKP proofs.
// In production this would come from a site registry.
const OPERATOR_SITE_MAP: Record<string, string[]> = {
  "MCH-OPERATOR-001": ["MCH-OUTLET-BCA"],
  "MCH-OUTLET-BCA":   ["MCH-OUTLET-BCA"],
};

function fallbackSites(operatorId: string): string[] {
  return OPERATOR_SITE_MAP[operatorId] ?? [operatorId];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CertBadge({ level }: { level: CertLevel }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 700,
      background: certLevelColor(level) + "22",
      color: certLevelColor(level),
      border: `1px solid ${certLevelColor(level)}66`,
    }}>
      {certLevelLabel(level)}
    </span>
  );
}

function SiteRow({ site }: { site: SiteAttestation }) {
  const [expanded, setExpanded] = useState(false);
  const att = site.attestation;

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: "pointer" }}
      >
        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{site.site_id}</td>
        <td>
          {att ? <CertBadge level={att.cert_level} /> : <span style={{ color: "#8b949e", fontSize: 12 }}>—</span>}
        </td>
        <td style={{ textAlign: "center" }}>
          {att?.all_criteria_pass === true
            ? <span style={{ color: "#3fb950", fontWeight: 700 }}>✓ PASS</span>
            : att
            ? <span style={{ color: "#f85149", fontWeight: 700 }}>✗ FAIL</span>
            : <span style={{ color: "#8b949e" }}>—</span>}
        </td>
        <td style={{ textAlign: "center", fontSize: 12 }}>
          {att?.cop_pass === true ? "✓" : att ? "✗" : "—"}
        </td>
        <td style={{ textAlign: "center", fontSize: 12 }}>
          {att?.lpd_pass === true ? "✓" : att ? "✗" : "—"}
        </td>
        <td style={{ fontFamily: "monospace", fontSize: 12 }}>
          {site.attested_at ? site.attested_at.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—"}
        </td>
        <td style={{ textAlign: "center" }}>
          {site.verified
            ? <span style={{ color: "#3fb950", fontSize: 12 }}>✓ verified</span>
            : site.error
            ? <span style={{ color: "#8b949e", fontSize: 12 }}>no proof</span>
            : "—"}
        </td>
        <td style={{ color: "#58a6ff", fontSize: 12 }}>{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: "rgba(88,166,255,0.04)", padding: "12px 16px" }}>
            {att ? (
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "4px 12px", fontSize: 12 }}>
                <span style={{ color: "#8b949e" }}>EUI</span>
                <span style={{ fontFamily: "monospace" }}>{att.eui_kwh_m2.toFixed(1)} kWh/m²/year</span>
                <span style={{ color: "#8b949e" }}>COP pass (≥ 0.65)</span>
                <span style={{ color: att.cop_pass ? "#3fb950" : "#f85149" }}>{att.cop_pass ? "Yes" : "No"}</span>
                <span style={{ color: "#8b949e" }}>LPD pass (≤ 15 W/m²)</span>
                <span style={{ color: att.lpd_pass ? "#3fb950" : "#f85149" }}>{att.lpd_pass ? "Yes" : "No"}</span>
                <span style={{ color: "#8b949e" }}>Record hash</span>
                <span style={{ fontFamily: "monospace", wordBreak: "break-all", color: "#8b949e" }}>
                  {site.record_hash ?? "—"}
                </span>
                <span style={{ color: "#8b949e" }}>ZK framework</span>
                <span style={{ fontFamily: "monospace" }}>mock (SP1 pending)</span>
                <span style={{ color: "#8b949e" }}>Raw sensor data</span>
                <span style={{ color: "#3fb950" }}>Not exposed — stays on edge device ✓</span>
              </div>
            ) : (
              <span style={{ color: "#8b949e", fontSize: 12 }}>
                {site.error === "no_runs"
                  ? "No audit records found. Run clarus-edge with PROFILE=sg-bca-greenmark."
                  : site.error === "no_zkp_record"
                  ? "No ZKP-bearing records in the most recent run."
                  : `Error: ${site.error}`}
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface Props {
  operators: OperatorSummary[];
}

export function AttestationView({ operators }: Props) {
  const [selectedOperator, setSelectedOperator] = useState<string>(
    operators[0]?.operator_id ?? "MCH-OUTLET-BCA"
  );
  const [portfolio, setPortfolio] = useState<PortfolioAttestation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedOperator) return;
    setLoading(true);
    setPortfolio(null);
    const siteIds = fallbackSites(selectedOperator);
    fetchPortfolioAttestation(selectedOperator, siteIds)
      .then(setPortfolio)
      .finally(() => setLoading(false));
  }, [selectedOperator]);

  return (
    <div style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            BCA Green Mark — ZKP Portfolio Attestation
          </h2>
          <span style={{
            background: "rgba(63,185,80,0.1)", color: "#3fb950",
            border: "1px solid rgba(63,185,80,0.3)", borderRadius: 12,
            fontSize: 11, fontWeight: 700, padding: "2px 10px",
          }}>
            WORM-sealed · proof-backed
          </span>
        </div>
        <p style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>
          Compliance status derived from ZKP proofs in the clarus WORM audit chain.
          Raw sensor data (EUI readings, occupancy, area) is never transmitted — only the mathematical attestation is read.
        </p>
      </div>

      {/* Operator selector */}
      {operators.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#8b949e" }}>Operator</label>
          <select
            value={selectedOperator}
            onChange={e => setSelectedOperator(e.target.value)}
            style={{
              background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3",
              fontSize: 13, padding: "5px 10px", borderRadius: 6, outline: "none", cursor: "pointer",
            }}
          >
            {operators.map(op => (
              <option key={op.operator_id} value={op.operator_id}>
                {op.operator_id} ({op.site_count} sites)
              </option>
            ))}
            <option value="MCH-OUTLET-BCA">MCH-OUTLET-BCA (demo)</option>
          </select>
        </div>
      )}

      {/* Summary banner */}
      {portfolio && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "12px 18px", borderRadius: 8, marginBottom: 16,
          border: portfolio.all_pass
            ? "1px solid rgba(63,185,80,0.4)" : "1px solid rgba(248,81,73,0.4)",
          background: portfolio.all_pass
            ? "rgba(63,185,80,0.07)" : "rgba(248,81,73,0.07)",
        }}>
          <span style={{ fontSize: 22 }}>{portfolio.all_pass ? "✅" : "⚠️"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {portfolio.all_pass
                ? `Portfolio compliant — ${portfolio.pass_count}/${portfolio.total_count} sites pass BCA Green Mark`
                : `${portfolio.pass_count}/${portfolio.total_count} sites passing BCA Green Mark criteria`}
            </div>
            <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
              Generated {portfolio.generated_at.toISOString().replace("T", " ").slice(0, 19)} UTC
              · Operator: {portfolio.operator_id}
            </div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: "#d29922",
            background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)",
            padding: "4px 10px", borderRadius: 12 }}>
            🔒 Object Lock · deletion not possible
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ color: "#8b949e", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
          Fetching ZKP attestations from clarus WORM chain…
        </div>
      )}

      {/* Site table */}
      {portfolio && !loading && (
        <div style={{
          background: "#161b22", border: "1px solid #30363d", borderRadius: 8, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #30363d" }}>
                {["Site ID", "Cert Level", "All Criteria", "COP", "LPD", "Attested At", "Proof", ""].map(h => (
                  <th key={h} style={{
                    fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
                    color: "#8b949e", padding: "8px 12px", textAlign: "left",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.sites.map(site => (
                <SiteRow key={site.site_id} site={site} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* API link */}
      <div style={{ marginTop: 16, fontSize: 11, color: "#8b949e" }}>
        API: <a
          href={`/api/bca-portfolio/${selectedOperator}`}
          target="_blank"
          style={{ color: "#58a6ff" }}
        >
          /api/bca-portfolio/{selectedOperator}
        </a>
        {" "}→ raw JSON attestation (for BCA integration / downstream systems)
      </div>
    </div>
  );
}
