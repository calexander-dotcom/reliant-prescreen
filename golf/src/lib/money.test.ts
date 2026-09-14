import { describe, expect, it } from "vitest";
import {
  distributeCents,
  formatCompact,
  formatMoney,
  formatSigned,
  parseMoney,
  sumCents,
} from "./money";

describe("parseMoney", () => {
  it("parses plain and decorated dollar amounts", () => {
    expect(parseMoney("20")).toBe(2000);
    expect(parseMoney("20.00")).toBe(2000);
    expect(parseMoney("$20.50")).toBe(2050);
    expect(parseMoney("20.5")).toBe(2050);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("  7 ")).toBe(700);
    expect(parseMoney("0.01")).toBe(1);
    expect(parseMoney(20)).toBe(2000);
  });

  it("parses negatives, including accounting parentheses", () => {
    expect(parseMoney("-40")).toBe(-4000);
    expect(parseMoney("-$10.00")).toBe(-1000);
    expect(parseMoney("(10)")).toBe(-1000);
    expect(parseMoney("+30")).toBe(3000);
  });

  it("rounds a third decimal place instead of dropping it", () => {
    expect(parseMoney("20.005")).toBe(2001);
    expect(parseMoney("20.004")).toBe(2000);
  });

  it("rejects junk without throwing", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats magnitudes and signs", () => {
    expect(formatMoney(2000)).toBe("$20.00");
    expect(formatMoney(-4000)).toBe("-$40.00");
    expect(formatMoney(2050, { cents: false })).toBe("$21");
    expect(formatSigned(2000)).toBe("+$20.00");
    expect(formatSigned(-4000)).toBe("-$40.00");
    expect(formatSigned(0)).toBe("$0.00");
  });

  it("formats compactly for scorecard cells", () => {
    expect(formatCompact(2000)).toBe("+20");
    expect(formatCompact(-4000)).toBe("-40");
    expect(formatCompact(2050)).toBe("+20.50");
    expect(formatCompact(0)).toBe("—");
  });
});

describe("distributeCents", () => {
  it("splits without losing or inventing money", () => {
    expect(distributeCents(2000, 3)).toEqual([667, 667, 666]);
    expect(sumCents(distributeCents(2000, 3))).toBe(2000);
    expect(sumCents(distributeCents(-2000, 3))).toBe(-2000);
    expect(sumCents(distributeCents(2500, 4))).toBe(2500);
    expect(distributeCents(2000, 2)).toEqual([1000, 1000]);
    expect(distributeCents(100, 0)).toEqual([]);
  });
});
