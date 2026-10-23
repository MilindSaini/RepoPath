import React, { useContext } from "react";
import { AuthContext } from "./AuthProvider";

export function Dashboard() {
  const auth = useContext(AuthContext);
  const data = fetch("/api/dashboard").then((res) => res.json());
  return <div>Welcome {auth?.user}</div>;
}

