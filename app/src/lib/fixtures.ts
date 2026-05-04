export interface Scenario {
  id: "TC1" | "TC2" | "TC3";
  label: string;
  vesselName: string;
  vesselImo: string;
  description: string;
  expectReviewRequired: boolean;
  expectedAlerts: number;
  csv: string;
  // clarus fields — present when loaded from live data
  mmsi?: number;
  behavioralScore?: number;
  aisGaps?: number;
  clarusUrl?: string;
}

const HEADER =
  "voyage_id,vessel_name,vessel_imo,flag_state,port_of_arrival,arrival_date,cargo_description,cargo_hs_code,crew_count,gross_tonnage,bwm_certificate_expiry,dangerous_goods,quarantine_status";

export const SCENARIOS: Scenario[] = [
  {
    id: "TC1",
    label: "Compliant voyage",
    vesselName: "MV Horizon",
    vesselImo: "IMO9876543",
    description: "All fields valid, BWM certificate current. Expect 0 alerts.",
    expectReviewRequired: false,
    expectedAlerts: 0,
    csv: `${HEADER}\nV001,MV Horizon,IMO9876543,SGP,SGSIN,2026-06-15,General industrial machinery and spare parts,8428,23,45000,2027-03-01,false,CLEAR`,
  },
  {
    id: "TC2",
    label: "BWM certificate expired",
    vesselName: "MV Pacific Star",
    vesselImo: "IMO1234567",
    description: "BWM certificate expired 2026-04-30. Expect HIGH alert.",
    expectReviewRequired: false,
    expectedAlerts: 1,
    csv: `${HEADER}\nV002,MV Pacific Star,IMO1234567,MYS,SGSIN,2026-06-18,Steel coils and raw materials,7208,18,32000,2026-04-30,false,CLEAR`,
  },
  {
    id: "TC3",
    label: "Low-confidence fields",
    vesselName: "MV Venture",
    vesselImo: "IMO5555555",
    description:
      "Crew count missing, vague cargo description. Expect review_required: true.",
    expectReviewRequired: true,
    expectedAlerts: 1,
    csv: `${HEADER}\nV003,MV Venture,IMO5555555,PHL,SGSIN,2026-06-20,goods,,,28000,2027-01-15,false,CLEAR`,
  },
];

export const SG_PORT_COMPLIANCE_RULES = JSON.stringify([
  {
    rule_id: "BWM_D2_EXPIRED",
    field: "bwm_certificate_expiry",
    check: "not_expired",
    severity: "HIGH",
    regulation:
      "BWM Convention Regulation D-2 — Ballast Water Performance Standard; MPA Port Circular No. 19 of 2023",
  },
  {
    rule_id: "CREW_COUNT_PRESENT",
    field: "crew_count",
    check: "not_null",
    severity: "HIGH",
    regulation:
      "IMO FAL Convention Annex — FAL Form 1 Field 15 (Number of crew members); MLC 2006 Regulation 1.4",
  },
  {
    rule_id: "CARGO_DESCRIPTION_PRESENT",
    field: "cargo_description",
    check: "not_null",
    severity: "HIGH",
    regulation:
      "IMO FAL Convention Annex — FAL Form 1 Field 7 (Brief description of cargo); Singapore Customs Act (Cap. 70) §22",
  },
  {
    rule_id: "DANGEROUS_GOODS_FLAG",
    field: "dangerous_goods",
    check: "not_true",
    severity: "MEDIUM",
    regulation:
      "SOLAS Chapter VII — Carriage of dangerous goods; MPA Port Marine Circular No. 11 of 2024",
  },
]);
