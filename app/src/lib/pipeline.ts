import init, {
  parse_maritime_csv,
  fill,
  fill_bca,
  parse_bca_csv,
  check,
  render_html,
  build_audit_payload,
  seal,
} from "../wasm-pkg/edgesentry_wasm.js";
import { SG_PORT_COMPLIANCE_RULES } from "./fixtures.js";

export interface FieldValue {
  value: string | null;
  confidence: number;
  flagged: boolean;
  source: string;
}

export interface FilledDocument {
  voyage_id: string;
  template: string;
  fields: Record<string, FieldValue>;
  review_required: boolean;
}

export interface ComplianceAlert {
  rule_id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  field: string;
  message: string;
  regulation: string;
  voyage_id: string;
}

export interface AuditRecord {
  device_id: string;
  sequence: number;
  timestamp_ms: number;
  payload_hash: number[];
  signature: number[];
  prev_record_hash: number[];
}

export interface PipelineResult {
  filled: FilledDocument;
  alerts: ComplianceAlert[];
  html: string;
  auditRecord: AuditRecord;
  payloadHash: string;
  durationMs: number;
}

// Demo signing key (public key visible in UI — this is a demo, not a secret)
const DEMO_PRIVATE_KEY =
  "0101010101010101010101010101010101010101010101010101010101010101";

let wasmReady = false;

export async function initPipeline(
  wasmInput?: Parameters<typeof init>[0]
): Promise<void> {
  if (wasmReady) return;
  await init(wasmInput);
  wasmReady = true;
}

export async function runPipeline(csv: string): Promise<PipelineResult> {
  await initPipeline();

  const t0 = performance.now();

  // 1. Parse CSV → DocumentEntity[]
  const entitiesJson = parse_maritime_csv(csv);
  const entities = JSON.parse(entitiesJson) as unknown[];
  if (entities.length === 0) throw new Error("No entities parsed from CSV");
  const entityJson = JSON.stringify(entities[0]);

  // 2. Fill fields (confidence threshold 0.80)
  const filledJson = fill(entityJson, "fal-form-1", 0.8);
  const filled = JSON.parse(filledJson) as FilledDocument;

  // 3. Compliance check
  const alertsJson = check(filledJson, SG_PORT_COMPLIANCE_RULES);
  const alerts = JSON.parse(alertsJson) as ComplianceAlert[];

  // 4. Render FAL Form 1 HTML
  const html = render_html(filledJson, "fal-form-1");

  // 5. Build + seal audit payload
  const payloadJson = build_audit_payload(filledJson);
  const auditJson = seal(payloadJson, DEMO_PRIVATE_KEY, "documaris-demo");
  const auditRecord = JSON.parse(auditJson) as AuditRecord;

  // Convert payload_hash bytes → hex string
  const payloadHash = Array.from(auditRecord.payload_hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const durationMs = Math.round(performance.now() - t0);

  return { filled, alerts, html, auditRecord, payloadHash, durationMs };
}

export interface BcaPipelineResult {
  filled: FilledDocument;
  alerts: ComplianceAlert[];
  html: string;
  auditRecord: AuditRecord;
  payloadHash: string;
  durationMs: number;
}

export const BCA_GREEN_MARK_RULES = JSON.stringify([
  {
    rule_id: "EUI_DATA_PRESENT",
    field: "eui_kwh_m2",
    check: "not_null",
    severity: "HIGH",
    regulation: "BCA Green Mark 2021 — Section 4.1: EUI data is mandatory for all submissions.",
  },
  {
    rule_id: "EUI_PLATINUM_EXCEEDED",
    field: "eui_kwh_m2",
    check: "above_threshold",
    threshold: 115.0,
    severity: "HIGH",
    regulation: "BCA Green Mark 2021 — Section 4.1: EUI must be ≤ 115 kWh/m²/year for Platinum certification.",
  },
  {
    rule_id: "CHILLER_COP_PRESENT",
    field: "chiller_cop",
    check: "not_null",
    severity: "HIGH",
    regulation: "BCA Green Mark 2021 — Section 4.2: Chiller COP data is mandatory.",
  },
  {
    rule_id: "CHILLER_COP_EXCEEDED",
    field: "chiller_cop",
    check: "above_threshold",
    threshold: 0.65,
    severity: "HIGH",
    regulation: "BCA Green Mark 2021 — Section 4.2: Chiller plant efficiency must be ≤ 0.65 kW/RT for Platinum.",
  },
  {
    rule_id: "LPD_DATA_PRESENT",
    field: "lpd_w_m2",
    check: "not_null",
    severity: "HIGH",
    regulation: "BCA Green Mark 2021 — Section 4.3: LPD data is mandatory.",
  },
  {
    rule_id: "LPD_PLATINUM_EXCEEDED",
    field: "lpd_w_m2",
    check: "above_threshold",
    threshold: 15.0,
    severity: "HIGH",
    regulation: "BCA Green Mark 2021 — Section 4.3: LPD must be ≤ 15 W/m² for Platinum certification.",
  },
  {
    rule_id: "AUDIT_PERIOD_START_PRESENT",
    field: "period_start",
    check: "not_null",
    severity: "MEDIUM",
    regulation: "BCA Green Mark 2021 — Section 2: Audit period start date is required.",
  },
  {
    rule_id: "AUDIT_PERIOD_END_PRESENT",
    field: "period_end",
    check: "not_null",
    severity: "MEDIUM",
    regulation: "BCA Green Mark 2021 — Section 2: Audit period end date is required.",
  },
]);

export async function runBcaPipeline(csv: string): Promise<BcaPipelineResult> {
  // Architecture proof: steps 3–5 are byte-for-byte identical to runPipeline().
  // Only parse_bca_csv → fill_bca → render_html("sg-bca-greenmark") differ.
  // check(), build_audit_payload(), seal() are profile-agnostic.
  await initPipeline();
  const t0 = performance.now();

  // 1. Parse CSV → BcaOutletEntity[]
  const entitiesJson = parse_bca_csv(csv);
  const entities = JSON.parse(entitiesJson) as unknown[];
  if (entities.length === 0) throw new Error("No entities parsed from BCA CSV");
  const entityJson = JSON.stringify(entities[0]);

  // 2. Fill fields (confidence threshold 0.80)
  const filledJson = fill_bca(entityJson, 0.8);
  const filled = JSON.parse(filledJson) as FilledDocument;

  // 3. Compliance check — SAME call as maritime
  const alertsJson = check(filledJson, BCA_GREEN_MARK_RULES);
  const alerts = JSON.parse(alertsJson) as ComplianceAlert[];

  // Propagate compliance alerts into review_required so the warning banner shows
  const hasHighAlerts = alerts.some((a) => a.severity === "HIGH");
  const filledWithReview: FilledDocument = hasHighAlerts
    ? { ...filled, review_required: true }
    : filled;

  // 4. Render BCA form HTML
  const html = render_html(filledJson, "sg-bca-greenmark");

  // 5. Build + seal audit payload — SAME call as maritime
  const payloadJson = build_audit_payload(JSON.stringify(filledWithReview));
  const auditJson = seal(payloadJson, DEMO_PRIVATE_KEY, "documaris-demo");
  const auditRecord = JSON.parse(auditJson) as AuditRecord;

  const payloadHash = Array.from(auditRecord.payload_hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const durationMs = Math.round(performance.now() - t0);
  return { filled: filledWithReview, alerts, html, auditRecord, payloadHash, durationMs };
}
