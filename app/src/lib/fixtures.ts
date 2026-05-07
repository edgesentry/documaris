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

export interface BcaScenario {
  id: "BC1" | "BC2" | "BC3";
  label: string;
  buildingName: string;
  outletId: string;
  description: string;
  expectReviewRequired: boolean;
  expectedAlerts: number;
  csv: string;
  // live fields — present when loaded from R2
  complianceScore?: number;
  alertCount?: number;
  euiKwhM2?: number;
  chillerCop?: number;
  lpdWM2?: number;
}

const BCA_HEADER =
  "outlet_id,building_name,building_type,period_start,period_end,gross_floor_area_m2,eui_kwh_m2,chiller_cop,lpd_w_m2,water_l_m2,green_mark_target,certifying_body";

export const BCA_SCENARIOS: BcaScenario[] = [
  {
    id: "BC1",
    label: "Compliant outlet",
    buildingName: "Singapore Pools — Tampines Hub",
    outletId: "SP-OUTLET-042",
    description: "All Section 4 fields present. 0 alerts expected.",
    expectReviewRequired: false,
    expectedAlerts: 0,
    csv: `${BCA_HEADER}\nSP-OUTLET-042,Singapore Pools Tampines Hub,Retail,2025-01-01,2025-12-31,3200,108.5,0.61,13.2,380.0,Platinum,BCA`,
  },
  {
    id: "BC2",
    label: "EUI data missing",
    buildingName: "Singapore Pools — Woodlands CC",
    outletId: "SP-OUTLET-017",
    description: "EUI not recorded. EUI_DATA_PRESENT alert expected.",
    expectReviewRequired: true,
    expectedAlerts: 1,
    csv: `${BCA_HEADER}\nSP-OUTLET-017,Singapore Pools Woodlands CC,Retail,2025-01-01,2025-12-31,2800,,0.63,14.1,395.0,Platinum,BCA`,
  },
  {
    id: "BC3",
    label: "Audit period missing",
    buildingName: "Singapore Pools — Jurong West",
    outletId: "SP-OUTLET-033",
    description: "Period dates not set. Two MEDIUM alerts expected.",
    expectReviewRequired: true,
    expectedAlerts: 2,
    csv: `${BCA_HEADER}\nSP-OUTLET-033,Singapore Pools Jurong West,Retail,,,2950,112.0,0.64,14.8,402.0,Gold+,BCA`,
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
