/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/**
 * Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем.
 *
 * Усечение делаем по десятичной записи числа, а не через `rub * 100`: во float
 * 4723.9 * 100 = 472389.99999999994, и Math.floor терял бы копейку.
 */
export function toKop(rub: number): number {
  const sign = rub < 0 ? -1 : 1;
  const s = String(Math.abs(rub));
  // Экспоненциальная запись (< 1e-6 или >= 1e21) для денег не встречается — прежний способ
  if (/e/i.test(s)) return sign * Math.floor(Math.abs(rub) * 100);
  const [int, frac = ""] = s.split(".");
  return sign * (Number(int) * 100 + Number(frac.padEnd(2, "0").slice(0, 2)));
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}
