"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";

/**
 * Structural loading skeleton matching the final layout shape.
 */
export function DocumentPresentorSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted/60" />
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-[minmax(180px,1fr)_2fr_28px] gap-0">
            <div className="bg-muted/40 px-3 py-2 border-b border-border">
              <div className="h-2.5 w-10 rounded bg-muted/50" />
            </div>
            <div className="bg-muted/40 px-3 py-2 border-b border-border">
              <div className="h-2.5 w-10 rounded bg-muted/50" />
            </div>
            <div className="bg-muted/40 px-3 py-2 border-b border-border" />
            {Array.from({ length: 5 }).map((_, i) => (
              <React.Fragment key={i}>
                <div className="px-3 py-2.5 border-b border-border/60">
                  <div className="h-3 w-24 rounded bg-muted/40" />
                </div>
                <div className="px-3 py-2.5 border-b border-border/60">
                  <div className="h-3 w-full rounded bg-muted/30" />
                </div>
                <div className="px-3 py-2.5 border-b border-border/60 flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted/40" />
                </div>
              </React.Fragment>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="flex gap-1">
            <div className="h-7 w-16 rounded-md bg-muted/40" />
            <div className="h-7 w-16 rounded-md bg-muted/40" />
          </div>
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 border-b border-border flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-2.5 w-20 rounded bg-muted/50" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-4 gap-0 border-b border-border/40">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="px-3 py-2.5">
                  <div className="h-3 rounded bg-muted/25" style={{ width: `${40 + Math.random() * 50}%` }} />
                </div>
              ))}
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-2">
            <div className="h-2.5 w-24 rounded bg-muted/30" />
            <div className="flex gap-2">
              <div className="h-2.5 w-8 rounded bg-muted/30" />
              <div className="h-2.5 w-8 rounded bg-muted/30" />
              <div className="h-2.5 w-8 rounded bg-muted/30" />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

export function InsightsPanelSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-pulse">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-3 w-40 rounded bg-muted/40 mt-1" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-16 rounded-md bg-muted/40" />
          </div>
        </div>
      </Card>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="p-3.5 border-l-2">
          <div className="flex items-start gap-2.5">
            <div className="h-4 w-4 rounded bg-muted/40 mt-0.5" />
            <div className="flex-1">
              <div className="h-3.5 w-48 rounded bg-muted/40" />
              <div className="h-3 w-full rounded bg-muted/25 mt-2" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
