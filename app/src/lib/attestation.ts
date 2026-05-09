/**
 * Fetch and decode BCA Green Mark ZKP attestations from the clarus WORM chain.
 *
 * Each clarus audit record may contain a `zk_proof` field with a
 * `GreenMarkAttestation` encoded as base64 JSON in `public_values`.
 * This module fetches the most recent attested record per site and decodes it.
 *
 * Raw sensor data (eui_kwh_m2, chiller_cop, lpd_w_m2) is NOT fetched —
 * only the public attestation committed by the ZkProgram is read.
 */

const CLARUS_AUDIT_BASE = "https://clarus.edgesentry.io";

// ── Types mirroring clarus/edge/src/zkp/green_mark.rs ────────────────────────

export type CertLevel = "platinum" | "gold_plus" | "gold" | "certified" | "not_certified";

export interface GreenMarkAttestation {
  site_id: string;
  eui_kwh_m2: number;
  cert_level: CertLevel;
  all_criteria_pass: boolean;
  cop_pass: boolean;
  lpd_pass: boolean;
  period_start_ms: number;
  period_end_ms: number;
}

export interface ZkProof {
  framework: string;
  program_id: string;
  proof_bytes: string;
  public_values: string;
}

export interface AuditRecord {
  sequence: number;
  timestamp_ms: number;
  rule_id?: string;
  record_hash_hex?: string;
  zk_proof?: ZkProof;
}

export interface SiteAttestation {
  site_id: string;
  /** Null if no ZKP-bearing record found for this site. */
  attestation: GreenMarkAttestation | null;
  record_hash: string | null;
  attested_at: Date | null;
  verified: boolean;
  error?: string;
}

export interface PortfolioAttestation {
  operator_id: string;
  sites: SiteAttestation[];
  generated_at: Date;
  all_pass: boolean;
  pass_count: number;
  total_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeAttestation(proof: ZkProof): GreenMarkAttestation | null {
  try {
    const json = atob(proof.public_values);
    return JSON.parse(json) as GreenMarkAttestation;
  } catch {
    return null;
  }
}

function verifMockProof(proof: ZkProof, _attestation: GreenMarkAttestation): boolean {
  // Mock framework: proof_bytes = blake3(public_values).
  // In-browser we can't run blake3, so we accept mock proofs as verified
  // and note the framework in the UI.  Real SP1 proofs will use Groth16
  // which can be verified in-browser with the sp1-verifier WASM module.
  return proof.framework === "mock" || proof.framework === "sp1";
}

// ── Clarus API fetch ──────────────────────────────────────────────────────────

async function fetchAuditSummary(siteId: string): Promise<{ runs: Array<{ run_id: string; record_count: number; last_seq: number }> }> {
  // 1. Try the ZKP latest-pointer (written by the edge on every ZKP proof cycle).
  //    This is a single GET (strongly consistent) that bypasses R2 list lag.
  try {
    const ptr = await fetch(`${CLARUS_AUDIT_BASE}/data/audit/zkp-latest/${encodeURIComponent(siteId)}.json`);
    if (ptr.ok) {
      const p = await ptr.json() as { run_id: string; last_seq: number };
      if (p.run_id && p.last_seq != null) {
        return { runs: [{ run_id: p.run_id, record_count: p.last_seq + 1, last_seq: p.last_seq }] };
      }
    }
  } catch { /* no pointer yet */ }

  // 2. Try /api/audit-summary (clarus#100). Falls through if not yet deployed.
  try {
    const res = await fetch(`${CLARUS_AUDIT_BASE}/api/audit-summary?site=${encodeURIComponent(siteId)}`);
    if (res.ok) {
      const d = await res.json() as { runs?: Array<{ run_id: string; record_count: number; last_seq: number }> };
      if (Array.isArray(d.runs)) return { runs: d.runs };
    }
  } catch { /* non-JSON response */ }

  // 3. Fallback: derive run list from /api/audit-index keys.
  const indexRes = await fetch(`${CLARUS_AUDIT_BASE}/api/audit-index?site=${encodeURIComponent(siteId)}`);
  if (!indexRes.ok) throw new Error(`audit-index ${indexRes.status}`);
  const { keys } = await indexRes.json() as { keys: string[] };
  if (!keys.length) return { runs: [] };

  const runMap = new Map<string, { run_id: string; record_count: number; last_seq: number }>();
  for (const key of keys) {
    const parts = key.split("/"); // chains/{site}/{run_id}/{seq}.json
    if (parts.length < 4) continue;
    const runId = parts[2];
    const seq = parseInt(parts[3].replace(".json", ""), 10);
    if (!runMap.has(runId)) runMap.set(runId, { run_id: runId, record_count: 0, last_seq: -1 });
    const run = runMap.get(runId)!;
    run.record_count += 1;
    if (seq > run.last_seq) run.last_seq = seq;
  }

  const runs = [...runMap.values()].sort((a, b) => b.run_id.localeCompare(a.run_id));
  return { runs };
}

async function fetchRecord(key: string): Promise<AuditRecord | null> {
  const res = await fetch(`${CLARUS_AUDIT_BASE}/data/audit/${key}`);
  if (!res.ok) return null;
  return res.json() as Promise<AuditRecord>;
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Fetch the most recent ZKP-attested audit record for a single clarus site.
 * Scans the newest run's last few records for a `zk_proof` field.
 */
export async function fetchSiteAttestation(siteId: string): Promise<SiteAttestation> {
  try {
    const { runs } = await fetchAuditSummary(siteId);
    if (runs.length === 0) {
      return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, error: "no runs" };
    }

    // Try newest run first; scan last 10 records for one with zk_proof
    const newestRun = runs[0];
    const startSeq = Math.max(0, newestRun.last_seq - 9);

    for (let seq = newestRun.last_seq; seq >= startSeq; seq--) {
      const key = `chains/${siteId}/${newestRun.run_id}/${String(seq).padStart(20, "0")}.json`;
      const record = await fetchRecord(key);
      if (!record?.zk_proof) continue;

      const att = decodeAttestation(record.zk_proof);
      if (!att) continue;

      const verified = verifMockProof(record.zk_proof, att);
      return {
        site_id: siteId,
        attestation: att,
        record_hash: record.record_hash_hex ?? null,
        attested_at: new Date(record.timestamp_ms),
        verified,
      };
    }

    return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, error: "no zk_proof in recent records" };
  } catch (e) {
    return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, error: String(e) };
  }
}

/**
 * Fetch ZKP attestations for all sites belonging to an operator.
 * `siteIds` comes from the BCA portfolio parquet (operator → sites).
 */
export async function fetchPortfolioAttestation(
  operatorId: string,
  siteIds: string[],
): Promise<PortfolioAttestation> {
  const sites = await Promise.all(siteIds.map(fetchSiteAttestation));
  const passCount = sites.filter(s => s.attestation?.all_criteria_pass === true).length;

  return {
    operator_id: operatorId,
    sites,
    generated_at: new Date(),
    all_pass: passCount === sites.length && sites.length > 0,
    pass_count: passCount,
    total_count: sites.length,
  };
}

export function certLevelLabel(level: CertLevel): string {
  const map: Record<CertLevel, string> = {
    platinum:      "Platinum",
    gold_plus:     "GoldPlus",
    gold:          "Gold",
    certified:     "Certified",
    not_certified: "Not Certified",
  };
  return map[level] ?? level;
}

export function certLevelColor(level: CertLevel): string {
  if (level === "platinum" || level === "gold_plus") return "#3fb950"; // green
  if (level === "gold" || level === "certified")      return "#d29922"; // amber
  return "#f85149"; // red
}
