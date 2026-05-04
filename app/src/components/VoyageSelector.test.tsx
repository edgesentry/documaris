import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VoyageSelector } from "./VoyageSelector.js";
import { SCENARIOS } from "../lib/fixtures.js";

describe("VoyageSelector", () => {
  it("renders all three scenario cards", () => {
    render(<VoyageSelector onSelect={vi.fn()} />);
    expect(screen.getByText("MV Horizon")).toBeInTheDocument();
    expect(screen.getByText("MV Pacific Star")).toBeInTheDocument();
    expect(screen.getByText("MV Venture")).toBeInTheDocument();
  });

  it("renders TC1, TC2, TC3 labels", () => {
    render(<VoyageSelector onSelect={vi.fn()} />);
    expect(screen.getByText("TC1")).toBeInTheDocument();
    expect(screen.getByText("TC2")).toBeInTheDocument();
    expect(screen.getByText("TC3")).toBeInTheDocument();
  });

  it("renders documaris heading", () => {
    render(<VoyageSelector onSelect={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "documaris" })).toBeInTheDocument();
  });

  it("calls onSelect with the correct scenario when a card is clicked", () => {
    const onSelect = vi.fn();
    render(<VoyageSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText("MV Horizon").closest("button")!);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(SCENARIOS[0]);
  });

  it("calls onSelect with TC2 scenario when Pacific Star is clicked", () => {
    const onSelect = vi.fn();
    render(<VoyageSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText("MV Pacific Star").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(SCENARIOS[1]);
  });

  it("renders 'Generate FAL Form 1' CTA on each card", () => {
    render(<VoyageSelector onSelect={vi.fn()} />);
    expect(screen.getAllByText(/Generate FAL Form 1/)).toHaveLength(3);
  });
});
