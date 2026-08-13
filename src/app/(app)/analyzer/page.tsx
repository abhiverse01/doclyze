import { Analyzer } from "@/components/doclyze/analyzer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Document Analyzer",
  description: "Upload and analyze documents — PDF, DOCX, images, spreadsheets. Get structured data and insights, all in your browser.",
  alternates: {
    canonical: "https://doclyze-web.vercel.app/analyzer",
  },
};

export default function AnalyzerPage() {
  return <Analyzer />;
}
