import React from "react";
import { AuthProvider } from "./AuthProvider";
import { Dashboard } from "./Dashboard";

export function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}

