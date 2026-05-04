import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldAnalysis } from "./FieldAnalysis.js";
import type { FilledDocument } from "../lib/pipeline.js";

const makeDoc = (overrides: Partial<FilledDocument> = {}): FilledDocument => ({
  voyage_id: "V001",
  template: "fal-form-1",
  review_required: false,
  fields: {
    vessel_name: { value: "MV Horizon", confidence: 1.0, flagged: false, source: "Direct" },
    cargo_description: { value: "General machinery", confidence: 0.91, flagged: false, source: "Llm" },
    crew_count: { value: "23", confidence: 1.0, flagged: false, source: "Direct" },
  },
  ...overrides,
});

describe("FieldAnalysis — summary", () => {
  it("shows total field count", () => {
    render(<FieldAnalysis filled={makeDoc()} />);
    expect(screen.getByText(/fields total/)).toBeInTheDocument();
  });

  it("shows AI-filled count", () => {
    render(<FieldAnalysis filled={makeDoc()} />);
    expect(screen.getByText(/AI-filled/)).toBeInTheDocument();
  });

  it("shows review count when fields are flagged", () => {
    const doc = makeDoc({
      fields: {
        ...makeDoc().fields,
        crew_count: { value: null, confidence: 0.0, flagged: true, source: "Direct" },
      },
    });
    render(<FieldAnalysis filled={doc} />);
    expect(screen.getByText(/need review/)).toBeInTheDocument();
  });

  it("does not show review count when nothing is flagged", () => {
    render(<FieldAnalysis filled={makeDoc()} />);
    expect(screen.queryByText(/need review/)).not.toBeInTheDocument();
  });
});

describe("FieldAnalysis — field rows", () => {
  it("renders a row for each field", () => {
    const { container } = render(<FieldAnalysis filled={makeDoc()} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("shows AI badge for Llm-sourced fields", () => {
    render(<FieldAnalysis filled={makeDoc()} />);
    const badges = screen.getAllByText("AI");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows Direct badge for Direct-sourced fields", () => {
    render(<FieldAnalysis filled={makeDoc()} />);
    const badges = screen.getAllByText("Direct");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows confidence bar for AI fields", () => {
    const { container } = render(<FieldAnalysis filled={makeDoc()} />);
    expect(container.querySelector(".conf-bar")).toBeInTheDocument();
  });

  it("shows review flag badge on flagged fields", () => {
    const doc = makeDoc({
      fields: {
        crew_count: { value: null, confidence: 0.0, flagged: true, source: "Direct" },
      },
    });
    const { container } = render(<FieldAnalysis filled={doc} />);
    expect(container.querySelector(".flag-badge")).toBeInTheDocument();
  });

  it("shows null value as dash", () => {
    const doc = makeDoc({
      fields: {
        crew_count: { value: null, confidence: 0.0, flagged: true, source: "Direct" },
      },
    });
    const { container } = render(<FieldAnalysis filled={doc} />);
    expect(container.querySelector(".null-value")).toBeInTheDocument();
  });
});
