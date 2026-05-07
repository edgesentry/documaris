/**
 * Generate synthetic BCA Green Mark outlet features Parquet and upload to
 * documaris-dev-public-analytics R2 bucket.
 *
 * Usage:
 *   cd scripts && npm install && npm run generate-bca
 *
 * Output:
 *   bca_outlet_features.parquet  (local temp file, then uploaded)
 *   R2 key: bca_outlet_features.parquet
 *
 * Schema mirrors BcaOutletEntity in edgesentry-parse, plus derived fields
 * (compliance_score, alert_count) for the outlet selector UI.
 */

import { Database } from "duckdb-async";
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { resolve } from "path";

const OUT_FILE = resolve(import.meta.dirname, "bca_outlet_features.parquet");
const R2_BUCKET = "documaris-dev-public-analytics";
const R2_KEY = "bca_outlet_features.parquet";

// ── Synthetic outlet definitions ──────────────────────────────────────────────

const OUTLET_NAMES = [
  "Tampines Hub",
  "Woodlands Civic Centre",
  "Jurong West CC",
  "Bishan CC",
  "Ang Mo Kio Hub",
  "Bedok North",
  "Clementi CC",
  "Toa Payoh Hub",
  "Yishun CC",
  "Bukit Batok CC",
  "Sengkang CC",
  "Punggol Oasis",
  "Hougang CC",
  "Pasir Ris CC",
  "Sembawang CC",
  "Choa Chu Kang CC",
  "Queenstown CC",
  "Serangoon Central",
  "Buona Vista CC",
  "Marsiling CC",
];

// BCA Green Mark Platinum thresholds (BCA Green Mark 2021):
//   EUI ≤ 115 kWh/m²/year
//   Chiller COP ≤ 0.65 kW/RT  (higher COP = worse efficiency in kW/RT)
//   LPD ≤ 15 W/m²
const EUI_PLATINUM = 115;
const COP_PLATINUM = 0.65;
const LPD_PLATINUM = 15;

interface Outlet {
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

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateOutlets(): Outlet[] {
  const rand = seededRandom(42);
  const outlets: Outlet[] = [];

  for (let i = 0; i < OUTLET_NAMES.length; i++) {
    const idx = String(i + 1).padStart(3, "0");
    const outletId = `SP-OUTLET-${idx}`;
    const name = `Singapore Pools — ${OUTLET_NAMES[i]}`;

    // Randomise metrics with realistic variance around the Platinum threshold.
    // ~60% of outlets are compliant (below threshold), ~40% have issues.
    const compliant = rand() < 0.6;

    const eui = compliant
      ? 90 + rand() * 25          // 90–115 (under threshold)
      : 115 + rand() * 40;        // 115–155 (over threshold)

    const cop = compliant
      ? 0.55 + rand() * 0.10      // 0.55–0.65 (under threshold)
      : 0.65 + rand() * 0.20;     // 0.65–0.85 (over threshold)

    const lpd = compliant
      ? 10 + rand() * 5           // 10–15 (under threshold)
      : 15 + rand() * 8;          // 15–23 (over threshold)

    const water = 350 + rand() * 150;  // 350–500 L/m²/year
    const gfa = 2000 + rand() * 2000;  // 2000–4000 m²

    // Count BCA compliance failures
    const euiFail  = eui  > EUI_PLATINUM  ? 1 : 0;
    const copFail  = cop  > COP_PLATINUM  ? 1 : 0;
    const lpdFail  = lpd  > LPD_PLATINUM  ? 1 : 0;
    const alertCount = euiFail + copFail + lpdFail;

    // Score: 100 minus 20 per failed metric (rough proxy for demonstration)
    const complianceScore = Math.max(0, 100 - alertCount * 25 - rand() * 10);

    const target = alertCount === 0 ? "Platinum"
                 : alertCount === 1 ? "Gold+"
                 : "Gold";

    outlets.push({
      outlet_id: outletId,
      building_name: name,
      building_type: "Retail / Community",
      period_start: "2025-01-01",
      period_end: "2025-12-31",
      gross_floor_area_m2: Math.round(gfa),
      eui_kwh_m2: Math.round(eui * 10) / 10,
      chiller_cop: Math.round(cop * 100) / 100,
      lpd_w_m2: Math.round(lpd * 10) / 10,
      water_l_m2: Math.round(water * 10) / 10,
      green_mark_target: target,
      certifying_body: "BCA",
      compliance_score: Math.round(complianceScore),
      alert_count: alertCount,
    });
  }

  return outlets;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const outlets = generateOutlets();
  console.log(`Generated ${outlets.length} outlet records`);

  // Write Parquet via DuckDB
  const db = await Database.create(":memory:");

  // Build VALUES clause
  const values = outlets.map((o) => `(
    '${o.outlet_id}', '${o.building_name.replace(/'/g, "''")}',
    '${o.building_type}', '${o.period_start}', '${o.period_end}',
    ${o.gross_floor_area_m2}, ${o.eui_kwh_m2}, ${o.chiller_cop},
    ${o.lpd_w_m2}, ${o.water_l_m2}, '${o.green_mark_target}',
    '${o.certifying_body}', ${o.compliance_score}, ${o.alert_count}
  )`).join(",\n");

  await db.run(`
    COPY (
      SELECT * FROM (VALUES ${values}) AS t(
        outlet_id, building_name, building_type,
        period_start, period_end, gross_floor_area_m2,
        eui_kwh_m2, chiller_cop, lpd_w_m2, water_l_m2,
        green_mark_target, certifying_body,
        compliance_score, alert_count
      )
    ) TO '${OUT_FILE}' (FORMAT PARQUET)
  `);

  await db.close();
  console.log(`Written: ${OUT_FILE}`);

  // Upload to R2 via wrangler
  console.log(`Uploading to R2: ${R2_BUCKET}/${R2_KEY}`);
  execSync(
    `wrangler r2 object put "${R2_BUCKET}/${R2_KEY}" --file "${OUT_FILE}" --content-type application/octet-stream --remote`,
    { stdio: "inherit" }
  );

  // Clean up local file
  if (existsSync(OUT_FILE)) unlinkSync(OUT_FILE);
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
