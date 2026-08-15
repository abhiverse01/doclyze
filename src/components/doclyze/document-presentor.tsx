"use client";

import * as React from "react";
import { FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ExtractedTable, FieldGroup } from "@/lib/extraction/types";
import { FieldGroupSheet } from "./presentor/field-group-sheet";
import { TableSheet } from "./presentor/table-sheet";
import { DocumentAnnotation } from "./presentor/document-annotation";
import { DocumentPresentorSkeleton, InsightsPanelSkeleton } from "./presentor/skeletons";

interface PresentorProps {
  tables: ExtractedTable[];
  fieldGroups: FieldGroup[];
  filename: string;
  documentId?: string;
  rawText?: string;
  highlightTarget?: string | null;
  onClearHighlight?: () => void;
}

export function DocumentPresentor({
  tables,
  fieldGroups,
  filename,
  documentId,
  rawText,
  highlightTarget,
  onClearHighlight,
}: PresentorProps) {
  if (tables.length === 0 && fieldGroups.length === 0) {
    return (
      <Card className="p-10 text-center">
        <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">No structured data extracted</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Doclyze couldn&apos;t pull any fields or tables from this document. Try
          the Raw Text tab to see what was extracted.
        </p>
      </Card>
    );
  }

  const annotationEl = documentId != null ? (
    <DocumentAnnotation docId={documentId} />
  ) : null;

  return (
    <div className="flex flex-col gap-8">
      {annotationEl}
      {fieldGroups.map((group) => (
        <FieldGroupSheet
          key={group.id}
          group={group}
          documentId={documentId}
          rawText={rawText}
        />
      ))}
      {tables.map((table, tableIdx) => (
        <TableSheet
          key={`${table.id}-${tableIdx}`}
          table={table}
          tableIndex={tableIdx}
          filename={filename}
          documentId={documentId}
          highlightTarget={highlightTarget}
          onClearHighlight={onClearHighlight}
        />
      ))}
    </div>
  );
}

export { type PresentorProps };
