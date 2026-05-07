import * as duckdb from "@duckdb/duckdb-wasm";
import type { BcaScenario } from "./fixtures.js";

// In local dev (wrangler pages dev), Pages Functions serve from the same origin.
// In production, use the deployed URL.
const DOCUMARIS_BCA_PARQUET_URL =
  typeof location !== "undefined" && location.hostname === "localhost"
    ? `${location.origin}/data/analytics/bca/bca_outlet_features.parquet`
    : "https://documaris.edgesentry.io/data/analytics/bca/bca_outlet_features.parquet";

export const DOCUMARIS_URL = "https://documaris.edgesentry.io";

// ── DuckDB singleton ──────────────────────────────────────────────────────────

let db: duckdb.AsyncDuckDB | null = null;

async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db;
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
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

async function getConn(): Promise<{ conn: duckdb.AsyncDuckDBConnection; close: () => Promise<void> }> {
  const d = await getDb();
  await d.registerFileURL("bca_outlets.parquet", DOCUMARIS_BCA_PARQUET_URL, duckdb.DuckDBDataProtocol.HTTP, false);
  const conn = await d.connect();
  return { conn, close: () => conn.close() };
}

// ── Row type ──────────────────────────────────────────────────────────────────

interface OutletRow {
  outlet_id: string;
  building_name: string;
  building_type: string;
  period_start: string;
  period_end: string;
  gross_floor_area_m2: number;
  eui_kwh_m2: number;
  chiller_cop: number;
  lpd_w_m2: number;
  water_l_m2: number;
  green_mark_target: string;
  certifying_body: string;
  compliance_score: number;
  alert_count: number;
}

function rowToOutlet(r: Record<string, unknown>): OutletRow {
  return {
    outlet_id:           String(r.outlet_id),
    building_name:       String(r.building_name),
    building_type:       String(r.building_type),
    period_start:        String(r.period_start),
    period_end:          String(r.period_end),
    gross_floor_area_m2: Number(r.gross_floor_area_m2),
    eui_kwh_m2:          Number(r.eui_kwh_m2),
    chiller_cop:         Number(r.chiller_cop),
    lpd_w_m2:            Number(r.lpd_w_m2),
    water_l_m2:          Number(r.water_l_m2),
    green_mark_target:   String(r.green_mark_target),
    certifying_body:     String(r.certifying_body),
    compliance_score:    Number(r.compliance_score),
    alert_count:         Number(r.alert_count),
  };
}

function outletToBcaScenario(o: OutletRow): BcaScenario {
  const header = "outlet_id,building_name,building_type,period_start,period_end,gross_floor_area_m2,eui_kwh_m2,chiller_cop,lpd_w_m2,water_l_m2,green_mark_target,certifying_body";
  const row = [
    o.outlet_id, o.building_name, o.building_type,
    o.period_start, o.period_end, o.gross_floor_area_m2,
    o.eui_kwh_m2, o.chiller_cop, o.lpd_w_m2, o.water_l_m2,
    o.green_mark_target, o.certifying_body,
  ].join(",");

  const alertCount = o.alert_count;
  const id = alertCount === 0 ? "BC1" : alertCount === 1 ? "BC2" : "BC3";

  return {
    id,
    label: o.green_mark_target,
    buildingName: o.building_name,
    outletId: o.outlet_id,
    description: alertCount === 0
      ? `All Section 4 metrics within Platinum targets. Score: ${o.compliance_score}/100.`
      : `${alertCount} metric(s) above threshold. Score: ${o.compliance_score}/100.`,
    expectReviewRequired: alertCount > 0,
    expectedAlerts: alertCount,
    csv: `${header}\n${row}`,
    complianceScore: o.compliance_score,
    alertCount: o.alert_count,
    euiKwhM2: o.eui_kwh_m2,
    chillerCop: o.chiller_cop,
    lpdWM2: o.lpd_w_m2,
  };
}

// ── Portfolio types ───────────────────────────────────────────────────────────

export interface OperatorSummary {
  operator_id: string;
  operator_name: string;
  site_count: number;
  compliant_count: number;
  needs_action_count: number;
  avg_eui: number;
  avg_compliance_score: number;
}

export interface SiteSummary {
  outlet_id: string;
  building_name: string;
  building_type: string;
  operator_id: string;
  operator_name: string;
  eui_kwh_m2: number;
  chiller_cop: number;
  lpd_w_m2: number;
  water_l_m2: number;
  green_mark_target: string;
  compliance_score: number;
  alert_count: number;
  period_start: string;
  period_end: string;
  gross_floor_area_m2: number;
  certifying_body: string;
}

// ── Portfolio helpers ─────────────────────────────────────────────────────────

