"use client";

import * as React from "react";
import { useDropzone, type FileRejection, type FileError } from "react-dropzone";
import { Upload, FileText, X, AlertCircle, Files } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/msword": [".doc"],
  "text/plain": [".txt", ".md", ".markdown"],
  "text/csv": [".csv", ".tsv"],
  "text/markdown": [".md", ".markdown"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

interface DropzoneProps {
  onFile: (file: File) => void;
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
}

export function Dropzone({ onFile, onFiles, disabled }: DropzoneProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);

  const onDrop = React.useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setError(null);
      if (rejected.length > 0) {
        const r = rejected[0];
        if (r.errors?.some((e: FileError) => e.code === "file-too-large")) {
          setError(`"${r.file.name}" is too large. Max size is 25 MB.`);
        } else if (r.errors?.some((e: FileError) => e.code === "file-invalid-type")) {
          setError(
            `"${r.file.name}" is not a supported type. Doclyze supports PDF, DOCX, XLSX, TXT, MD, CSV/TSV, PNG, JPG, WEBP. PPTX is coming soon.`
          );
        } else {
          setError(`Could not accept "${r.file.name}". ${r.errors?.[0]?.message ?? ""}`);
        }
        return;
      }
      if (accepted.length > 0) {
        setSelectedFiles(accepted);
        if (accepted.length === 1) {
          onFile(accepted[0]);
        }
        onFiles?.(accepted);
      }
    },
    [onFile, onFiles]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    multiple: true,
    disabled,
  });

  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors outline-none cursor-pointer",
          "focus-visible:ring-2 focus-visible:ring-ring",
          isDragActive && !isDragReject
            ? "border-[var(--brand)] bg-[var(--brand-soft)]"
            : isDragReject
            ? "border-[var(--severity-warning)] bg-[var(--severity-warning)]/5"
            : "border-border bg-background hover:border-foreground/30 hover:bg-muted/20",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        aria-label="Upload documents"
      >
        <input {...getInputProps()} />
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
            isDragActive
              ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
              : "bg-[var(--brand-soft)] text-[var(--brand)]"
          )}
        >
          <Upload className="h-6 w-6" />
        </div>
        <div>
          <p className="text-base font-semibold">
            {isDragActive
              ? selectedFiles.length > 1
                ? `Drop ${selectedFiles.length} files to analyze`
                : "Drop the file to analyze"
              : "Tap to select or drop files"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            or <span className="text-foreground underline underline-offset-2">browse</span> — PDF, DOCX, XLSX, TXT, MD, CSV/TSV, images
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            Max 25 MB each · Supports multiple files · Files stay in your browser
          </p>
        </div>
      </div>

      {/* Selected files preview */}
      {selectedFiles.length > 0 && !error && (
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/50">
            <Files className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected
            </span>
            <span className="text-[11px] text-muted-foreground/70 ml-auto">
              {formatSize(selectedFiles.reduce((acc, f) => acc + f.size, 0))} total
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {selectedFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-3 px-3 py-2 border-b border-border/40 last:border-b-0"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-background border border-border shrink-0">
                  <FileText className="h-3.5 w-3.5 text-[var(--brand)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(file.size)} · {file.type || "unknown type"}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">#{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--severity-warning)]/40 bg-[var(--severity-warning)]/10 px-3 py-2.5 text-sm text-[var(--severity-warning)]"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Couldn&apos;t accept that file</p>
            <p className="mt-0.5 text-xs opacity-90">{error}</p>
          </div>
          <button
            onClick={() => {
              setError(null);
              setSelectedFiles([]);
            }}
            className="text-[var(--severity-warning)] hover:opacity-70"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
