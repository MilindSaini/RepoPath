const router = { get: (_path: string, _handler: unknown) => undefined };

export function getOrder() {
  return { status: "paid" };
}

router.get("/api/orders/:id", getOrder);
