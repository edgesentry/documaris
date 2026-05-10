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
  platinum:      "BCA Green Mark Platinum — 最高水準のエネルギー効率",
  gold_plus:     "BCA Green Mark GoldPlus — 優秀なエネルギー効率",
  gold:          "BCA Green Mark Gold — 良好なエネルギー効率",
  certified:     "BCA Green Mark Certified — 基準を満たす",
  not_certified: "非認定 — BCA基準を満たしていません",
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

// ── Trust status badge ────────────────────────────────────────────────────────

function TrustBadge({ proof_valid, all_criteria_pass }: { proof_valid: boolean | null; all_criteria_pass: boolean | undefined }) {
  if (proof_valid === false) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        color: "#f85149", fontSize: 12, fontWeight: 700,
        background: "rgba(248,81,73,0.12)", border: "1px solid rgba(248,81,73,0.4)",
        borderRadius: 10, padding: "3px 10px",
      }}>
        ⚠ データ信頼性に問題あり
      </span>
    );
  }
  if (all_criteria_pass === true) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        color: "#3fb950", fontSize: 12, fontWeight: 700,
        background: "rgba(63,185,80,0.12)", border: "1px solid rgba(63,185,80,0.4)",
        borderRadius: 10, padding: "3px 10px",
      }}>
        ✓ 認証取得済み
      </span>
    );
  }
  if (all_criteria_pass === false) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        color: "#d29922", fontSize: 12, fontWeight: 600,
        background: "rgba(210,153,34,0.12)", border: "1px solid rgba(210,153,34,0.4)",
        borderRadius: 10, padding: "3px 10px",
      }}>
        — 基準未達
      </span>
    );
  }
  return <span style={{ color: "#8b949e", fontSize: 12 }}>確認中</span>;
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
        {/* Site name */}
        <td style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{site.site_id}</div>
          {att && (
            <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>
              {CERT_DESCRIPTIONS[att.cert_level]}
            </div>
          )}
        </td>

        {/* Certification level */}
        <td style={{ padding: "12px 16px" }}>
          {att ? <CertBadge level={att.cert_level} /> : <span style={{ color: "#8b949e", fontSize: 12 }}>—</span>}
        </td>

        {/* EUI */}
        <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 13 }}>
          {att ? (
            <span style={{ color: att.all_criteria_pass ? "#e6edf3" : "#f85149" }}>
              {att.eui_kwh_m2.toFixed(1)}
            </span>
          ) : "—"}
        </td>

        {/* Compliance status */}
        <td style={{ padding: "12px 16px" }}>
          <TrustBadge proof_valid={site.proof_valid} all_criteria_pass={att?.all_criteria_pass} />
        </td>

        {/* Last verified */}
        <td style={{ padding: "12px 16px", fontSize: 12, color: "#8b949e" }}>
          {site.attested_at
            ? site.attested_at.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
              + " " + site.attested_at.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
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
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>

                {/* Criteria detail */}
                <div>
                  <div style={{ fontSize: 11, color: "#8b949e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    BCA基準チェック項目
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "6px 20px", fontSize: 13 }}>
                    <span style={{ color: "#8b949e" }}>エネルギー使用強度（EUI）</span>
                    <span style={{ color: att.cop_pass ? "#e6edf3" : "#f85149" }}>
                      {att.eui_kwh_m2.toFixed(1)} kWh/m²/年
                      <span style={{ marginLeft: 8, fontSize: 11, color: certLevelColor(att.cert_level) }}>
                        ({certLevelLabel(att.cert_level)})
                      </span>
                    </span>

                    <span style={{ color: "#8b949e" }}>冷凍機効率（COP）</span>
                    <span style={{ color: att.cop_pass ? "#3fb950" : "#f85149" }}>
                      {att.cop_pass ? "✓ 基準達成（≥ 0.65）" : "✗ 基準未達（< 0.65）"}
                    </span>

                    <span style={{ color: "#8b949e" }}>照明電力密度（LPD）</span>
                    <span style={{ color: att.lpd_pass ? "#3fb950" : "#f85149" }}>
                      {att.lpd_pass ? "✓ 基準達成（≤ 15 W/m²）" : "✗ 基準未達（> 15 W/m²）"}
                    </span>
                  </div>
                </div>

                {/* Data integrity */}
                <div>
                  <div style={{ fontSize: 11, color: "#8b949e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    データの信頼性
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {site.proof_valid === true && (
                      <div style={{ color: "#3fb950" }}>
                        ✓ 数値が改ざんされていないことを数学的に検証済み
                        <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>
                          エネルギー計算の元データ（生センサー値）はエッジデバイス内に保持され、
                          外部に送信されることなく、計算結果のみが認証記録として保存されています。
                        </div>
                      </div>
                    )}
                    {site.proof_valid === false && (
                      <div style={{ color: "#f85149" }}>
                        ⚠ 認証データの整合性が確認できません
                        <div style={{ fontSize: 11, color: "#f85149", marginTop: 4, opacity: 0.8 }}>
                          申告されている認証レベルと、実際の計算証明が一致していません。
                          このデータに基づいて認証を発行することはできません。
                        </div>
                      </div>
                    )}
                    {site.proof_valid === null && (
                      <div style={{ color: "#8b949e" }}>
                        次世代の検証方式（SP1）への移行準備中です。現在は自動確認できません。
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit trail */}
                <div>
                  <div style={{ fontSize: 11, color: "#8b949e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    監査記録
                  </div>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>
                    <div>記録ID: <span style={{ fontFamily: "monospace", fontSize: 11 }}>{site.record_hash?.slice(0, 16) ?? "—"}…</span></div>
                    <div style={{ marginTop: 4 }}>この記録は改ざん防止ストレージに保存されており、後から変更・削除することはできません。</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#8b949e", fontSize: 13 }}>
                {site.error === "no runs"
                  ? "このサイトの認証記録がまだありません。"
                  : site.error === "no zk_proof in recent records"
                  ? "直近の記録に認証データが含まれていません。"
                  : `データ取得エラー: ${site.error}`}
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
  const tamperCount  = portfolio.sites.filter(s => s.proof_valid === false).length;
  const passCount    = portfolio.pass_count;
  const total        = portfolio.total_count;
  const honestTotal  = total - tamperCount;

  if (tamperCount > 0) {
    return (
      <div style={{
        display: "flex", gap: 16, padding: "16px 20px", borderRadius: 10, marginBottom: 20,
        border: "1px solid rgba(248,81,73,0.5)", background: "rgba(248,81,73,0.07)",
      }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>🚨</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f85149" }}>
            {tamperCount}件のデータ申告に問題が検出されました
          </div>
          <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
            信頼性が確認できた {honestTotal} 件のうち、{passCount} 件が BCA Green Mark 基準を満たしています。
            問題のある申告は認証対象から除外されます。
          </div>
        </div>
        <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: "#d29922",
          background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)",
          padding: "4px 12px", borderRadius: 12, whiteSpace: "nowrap" }}>
          🔒 記録は削除・変更不可
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
            ? `全 ${total} 件が BCA Green Mark 基準を達成しています`
            : `${total} 件中 ${passCount} 件が BCA Green Mark 基準を達成しています`}
        </div>
        <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
          すべての認証データの整合性が確認されています ·
          確認日時: {portfolio.generated_at.toLocaleString("ja-JP")}
        </div>
      </div>
      <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: "#d29922",
        background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.3)",
        padding: "4px 12px", borderRadius: 12, whiteSpace: "nowrap" }}>
        🔒 記録は削除・変更不可
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
    fetchPortfolioAttestation(selectedOperator, siteIds)
      .then(setPortfolio)
      .finally(() => setLoading(false));
  }, [selectedOperator, registry]);

  return (
    <div style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            BCA Green Mark 認証ポートフォリオ
          </h2>
          <span style={{
            background: "rgba(63,185,80,0.1)", color: "#3fb950",
            border: "1px solid rgba(63,185,80,0.3)", borderRadius: 12,
            fontSize: 11, fontWeight: 700, padding: "2px 10px",
          }}>
            改ざん防止記録
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#8b949e", margin: 0, lineHeight: 1.6 }}>
          エッジデバイスが収集したエネルギーデータをもとに、BCA Green Mark 2021 の基準適合状況を自動で検証します。
          生の計測値は外部に送信されず、計算結果の正当性のみが改ざん不可能な記録として保存されます。
        </p>
      </div>

      {registryError && (
        <div style={{ color: "#f85149", fontSize: 13, marginBottom: 16 }}>
          サイト一覧の取得に失敗しました: {registryError}
        </div>
      )}

      {/* Operator selector */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 13, color: "#8b949e" }}>事業者</label>
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
              {opId}（{sites.length} サイト）
            </option>
          ))}
          {!registry && operators.map(op => (
            <option key={op.operator_id} value={op.operator_id}>
              {op.operator_id}（{op.site_count} サイト）
            </option>
          ))}
        </select>
      </div>

      {/* Summary banner */}
      {portfolio && <SummaryBanner portfolio={portfolio} />}

      {/* Loading */}
      {loading && (
        <div style={{ color: "#8b949e", fontSize: 13, padding: "48px 0", textAlign: "center" }}>
          認証記録を確認中…
        </div>
      )}

      {/* Site table */}
      {portfolio && !loading && (
        <div style={{
          background: "#161b22", border: "1px solid #30363d", borderRadius: 10, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #30363d" }}>
                {[
                  { label: "サイト", width: "auto" },
                  { label: "認証レベル", width: 140 },
                  { label: "EUI (kWh/m²/年)", width: 130 },
                  { label: "認証ステータス", width: 160 },
                  { label: "最終確認日時", width: 130 },
                  { label: "", width: 32 },
                ].map(({ label, width }) => (
                  <th key={label} style={{
                    fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em",
                    color: "#8b949e", padding: "10px 16px", textAlign: "left", width,
                  }}>
                    {label}
                  </th>
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

      {/* Note at bottom */}
      <div style={{
        marginTop: 20, padding: "12px 16px",
        background: "rgba(88,166,255,0.04)", border: "1px solid rgba(88,166,255,0.15)",
        borderRadius: 8, fontSize: 12, color: "#8b949e", lineHeight: 1.6,
      }}>
        <span style={{ color: "#58a6ff", fontWeight: 600 }}>ℹ 仕組みについて</span>
        {" "}各サイトのエッジデバイスが計算した認証結果は、数学的証明とともに改ざん防止ストレージに記録されます。
        第三者機関（BCA）はこの記録を参照することで、生の計測データを受け取ることなく認証の正当性を確認できます。
        <a
          href={`/api/bca-portfolio/${encodeURIComponent(selectedOperator)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#58a6ff", marginLeft: 8 }}
        >
          JSON形式で出力 →
        </a>
      </div>
    </div>
  );
}
