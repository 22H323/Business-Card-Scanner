import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · CardSync AI" },
      { name: "description", content: "(Removed) Redirecting to Queue Center." },
    ],
  }),
  component: () => redirect({ to: "/queue" }),
});

