import { createFileRoute, Navigate } from "@tanstack/react-router";

// Dashboard is now intentionally minimal: direct access to the Scan flow.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scan Card · CardSync AI" },
      { name: "description", content: "Capture business cards with AI-powered OCR." },
      { property: "og:title", content: "Scan a card · CardSync AI" },
      { property: "og:description", content: "AI extracts contact details from any business card in seconds." },
    ],
  }),
  component: () => <Navigate to="/scan" replace />,
});

