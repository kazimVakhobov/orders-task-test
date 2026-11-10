import type { OrdersRepository } from "../repositories/orders.js";
import { fromKop } from "../utils/money.js";
import { datesBetween, dateInTimeZone, utcDayStart } from "../utils/time.js";
import type { CustomersService } from "./customers.js";

export interface DailyTotal {
  date: string;
  /** Для обратной совместимости: то же, что gross. */
  total: number;
  /** Оплаченные заказы до скидки. */
  gross: number;
  /** gross − net. */
  discount: number;
  /** Фактически оплачено. */
  net: number;
}

export class TotalsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Сумма оплаченных заказов клиента по дням в его таймзоне, from..to включительно.
   * Дни без оплат — с нулём.
   */
  async daily(customerId: string, from: string, to: string): Promise<DailyTotal[]> {
    const timezone = await this.customers.timezone(customerId);
    const dayOf = dateInTimeZone(timezone);

    // Смещения таймзон в пределах ±14 ч: берём с запасом в сутки с каждой стороны
    const rows = await this.orders.paidCreatedBetween(
      customerId,
      utcDayStart(from, -1),
      utcDayStart(to, 2),
    );

    const sums = new Map(datesBetween(from, to).map((d) => [d, { gross: 0, net: 0 }]));
    for (const o of rows) {
      // день по таймзоне клиента на момент заказа (с учётом перехода на летнее время)
      const cur = sums.get(dayOf(o.createdAt));
      if (cur) {
        cur.gross += o.amountKop;
        cur.net += o.amountPaidKop;
      }
    }
    return [...sums].map(([date, { gross, net }]) => ({
      date,
      total: fromKop(gross),
      gross: fromKop(gross),
      discount: fromKop(gross - net),
      net: fromKop(net),
    }));
  }
}
