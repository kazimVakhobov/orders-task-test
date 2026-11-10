import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /webhooks/order: параллельная доставка", () => {
  /** 5 версий каждого из `count` заказов; версия v — updatedAt растёт, скидка = v. */
  const allVersions = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      [1, 2, 3, 4, 5].map((v) =>
        apiOrder({
          id: `race_${i}`,
          status: "paid",
          discountPercent: v,
          amountPaid: 1000 - v,
          updatedAt: `2026-02-1${v}T12:00:00Z`,
        }),
      ),
    ).flat();

  /** Детерминированное перемешивание (LCG): тот же порядок при каждом запуске. */
  const shuffled = <T,>(items: T[], seed = 42): T[] => {
    const a = [...items];
    let x = seed;
    for (let i = a.length - 1; i > 0; i--) {
      x = (x * 1664525 + 1013904223) % 2 ** 32;
      const j = x % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const snapshot = async () =>
    (await ctx.db.query(`SELECT id, status, discount_percent, amount_paid_kop, updated_at FROM orders ORDER BY id`)).rows;

  it("версии одного заказа вперемешку и одновременно: остаётся самая новая", async () => {
    const all = shuffled(allVersions(100));
    await Promise.all(all.map((o) => postWebhook(ctx.app, o)));
    const rows = await snapshot();
    expect(rows).toHaveLength(100);
    expect(rows.every((r) => Number(r.discount_percent) === 5 && Number(r.amount_paid_kop) === 99500)).toBe(true);
  });

  it("повторная доставка тех же событий ничего не меняет", async () => {
    const all = shuffled(allVersions(50));
    await Promise.all(all.map((o) => postWebhook(ctx.app, o)));
    const before = await snapshot();

    const replies = await Promise.all(shuffled(all, 7).map((o) => postWebhook(ctx.app, o)));
    expect(replies.every((r) => r.json().result === "stale")).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
});
