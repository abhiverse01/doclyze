"use client";

import * as React from "react";
import { Search, Eye, Copy, Check, Pencil, X, StickyNote, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuTrigger, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FieldGroup } from "@/lib/extraction/types";
import { useDoclyzeStore, correctionKey, annotationKey } from "@/lib/store";
import { toast } from "sonner";

interface FieldGroupSheetProps {
  group: FieldGroup;
  documentId?: string;
  rawText?: string;
}

export function FieldGroupSheet({ group, documentId, rawText }: FieldGroupSheetProps) {
  const [filterText, setFilterText] = React.useState("");

  const filteredFields = React.useMemo(() => {
    if (!filterText.trim()) return group.fields;
    const q = filterText.toLowerCase();
    return group.fields.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        (f.value && f.value.toLowerCase().includes(q))
    );
  }, [group.fields, filterText]);

  return (
    <section aria-labelledby={`group-${group.id}`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 id={`group-${group.id}`} className="text-sm font-semibold text-foreground">
          {group.title}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {group.fields.filter((f) => f.value !== null).length}/{group.fields.length} fields
          </span>
          {group.fields.length > 6 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter fields..."
                className="h-6 w-[140px] rounded-md border border-border bg-background pl-7 pr-2 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}
        </div>
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[minmax(180px,1fr)_2fr_28px] gap-0">
          <div className="bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Field</div>
          <div className="bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">Value</div>
          <div className="bg-muted/40 px-3 py-2 border-b border-border" />
          {filteredFields.map((field) => (
            <EditableFieldRow key={field.key} field={field} documentId={documentId} rawText={rawText} />
          ))}
          {filteredFields.length === 0 && filterText && (
            <div className="col-span-3 px-3 py-6 text-center text-xs text-muted-foreground/60">
              No fields match &quot;{filterText}&quot;
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

function EditableFieldRow({ field, documentId, rawText }: { field: FieldGroup["fields"][number]; documentId?: string; rawText?: string }) {
  const { fieldCorrections, setFieldCorrection, removeFieldCorrection, annotations, addAnnotation, removeAnnotation } = useDoclyzeStore();
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editDraft, setEditDraft] = React.useState("");
  const [showProvenance, setShowProvenance] = React.useState(false);
  const [showAnnotation, setShowAnnotation] = React.useState(false);
  const [annotationDraft, setAnnotationDraft] = React.useState("");
  const editRef = React.useRef<HTMLInputElement>(null);

  const ck = documentId ? correctionKey(documentId, field.key) : "";
  const correction = documentId ? fieldCorrections[ck] : undefined;
  const displayValue = correction ? correction.value : (field.value ?? null);
  const provenance = correction
    ? `Edited on ${new Date(correction.correctedAt).toLocaleString()}`
    : field.provenance;

  const ak = documentId ? annotationKey(documentId, field.key) : "";
  const fieldAnnotations = documentId ? (annotations[ak] ?? []) : [];

  React.useEffect(() => {
    if (editing) {
      setEditDraft(displayValue ?? "");
      editRef.current?.focus();
    }
  }, [editing]);

  const copy = () => {
    if (displayValue) {
      navigator.clipboard.writeText(displayValue).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
        toast.success("Copied to clipboard");
      }).catch(() => toast.error("Failed to copy to clipboard"));
    }
  };

  const saveEdit = () => {
    if (!documentId) return;
    if (editDraft === (field.value ?? "")) {
      if (correction) removeFieldCorrection(documentId, field.key);
    } else if (editDraft !== (correction?.value ?? "")) {
      setFieldCorrection(documentId, field.key, editDraft);
    }
    setEditing(false);
    toast.success(correction ? "Field updated" : "Field corrected");
  };

  const revertCorrection = () => {
    if (!documentId || !correction) return;
    removeFieldCorrection(documentId, field.key);
    toast.success("Reverted to extracted value");
  };

  const handleAddAnnotation = () => {
    if (!documentId) return;
    const text = annotationDraft.trim();
    if (!text) return;
    addAnnotation(ak, text);
    setAnnotationDraft("");
    toast.success("Annotation added");
  };

  const provenanceSource = React.useMemo(() => {
    if (!rawText || !field.value) return null;
    if (field.value.length < 100) {
      const idx = rawText.indexOf(field.value);
      if (idx !== -1) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(rawText.length, idx + field.value.length + 40);
        let snippet = rawText.slice(start, end);
        if (start > 0) snippet = "..." + snippet;
        if (end < rawText.length) snippet = snippet + "...";
        return snippet;
      }
    }
    return null;
  }, [rawText, field.value]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="contents cursor-context-menu hover:[&>div]:bg-muted/30">
          <div className="px-3 py-2.5 text-xs font-medium text-foreground border-b border-border/60">
            <div className="flex items-center gap-1">
              {field.label}
              {provenance && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setShowProvenance(!showProvenance)} className="ml-0.5 inline-flex items-center justify-center rounded-sm transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" aria-label="Show provenance">
                        <Eye className="h-2.5 w-2.5 text-muted-foreground/60" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">{provenance}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {correction && (
                <span className="ml-1 inline-flex h-3.5 px-1 items-center rounded text-[8px] uppercase tracking-wider border border-[var(--brand)]/40 text-[var(--brand)]">Edited</span>
              )}
              {fieldAnnotations.length > 0 && (
                <span className="ml-1 inline-flex h-3.5 px-1 items-center rounded text-[8px] border border-[var(--severity-notice)]/40 text-[var(--severity-notice)]">
                  <StickyNote className="h-2 w-2 mr-0.5" />{fieldAnnotations.length}
                </span>
              )}
            </div>
          </div>
          <div className="px-3 py-2.5 text-xs text-foreground/90 border-b border-border/60 whitespace-pre-wrap break-words">
            {editing ? (
              <div className="flex items-center gap-1">
                <input ref={editRef} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }} className="flex-1 h-6 rounded border border-border bg-background px-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <button onClick={saveEdit} className="h-6 w-6 flex items-center justify-center rounded bg-[var(--confidence-high)] text-white hover:opacity-90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" aria-label="Save edit"><Check className="h-3 w-3" /></button>
                <button onClick={() => setEditing(false)} className="h-6 w-6 flex items-center justify-center rounded border border-border hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" aria-label="Cancel edit"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <span className={correction ? "italic" : ""}>{displayValue ?? <span className="text-muted-foreground/50 italic">Not found</span>}</span>
            )}
            {showProvenance && provenanceSource && (
              <div className="mt-1.5 p-2 rounded bg-muted/40 border border-border/60 text-[10px] font-mono text-muted-foreground leading-relaxed">
                <span className="text-[9px] uppercase tracking-wider font-semibold block mb-1">Source</span>
                {provenanceSource}
              </div>
            )}
            {fieldAnnotations.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1">
                {fieldAnnotations.map((a) => (
                  <div key={a.id} className="flex items-start gap-1 text-[10px] text-muted-foreground group/ann">
                    <StickyNote className="h-2.5 w-2.5 mt-0.5 shrink-0 text-[var(--severity-notice)]" />
                    <span className="leading-relaxed flex-1">{a.text}</span>
                    <button onClick={() => removeAnnotation(ak, a.id)} className="opacity-0 group-hover/ann:opacity-100 shrink-0 hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" aria-label="Remove annotation">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 py-2.5 border-b border-border/60 flex items-center justify-center gap-0.5">
            <ConfidenceDot confidence={field.confidence} />
            {documentId && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setShowAnnotation(!showAnnotation)} className="ml-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" aria-label="Add annotation">
                      <StickyNote className="h-2.5 w-2.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Annotate</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={copy} disabled={!displayValue}>
          {copied ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}Copy value
        </ContextMenuItem>
        {documentId && <ContextMenuItem onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5 mr-2" />{correction ? "Edit correction" : "Correct value"}</ContextMenuItem>}
        {correction && documentId && <ContextMenuItem onClick={revertCorrection}><Undo2 className="h-3.5 w-3.5 mr-2" />Revert to extracted</ContextMenuItem>}
        {provenanceSource && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setShowProvenance(!showProvenance)}><Eye className="h-3.5 w-3.5 mr-2" />{showProvenance ? "Hide provenance" : "Show provenance"}</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      {showAnnotation && documentId && (
        <div className="col-span-3 px-3 py-2 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2">
            <Input value={annotationDraft} onChange={(e) => setAnnotationDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddAnnotation(); if (e.key === "Escape") { setShowAnnotation(false); setAnnotationDraft(""); } }} placeholder="Add a note about this field..." className="h-7 text-[11px]" />
            <button onClick={handleAddAnnotation} className="h-7 px-2 text-[11px] shrink-0 rounded bg-foreground text-background hover:opacity-90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">Add</button>
            <button onClick={() => { setShowAnnotation(false); setAnnotationDraft(""); }} className="h-7 w-7 flex items-center justify-center rounded-sm hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" aria-label="Cancel annotation"><X className="h-3 w-3" /></button>
          </div>
        </div>
      )}
    </ContextMenu>
  );
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = { high: "bg-[var(--confidence-high)]", medium: "bg-[var(--confidence-medium)]", low: "bg-[var(--confidence-low)]" };
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={"inline-block h-1.5 w-1.5 rounded-full " + (colors[confidence] ?? "bg-muted")} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{confidence} confidence</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}