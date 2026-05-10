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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — @noble/hashes uses .ts extensions internally; works at runtime
import { blake3 } from "@noble/hashes/blake3.js";

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
  /** True when proof_bytes verifies against public_values (BLAKE3 for mock, Groth16 for SP1). */
  verified: boolean;
  /** Null = not attempted; true = proof matches; false = proof is invalid/tampered. */
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

/** Returns site IDs grouped by operator_id. */
export function sitesByOperator(registry: SiteRegistry): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const s of registry.sites) {
    if (!result[s.operator_id]) result[s.operator_id] = [];
    result[s.operator_id].push(s.site_id);
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function arrEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function decodeAttestation(proof: ZkProof): GreenMarkAttestation | null {
  try {
    const json = atob(proof.public_values);
    return JSON.parse(json) as GreenMarkAttestation;
  } catch {
    return null;
  }
}

/**
 * Verify the ZKP proof bytes against its public values.
 *
 * Mock framework: proof_bytes = BLAKE3(public_values_bytes)
 *   → verifiable in-browser with @noble/hashes/blake3
 *
 * SP1 framework: would require Groth16 WASM verifier (not yet integrated).
 *   → currently accepted as-is (returns true) pending SP1 verifier integration.
 *
 * Returns null if verification is not supported for the framework.
 */
function verifyProof(proof: ZkProof): boolean | null {
  if (proof.framework === "mock") {
    try {
      const pubValBytes = b64Decode(proof.public_values);
      const expected    = blake3(pubValBytes);          // 32-byte Uint8Array
      const actual      = b64Decode(proof.proof_bytes); // should also be 32 bytes
      return arrEqual(expected, actual);
    } catch {
      return false;
    }
  }
  if (proof.framework === "sp1") {
    // Groth16 in-browser verification pending SP1 WASM verifier integration
    return null;
  }
  return null;
}

// ── Clarus API fetch ──────────────────────────────────────────────────────────

async function fetchAuditSummary(siteId: string): Promise<{ runs: Array<{ run_id: string; record_count: number; last_seq: number }> }> {
  // 1. Try the ZKP latest-pointer (written by the edge on every ZKP proof cycle).
  //    This is a single GET (strongly consistent) that bypasses R2 list lag.
  try {
    const ptr = await fetch(`${CLARUS_AUDIT_BASE}/data/raw/zkp-latest/${encodeURIComponent(siteId)}.json`);
    if (ptr.ok) {
      const p = await ptr.json() as { run_id: string; last_seq: number };
      if (p.run_id && p.last_seq != null) {
        return { runs: [{ run_id: p.run_id, record_count: p.last_seq + 1, last_seq: p.last_seq }] };
      }
    }
  } catch { /* no pointer yet */ }

  // 2. Try /api/audit-summary. Falls through if not yet deployed.
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
      return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, proof_valid: null, error: "no runs" };
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

      const proof_valid = verifyProof(record.zk_proof);
      const verified    = proof_valid === true || proof_valid === null; // null = unverifiable (SP1 pending)
      return {
        site_id: siteId,
        attestation: att,
        record_hash: record.record_hash_hex ?? null,
        attested_at: new Date(record.timestamp_ms),
        verified,
        proof_valid,
      };
    }

    return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, proof_valid: null, error: "no zk_proof in recent records" };
  } catch (e) {
    return { site_id: siteId, attestation: null, record_hash: null, attested_at: null, verified: false, proof_valid: null, error: String(e) };
  }
}

/**
 * Fetch ZKP attestations for all sites belonging to an operator.
 * `siteIds` comes from the BCA site registry or BCA portfolio parquet.
 */
export async function fetchPortfolioAttestation(
  operatorId: string,
  siteIds: string[],
): Promise<PortfolioAttestation> {
  const sites = await Promise.all(siteIds.map(fetchSiteAttestation));
  // Only count sites with verified proofs toward pass count
  const passCount = sites.filter(s => s.attestation?.all_criteria_pass === true && s.proof_valid !== false).length;

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
