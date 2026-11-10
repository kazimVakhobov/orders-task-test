import { describe, expect, it } from "vitest";
import { apiOrder, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /sync", () => {
  it("проходит все страницы и останавливается на пустой странице с тем же курсором", async () => {
    const [a, b, c] = [apiOrder(), apiOrder(), apiOrder()];
    ctx.api.pages.set(null, { items: [a, b], nextCursor: "p2" });
    ctx.api.pages.set("p2", { items: [c], nextCursor: "p3" });
    ctx.api.pages.set("p3", { items: [], nextCursor: "p3" });

    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pages: 3, received: 3, applied: 3, invalid: 0 });
    const { rows } = await ctx.db.query(`SELECT count(*)::int AS n FROM orders`);
    expect(rows[0].n).toBe(3);
  });

  it("невалидные заказы пропускает, а не падает", async () => {
    ctx.api.pages.set(null, { items: [apiOrder(), { id: "broken" }, apiOrder({ amount: "abc" })], nextCursor: null });
    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.json()).toMatchObject({ received: 3, applied: 1, invalid: 2 });
  });

  it("не откатывает более свежую версию заказа", async () => {
    const fresh = apiOrder({ status: "refunded", updatedAt: "2026-02-12T00:00:00Z" });
    await ctx.app.inject({ method: "POST", url: "/webhooks/order", payload: fresh });
    ctx.api.pages.set(null, { items: [{ ...fresh, status: "paid", updatedAt: "2026-02-10T12:00:00Z" }], nextCursor: null });

    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.json()).toMatchObject({ stale: 1 });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [fresh.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("строковые суммы и даты без зоны", async () => {
    const o = apiOrder({ amount: "2500.00", createdAt: "2026-02-10T21:30:00" });
    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    await ctx.app.inject({ method: "POST", url: "/sync" });
    const { rows } = await ctx.db.query(`SELECT amount_kop, created_at FROM orders WHERE id = $1`, [o.id]);
    expect(Number(rows[0].amount_kop)).toBe(250000);
    expect(rows[0].created_at.toISOString()).toBe("2026-02-10T21:30:00.000Z");
  });

  it("сохраняет скидку и оплаченную сумму из sync, а затем обновляет их вебхуком", async () => {
    const o = apiOrder({ amount: "1000.00", discountPercent: 10, amountPaid: "900.00" });
    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    await ctx.app.inject({ method: "POST", url: "/sync" });
    const q = `SELECT discount_percent, amount_paid_kop FROM orders WHERE id = $1`;
    let { rows } = await ctx.db.query(q, [o.id]);
    expect(Number(rows[0].discount_percent)).toBe(10);
    expect(Number(rows[0].amount_paid_kop)).toBe(90000);

    await ctx.app.inject({
      method: "POST",
      url: "/webhooks/order",
      payload: { ...o, discountPercent: 20, amountPaid: 800, updatedAt: "2026-02-11T00:00:00Z" },
    });
    ({ rows } = await ctx.db.query(q, [o.id]));
    expect(Number(rows[0].discount_percent)).toBe(20);
    expect(Number(rows[0].amount_paid_kop)).toBe(80000);
  });

  it("заказ без скидочных полей: скидка 0, оплачено = сумме заказа", async () => {
    const o = apiOrder({ amount: 250 });
    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    await ctx.app.inject({ method: "POST", url: "/sync" });
    const { rows } = await ctx.db.query(`SELECT discount_percent, amount_paid_kop FROM orders WHERE id = $1`, [o.id]);
    expect(Number(rows[0].discount_percent)).toBe(0);
    expect(Number(rows[0].amount_paid_kop)).toBe(25000);
  });

  it("некорректная amountPaid — заказ невалиден", async () => {
    const o = apiOrder({ amountPaid: "abc" });
    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.json()).toMatchObject({ invalid: 1, applied: 0 });
  });
});
