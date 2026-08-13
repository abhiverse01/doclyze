import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Document",
  description: "View a processed document's structured extraction and insights.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

// We use a client component wrapper for the actual page logic
// since the [docId] route needs useParams and store access.
// The metadata export above is server-side only.
import DocumentPageClient from "./DocumentPageClient";

export default function DocumentPage() {
  return <DocumentPageClient />;
}