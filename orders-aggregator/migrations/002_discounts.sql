-- Скидки: внешний API отдаёт discountPercent и amountPaid.
-- Для уже сохранённых заказов скидка неизвестна до следующего sync: считаем оплату равной сумме заказа.
ALTER TABLE orders
  ADD COLUMN discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN amount_paid_kop  BIGINT;

UPDATE orders SET amount_paid_kop = amount_kop;

ALTER TABLE orders ALTER COLUMN amount_paid_kop SET NOT NULL;
