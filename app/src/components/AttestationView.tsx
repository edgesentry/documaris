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

// ── Cert level display ────────────────────────────────────────────────────────

const CERT_DESCRIPTIONS: Record<CertLevel, string> = {
  platinum:      "Highest energy efficiency — BCA Green Mark Platinum",
  gold_plus:     "Excellent energy efficiency — BCA Green Mark GoldPlus",
  gold:          "Good energy efficiency — BCA Green Mark Gold",
  certified:     "Meets the BCA Green Mark standard — Certified",
  not_certified: "Does not meet BCA Green Mark requirements",
};

function CertBadge({ level }: { level: CertLevel }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 12px",
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 700,
      background: certLevelColor(level) + "22",
      color: certLevelColor(level),
      border: `1px solid ${certLevelColor(level)}66`,
    }}>
      {certLevelLabel(level)}
    </span>
  );
}

// ── Compliance status ─────────────────────────────────────────────────────────

function StatusBadge({ proof_valid, all_criteria_pass }: { proof_valid: boolean | null; all_criteria_pass: boolean | undefined }) {
  if (proof_valid === false) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: "#f85149", fontSize: 12, fontWeight: 700,
        background: "rgba(248,81,73,0.12)", border: "1px solid rgba(248,81,73,0.4)",
        borderRadius: 10, padding: "3px 10px",
      }}>
        ⚠ Data integrity issue
      </span>
    );
  }
  if (all_criteria_pass === true) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: "#3fb950", fontSize: 12, fontWeight: 700,
        background: "rgba(63,185,80,0.12)", border: "1px solid rgba(63,185,80,0.4)",
        borderRadius: 10, padding: "3px 10px",
      }}>
        ✓ Certified
      </span>
    );
  }
  if (all_criteria_pass === false) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: "#d29922", fontSize: 12, fontWeight: 600,
        background: "rgba(210,153,34,0.12)", border: "1px solid rgba(210,153,34,0.4)",
        borderRadius: 10, padding: "3px 10px",
      }}>
        — Below standard
      </span>
    );
  }
  return <span style={{ color: "#8b949e", fontSize: 12 }}>Pending</span>;
}

