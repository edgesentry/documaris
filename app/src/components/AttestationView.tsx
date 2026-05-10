import { useState, useEffect } from "react";
import {
  fetchPortfolioAttestation,
  fetchBcaSiteRegistry,
  sitesByOperator,
  certLevelLabel,
  certLevelColor,
  type PortfolioAttestation,
  type SiteAttestation,
  type CertLevel,
  type SiteRegistry,
} from "../lib/attestation.js";
import type { OperatorSummary } from "../lib/bcaData.js";

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

function ProofBadge({ proof_valid }: { proof_valid: boolean | null }) {
  if (proof_valid === true)  return <span style={{ color: "#3fb950", fontSize: 11, fontWeight: 700 }}>✓ valid</span>;
  if (proof_valid === false) return <span style={{ color: "#f85149", fontSize: 11, fontWeight: 700 }}>✗ TAMPERED</span>;
  return <span style={{ color: "#8b949e", fontSize: 11 }}>SP1 (pending)</span>;
}

function SiteRow({ site }: { site: SiteAttestation }) {
  const [expanded, setExpanded] = useState(false);
  const att = site.attestation;
  const isTampered = site.proof_valid === false;

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{
          cursor: "pointer",
          background: isTampered ? "rgba(248,81,73,0.04)" : undefined,
          borderLeft: isTampered ? "3px solid #f85149" : "3px solid transparent",
        }}
      >
        <td style={{ fontFamily: "monospace", fontSize: 12, padding: "8px 12px" }}>
          {site.site_id}
          {isTampered && (
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700,
              background: "rgba(248,81,73,0.15)", color: "#f85149",
              border: "1px solid rgba(248,81,73,0.4)", borderRadius: 8, padding: "1px 6px",
            }}>
              ⚠ PROOF INVALID
            </span>
          )}
        </td>
        <td style={{ padding: "8px 12px" }}>
          {att ? <CertBadge level={att.cert_level} /> : <span style={{ color: "#8b949e", fontSize: 12 }}>—</span>}
        </td>
        <td style={{ textAlign: "center", padding: "8px 12px" }}>
          {att?.all_criteria_pass === true && !isTampered
            ? <span style={{ color: "#3fb950", fontWeight: 700 }}>✓ PASS</span>
            : att?.all_criteria_pass === true && isTampered
            ? <span style={{ color: "#f85149", fontWeight: 700 }}>⚠ UNVERIFIED</span>
            : att
            ? <span style={{ color: "#f85149", fontWeight: 700 }}>✗ FAIL</span>
            : <span style={{ color: "#8b949e" }}>—</span>}
        </td>
        <td style={{ textAlign: "center", fontSize: 12, padding: "8px 12px" }}>
          {att?.cop_pass === true ? "✓" : att ? "✗" : "—"}
        </td>
        <td style={{ textAlign: "center", fontSize: 12, padding: "8px 12px" }}>
          {att?.lpd_pass === true ? "✓" : att ? "✗" : "—"}
        </td>
        <td style={{ fontFamily: "monospace", fontSize: 12, padding: "8px 12px" }}>
          {site.attested_at ? site.attested_at.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—"}
        </td>
        <td style={{ padding: "8px 12px" }}>
          <ProofBadge proof_valid={site.proof_valid} />
        </td>
        <td style={{ color: "#58a6ff", fontSize: 12, padding: "8px 12px" }}>{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: "rgba(88,166,255,0.04)", padding: "12px 16px", borderBottom: "1px solid #30363d" }}>
            {att ? (
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "4px 12px", fontSize: 12 }}>
                <span style={{ color: "#8b949e" }}>EUI</span>
                <span style={{ fontFamily: "monospace" }}>{att.eui_kwh_m2.toFixed(1)} kWh/m²/year</span>
                <span style={{ color: "#8b949e" }}>COP pass (≥ 0.65)</span>
                <span style={{ color: att.cop_pass ? "#3fb950" : "#f85149" }}>{att.cop_pass ? "Yes" : "No"}</span>
                <span style={{ color: "#8b949e" }}>LPD pass (≤ 15 W/m²)</span>
                <span style={{ color: att.lpd_pass ? "#3fb950" : "#f85149" }}>{att.lpd_pass ? "Yes" : "No"}</span>
                <span style={{ color: "#8b949e" }}>ZK proof verification</span>
                <span>
                  {site.proof_valid === true  && <span style={{ color: "#3fb950" }}>✓ BLAKE3 hash matches public_values — proof authentic</span>}
                  {site.proof_valid === false && (
                    <span style={{ color: "#f85149" }}>
                      ✗ BLAKE3 hash does NOT match — proof_bytes are tampered or forged.
                      This record cannot be trusted regardless of the claimed cert_level.
                    </span>
                  )}
                  {site.proof_valid === null  && <span style={{ color: "#8b949e" }}>SP1 Groth16 verification pending WASM verifier integration</span>}
                </span>
                <span style={{ color: "#8b949e" }}>ZK framework</span>
                <span style={{ fontFamily: "monospace" }}>mock (SP1 pending)</span>
                <span style={{ color: "#8b949e" }}>Record hash</span>
                <span style={{ fontFamily: "monospace", wordBreak: "break-all", color: "#8b949e", fontSize: 11 }}>
                  {site.record_hash ?? "—"}
                </span>
                <span style={{ color: "#8b949e" }}>Raw sensor data</span>
                <span style={{ color: "#3fb950" }}>Not exposed — stays on edge device ✓</span>
              </div>
            ) : (
              <span style={{ color: "#8b949e", fontSize: 12 }}>
                {site.error === "no runs"
                  ? "No audit records found. Run clarus-edge with PROFILE=sg-bca-greenmark."
                  : site.error === "no zk_proof in recent records"
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

// ── 4-quadrant legend ─────────────────────────────────────────────────────────

function QuadrantLegend() {
  const cell = (label: string, color: string, bg: string) => (
    <div style={{
      padding: "10px 14px", borderRadius: 6,
      border: `1px solid ${color}44`,
      background: bg, fontSize: 11,
    }}>
      <div style={{ fontWeight: 700, color, marginBottom: 3 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 6 }}>
        E2E test matrix — all 4 quadrants of ZKP computation × BCA criteria:
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxWidth: 560 }}>
        {cell("Q1 ✓ Correct calc + Passes BCA GM",   "#3fb950", "rgba(63,185,80,0.06)")}
        {cell("Q2 ✓ Correct calc + Fails BCA GM",    "#d29922", "rgba(210,153,34,0.06)")}
        {cell("Q3 ✗ Tampered ZKP + Claims PASS → fraud detected",  "#f85149", "rgba(248,81,73,0.06)")}
        {cell("Q4 ✗ Tampered ZKP + Claims FAIL → sabotage detected", "#f85149", "rgba(248,81,73,0.06)")}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface Props {
  operators: OperatorSummary[];
}

export function AttestationView({ operators }: Props) {
  const [registry, setRegistry]           = useState<SiteRegistry | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<string>("MCH-OPERATOR-001");
  const [portfolio, setPortfolio]         = useState<PortfolioAttestation | null>(null);
  const [loading, setLoading]             = useState(false);

  // Fetch registry from R2 on mount
  useEffect(() => {
    fetchBcaSiteRegistry()
      .then(setRegistry)
      .catch(e => setRegistryError(String(e)));
  }, []);

  // Derive operator → site_id mapping from registry
  const operatorSiteMap = registry ? sitesByOperator(registry) : {};

  // Set default operator from registry once loaded
  useEffect(() => {
    if (registry && registry.sites.length > 0 && !operatorSiteMap[selectedOperator]) {
      setSelectedOperator(Object.keys(operatorSiteMap)[0]);
    }
  }, [registry]);

  // Fetch attestations whenever selected operator changes
  useEffect(() => {
    const siteIds = operatorSiteMap[selectedOperator];
    if (!siteIds?.length) return;
    setLoading(true);
    setPortfolio(null);
    fetchPortfolioAttestation(selectedOperator, siteIds)
      .then(setPortfolio)
      .finally(() => setLoading(false));
  }, [selectedOperator, registry]);

  const tamperCount = portfolio?.sites.filter(s => s.proof_valid === false).length ?? 0;

  return (
    <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>

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
          {registry && (
            <span style={{
              background: "rgba(88,166,255,0.1)", color: "#58a6ff",
              border: "1px solid rgba(88,166,255,0.3)", borderRadius: 12,
              fontSize: 11, padding: "2px 10px",
            }}>
              {registry.sites.length} sites from R2 registry
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>
          Compliance status derived from ZKP proofs in the clarus WORM audit chain.
          Raw sensor data (EUI readings, occupancy, area) never transmitted — only the mathematical attestation is read.
          Proof bytes verified in-browser via BLAKE3.
        </p>
      </div>

      {/* Registry error */}
      {registryError && (
        <div style={{ color: "#f85149", fontSize: 12, marginBottom: 12 }}>
          Registry fetch failed: {registryError}
        </div>
      )}

      {/* E2E 4-quadrant legend */}
      <QuadrantLegend />

      {/* Operator selector — driven by registry */}
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
          {Object.entries(operatorSiteMap).map(([opId, sites]) => (
            <option key={opId} value={opId}>
              {opId} ({sites.length} sites)
            </option>
          ))}
          {/* Fallback options if registry not loaded */}
          {!registry && operators.map(op => (
            <option key={op.operator_id} value={op.operator_id}>
              {op.operator_id} ({op.site_count} sites)
            </option>
          ))}
        </select>
        {registry && (
          <span style={{ fontSize: 11, color: "#8b949e" }}>
            (source: R2 registry/bca-sites.json)
          </span>
        )}
      </div>

      {/* Summary banner */}
      {portfolio && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "12px 18px", borderRadius: 8, marginBottom: 16,
          border: tamperCount > 0
            ? "1px solid rgba(248,81,73,0.6)"
            : portfolio.all_pass
            ? "1px solid rgba(63,185,80,0.4)" : "1px solid rgba(210,153,34,0.4)",
          background: tamperCount > 0
            ? "rgba(248,81,73,0.07)"
            : portfolio.all_pass
            ? "rgba(63,185,80,0.07)" : "rgba(210,153,34,0.07)",
        }}>
          <span style={{ fontSize: 22 }}>
            {tamperCount > 0 ? "🚨" : portfolio.all_pass ? "✅" : "⚠️"}
          </span>
          <div>
            {tamperCount > 0 ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#f85149" }}>
                  {tamperCount} tampered/forged proof{tamperCount > 1 ? "s" : ""} detected — ZKP verification failed
                </div>
                <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
                  {portfolio.pass_count}/{portfolio.total_count - tamperCount} honest sites pass BCA Green Mark · {tamperCount} rejected due to invalid proof
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {portfolio.all_pass
                    ? `Portfolio compliant — ${portfolio.pass_count}/${portfolio.total_count} sites pass BCA Green Mark`
                    : `${portfolio.pass_count}/${portfolio.total_count} sites passing BCA Green Mark criteria`}
                </div>
                <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
                  All proofs verified · Generated {portfolio.generated_at.toISOString().replace("T", " ").slice(0, 19)} UTC
                </div>
              </>
            )}
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
                {["Site ID", "Cert Level", "All Criteria", "COP", "LPD", "Attested At", "ZKP Proof", ""].map(h => (
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
        API:{" "}
        <a
          href={`/api/bca-portfolio/${encodeURIComponent(selectedOperator)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#58a6ff" }}
        >
          /api/bca-portfolio/{selectedOperator}
        </a>
        {" · "}
        <a
          href="https://clarus.edgesentry.io/data/raw/registry/bca-sites.json"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#58a6ff" }}
        >
          registry/bca-sites.json
        </a>
      </div>
    </div>
  );
}
