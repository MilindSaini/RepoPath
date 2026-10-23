test("gets an order", async () => {
  await fetch("/api/orders/42");
});