// ── Site row ──────────────────────────────────────────────────────────────────

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
        {/* Site */}
        <td style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{site.site_id}</div>
        </td>

        {/* Certification level */}
        <td style={{ padding: "12px 16px" }}>
          {att ? (
            <>
              <CertBadge level={att.cert_level} />
              <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>
                {CERT_DESCRIPTIONS[att.cert_level]}
              </div>
            </>
          ) : <span style={{ color: "#8b949e", fontSize: 12 }}>—</span>}
        </td>

        {/* EUI */}
        <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 13 }}>
          {att ? (
            <span style={{ color: att.all_criteria_pass ? "#e6edf3" : "#f85149" }}>
              {att.eui_kwh_m2.toFixed(1)}
            </span>
          ) : "—"}
        </td>

        {/* Status */}
        <td style={{ padding: "12px 16px" }}>
          <StatusBadge proof_valid={site.proof_valid} all_criteria_pass={att?.all_criteria_pass} />
        </td>

        {/* Verified at */}
        <td style={{ padding: "12px 16px", fontSize: 12, color: "#8b949e" }}>
          {site.attested_at
            ? site.attested_at.toISOString().slice(0, 16).replace("T", " ") + " UTC"
            : "—"}
        </td>

        <td style={{ padding: "12px 16px", color: "#58a6ff", fontSize: 12 }}>{expanded ? "▲" : "▼"}</td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={6} style={{
            background: isTampered ? "rgba(248,81,73,0.04)" : "rgba(88,166,255,0.03)",
            padding: "16px 20px",
            borderBottom: "1px solid #30363d",
          }}>
            {att ? (
              <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>

                {/* Criteria */}
                <div>
                  <div style={{ fontSize: 11, color: "#8b949e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    BCA Compliance Criteria
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "6px 24px", fontSize: 13 }}>
                    <span style={{ color: "#8b949e" }}>Energy Use Intensity (EUI)</span>
                    <span>
                      {att.eui_kwh_m2.toFixed(1)} kWh/m²/yr
                      <span style={{ marginLeft: 8, fontSize: 11, color: certLevelColor(att.cert_level) }}>
                        ({certLevelLabel(att.cert_level)})
                      </span>
                    </span>

                    <span style={{ color: "#8b949e" }}>Chiller Efficiency (COP)</span>
                    <span style={{ color: att.cop_pass ? "#3fb950" : "#f85149" }}>
                      {att.cop_pass ? "✓ Meets standard (≥ 0.65)" : "✗ Below standard (< 0.65)"}
                    </span>

                    <span style={{ color: "#8b949e" }}>Lighting Power Density (LPD)</span>
                    <span style={{ color: att.lpd_pass ? "#3fb950" : "#f85149" }}>
                      {att.lpd_pass ? "✓ Meets standard (≤ 15 W/m²)" : "✗ Above limit (> 15 W/m²)"}
                    </span>


                  </div>
                </div>

                {/* Data integrity */}
                <div style={{ maxWidth: 340 }}>
                  <div style={{ fontSize: 11, color: "#8b949e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Data Integrity
                  </div>
                  {site.proof_valid === true && (
                    <div style={{ fontSize: 13, color: "#3fb950" }}>
                      ✓ Figures verified — not altered since measurement
                      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4, lineHeight: 1.5 }}>
                        Raw sensor data stays on the edge device and is never transmitted.
                        Only the computed result — with a mathematical proof of correctness — is stored in the audit record.
                      </div>
                    </div>
                  )}
                  {site.proof_valid === false && (
                    <div style={{ fontSize: 13, color: "#f85149" }}>
                      ⚠ Cannot confirm data integrity
                      <div style={{ fontSize: 11, color: "#f85149", opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
                        The claimed certification level does not match the mathematical proof attached to this record.
                        This submission cannot be used as the basis for issuing a Green Mark certificate.
                      </div>
                    </div>
                  )}
                  {site.proof_valid === null && (
                    <div style={{ fontSize: 13, color: "#8b949e" }}>
                      Automatic verification not yet available for this proof type.
                    </div>
                  )}
                </div>

                {/* Audit trail */}
                <div>
                  <div style={{ fontSize: 11, color: "#8b949e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Audit Record
                  </div>
                  <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.6 }}>
                    <div>Record ID: <span style={{ fontFamily: "monospace", fontSize: 11 }}>{site.record_hash?.slice(0, 16) ?? "—"}…</span></div>
                    <div style={{ marginTop: 4 }}>Stored in tamper-evident, deletion-proof storage. Cannot be modified after the fact.</div>
                    <div style={{ marginTop: 6 }}>
                      <a
                        href={`https://clarus.edgesentry.io/api/verify?site=${encodeURIComponent(site.site_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#58a6ff", fontSize: 11 }}
                      >
                        Independent verification ↗
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#8b949e", fontSize: 13 }}>
                {site.error === "no runs"
                  ? "No certification records found for this site."
                  : site.error === "no zk_proof in recent records"
                  ? "The most recent record does not include a certification proof."
                  : `Could not retrieve data: ${site.error}`}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Summary banner ────────────────────────────────────────────────────────────

function SummaryBanner({ portfolio }: { portfolio: PortfolioAttestation }) {
  const tamperCount = portfolio.sites.filter(s => s.proof_valid === false).length;
  const passCount   = portfolio.pass_count;
  const total       = portfolio.total_count;

  if (tamperCount > 0) {
    return (
      <div style={{
        display: "flex", gap: 16, padding: "16px 20px", borderRadius: 10, marginBottom: 20,
        border: "1px solid rgba(248,81,73,0.5)", background: "rgba(248,81,73,0.07)",
      }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>🚨</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f85149" }}>
            {tamperCount} submission{tamperCount > 1 ? "s" : ""} could not be verified
          </div>
          <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
            Of the {total - tamperCount} verified submissions, {passCount} meet{passCount === 1 ? "s" : ""} the BCA Green Mark standard.
            Unverified submissions are excluded from certification.
          </div>
        </div>
        <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: "#d29922",
          background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)",
          padding: "4px 12px", borderRadius: 12, whiteSpace: "nowrap" }}>
          🔒 Records cannot be deleted or altered
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", gap: 16, padding: "16px 20px", borderRadius: 10, marginBottom: 20,
      border: portfolio.all_pass
        ? "1px solid rgba(63,185,80,0.4)" : "1px solid rgba(210,153,34,0.4)",
      background: portfolio.all_pass
        ? "rgba(63,185,80,0.07)" : "rgba(210,153,34,0.07)",
    }}>
      <span style={{ fontSize: 24, lineHeight: 1 }}>{portfolio.all_pass ? "✅" : "⚠️"}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {portfolio.all_pass
            ? `All ${total} sites meet the BCA Green Mark standard`
            : `${passCount} of ${total} sites meet the BCA Green Mark standard`}
        </div>
        <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
          All data integrity checks passed ·
          Verified {portfolio.generated_at.toISOString().slice(0, 16).replace("T", " ")} UTC
        </div>
      </div>
      <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: "#d29922",
        background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)",
        padding: "4px 12px", borderRadius: 12, whiteSpace: "nowrap" }}>
        🔒 Records cannot be deleted or altered
      </div>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "certified" | "below_standard" | "integrity_issue" | "no_records";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all",             label: "All" },
  { key: "certified",       label: "✓ Certified" },
  { key: "below_standard",  label: "Below standard" },
  { key: "integrity_issue", label: "⚠ Data integrity issue" },
  { key: "no_records",      label: "No records" },
];

function matchesStatusFilter(site: SiteAttestation, filter: StatusFilter): boolean {
  if (filter === "all")             return true;
  if (filter === "integrity_issue") return site.proof_valid === false;
  if (filter === "no_records")      return site.attestation === null;
  if (filter === "certified")       return site.attestation?.all_criteria_pass === true && site.proof_valid !== false;
  if (filter === "below_standard")  return site.attestation?.all_criteria_pass === false && site.proof_valid !== false;
  return true;
}

function applySiteFilters(
  sites: SiteAttestation[],
  search: string,
  status: StatusFilter,
): SiteAttestation[] {
  const q = search.trim().toLowerCase();
  return sites.filter(s =>
    matchesStatusFilter(s, status) &&
    (q === "" || s.site_id.toLowerCase().includes(q))
  );
}

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  sites: SiteAttestation[];
  filteredCount: number;
}

function FilterBar({ search, onSearch, status, onStatus, sites, filteredCount }: FilterBarProps) {
  const counts: Record<StatusFilter, number> = {
    all:             sites.length,
    certified:       sites.filter(s => matchesStatusFilter(s, "certified")).length,
    below_standard:  sites.filter(s => matchesStatusFilter(s, "below_standard")).length,
    integrity_issue: sites.filter(s => matchesStatusFilter(s, "integrity_issue")).length,
    no_records:      sites.filter(s => matchesStatusFilter(s, "no_records")).length,
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <span style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            color: "#8b949e", fontSize: 13, pointerEvents: "none",
          }}>🔍</span>
          <input
            type="text"
            placeholder="Search by site ID…"
            value={search}
            onChange={e => onSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#0d1117", border: "1px solid #30363d", borderRadius: 6,
              color: "#e6edf3", fontSize: 13, padding: "7px 12px 7px 32px",
              outline: "none",
            }}
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "#8b949e", cursor: "pointer",
                fontSize: 14, padding: 0, lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#8b949e", whiteSpace: "nowrap" }}>
          {filteredCount === sites.length
            ? `${sites.length} site${sites.length !== 1 ? "s" : ""}`
            : `${filteredCount} of ${sites.length} sites`}
        </span>
      </div>

      {/* Status filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STATUS_FILTERS.filter(f => counts[f.key] > 0 || f.key === "all").map(f => (
          <button
            key={f.key}
            onClick={() => onStatus(f.key)}
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: status === f.key ? "1px solid #58a6ff" : "1px solid #30363d",
              background: status === f.key ? "rgba(88,166,255,0.15)" : "#161b22",
              color: status === f.key ? "#58a6ff" : "#8b949e",
              fontWeight: status === f.key ? 600 : 400,
            }}
          >
            {f.label}
            <span style={{ marginLeft: 5, opacity: 0.7 }}>{counts[f.key]}</span>
          </button>
        ))}
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
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");

  useEffect(() => {
    fetchBcaSiteRegistry()
      .then(setRegistry)
      .catch(e => setRegistryError(String(e)));
  }, []);

  const operatorSiteMap = registry ? sitesByOperator(registry) : {};

  useEffect(() => {
    if (registry && !operatorSiteMap[selectedOperator]) {
      setSelectedOperator(Object.keys(operatorSiteMap)[0] ?? selectedOperator);
    }
  }, [registry]);

  useEffect(() => {
    const siteIds = operatorSiteMap[selectedOperator];
    if (!siteIds?.length) return;
    setLoading(true);
    setPortfolio(null);
    setSearch("");
    setStatusFilter("all");
    fetchPortfolioAttestation(selectedOperator, siteIds)
      .then(setPortfolio)
      .finally(() => setLoading(false));
  }, [selectedOperator, registry]);

  const filteredSites = portfolio
    ? applySiteFilters(portfolio.sites, search, statusFilter)
    : [];

  return (
    <div style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            BCA Green Mark Portfolio
          </h2>
          <span style={{
            background: "rgba(63,185,80,0.1)", color: "#3fb950",
            border: "1px solid rgba(63,185,80,0.3)", borderRadius: 12,
            fontSize: 11, fontWeight: 700, padding: "2px 10px",
          }}>
            Tamper-proof records
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#8b949e", margin: 0, lineHeight: 1.6 }}>
          Compliance status verified automatically from energy data collected at each site.
          Raw measurements stay on the device — only the computed result, with proof that the calculation is correct, is stored in the audit record.
        </p>
      </div>

      {registryError && (
        <div style={{ color: "#f85149", fontSize: 13, marginBottom: 16 }}>
          Could not load site list: {registryError}
        </div>
      )}

      {/* Operator selector */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 13, color: "#8b949e" }}>Operator</label>
        <select
          value={selectedOperator}
          onChange={e => setSelectedOperator(e.target.value)}
          style={{
            background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3",
            fontSize: 13, padding: "6px 12px", borderRadius: 6, outline: "none", cursor: "pointer",
          }}
        >
          {Object.entries(operatorSiteMap).map(([opId, sites]) => (
            <option key={opId} value={opId}>
              {opId} ({sites.length} site{sites.length !== 1 ? "s" : ""})
            </option>
          ))}
          {!registry && operators.map(op => (
            <option key={op.operator_id} value={op.operator_id}>
              {op.operator_id} ({op.site_count} site{op.site_count !== 1 ? "s" : ""})
            </option>
          ))}
        </select>
      </div>

      {/* Summary banner */}
      {portfolio && <SummaryBanner portfolio={portfolio} />}

      {/* Loading */}
      {loading && (
        <div style={{ color: "#8b949e", fontSize: 13, padding: "48px 0", textAlign: "center" }}>
          Retrieving certification records…
        </div>
      )}

      {/* Filter bar + site table */}
      {portfolio && !loading && (
        <>
          <FilterBar
            search={search}
            onSearch={setSearch}
            status={statusFilter}
            onStatus={setStatusFilter}
            sites={portfolio.sites}
            filteredCount={filteredSites.length}
          />

          <div style={{
            background: "#161b22", border: "1px solid #30363d", borderRadius: 10, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #30363d" }}>
                  {["Site", "Certification Level", "EUI (kWh/m²/yr)", "Status", "Verified At", ""].map(label => (
                    <th key={label} style={{
                      fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
                      color: "#8b949e", padding: "10px 16px", textAlign: "left",
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSites.length > 0
                  ? filteredSites.map(site => <SiteRow key={site.site_id} site={site} />)
                  : (
                    <tr>
                      <td colSpan={6} style={{
                        padding: "32px 16px", textAlign: "center",
                        color: "#8b949e", fontSize: 13,
                      }}>
                        No sites match the current filter.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Footer note */}
      <div style={{
        marginTop: 20, padding: "12px 16px",
        background: "rgba(88,166,255,0.04)", border: "1px solid rgba(88,166,255,0.15)",
        borderRadius: 8, fontSize: 12, color: "#8b949e", lineHeight: 1.6,
      }}>
        <span style={{ color: "#58a6ff", fontWeight: 600 }}>How this works</span>
        {" — "}
        Each site's edge device computes the energy compliance result and stores it with a mathematical proof in a tamper-evident record.
        BCA can verify the result without ever receiving the raw sensor data.
        <a
          href={`/api/bca-portfolio/${encodeURIComponent(selectedOperator)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#58a6ff", marginLeft: 8 }}
        >
          Export as JSON →
        </a>
      </div>
    </div>
  );
}
