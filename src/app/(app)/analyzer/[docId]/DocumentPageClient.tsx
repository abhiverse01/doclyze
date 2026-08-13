"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useDoclyzeStore } from "@/lib/store";
import { Analyzer } from "@/components/doclyze/analyzer";

/**
 * /analyzer/[docId] — Individual processed document view.
 *
 * Since Doclyze v1 is intentionally storage-only (localStorage),
 * this route resolves the docId against the Zustand store's document list.
 * If the document is not found (e.g. expired from localStorage, or
 * the user navigated directly to a stale URL), we show a clear
 * "document not found" fallback with a link to re-upload.
 *
 * This route is deliberately excluded from the sitemap and marked noindex
 * because the pages are ephemeral/local-storage-backed, not persistent.
 *
 * RATIONALE for noindex: These pages are backed by the user's browser
 * localStorage, which is device-specific and non-persistent. A crawler
 * cannot access any meaningful content at these URLs, and the same
 * URL on a different device or after clearing storage would show
 * the "not found" fallback. Excluding them from search indexes is
 * the correct behavior, not an oversight.
 */
export default function DocumentPageClient() {
  const params = useParams<{ docId: string }>();
  const router = useRouter();
  const docId = params.docId;
  const { documents, setActiveDocument } = useDoclyzeStore();

  const doc = documents.find((d) => d.id === docId);

  React.useEffect(() => {
    if (docId) {
      setActiveDocument(docId);
    }
  }, [docId, setActiveDocument]);

  if (!doc) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold">Document not found</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            This document may have been removed from your local history,
            or the link may be stale. Documents are stored in your browser&apos;s
            local storage and do not persist across devices.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
            >
              Back to dashboard
            </button>
            <button
              onClick={() => router.push("/analyzer")}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              Analyze a new document
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render the Analyzer component — it reads the active document from the store
  return <Analyzer />;
}
