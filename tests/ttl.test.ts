import { describe, expect, it } from "vitest";
import { parseTtl } from "../src/ttl";

describe("parseTtl", () => {
  it("accepts raw millisecond numbers", () => {
    expect(parseTtl(0)).toBe(0);
    expect(parseTtl(1500)).toBe(1500);
  });

  it("parses second/minute/hour/day strings", () => {
    expect(parseTtl("500ms")).toBe(500);
    expect(parseTtl("60s")).toBe(60_000);
    expect(parseTtl("5m")).toBe(300_000);
    expect(parseTtl("1h")).toBe(3_600_000);
    expect(parseTtl("2d")).toBe(172_800_000);
  });

  it("accepts fractional values", () => {
    expect(parseTtl("1.5m")).toBe(90_000);
  });

  it("is case insensitive", () => {
    expect(parseTtl("5M")).toBe(300_000);
  });

  it("rejects invalid strings", () => {
    expect(() => parseTtl("five minutes")).toThrow();
    expect(() => parseTtl("5 weeks")).toThrow();
    expect(() => parseTtl("")).toThrow();
  });

  it("rejects invalid numbers", () => {
    expect(() => parseTtl(-1)).toThrow();
    expect(() => parseTtl(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => parseTtl(Number.NaN)).toThrow();
  });
});
