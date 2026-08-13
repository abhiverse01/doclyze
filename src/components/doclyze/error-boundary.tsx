"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DoclyzeErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Doclyze ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--severity-warning)]/10">
              <AlertTriangle className="h-6 w-6 text-[var(--severity-warning)]" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Doclyze encountered an unexpected error while processing this document.
              This is usually caused by a malformed or unsupported file format.
            </p>
            {this.state.error && (
              <pre className="mt-4 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 text-left overflow-auto max-h-32 font-mono">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Try again
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Client wrapper so we can use the class-based error boundary in a "use client" tree.
 * Used in the (app) layout.
 */
export function ErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
  return <DoclyzeErrorBoundary>{children}</DoclyzeErrorBoundary>;
}
