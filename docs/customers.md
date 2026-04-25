# documaris — Customer Analysis

**Date:** 2026-04-25
**Status:** Hypothesis-stage. Named pilot customer to be confirmed at M3 (Week 4).
**Closes:** [#6](https://github.com/edgesentry/documaris/issues/6)
**PIER71 priority note:** Customer and use case selection below is ordered by expected impact on PIER71-11 acceptance. The primary evaluators are MPA Singapore officials; use cases that directly reduce MPA's own operational burden score highest.

---

## The core problem

When a vessel arrives at Port of Singapore, the ship agent faces a four-agency coordination wall: MPA Port+ (vessel arrival/departure), ICA (crew immigration), Singapore Customs / TradeNet (cargo declaration), and SFA (food safety, if applicable). Each authority uses a different form, field naming, and submission channel. The same voyage data is manually re-keyed four times, under a tight pre-arrival window, with errors triggering port detentions that cost USD 50,000–500,000 per incident.

Singapore processes 140,000+ vessel calls per year. Every one of them has this problem.

---

## Customer priority order (PIER71-optimised)

### Priority 1 — Singapore ship agent managing MPA Port+ submissions ★★★

**Why this segment maximises PIER71 acceptance:**
MPA Singapore runs PIER71. The 140,000 annual port calls are MPA's own operational environment. A solution that reduces error rate and submission time for Singapore ship agents directly solves a problem MPA's Port Operations department sees every day. This is not a third-party market claim — it is MPA's own data.

**Who they are:** Agents who handle port call submissions on behalf of shipowners for vessels calling at Singapore. A mid-size agency may process 20–100 vessel calls per month.

**Pain points:**

| Pain | Singapore-specific detail |
|---|---|
| Four-agency submission | MPA Port+, ICA, TradeNet, SFA each require separate logins, formats, and timing windows |
| Pre-arrival window pressure | MPA requires notification 24–48 hours before arrival; ICA crew list must be pre-cleared; errors at T-24h cascade |
| Regulatory change lag | MPA issues Port Marine Circulars irregularly; agents track changes manually or miss them |
| No consolidated view | Agent has no single view of submission status across all four agencies for a single port call |

**Use case for PIER71 demo (highest evaluator impact):**
> Agent enters vessel + voyage data once → documaris generates MPA General Declaration (FAL Form 1), Crew List (FAL Form 5), and Singapore Port Entry Package (MPA Port+ fields + ICA pre-clearance fields) simultaneously → Regulatory Alert flags an expired Ballast Water Management certificate as HIGH before submission → PDF package downloaded with BLAKE3 hash + AIS voyage evidence appended.

**Why documaris, not alternatives:**
- MPA's own Port+ system receives documents but does not generate them — there is no MPA-provided tool for agents to create the submission package
- Voyage management platforms (Veson, Helm CONNECT) handle commercial operations, not port-authority-specific form assembly
- A single avoided detention in Singapore justifies an annual subscription 10× over

---

### Priority 2 — MPA Singapore / Port+ programme as institutional pilot target ★★★

**Why this matters for PIER71:**
PIER71 is explicitly designed to identify solutions that MPA can adopt or endorse. A solution that MPA can point to as "we validated this against our Port+ data" scores on Criterion 5 (Real-World Validation) and Criterion 9 (Domain Mastery) simultaneously.

**What MPA cares about:**
- Reducing inbound submission errors that burden Port Operations staff
- Advancing Singapore's paperless port initiative (Port+ is MPA's own digitalisation programme)
- Anti-shadow-fleet document integrity — MPA's MPOL programme is the institutional counterpart to arktrace

**documaris value to MPA directly:**
The Trust Layer (BLAKE3 + Ed25519 + AIS voyage evidence) allows MPA to cryptographically verify that a submitted document was generated from a specific AIS track at a specific time. This directly addresses false declarations — a known concern for vessels operating in the shadow fleet evasion routes through the Malacca Strait.

**PIER71 pitch framing:**
> "documaris is the document layer of the same data infrastructure that arktrace uses for shadow fleet detection. A vessel that arktrace flags as high-risk generates a port call document with a verifiable AIS trail that MPA can cross-check against the MPOL intercept record — closing the loop between vessel tracking and port compliance in a single audit event."

This connection to arktrace is unique. No competitor can make this claim.