export function siteSummaryToBcaScenario(site: SiteSummary): BcaScenario {
  const header = "outlet_id,building_name,building_type,period_start,period_end,gross_floor_area_m2,eui_kwh_m2,chiller_cop,lpd_w_m2,water_l_m2,green_mark_target,certifying_body";
  const row = [
    site.outlet_id, site.building_name, site.building_type,
    site.period_start, site.period_end, site.gross_floor_area_m2,
    site.eui_kwh_m2, site.chiller_cop, site.lpd_w_m2, site.water_l_m2,
    site.green_mark_target, site.certifying_body,
  ].join(",");

  const alertCount = site.alert_count;
  const id = alertCount === 0 ? "BC1" : alertCount === 1 ? "BC2" : "BC3";

  return {
    id,
    label: site.green_mark_target,
    buildingName: site.building_name,
    outletId: site.outlet_id,
    description: alertCount === 0
      ? `All Section 4 metrics within Platinum targets. Score: ${site.compliance_score}/100.`
      : `${alertCount} metric(s) above threshold. Score: ${site.compliance_score}/100.`,
    expectReviewRequired: alertCount > 0,
    expectedAlerts: alertCount,
    csv: `${header}\n${row}`,
    complianceScore: site.compliance_score,
    alertCount: site.alert_count,
    euiKwhM2: site.eui_kwh_m2,
    chillerCop: site.chiller_cop,
    lpdWM2: site.lpd_w_m2,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function loadBcaScenarios(): Promise<BcaScenario[]> {
  const { conn, close } = await getConn();
  try {
    const result = await conn.query(`
      SELECT outlet_id, building_name, building_type,
             period_start, period_end, gross_floor_area_m2,
             eui_kwh_m2, chiller_cop, lpd_w_m2, water_l_m2,
             green_mark_target, certifying_body,
             compliance_score, alert_count
      FROM parquet_scan('bca_outlets.parquet')
      ORDER BY compliance_score DESC
      LIMIT 20
    `);
    return result.toArray()
      .map((r) => rowToOutlet(r as Record<string, unknown>))
      .map(outletToBcaScenario);
  } finally {
    await close();
  }
}

export async function loadBcaScenarioByOutletId(outletId: string): Promise<BcaScenario | null> {
  const { conn, close } = await getConn();
  try {
    const result = await conn.query(`
      SELECT outlet_id, building_name, building_type,
             period_start, period_end, gross_floor_area_m2,
             eui_kwh_m2, chiller_cop, lpd_w_m2, water_l_m2,
             green_mark_target, certifying_body,
             compliance_score, alert_count
      FROM parquet_scan('bca_outlets.parquet')
      WHERE outlet_id = '${outletId}'
      LIMIT 1
    `);
    const rows = result.toArray();
    if (rows.length === 0) return null;
    return outletToBcaScenario(rowToOutlet(rows[0] as Record<string, unknown>));
  } finally {
    await close();
  }
}

export async function loadPortfolio(): Promise<OperatorSummary[]> {
  const { conn, close } = await getConn();
  try {
    const result = await conn.query(`
      SELECT operator_id, operator_name,
             COUNT(*) AS site_count,
             SUM(CASE WHEN alert_count = 0 THEN 1 ELSE 0 END) AS compliant_count,
             SUM(CASE WHEN alert_count > 0 THEN 1 ELSE 0 END) AS needs_action_count,
             ROUND(AVG(eui_kwh_m2), 1) AS avg_eui,
             ROUND(AVG(compliance_score), 0) AS avg_compliance_score
      FROM parquet_scan('bca_outlets.parquet')
      GROUP BY operator_id, operator_name
      ORDER BY operator_name
    `);
    return result.toArray().map((r) => {
      const row = r as Record<string, unknown>;
      return {
        operator_id:         String(row.operator_id),
        operator_name:       String(row.operator_name),
        site_count:          Number(row.site_count),
        compliant_count:     Number(row.compliant_count),
        needs_action_count:  Number(row.needs_action_count),
        avg_eui:             Number(row.avg_eui),
        avg_compliance_score: Number(row.avg_compliance_score),
      };
    });
  } finally {
    await close();
  }
}

export async function loadOperatorSites(operatorId: string): Promise<SiteSummary[]> {
  const { conn, close } = await getConn();
  try {
    const result = await conn.query(`
      SELECT outlet_id, building_name, building_type, operator_id, operator_name,
             eui_kwh_m2, chiller_cop, lpd_w_m2, water_l_m2,
             green_mark_target, compliance_score, alert_count,
             period_start, period_end, gross_floor_area_m2, certifying_body
      FROM parquet_scan('bca_outlets.parquet')
      WHERE operator_id = '${operatorId}'
      ORDER BY compliance_score DESC
    `);
    return result.toArray().map((r) => {
      const row = r as Record<string, unknown>;
      return {
        outlet_id:           String(row.outlet_id),
        building_name:       String(row.building_name),
        building_type:       String(row.building_type),
        operator_id:         String(row.operator_id),
        operator_name:       String(row.operator_name),
        eui_kwh_m2:          Number(row.eui_kwh_m2),
        chiller_cop:         Number(row.chiller_cop),
        lpd_w_m2:            Number(row.lpd_w_m2),
        water_l_m2:          Number(row.water_l_m2),
        green_mark_target:   String(row.green_mark_target),
        compliance_score:    Number(row.compliance_score),
        alert_count:         Number(row.alert_count),
        period_start:        String(row.period_start),
        period_end:          String(row.period_end),
        gross_floor_area_m2: Number(row.gross_floor_area_m2),
        certifying_body:     String(row.certifying_body),
      };
    });
  } finally {
    await close();
  }
}
