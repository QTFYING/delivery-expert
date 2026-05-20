ALTER TABLE "payment_orders"
  ADD COLUMN "onlineAttemptNo" INTEGER;

CREATE UNIQUE INDEX "payment_orders_orderId_paymentMethod_onlineAttemptNo_key"
  ON "payment_orders"("orderId", "paymentMethod", "onlineAttemptNo");
