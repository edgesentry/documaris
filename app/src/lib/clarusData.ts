import * as duckdb from "@duckdb/duckdb-wasm";
import type { Scenario } from "./fixtures.js";

// Clarus public analytics endpoint — CORS open
const CLARUS_PARQUET_URL =
  "https://clarus-d5d.pages.dev/data/analytics/vessel_features_synthetic.parquet";

export const CLARUS_URL = "https://clarus-d5d.pages.dev";

// ── field derivation helpers ──────────────────────────────────────────────────

const CARGO_BY_TYPE: Record<string, { desc: string; hs: string; crew: number; gt: number }> = {
  "Bulk Carrier":    { desc: "Bulk grain and agricultural commodities", hs: "1001", crew: 22, gt: 45000 },
  "Container Ship":  { desc: "Containerised general merchandise",       hs: "8428", crew: 20, gt: 52000 },
  "Tanker":          { desc: "Crude petroleum oil",                      hs: "2709", crew: 25, gt: 80000 },
  "Other":           { desc: "goods",                                    hs: "",    crew: 0,  gt: 28000 },
};

const FLAG_ISO3: Record<string, string> = {
  Panama: "PAN", Malta: "MLT", Cyprus: "CYP", "Hong Kong": "HKG",
  Singapore: "SGP", Liberia: "LBR", "Marshall Islands": "MHL",
  Bahamas: "BHS", Greece: "GRC", Norway: "NOR",
};

function flagIso3(flag: string): string {
  return FLAG_ISO3[flag] ?? flag.slice(0, 3).toUpperCase();
}

function bwmExpiry(behavioralScore: number, aisGaps: number): string {
  // High risk (score > 60 OR many AIS gaps) → expired certificate
  if (behavioralScore > 60 || aisGaps > 10) return "2026-04-30";
  // Medium risk → near future
  if (behavioralScore > 30) return "2026-12-01";
  // Low risk → valid
  return "2027-06-01";
}

function arrivalDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

function vesselImo(mmsi: number): string {
  // No real IMO in the dataset — derive a plausible one from MMSI for demo
  return `IMO${String(mmsi).slice(-7).padStart(7, "0")}`;
}

// ── vessel row type ───────────────────────────────────────────────────────────

interface VesselRow {
  mmsi: number;
  vessel_name: string;
  flag_state: string;
  vessel_type: string;
  behavioral_score: number;
  ais_gap_count_30d: number;
  ais_gap_max_hours: number;
  sts_candidate_count: number;
}

// ── DuckDB init (singleton) ───────────────────────────────────────────────────

let db: duckdb.AsyncDuckDB | null = null;

async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db;
  // Use jsDelivr CDN bundles so the large WASM files (~35-41 MiB each) are
  // not included in the Cloudflare Pages deploy (25 MiB per-file limit).
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  // Worker must be loaded via blob URL to satisfy same-origin worker policy.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR);
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  URL.revokeObjectURL(workerUrl);
  return db;
}

// ── main export ───────────────────────────────────────────────────────────────

export async function loadClarusScenarios(): Promise<Scenario[]> {
  const db = await getDb();
  const conn = await db.connect();

  try {
    // Register the remote Parquet file
    await db.registerFileURL(
      "vessels.parquet",
      CLARUS_PARQUET_URL,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );

    const result = await conn.query(`
      WITH ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (ORDER BY behavioral_score DESC)  AS rn_high,
          ROW_NUMBER() OVER (ORDER BY behavioral_score ASC)   AS rn_low,
          ROW_NUMBER() OVER (
            ORDER BY ABS(behavioral_score - 40) ASC
          ) AS rn_mid
        FROM parquet_scan('vessels.parquet')
        WHERE vessel_name IS NOT NULL
      )
      SELECT mmsi, vessel_name, flag_state, vessel_type,
             behavioral_score, ais_gap_count_30d, ais_gap_max_hours,
             sts_candidate_count
      FROM ranked
      WHERE rn_high = 1 OR rn_low = 1 OR rn_mid = 1
      LIMIT 3
    `);

    const rows: VesselRow[] = result.toArray().map((r) => ({
      mmsi:               Number(r.mmsi),
      vessel_name:        String(r.vessel_name),
      flag_state:         String(r.flag_state),
      vessel_type:        String(r.vessel_type),
      behavioral_score:   Number(r.behavioral_score),
      ais_gap_count_30d:  Number(r.ais_gap_count_30d),
      ais_gap_max_hours:  Number(r.ais_gap_max_hours),
      sts_candidate_count: Number(r.sts_candidate_count),
    }));

    // Sort: highest risk first, then medium, then lowest
    rows.sort((a, b) => b.behavioral_score - a.behavioral_score);
    const [high, mid, low] = rows;

    return [
      vesselToScenario("TC1", low,  "Compliant voyage — all fields valid, 0 alerts expected."),
      vesselToScenario("TC2", high, `High-risk vessel — ${high.ais_gap_count_30d} AIS gaps in 30 days. BWM certificate expired.`),
      vesselToScenario("TC3", mid,  "Medium-risk vessel — vague cargo description, crew count missing."),
    ];
  } finally {
    await conn.close();
  }
}

function vesselToScenario(
  id: "TC1" | "TC2" | "TC3",
  v: VesselRow,
  description: string,
): Scenario {
  const cargo = CARGO_BY_TYPE[v.vessel_type] ?? CARGO_BY_TYPE["Other"];
  const bwm = bwmExpiry(v.behavioral_score, v.ais_gap_count_30d);
  const arrival = arrivalDate();
  const imo = vesselImo(v.mmsi);
  const flag = flagIso3(v.flag_state);

  // TC3: omit crew_count and use vague cargo to trigger low-confidence
  const isLowConf = id === "TC3";
  const cargoDesc = isLowConf ? "goods" : cargo.desc;
  const cargoHs   = isLowConf ? "" : cargo.hs;
  const crewCount = isLowConf ? "" : String(cargo.crew);

  const csv = [
    "voyage_id,vessel_name,vessel_imo,flag_state,port_of_arrival,arrival_date," +
    "cargo_description,cargo_hs_code,crew_count,gross_tonnage," +
    "bwm_certificate_expiry,dangerous_goods,quarantine_status",
    [
      `V-${v.mmsi}`, v.vessel_name, imo, flag, "SGSIN", arrival,
      cargoDesc, cargoHs, crewCount, String(cargo.gt),
      bwm, "false", "CLEAR",
    ].join(","),
  ].join("\n");

  const expectedAlerts = id === "TC1" ? 0 : 1;

  return {
    id,
    label: id === "TC1" ? "Compliant voyage"
         : id === "TC2" ? "BWM certificate expired"
         : "Low-confidence fields",
    vesselName: v.vessel_name,
    vesselImo: imo,
    mmsi: v.mmsi,
    behavioralScore: v.behavioral_score,
    aisGaps: v.ais_gap_count_30d,
    description,
    expectReviewRequired: id === "TC3",
    expectedAlerts,
    csv,
    clarusUrl: CLARUS_URL,
  };
}
