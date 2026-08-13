import { Dashboard } from "@/components/doclyze/dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Doclyze document dashboard — browse analyzed documents, filter by type, and track extraction history.",
  alternates: {
    canonical: "https://doclyze-web.vercel.app/dashboard",
  },
};

export default function DashboardPage() {
  return <Dashboard />;
}
