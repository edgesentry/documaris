import { describe, it, expect } from "vitest";
import { injectAttestationSection, verifyUrl } from "./bca-attestation.js";
import type { SiteAttestation } from "./attestation.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAttestation(overrides: Partial<SiteAttestation> = {}): SiteAttestation {
  return {
    site_id:     "MCH-OUTLET-042",
    attestation: {
      site_id:           "MCH-OUTLET-042",
      eui_kwh_m2:        105.0,
      cert_level:        "gold",
      all_criteria_pass: true,
      cop_pass:          true,
      lpd_pass:          true,
      period_start_ms:   1_000_000,
      period_end_ms:     2_000_000,
    },
    record_hash:  "a".repeat(64),
    attested_at:  new Date("2026-05-10T00:00:00Z"),
    verified:     true,
    proof_valid:  true,
    ...overrides,
  };
}

const BASE_HTML = "<html><body><p>Report</p></body></html>";

// ── verifyUrl ─────────────────────────────────────────────────────────────────

describe("verifyUrl", () => {
  it("returns clarus verify URL for a site", () => {
    const url = verifyUrl("MCH-OUTLET-042");
    expect(url).toBe("https://clarus.edgesentry.io/api/verify?site=MCH-OUTLET-042");
  });

  it("encodes special characters in site ID", () => {
    const url = verifyUrl("BLD HIGHUSE/FAIL");
    expect(url).toContain("BLD%20HIGHUSE%2FFAIL");
  });
});

// ── injectAttestationSection ──────────────────────────────────────────────────

describe("injectAttestationSection", () => {
  it("injects section before </body>", () => {
    const html = injectAttestationSection(BASE_HTML, "MCH-OUTLET-042", makeAttestation());
    expect(html).toContain("</body>");
    expect(html.indexOf("attestation-section")).toBeLessThan(html.indexOf("</body>"));
  });

  it("includes verify_url for the site", () => {
    const html = injectAttestationSection(BASE_HTML, "MCH-OUTLET-042", makeAttestation());
    expect(html).toContain("clarus.edgesentry.io/api/verify?site=MCH-OUTLET-042");
  });

  it("shows Gold cert level with correct label", () => {
    const html = injectAttestationSection(BASE_HTML, "MCH-OUTLET-042", makeAttestation());
    expect(html).toContain("Gold");
  });

  it("shows Platinum cert level", () => {
    const att = makeAttestation({ attestation: { ...makeAttestation().attestation!, cert_level: "platinum", eui_kwh_m2: 70 } });
    const html = injectAttestationSection(BASE_HTML, "SITE-A", att);
    expect(html).toContain("Platinum");
  });

  it("shows ✓ Verified badge when proof_valid is true", () => {
    const html = injectAttestationSection(BASE_HTML, "MCH-OUTLET-042", makeAttestation({ proof_valid: true }));
    expect(html).toContain("✓ Verified");
  });

  it("shows ✗ Tampered badge when proof_valid is false", () => {
    const att = makeAttestation({ proof_valid: false });
    const html = injectAttestationSection(BASE_HTML, "BLD-TAMPER", att);
    expect(html).toContain("✗ Tampered");
  });

  it("shows ~ Pending SP1 badge when proof_valid is null", () => {
    const att = makeAttestation({ proof_valid: null });
    const html = injectAttestationSection(BASE_HTML, "SITE-A", att);
    expect(html).toContain("Pending SP1");
  });

  it("shows criteria pass/fail for COP", () => {
    const att = makeAttestation({
      attestation: { ...makeAttestation().attestation!, cop_pass: false, all_criteria_pass: false },
    });
    const html = injectAttestationSection(BASE_HTML, "SITE-A", att);
    expect(html).toContain("Chiller COP");
  });

  it("includes record_hash", () => {
    const html = injectAttestationSection(BASE_HTML, "MCH-OUTLET-042", makeAttestation());
    expect(html).toContain("a".repeat(64));
  });

  it("shows unavailable section when attestation is null", () => {
    const att: SiteAttestation = {
      site_id: "SITE-A", attestation: null, record_hash: null,
      attested_at: null, verified: false, proof_valid: null, error: "no_zkp_record",
    };
    const html = injectAttestationSection(BASE_HTML, "SITE-A", att);
    expect(html).toContain("Not Available");
    expect(html).toContain("no_zkp_record");
    expect(html).toContain("clarus.edgesentry.io/api/verify?site=SITE-A");
  });

  it("shows unavailable section when attestation fetch failed (null passed)", () => {
    const html = injectAttestationSection(BASE_HTML, "SITE-A", null);
    expect(html).toContain("Not Available");
    expect(html).toContain("not fetched");
  });

  it("escapes HTML in site_id to prevent XSS", () => {
    const att: SiteAttestation = {
      site_id: "<script>alert(1)</script>", attestation: null, record_hash: null,
      attested_at: null, verified: false, proof_valid: null,
    };
    const html = injectAttestationSection(BASE_HTML, "<script>alert(1)</script>", att);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("preserves original HTML content", () => {
    const html = injectAttestationSection(BASE_HTML, "MCH-OUTLET-042", makeAttestation());
    expect(html).toContain("<p>Report</p>");
  });
});
