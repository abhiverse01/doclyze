"use client";

import * as React from "react";
import { ChevronRight, ChevronDown, Table2, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { StructureNode } from "@/lib/extraction/extractors/general";

interface StructureViewProps {
  tree: StructureNode[];
}

/** Render a single table within a structure node. */
function StructureTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="mt-2 mb-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            {columns.map((col, i) => (
              <th
                key={i}
                className="px-3 py-1.5 text-left font-medium text-foreground whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, ri) => (
            <tr
              key={ri}
              className="border-t border-border hover:bg-muted/30"
            >
              {columns.map((_, ci) => (
                <td key={ci} className="px-3 py-1.5 text-foreground/90">
                  {row[ci] || "—"}
                </td>
              ))}
            </tr>
          ))}
          {rows.length > 20 && (
            <tr className="border-t border-border">
              <td
                colSpan={columns.length}
                className="px-3 py-1.5 text-center text-muted-foreground italic"
              >
                ...and {rows.length - 20} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Render a structure node (heading + content + children) recursively. */
function StructureNodeView({
  node,
  depth = 0,
}: {
  node: StructureNode;
  depth?: number;
}) {
  const [expanded, setExpanded] = React.useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const hasContent = node.content.trim().length > 0;
  const hasTables = node.tables.length > 0;
  const isCollapsible = hasChildren || hasContent;

  const levelColors = [
    "text-foreground font-bold",
    "text-foreground font-semibold",
    "text-foreground/80 font-medium",
    "text-foreground/70 font-medium",
  ];
  const colorClass = levelColors[Math.min(depth, levelColors.length - 1)];
  const textSize = depth === 0 ? "text-base" : depth === 1 ? "text-sm" : "text-xs";

  return (
    <div className={`${depth > 0 ? `ml-${Math.min(depth * 4, 16)}` : ""}`}>
      {/* Heading row */}
      <button
        onClick={() => isCollapsible && setExpanded(!expanded)}
        className={`flex items-center gap-1.5 w-full text-left py-1 hover:bg-muted/30 rounded px-1 transition-colors ${
          isCollapsible ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {isCollapsible && (
          <span className="text-muted-foreground shrink-0">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        )}
        {!isCollapsible && <span className="w-3.5" />}
        <span className={`${colorClass} ${textSize} truncate`}>
          {node.heading}
        </span>
        {node.level > 0 && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            H{node.level}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mb-2">
          {/* Body text */}
          {hasContent && (
            <p
              className={`text-xs text-foreground/70 leading-relaxed ml-5 mb-2 whitespace-pre-line`}
            >
              {node.content.length > 500
                ? node.content.slice(0, 500) + "..."
                : node.content}
            </p>
          )}

          {/* Tables */}
          {hasTables && (
            <div className="ml-5 mb-2">
              {node.tables.map((t) => (
                <div key={t.id}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Table2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t.rowCount}x{t.colCount} table
                    </span>
                  </div>
                  <StructureTable columns={t.columns} rows={t.rows} />
                </div>
              ))}
            </div>
          )}

          {/* Child nodes */}
          {hasChildren &&
            node.children.map((child, i) => (
              <StructureNodeView key={i} node={child} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}

/** Main Document Structure view component. */
export function StructureView({ tree }: StructureViewProps) {
  if (!tree || tree.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          No document structure could be extracted.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-1">
      {tree.map((node, i) => (
        <StructureNodeView key={i} node={node} depth={0} />
      ))}
    </div>
  );
}
