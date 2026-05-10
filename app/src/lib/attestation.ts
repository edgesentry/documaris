/**
 * Fetch BCA Green Mark compliance attestations from the clarus WORM chain.
 *
 * Reads the top-level `attestation` field written by the clarus edge daemon
 * on every BCA cycle. Falls back to `zk_proof.public_values` for records
 * written before clarus#124.
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

// Retained for backward compat with pre-clarus#124 records
interface ZkProof {
  framework: string;
  program_id: string;
  proof_bytes: string;
  public_values: string; // base64 JSON → GreenMarkAttestation
}

export interface AuditRecord {
  sequence: number;
  timestamp_ms: number;
  rule_id?: string;
  record_hash_hex?: string;
  attestation?: GreenMarkAttestation; // top-level field (clarus#124+)
  zk_proof?: ZkProof;                 // legacy field (pre-clarus#124)
}

export interface SiteAttestation {
  site_id: string;
  attestation: GreenMarkAttestation | null;
  record_hash: string | null;
  attested_at: Date | null;
  verified: boolean;
  /** Always null in new records (no ZKP in BCA path). Retained for compatibility. */
  proof_valid: boolean | null;
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

// ── Site registry ─────────────────────────────────────────────────────────────

export interface SiteRegistryEntry {
  site_id: string;
  name: string;
  operator_id: string;
  profile: string;
  e2e_scenario?: string;
}

export interface SiteRegistry {
  version: string;
  sites: SiteRegistryEntry[];
}

export async function fetchBcaSiteRegistry(): Promise<SiteRegistry> {
  const res = await fetch(`${CLARUS_AUDIT_BASE}/data/raw/registry/bca-sites.json`);
  if (!res.ok) throw new Error(`registry fetch failed: ${res.status}`);
  return res.json() as Promise<SiteRegistry>;
}

export function sitesByOperator(registry: SiteRegistry): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const s of registry.sites) {
    if (!result[s.operator_id]) result[s.operator_id] = [];
    result[s.operator_id].push(s.site_id);
  }
  return result;
}

// ── Clarus API fetch ──────────────────────────────────────────────────────────

async function fetchAuditSummary(siteId: string): Promise<{ runs: Array<{ run_id: string; record_count: number; last_seq: number }> }> {
  // 1. Try compliance-latest pointer (clarus#124+), then zkp-latest (legacy).
  for (const prefix of ["compliance-latest", "zkp-latest"]) {
    try {
      const ptr = await fetch(`${CLARUS_AUDIT_BASE}/data/raw/${prefix}/${encodeURIComponent(siteId)}.json`);
      if (ptr.ok) {
        const p = await ptr.json() as { run_id: string; last_seq: number };
        if (p.run_id && p.last_seq != null) {
          return { runs: [{ run_id: p.run_id, record_count: p.last_seq + 1, last_seq: p.last_seq }] };
        }
      }
    } catch { /* try next */ }
  }

  // 2. Try /api/audit-summary.
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
    const parts = key.split("/");
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

function extractAttestation(record: AuditRecord): GreenMarkAttestation | null {
  // New format (clarus#124+): top-level attestation field
  if (record.attestation) return record.attestation;
  // Legacy format: decode from zk_proof.public_values
  if (record.zk_proof) {
    try {
      return JSON.parse(atob(record.zk_proof.public_values)) as GreenMarkAttestation;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Fetch the most recent compliance attestation for a single clarus site.
 * Reads the top-level `attestation` field; falls back to `zk_proof.public_values`
 * for records written before clarus#124.
 */
export async function fetchSiteAttestation(siteId: string): Promise<SiteAttestation> {
  try {
    const { runs } = await fetchAuditSummary(siteId);
    if (runs.length === 0) {
      return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, proof_valid: null, error: "no runs" };
    }

    const newestRun = runs[0];
    const startSeq = Math.max(0, newestRun.last_seq - 9);

    for (let seq = newestRun.last_seq; seq >= startSeq; seq--) {
      const key = `chains/${siteId}/${newestRun.run_id}/${String(seq).padStart(20, "0")}.json`;
      const record = await fetchRecord(key);
      if (!record) continue;

      const att = extractAttestation(record);
      if (!att) continue;

      return {
        site_id: siteId,
        attestation: att,
        record_hash: record.record_hash_hex ?? null,
        attested_at: new Date(record.timestamp_ms),
        verified: true,
        proof_valid: null,
      };
    }

    return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, proof_valid: null, error: "no attestation in recent records" };
  } catch (e) {
    return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, proof_valid: null, error: String(e) };
  }
}

/**
 * Fetch compliance attestations for all sites belonging to an operator.
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
  if (level === "platinum" || level === "gold_plus") return "#3fb950";
  if (level === "gold" || level === "certified")      return "#d29922";
  return "#f85149";
}
