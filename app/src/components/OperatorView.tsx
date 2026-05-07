import { useState, useMemo } from "react";
import type { OperatorSummary, SiteSummary } from "../lib/bcaData.js";

interface Props {
  operator: OperatorSummary;
  sites: SiteSummary[];
  loading: boolean;
  onSelectSite: (site: SiteSummary) => void;
  onBack: () => void;
}

type SortKey = "score" | "eui" | "alerts";
type FilterTarget = "All" | "Platinum" | "Gold+" | "Gold";

function complianceBadgeClass(score: number): string {
  if (score >= 80) return "compliance-badge compliance-badge-green";
  if (score >= 50) return "compliance-badge compliance-badge-amber";
  return "compliance-badge compliance-badge-red";
}

function alertBadgeClass(count: number): string {
  return count === 0
    ? "compliance-badge compliance-badge-green"
    : "compliance-badge compliance-badge-red";
}

export function OperatorView({ operator, sites, loading, onSelectSite, onBack }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTarget>("All");
  const [sort, setSort] = useState<SortKey>("score");

  const displayed = useMemo(() => {
    let result = sites;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.building_name.toLowerCase().includes(q));
    }

    if (filter !== "All") {
      result = result.filter((s) => s.green_mark_target === filter);
    }

    result = [...result].sort((a, b) => {
      if (sort === "score") return b.compliance_score - a.compliance_score;
      if (sort === "eui")   return a.eui_kwh_m2 - b.eui_kwh_m2;
      if (sort === "alerts") return b.alert_count - a.alert_count;
      return 0;
    });

    return result;
  }, [sites, search, filter, sort]);

  const FILTER_PILLS: FilterTarget[] = ["All", "Platinum", "Gold+", "Gold"];

  return (
    <div className="operator-view">
      <div className="operator-view-header">
        <button className="back-btn" onClick={onBack}>
          ← Portfolio
        </button>
        <h2 className="operator-view-title">{operator.operator_name}</h2>
      </div>

      <div className="operator-controls">
        <input
          type="text"
          className="portfolio-search-input"
          placeholder="Search sites…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search sites"
        />

        <div className="filter-pills">
          {FILTER_PILLS.map((f) => (
            <button
              key={f}
              className={`pill${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort sites"
        >
          <option value="score">Score ↓</option>
          <option value="eui">EUI ↑</option>
          <option value="alerts">Alerts ↓</option>
        </select>
      </div>

      {loading && <p className="loading-clarus" style={{ padding: "0 24px 16px" }}>Loading sites from R2…</p>}

      <div className="site-cards">
        {displayed.map((site) => (
          <button
            key={site.outlet_id}
            className="card site-card"
            onClick={() => onSelectSite(site)}
          >
            <div className="card-top">
              <span className="scenario-id">{site.outlet_id}</span>
              <span className={complianceBadgeClass(site.compliance_score)}>
                Score {site.compliance_score}/100
              </span>
              <span className={alertBadgeClass(site.alert_count)}>
                {site.alert_count === 0
                  ? "0 alerts"
                  : `${site.alert_count} alert${site.alert_count > 1 ? "s" : ""}`}
              </span>
            </div>

            <div className="vessel-name">{site.building_name}</div>

            <div className="metric-row">
              <span>EUI {site.eui_kwh_m2}</span>
              <span>·</span>
              <span>COP {site.chiller_cop}</span>
              <span>·</span>
              <span>LPD {site.lpd_w_m2} W/m²</span>
            </div>

            <div className="site-card-target">
              <span className="pill">{site.green_mark_target}</span>
            </div>

            <div className="card-cta">Generate Section 4 →</div>
          </button>
        ))}
      </div>
    </div>
  );
}
