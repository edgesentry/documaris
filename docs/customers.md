# documaris — Customer Analysis

**Date:** 2026-04-25
**Status:** Hypothesis-stage. Customer names and paid validation targets defined at M3 (Week 4 of PIER71 sprint).
**Closes:** [#6](https://github.com/edgesentry/documaris/issues/6)

---

## The core problem

When a vessel arrives at port, the master and ship agent face a coordination wall: crew lists, cargo manifests, customs declarations, health forms, and quarantine notices — each port demanding its own format, language, and submission window. The same data is manually re-keyed across multiple systems under time pressure, precisely when crew attention is needed for safety-critical operations.

**Consequence:** Errors trigger port detentions. Demurrage and penalties commonly range from USD 50,000 to USD 500,000 per incident. Agents operate in reactive firefighting mode with no tooling that understands port-specific compliance requirements before submission.

---

## Customer segments

### Segment 1 — Ship agents (primary)

**Who they are:** Intermediaries who handle port call documentation on behalf of shipowners and operators. A single agent may process dozens of port calls per week across multiple vessels.

**Scale:** Port of Singapore alone processes 140,000+ vessel calls per year. Each call requires coordinated submission to MPA, ICA, TradeNet (Singapore Customs), and SFA. The agent is responsible for all of them.

**Pain points:**

| Pain | Description | Consequence |
|---|---|---|
| Manual re-keying | The same voyage data (vessel, crew, cargo) is entered separately into each authority's system | Time cost estimated at 25–40 min per port call; error rate compounds with fatigue |
| Format fragmentation | Each port authority uses a different form, field naming, and submission channel | Agent must maintain a mental model of every port's requirements |
| No pre-submission check | Errors surface only after rejection by port authority | Triggers detention, delay, and demurrage charges |
| Reactive workflow | No alert when a regulation changes or a crew certificate is about to expire | Agent discovers the problem at submission time |

**Why documaris, not a workaround:**

- Excel / Word templates do not enforce compliance rules or alert on regulatory changes
- Existing voyage management platforms (Veson, Helm CONNECT) focus on commercial operations, not document assembly and port-authority-specific compliance
- No current tool generates Singapore port call packages (MPA + ICA + TradeNet + SFA) from a single data entry
- Offline generation is unavailable in server-dependent SaaS tools — a constraint when connectivity is limited

**Adoption trigger:** A single avoided detention (USD 50,000 minimum) justifies an annual subscription many times over. The financial ROI is computable and immediate.

---

### Segment 2 — Ship managers and operators

**Who they are:** Shore-side operations teams responsible for fleet compliance, crewing, and port scheduling. They do not submit documents directly but bear the cost when agents make errors.

**Pain points:**

| Pain | Description | Consequence |
|---|---|---|
| Crew fatigue from admin | Crew members complete forms during port approach — a safety-critical window | Compliance burden competes directly with navigation duties |
| Opaque fleet compliance status | No consolidated view of which vessels have submitted what, across 10–50 vessels | Operator learns of a problem from the port authority, not from their own system |
| Certificate expiry blindspot | Crew certificates (STCW, medical) expire without automated notice | Port state control deficiency; potential vessel detention |

**Why documaris:** Operators need a read-only dashboard view of fleet-wide compliance status without running a separate IT system. documaris generates documents from the same maridb data feed that powers arktrace, meaning the operator does not maintain a second data source.

---

### Segment 3 — Port authorities and customs (institutional, indirect)

**Who they are:** MPA Singapore, ICA, TradeNet/Singapore Customs, SFA. They receive declarations and verify vessel identity, crew, and cargo. They are not paying customers; they are the destination authority.

**Pain:** Inaccurate or unverifiable declarations create enforcement gaps. Shadow fleet operators exploit format inconsistencies to obscure vessel identity.

**Why documaris matters to them:** The Trust Layer (BLAKE3 hash + Ed25519 signature + AIS voyage evidence) makes document provenance verifiable. A port authority that receives a documaris-generated submission can cryptographically verify that the document was produced from a specific AIS track at a specific time — without accessing the originator's systems.

**Adoption path:** Port authority adoption is not a short-cycle sales motion. It is an institutional alignment play, aligned with MPA's Port+ digitalisation initiative and Singapore's TrustSG framework. This is a Phase 2+ objective, not an M0–M3 deliverable.

---

## Why must they use documaris specifically

The following table maps each customer pain to the specific documaris capability that addresses it — and to the differentiator that creates switching cost.

| Customer pain | documaris capability | Why competitors do not cover it |
|---|---|---|
| Re-keying across systems | Single data entry → all port-authority forms generated in one pass | Voyage management platforms do not model port-specific form schemas |
| No pre-submission check | Regulatory Alert: HIGH / MEDIUM / LOW flags before submission | No current tool applies a compliance rule engine to port-specific regulations |
| Offline requirement | WASM in-browser rendering; no server required for crew PII forms | SaaS platforms require active connectivity |
| Audit trail / document authenticity | Trust Layer: BLAKE3 hash + Ed25519 signature + AIS voyage evidence | No current tool binds a document to a verifiable AIS track |
| Crew certificate expiry | Regulatory Alert monitors certificate validity against voyage schedule | Handled separately in crewing systems, not integrated with document generation |

---

## What remains unvalidated (honest accounting)

The following are design hypotheses that will be validated at M3 (Week 4 of the PIER71 sprint):

| Hypothesis | Validation method | Target |
|---|---|---|
| Baseline document creation time is ~32 min per port call | Timed session with a Singapore ship agent on the current workflow | Confirmed baseline before measuring reduction |
| Port-authority rejection / rework rate is ~18% | Log review with ship agent across 20 sample port calls | Confirmed baseline |
| Regulatory Alert precision ≥ 90% | 20-case audit: fraction of HIGH alerts that correspond to a real rule violation | ≥ 90% precision |
| Ship agents will adopt a free FAL form tool as an on-ramp | Interview with 3 agents; attempt to use M0 live demo | At least 1 agent willing to run a live port call through M0 |

The PoC does not depend on these numbers being validated before the platform is built. AUROC-equivalent quality gates are defined in `roadmap.md` and will be measured at M3.

---

## Open questions

1. **Who is the economic buyer vs. the daily user?** In a ship agency, the operations manager approves SaaS subscriptions; the documentation clerk uses the tool. Sales motion targets the manager; onboarding targets the clerk.
2. **What is the switching cost from the current workflow?** If an agent's current workflow is Excel + email, switching cost is low. If they have a vendor-integrated system (e.g., integrated with a shipowner's ERP), switching cost is higher.
3. **Does MPA Singapore have a preferred submission channel?** If MPA Port+ mandates a specific API or format, documaris must integrate with it — or become an upstream generator that feeds the mandated channel.
4. **Who owns regulatory KB updates?** Port regulations change. The Regulatory Alert is only as good as the knowledge base that powers it. Ownership of ongoing KB maintenance is unresolved (see `roadmap.md` open question #6).
