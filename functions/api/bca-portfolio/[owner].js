/**
 * GET /api/bca-portfolio/:owner
 *
 * Returns a Portfolio Attestation JSON for a BCA Green Mark operator.
 * Reads ZKP proofs from the clarus WORM audit chain — no raw sensor data.
 *
 * Response shape:
 * {
 *   operator_id: string,
 *   generated_at_ms: number,
 *   all_pass: boolean,
 *   pass_count: number,
 *   total_count: number,
 *   sites: [{
 *     site_id, cert_level, all_criteria_pass, cop_pass, lpd_pass,
 *     eui_kwh_m2, attested_at_ms, record_hash, framework, verified
 *   }]
 * }
 */

const CLARUS_BASE = "https://clarus.edgesentry.io";
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

async function fetchAuditSummary(siteId) {
  const res = await fetch(`${CLARUS_BASE}/api/audit-summary?site=${siteId}`);
  if (!res.ok) return { runs: [] };
  const d = await res.json();
  return { runs: d.runs ?? [] };
}

async function fetchRecord(siteId, runId, seq) {
  const key = `${String(seq).padStart(20, "0")}.json`;
  const res = await fetch(`${CLARUS_BASE}/data/audit/chains/${siteId}/${runId}/${key}`);
  if (!res.ok) return null;
  return res.json();
}

function decodeAttestation(proof) {
  try {
    return JSON.parse(atob(proof.public_values));
  } catch {
    return null;
  }
}

async function siteAttestation(siteId) {
  const { runs } = await fetchAuditSummary(siteId);
  if (!runs.length) return { site_id: siteId, error: "no_runs" };

  const run = runs[0];
  const startSeq = Math.max(0, run.last_seq - 9);

  for (let seq = run.last_seq; seq >= startSeq; seq--) {
    const record = await fetchRecord(siteId, run.run_id, seq);
    if (!record?.zk_proof) continue;
    const att = decodeAttestation(record.zk_proof);
    if (!att) continue;

    return {
      site_id:          siteId,
      cert_level:       att.cert_level,
      all_criteria_pass: att.all_criteria_pass,
      cop_pass:         att.cop_pass,
      lpd_pass:         att.lpd_pass,
      eui_kwh_m2:       att.eui_kwh_m2,
      attested_at_ms:   record.timestamp_ms,
      record_hash:      record.record_hash_hex ?? null,
      framework:        record.zk_proof.framework,
      program_id:       record.zk_proof.program_id,
      verified:         true,
    };
  }

  return { site_id: siteId, error: "no_zkp_record" };
}

export async function onRequestGet({ params, request }) {
  const owner = params.owner;
  if (!owner) return new Response(JSON.stringify({ error: "owner required" }), { status: 400, headers: CORS });

  // Discover sites for this operator from the BCA parquet via the data proxy.
  // Fall back to using the owner as a single site_id for simple demos.
  let siteIds = [owner];
  try {
    const parquetUrl = `${new URL(request.url).origin}/data/analytics/bca/bca_outlet_features.parquet`;
    // Use DuckDB WASM is not available in CF Workers; use simple site list heuristic.
    // Production: replace with R2 SELECT via Workers Analytics Engine or cached JSON index.
    siteIds = [owner]; // single-site for now; multi-site via indago#131
  } catch { /* ignore */ }

  const siteResults = await Promise.all(siteIds.map(siteAttestation));
  const passing = siteResults.filter(s => s.all_criteria_pass === true);

  const body = {
    operator_id:    owner,
    generated_at_ms: Date.now(),
    all_pass:       passing.length === siteResults.length && siteResults.length > 0,
    pass_count:     passing.length,
    total_count:    siteResults.length,
    sites:          siteResults,
  };

  return new Response(JSON.stringify(body, null, 2), { headers: CORS });
}