---

### Priority 3 — Ship managers / operators (fleet-level) ★★

**Who they are:** Shore-side operations teams managing 10–50 vessels. They do not submit documents themselves but own the compliance responsibility.

**Pain:** No consolidated fleet compliance view. Certificate expiry (STCW, medical, BWM) is tracked in separate crewing systems that do not connect to port call submission workflows.

**Use case:** Fleet operations manager sees a dashboard of upcoming port calls flagged by Regulatory Alert — three vessels have BWM certificates expiring within the port call window; one is already HIGH severity. No agent needs to be called; the alert is visible before the pre-arrival window opens.

**PIER71 relevance:** Supports Criterion 6 (Operational Scalability) — documaris scales from a single agent to a fleet operator without changing architecture. The same WASM pipeline serves 1 vessel or 500.

---

### Priority 4 — Port authorities / customs (institutional, indirect) ★

**Who they are:** MPA, ICA, Singapore Customs. They receive declarations; they are not paying customers.

**Why they matter for PIER71:** If an evaluator from MPA Port Operations sees that documaris generates submissions that are cryptographically verifiable — and that this directly reduces false declarations — it provides institutional credibility that no ship agent reference can match.

**Note:** Port authority adoption is a Phase 2+ play. It is not an M0–M5 deliverable. It should be framed as the long-term institutional outcome, not the near-term customer.

---

## Use cases ranked by PIER71 evaluator impact

| Rank | Use case | Criterion addressed | Demo feasibility at M3 |
|---|---|---|---|
| 1 | Singapore port entry package (MPA + ICA + TradeNet) from single data entry | 1 (Urgency), 5 (Validation), 9 (Domain) | Yes — field map + mock data |
| 2 | Regulatory Alert: HIGH on expired BWM cert blocks submission | 1 (Urgency), 3 (Competitive advantage), 9 (Domain) | Yes — seed KB with real MPA circular |
| 3 | AIS Voyage Evidence appended to port call package (arktrace connection) | 8 (IP/Defensibility), 9 (Domain), 10 (IO-11) | Yes — maridb AIS data → signed summary |
| 4 | Cryptographic verify endpoint: `GET /audit/verify?hash=` returns voyage record | 2 (Market), 8 (IP), 10 (IO-02) | Yes — Trust Layer M2 deliverable |
| 5 | Offline FAL Form 5 generation (PWA, no server) | 3 (Competitive advantage), 6 (Scalability) | M1 Should / M2 stretch |
| 6 | Fleet compliance dashboard (multi-vessel Regulatory Alert view) | 6 (Scalability), 7 (Business model) | Phase 2 — not M0–M5 |

---

## What remains unvalidated

| Hypothesis | Validation method | When |
|---|---|---|
| Baseline document creation time is ~32 min per Singapore port call | Timed session with a Singapore ship agent on current workflow | M3 (Week 4) |
| Port-authority rework / rejection rate is ~18% | Log review with ship agent across 20 sample port calls | M3 (Week 4) |
| Regulatory Alert precision ≥ 90% on Singapore rules | 20-case audit against real MPA Port Marine Circulars | M3 (Week 4) |
| Ship agents will adopt a free FAL form tool as an on-ramp to Singapore subscription | Interview with ≥ 3 Singapore agents; attempt live port call through M0 demo | M3 (Week 4) |
| MPA Port Operations staff will engage as a pilot via PIER71 introduction | PIER71 programme contact facilitation | M4–M5 |

---

## Open questions

1. **Who is the economic buyer vs. the daily user?** Operations manager approves subscription; documentation clerk uses the tool. Sales motion targets the manager; onboarding targets the clerk.
2. **Does MPA's Port+ system expose an API for documaris to submit directly?** If yes, documaris becomes a generation + submission tool, not just a generation tool — significantly raising value and switching cost.
3. **Who owns Regulatory KB updates?** Port regulations change. The Regulatory Alert is only as good as the knowledge base. Ownership of ongoing KB maintenance is unresolved — see `roadmap.md` open question #6.
4. **Can arktrace watchlist data feed a "document risk flag" in documaris?** If a vessel is on the arktrace high-risk watchlist, documaris could surface a warning at document generation time — before MPA sees the submission. This closes the arktrace → documaris loop and creates a uniquely defensible integration.
