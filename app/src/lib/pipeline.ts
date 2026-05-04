import init, {
  parse_maritime_csv,
  fill,
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

export async function initPipeline(): Promise<void> {
  if (wasmReady) return;
  await init();
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
