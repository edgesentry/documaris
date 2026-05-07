/* tslint:disable */
/* eslint-disable */

/**
 * Build a deterministic DocumentAuditPayload from a FilledDocument.
 *
 * `filled_json`: FilledDocument JSON string (output of `fill()`)
 *
 * Returns: DocumentAuditPayload JSON string (fields sorted for stable BLAKE3 hashing).
 */
export function build_audit_payload(filled_json: string): string;

/**
 * Check a FilledDocument against a compliance rules JSON array.
 *
 * `filled_json`: FilledDocument JSON string (output of `fill()`)
 * `rules_json`: JSON array of rule objects
 *   e.g. [{"rule_id":"BWM_D2_EXPIRED","field":"bwm_certificate_expiry",
 *           "check":"not_expired","severity":"HIGH","regulation":"..."}]
 *
 * Returns: JSON array of ComplianceAlert objects, or throws on error.
 */
export function check(filled_json: string, rules_json: string): string;

/**
 * Compute the BLAKE3 hash of an arbitrary byte slice.
 * Returns the hash as a 64-char lowercase hex string.
 */
export function compute_hash(data: Uint8Array): string;

/**
 * Fill a FAL form template from a DocumentEntity JSON object.
 *
 * `entity_json`: single DocumentEntity (one element from `parse_maritime_csv` output)
 * `template`: "fal-form-1" | "fal-form-5" | "sg-port-entry"
 * `confidence_threshold`: fields below this score are flagged (0.0–1.0, default 0.80)
 *
 * Returns: FilledDocument JSON string, or throws on error.
 */
export function fill(entity_json: string, template: string, confidence_threshold: number): string;

/**
 * Fill a BCA Green Mark Section 4 form from a BcaOutletEntity JSON object.
 *
 * `entity_json`: single BcaOutletEntity (one element from `parse_bca_csv` output)
 * `confidence_threshold`: fields below this score are flagged (0.0–1.0, default 0.80)
 *
 * Returns: FilledDocument JSON string with template "sg-bca-greenmark", or throws on error.
 */
export function fill_bca(entity_json: string, confidence_threshold: number): string;

/**
 * Parse a BCA Green Mark outlet CSV string into a JSON array of BcaOutletEntity objects.
 *
 * Input: CSV text with header:
 * outlet_id,building_name,building_type,period_start,period_end,gross_floor_area_m2,eui_kwh_m2,chiller_cop,lpd_w_m2,water_l_m2,green_mark_target,certifying_body
 * Returns: JSON array string, or throws on parse error.
 */
export function parse_bca_csv(csv: string): string;

/**
 * Parse a maritime voyage CSV string into a JSON array of DocumentEntity objects.
 *
 * Input: CSV text (same format as `crates/edgesentry-document/fixtures/*.csv`)
 * Returns: JSON array string, or throws on parse error.
 */
export function parse_maritime_csv(csv: string): string;

/**
 * Render a FilledDocument into an HTML string using the named template.
 *
 * `filled_json`: FilledDocument JSON string (output of `fill()`)
 * `template`: "fal-form-1" | "fal-form-5" | "sg-port-entry"
 *
 * Returns: HTML string with {{FIELD}} placeholders substituted.
 */
export function render_html(filled_json: string, template: string): string;

/**
 * Seal a DocumentAuditPayload into a tamper-proof AuditRecord (BLAKE3 + Ed25519).
 *
 * `payload_json`: DocumentAuditPayload JSON string (output of `build_audit_payload()`)
 * `private_key_hex`: 64-char hex Ed25519 private key (from `eds audit keygen`)
 * `device_id`: identifier for the sealing device (e.g. "documaris-web-demo")
 *
 * Returns: AuditRecord JSON string, or throws on error.
 */
export function seal(payload_json: string, private_key_hex: string, device_id: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly build_audit_payload: (a: number, b: number) => [number, number, number, number];
    readonly check: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly compute_hash: (a: number, b: number) => [number, number];
    readonly fill: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly fill_bca: (a: number, b: number, c: number) => [number, number, number, number];
    readonly parse_bca_csv: (a: number, b: number) => [number, number, number, number];
    readonly parse_maritime_csv: (a: number, b: number) => [number, number, number, number];
    readonly render_html: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly seal: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
