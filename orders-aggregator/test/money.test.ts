import { describe, expect, it } from "vitest";
import { fromKop, parseRub, toKop } from "../src/utils/money.js";

describe("parseRub", () => {
  it("принимает число и строку с числом", () => {
    expect(parseRub(2500)).toBe(2500);
    expect(parseRub("2500.00")).toBe(2500);
    expect(parseRub(" 99 ")).toBe(99);
  });

  it("отклоняет мусор и отрицательные суммы", () => {
    expect(() => parseRub("abc")).toThrow();
    expect(() => parseRub(null)).toThrow();
    expect(() => parseRub(-1)).toThrow();
  });
});

describe("toKop / fromKop", () => {
  it("рубли в копейки", () => {
    expect(toKop(2500)).toBe(250000);
    expect(toKop(99)).toBe(9900);
  });

  it("отбрасывает доли копейки", () => {
    expect(toKop(10.999)).toBe(1099);
  });

  it("не теряет копейку из-за двоичной арифметики", () => {
    expect(toKop(19.99)).toBe(1999);
    expect(toKop(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996
    expect(toKop(4723.9)).toBe(472390); // значения из реальных данных
    expect(toKop(1276.1)).toBe(127610);
    expect(toKop(2284.99)).toBe(228499);
  });

  it("любая сумма в копейках проходит туда-обратно без потерь", () => {
    for (let kop = 0; kop <= 500_000; kop++) {
      if (toKop(kop / 100) !== kop) throw new Error(`lost kopeck at ${kop}`);
    }
  });

  it("доли копейки по-прежнему отбрасываются", () => {
    expect(toKop(1.005)).toBe(100);
    expect(toKop(0.0049)).toBe(0);
  });

  it("копейки в рубли", () => {
    expect(fromKop(250000)).toBe(2500);
    expect(fromKop(1099)).toBe(10.99);
  });
});
