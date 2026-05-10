/**
 * Enriches a BCA Green Mark HTML report with a ZKP attestation section.
 *
 * The base HTML is rendered by the edgesentry-rs WASM pipeline.
 * This module injects a tamper-evidence section that embeds the clarus
 * verify_url and record_hash so recipients can independently verify
 * the compliance claim without going through documaris.
 */

import {
  fetchSiteAttestation,
  certLevelLabel,
  certLevelColor,
  type SiteAttestation,
} from "./attestation.js";

const CLARUS_VERIFY_BASE = "https://clarus.edgesentry.io/api/verify";

export function verifyUrl(siteId: string): string {
  return `${CLARUS_VERIFY_BASE}?site=${encodeURIComponent(siteId)}`;
}

/**
 * Fetch the clarus attestation for a site and inject it into the rendered HTML.
 * Returns the enriched HTML regardless of attestation availability —
 * if clarus is unreachable, the document is still valid with a "not fetched" note.
 */
export async function enrichBcaHtml(html: string, siteId: string): Promise<string> {
  const attestation = await fetchSiteAttestation(siteId).catch(() => null);
  return injectAttestationSection(html, siteId, attestation);
}

/**
 * Inject the ZKP attestation section immediately before </body>.
 * Pure function — safe to test without network calls.
 */
export function injectAttestationSection(
  html: string,
  siteId: string,
  attestation: SiteAttestation | null,
): string {
  const section = buildAttestationSection(siteId, attestation);
  return html.replace("</body>", `${section}\n</body>`);
}

function buildAttestationSection(siteId: string, att: SiteAttestation | null): string {
  const url = verifyUrl(siteId);

  if (!att || att.attestation === null) {
    const reason = att?.error ?? "not fetched";
    return `
<div class="attestation-section attestation-unavailable">
  <div class="attestation-header">ZKP Attestation — Not Available</div>
  <p>Clarus attestation could not be retrieved for site <code>${escHtml(siteId)}</code> (${escHtml(reason)}).</p>
  <p>Verify independently: <a href="${escHtml(url)}">${escHtml(url)}</a></p>
</div>`;
  }

  const a = att.attestation;
  const level = certLevelLabel(a.cert_level);
  const color = certLevelColor(a.cert_level);
  const attestedAt = att.attested_at ? att.attested_at.toISOString().slice(0, 10) : "—";
  const recordHash = att.record_hash ?? "—";

  const proofBadge =
    att.proof_valid === true  ? `<span class="badge badge-ok">✓ Verified</span>` :
    att.proof_valid === false ? `<span class="badge badge-fail">✗ Tampered</span>` :
                                `<span class="badge badge-pending">~ Pending SP1</span>`;

  const criteriaRows = [
    ["EUI within threshold",   a.cert_level !== "not_certified" ? "✓" : "✗"],
    ["Chiller COP ≥ 0.65",     a.cop_pass ? "✓" : "✗"],
    ["LPD ≤ 15 W/m²",          a.lpd_pass ? "✓" : "✗"],
  ].map(([label, v]) =>
    `<tr><td>${label}</td><td class="${v === "✓" ? "pass" : "fail"}">${v}</td></tr>`
  ).join("\n");

  return `
<div class="attestation-section">
  <style>
    .attestation-section { margin: 24px 0; padding: 16px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 13px; }
    .attestation-header { font-weight: 700; font-size: 14px; margin-bottom: 12px; }
    .attestation-section table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    .attestation-section th { text-align: left; padding: 4px 8px; background: #f6f8fa; }
    .attestation-section td { padding: 4px 8px; }
    .attestation-section .pass { color: #1a7f37; font-weight: 600; }
    .attestation-section .fail { color: #cf222e; font-weight: 600; }
    .cert-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; color: #fff; font-weight: 700; font-size: 13px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-ok   { background: #dafbe1; color: #1a7f37; }
    .badge-fail { background: #ffebe9; color: #cf222e; }
    .badge-pending { background: #fff8c5; color: #9a6700; }
    .attestation-section .verify-url { font-size: 12px; color: #57606a; word-break: break-all; }
    .attestation-unavailable { background: #fff8c5; }
  </style>
  <div class="attestation-header">ZKP Attestation — Clarus Edge Chain</div>
  <table>
    <tr>
      <th>Certification level</th>
      <td><span class="cert-badge" style="background:${color}">${escHtml(level)}</span></td>
    </tr>
    <tr><th>All criteria pass</th><td>${a.all_criteria_pass ? "✓ Yes" : "✗ No"}</td></tr>
    <tr><th>Proof integrity</th><td>${proofBadge}</td></tr>
    <tr><th>Attested at</th><td>${escHtml(attestedAt)}</td></tr>
    <tr><th>Record hash</th><td><code style="font-size:11px">${escHtml(recordHash)}</code></td></tr>
  </table>
  <table>
    <tr><td colspan="2"><strong>Criteria detail</strong></td></tr>
    ${criteriaRows}
  </table>
  <p class="verify-url">
    Independent verification: <a href="${escHtml(url)}">${escHtml(url)}</a>
  </p>
</div>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
