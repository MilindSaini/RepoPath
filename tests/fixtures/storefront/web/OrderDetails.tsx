import axios from "axios";

export function OrderDetails({ id }: { id: string }) {
  return <button onClick={() => axios.get(`/api/orders/${id}`)}>Load order</button>;
}
