"use client";

import * as React from "react";
import {
  Table2, Download, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check,
  Type, Calendar, DollarSign, Hash, Link as LinkIcon, Mail, Tag,
  LayoutGrid, LayoutList, Search, BarChart3,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  ColumnDef, flexRender, getCoreRowModel, getSortedRowModel,
  SortingState, useReactTable, VisibilityState,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { CellType, Confidence, ExtractedTable } from "@/lib/extraction/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";

interface SheetRow { [key: string]: string | number | null; }

interface TableSheetProps {
  table: ExtractedTable;
  tableIndex: number;
  filename: string;
  documentId?: string;
  highlightTarget?: string | null;
  onClearHighlight?: () => void;
}

export function TableSheet({ table, tableIndex, filename, documentId, highlightTarget, onClearHighlight }: TableSheetProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const [copiedCell, setCopiedCell] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<"auto" | "card" | "table">("auto");
  const [isMobile, setIsMobile] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const tableScrollRef = React.useRef<HTMLDivElement>(null);
  const highlightedRowRef = React.useRef<HTMLTableRowElement>(null);

  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const update = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(!e.matches);
    update(mql);
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    if (highlightTarget && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const t = setTimeout(() => onClearHighlight?.(), 3000);
      return () => clearTimeout(t);
    }
  }, [highlightTarget, onClearHighlight]);

  const showCards = viewMode === "card" || (viewMode === "auto" && isMobile);

  const filteredRows = React.useMemo(() => {
    if (!searchQuery.trim()) return table.rows;
    const q = searchQuery.toLowerCase();
    return table.rows.filter((row) =>
      table.columns.some((col) => {
        const v = row[col.id];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      })
    );
  }, [table.rows, table.columns, searchQuery]);

  const numericColumns = React.useMemo(() => {
    return table.columns.filter((col) => {
      if (col.type !== "currency" && col.type !== "number") return false;
      let n = 0;
      for (const row of table.rows) {
        const v = row[col.id];
        if (v !== null && v !== undefined && !isNaN(Number(v))) n++;
        if (n >= 2) return true;
      }
      return false;
    });
  }, [table.columns, table.rows]);

  const hasChart = numericColumns.length > 0 && filteredRows.length > 1;
  const [showChart, setShowChart] = React.useState(false);

  const columns = React.useMemo<ColumnDef<SheetRow>[]>(
    () => table.columns.map((col) => ({
      id: col.id, accessorKey: col.id, header: col.label, enableSorting: col.sortable ?? false,
      meta: { cellType: col.type },
      cell: (info) => <CellRenderer value={info.getValue() as string | number | null} type={col.type} />,
    })),
    [table.columns]
  );

  const table_ = useReactTable({
    data: filteredRows as SheetRow[],
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting, onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';

  const exportCsv = () => {
    const h = table.columns.map((c) => c.label);
    const r = table_.getRowModel().rows.map((row) => table.columns.map((c) => { const v = row.original[c.id]; return v === null || v === undefined ? "" : String(v); }));
    const csv = [h, ...r].map((row) => row.map((c) => esc(String(c))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${table.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${table_.getRowModel().rows.length} rows to CSV`);
  };

  const exportXlsx = () => {
    const data = [table.columns.map((c) => c.label), ...table_.getRowModel().rows.map((r) => table.columns.map((c) => r.original[c.id] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, table.title.slice(0, 30));
    XLSX.writeFile(wb, `${filename}_${table.id}.xlsx`);
    toast.success(`Exported ${table_.getRowModel().rows.length} rows to XLSX`);
  };

  const chartData = React.useMemo(() => {
    if (!showChart || numericColumns.length === 0) return [];
    const labelCol = table.columns.find((c) => c.type === "text") ?? table.columns[0];
    const numCol = numericColumns[0];
    return filteredRows.slice(0, 50).map((row) => ({ name: String(row[labelCol.id] ?? ""), value: Number(row[numCol.id] ?? 0) }));
  }, [showChart, numericColumns, filteredRows, table.columns]);

  // Parse highlight target: "tableIdx-rowIdx"
  const highlightTableIdx = highlightTarget ? parseInt(highlightTarget.split("-")[0], 10) : -1;
  const highlightRowIdx = highlightTarget ? parseInt(highlightTarget.split("-")[1], 10) : -1;
  const isHighlighted = highlightTableIdx === tableIndex;

  // Virtualizer for table view
  const rowVirtualizer = useVirtualizer({
    count: table_.getRowModel().rows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  return (
    <section aria-labelledby={`table-${table.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
        <div>
          <h3 id={`table-${table.id}`} className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Table2 className="h-4 w-4 text-[var(--brand)]" />{table.title}
          </h3>
          {table.description && <p className="text-[11px] text-muted-foreground mt-0.5">{table.description}</p>}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {table.rows.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search rows..." className="h-7 w-[130px] rounded-md border border-border bg-background pl-7 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setViewMode(showCards ? "table" : "card")} className="md:hidden h-7 text-xs">
            {showCards ? <LayoutList className="h-3 w-3 mr-1" /> : <LayoutGrid className="h-3 w-3 mr-1" />}{showCards ? "Table" : "Cards"}
          </Button>
          {hasChart && (
            <Button variant="outline" size="sm" onClick={() => setShowChart(!showChart)} className={cn("h-7 text-xs", showChart && "border-[var(--brand)]/40 text-[var(--brand)]")}>
              <BarChart3 className="h-3 w-3 mr-1" />Chart
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} className="h-7 text-xs"><Download className="h-3 w-3 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} className="h-7 text-xs"><Download className="h-3 w-3 mr-1" />XLSX</Button>
        </div>
      </div>

      {showChart && chartData.length > 0 && (
        <Card className="p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{numericColumns[0]?.label ?? "Values"}</span>
            <span className="text-[10px] text-muted-foreground">{chartData.length} items</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} angle={-35} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} width={60} />
              <RTooltip contentStyle={{ fontSize: 11, background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--popover-foreground)" }} />
              <Bar dataKey="value" fill="var(--brand)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {showCards ? (
        /* ── Card view (mobile) ── */
        <Card className="p-0 overflow-hidden">
          {filteredRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground/60">No rows match &quot;{searchQuery}&quot;</div>
          ) : (
            <div className="flex flex-col divide-y divide-border/40">
              {filteredRows.map((row, rowIdx) => {
                const firstCol = table.columns[0];
                const isRowHighlighted = isHighlighted && rowIdx === highlightRowIdx;
                return (
                  <ContextMenu key={rowIdx}>
                    <ContextMenuTrigger asChild>
                      <div className={cn("px-3 py-3", isRowHighlighted && "bg-[var(--brand-soft)]")} ref={isRowHighlighted ? highlightedRowRef : undefined}>
                        <div className="text-xs font-medium text-foreground mb-1.5">
                          {row[firstCol.id] != null ? String(row[firstCol.id]) : "—"}
                        </div>
                        <div className="flex flex-col gap-1">
                          {table.columns.slice(1).map((col) => (
                            <div key={col.id} className="flex items-baseline gap-2 text-[11px]">
                              <span className="text-muted-foreground shrink-0">{col.label}:</span>
                              <span className="text-foreground/90">
                                <CellRenderer value={row[col.id]} type={col.type} />
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => { navigator.clipboard.writeText(table.columns.map((c) => row[c.id] ?? "").join("\t")).then(() => toast.success("Row copied")).catch(() => toast.error("Failed to copy row")); }}>
                        <Copy className="h-3.5 w-3.5 mr-2" />Copy row
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        /* ── Virtualized table view (desktop) ── */
        <Card className="p-0 overflow-hidden">
          <div ref={tableScrollRef} className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 sheet-header-shadow">
                <tr className="bg-muted/40">
                  {table_.getHeaderGroups()[0].headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
                        header.column.getCanSort() && "cursor-pointer select-none hover:text-foreground"
                      )}
                      style={{ width: columnWidths[header.id] ?? undefined }}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ChevronUp className="h-3 w-3" />,
                          desc: <ChevronDown className="h-3 w-3" />,
                        }[header.column.getIsSorted() as string] ?? (header.column.getCanSort() && <ChevronsUpDown className="h-3 w-3 opacity-30" />)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowVirtualizer.getVirtualItems().length === 0 ? (
                  <tr>
                    <td colSpan={table.columns.length} className="px-3 py-6 text-center text-xs text-muted-foreground/60">
                      No rows match &quot;{searchQuery}&quot;
                    </td>
                  </tr>
                ) : (
                  rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = table_.getRowModel().rows[virtualRow.index];
                    const isRowHighlighted = isHighlighted && virtualRow.index === highlightRowIdx;
                    return (
                      <ContextMenu key={virtualRow.index}>
                        <ContextMenuTrigger asChild>
                          <tr
                            ref={isRowHighlighted ? highlightedRowRef : undefined}
                            className={cn(
                              "border-b border-border/40 hover:bg-muted/20 transition-colors",
                              isRowHighlighted && "bg-[var(--brand-soft)]"
                            )}
                            style={{ height: virtualRow.size }}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <td key={cell.id} className="px-3 py-2.5 text-foreground/90 whitespace-pre-wrap break-words max-w-[300px]">
                                <CellRenderer value={cell.getValue() as string | number | null} type={(cell.column.columnDef.meta as { cellType?: CellType })?.cellType} />
                              </td>
                            ))}
                          </tr>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => { navigator.clipboard.writeText(table.columns.map((c) => row.original[c.id] ?? "").join("\t")).then(() => toast.success("Row copied")).catch(() => toast.error("Failed to copy row")); }}>
                            <Copy className="h-3.5 w-3.5 mr-2" />Copy row
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Virtualizer padding for correct scroll height */}
          <div style={{ height: rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems().reduce((acc, v) => acc + v.size, 0) }} />
          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
            <span>{filteredRows.length} row{filteredRows.length !== 1 ? "s" : ""}{searchQuery ? ` (filtered from ${table.rows.length})` : ""}</span>
            <span>{table.columns.length} columns</span>
          </div>
        </Card>
      )}
    </section>
  );
}

/* ── Cell Renderer ── */

function CellRenderer({ value, type }: { value: string | number | null; type?: CellType }) {
  const cellValue = value === null || value === undefined ? null : String(value);

  const icon = React.useMemo(() => {
    switch (type) {
      case "email": return <Mail className="h-3 w-3" />;
      case "url": return <LinkIcon className="h-3 w-3" />;
      case "date": return <Calendar className="h-3 w-3" />;
      case "currency": return <DollarSign className="h-3 w-3" />;
      case "number": return <Hash className="h-3 w-3" />;
      case "text": return <Type className="h-3 w-3" />;
      default: return <Tag className="h-3 w-3" />;
    }
  }, [type]);

  if (cellValue === null) {
    return <span className="text-muted-foreground/40 italic">--</span>;
  }

  if (type === "email") {
    return (
      <a href={`mailto:${cellValue}`} className="inline-flex items-center gap-1 text-[var(--brand)] hover:underline" onClick={(e) => e.stopPropagation()}>
        {icon}{cellValue}
      </a>
    );
  }

  if (type === "url") {
    return (
      <a href={cellValue.startsWith("http") ? cellValue : `https://${cellValue}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--brand)] hover:underline" onClick={(e) => e.stopPropagation()}>
        {icon}{cellValue.length > 30 ? cellValue.slice(0, 30) + "..." : cellValue}
      </a>
    );
  }

  if (type === "currency") {
    return (
      <span className="inline-flex items-center gap-1 font-mono">
        {icon}<span className={cellValue.startsWith("-") ? "text-[var(--severity-warning)]" : ""}>{cellValue}</span>
      </span>
    );
  }

  return <span className="inline-flex items-center gap-1">{icon}{cellValue}</span>;
}
