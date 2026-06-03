import { createFileRoute } from "@tanstack/react-router";
import { LeadReviewPage } from "@/pages/LeadReviewPage";
export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review extracted details · CardSync AI" },
      {
        name: "description",
        content: "Review OCR extracted business card details and save to local PostgreSQL.",
      },
    ],
  }),
  component: LeadReviewPage,
});
