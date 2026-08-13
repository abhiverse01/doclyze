"use client";

import * as React from "react";
import { StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDoclyzeStore, annotationKey } from "@/lib/store";
import { toast } from "sonner";

export function DocumentAnnotation({ docId }: { docId: string }) {
  const { annotations, addAnnotation, removeAnnotation } = useDoclyzeStore();
  const [showInput, setShowInput] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const key = annotationKey(docId);
  const anns = annotations[key] ?? [];

  React.useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    addAnnotation(key, text);
    setDraft("");
    setShowInput(false);
    toast.success("Annotation added");
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-[var(--brand)]" />
          <h3 className="text-sm font-semibold">Document Notes</h3>
          {anns.length > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-muted px-1 text-[9px] font-mono text-muted-foreground">
              {anns.length}
            </span>
          )}
        </div>
        {!showInput && (
          <Button variant="ghost" size="sm" onClick={() => setShowInput(true)} className="h-6 text-xs">
            <StickyNote className="h-3 w-3 mr-1" />
            Add note
          </Button>
        )}
      </div>
      {showInput && (
        <div className="flex items-center gap-2 mb-3">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setShowInput(false); setDraft(""); }
            }}
            placeholder="Add a note about this document..."
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={handleAdd} className="h-8 text-xs shrink-0">Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowInput(false); setDraft(""); }} className="h-8 text-xs shrink-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {anns.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {anns.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs group">
              <span className="text-muted-foreground leading-relaxed flex-1">{a.text}</span>
              <button
                onClick={() => { removeAnnotation(key, a.id); toast.success("Note removed"); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Remove annotation"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
