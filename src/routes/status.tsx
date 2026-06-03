import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

function StatusPage() {
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setStatus(JSON.stringify(data, null, 2));
      })
      .catch((err) => {
        setError(err.message);
        setStatus("Failed");
      });
  }, []);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: "2rem" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Backend Connectivity</h1>
      <pre
        style={{
          background: "#1e1e1e",
          color: "#d4d4d4",
          padding: "1rem",
          borderRadius: "8px",
          overflowX: "auto",
        }}
      >
        {error ? `Error: ${error}` : status}
      </pre>
    </div>
  );
}
