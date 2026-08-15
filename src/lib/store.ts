/**
 * Doclyze App Store — Client State
 * ================================
 * Manages the document list, active document, AI insights, settings,
 * field corrections, and per-document/field annotations.
 *
 * ## Invariants
 * - `documents` array has **unique** `id` values — no duplicates.
 *   `addDocument` is idempotent: if a doc with the same `id` already
 *   exists, it is replaced in-place (moved to front) rather than appended.
 * - `activeDocumentId` is always `null` or points to a document that
 *   exists in the `documents` array.
 * - `fieldCorrections` is keyed by `${docId}::${fieldKey}`.
 * - `annotations` is keyed by `${docId}` (document-level) or
 *   `${docId}::${fieldKey}` (field-level).
 * - Persisted state is validated on rehydration — malformed entries
 *   are silently discarded rather than crashing the app.
 *
 * v4: Added rehydration validation, idempotent addDocument,
 *      field corrections, annotations, and Zod-free manual validation.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DoclyzeExtractionResult, Insight } from "@/lib/extraction/types";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface StoredDocument {
  id: string;
  filename: string;
  detectedType: string;
  /** v5: Numeric classification confidence 0-100. */
  classificationConfidence: number;
  fileSizeBytes: number;
  extractedAt: string;
  completenessScore: number;
  ocrUsed: boolean;
  /** Full extraction result — in-memory only, stripped before persistence. */
  result?: DoclyzeExtractionResult;
}

export interface AIInsightState {
  status: "idle" | "loading" | "ready" | "error" | "not_configured";
  insights: Insight[];
  error?: string;
}

export interface FieldCorrection {
  /** The corrected value — replaces the original extracted value. */
  value: string;
  /** ISO timestamp of when the correction was made. */
  correctedAt: string;
}

export interface Annotation {
  id: string;
  text: string;
  createdAt: string;
}

interface Settings {
  theme: "light" | "dark" | "system";
  sidebarCollapsed: boolean;
  aiInsightsEnabled: boolean;
}

interface AppState {
  activeDocumentId: string | null;
  documents: StoredDocument[];
  aiInsights: Record<string, AIInsightState>;
  settings: Settings;

  // v4: Field corrections — keyed by `${docId}::${fieldKey}`
  fieldCorrections: Record<string, FieldCorrection>;
  // v4: Annotations — document-level keyed by `${docId}`,
  //     field-level keyed by `${docId}::${fieldKey}`
  annotations: Record<string, Annotation[]>;

  // Actions
  setActiveDocument: (id: string | null) => void;
  openDocument: (id: string) => void;
  addDocument: (doc: StoredDocument) => void;
  removeDocument: (id: string) => void;
  clearDocuments: () => void;
  clearAllData: () => void;
  setAIInsights: (docId: string, state: AIInsightState) => void;
  updateSettings: (partial: Partial<Settings>) => void;
  toggleSidebar: () => void;
  // v4: Correction & annotation actions
  setFieldCorrection: (docId: string, fieldKey: string, value: string) => void;
  removeFieldCorrection: (docId: string, fieldKey: string) => void;
  addAnnotation: (key: string, text: string) => void;
  removeAnnotation: (key: string, annotationId: string) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RECENT_DOC_LIMIT = 20;

// ─── Rehydration validation ─────────────────────────────────────────────────

/** Validate and sanitize persisted state on load. */
function validateState(raw: unknown): Partial<AppState> {
  if (!raw || typeof raw !== "object") return {};
  const state = raw as Record<string, unknown>;

  const result: Partial<AppState> = {};

  // Validate documents — must be an array of objects with string `id`
  if (Array.isArray(state.documents)) {
    const seen = new Set<string>();
    const validDocs: StoredDocument[] = [];
    for (const d of state.documents) {
      if (d && typeof d === "object" && typeof d.id === "string" && d.id.length > 0) {
        if (seen.has(d.id)) continue; // deduplicate at rehydration boundary
        seen.add(d.id);
        validDocs.push({
          id: d.id,
          filename: typeof d.filename === "string" ? d.filename : "unknown",
          detectedType: typeof d.detectedType === "string" ? d.detectedType : "general",
          classificationConfidence: typeof d.classificationConfidence === "number" ? d.classificationConfidence : 0,
          fileSizeBytes: typeof d.fileSizeBytes === "number" ? d.fileSizeBytes : 0,
          extractedAt: typeof d.extractedAt === "string" ? d.extractedAt : new Date().toISOString(),
          completenessScore: typeof d.completenessScore === "number" ? d.completenessScore : 0,
          ocrUsed: typeof d.ocrUsed === "boolean" ? d.ocrUsed : false,
          // Never restore `result` from persistence
          result: undefined,
        });
      }
    }
    result.documents = validDocs;
  }

  // Validate settings
  if (state.settings && typeof state.settings === "object") {
    const s = state.settings as Record<string, unknown>;
    result.settings = {
      theme: s.theme === "light" || s.theme === "dark" || s.theme === "system" ? s.theme : "system",
      sidebarCollapsed: typeof s.sidebarCollapsed === "boolean" ? s.sidebarCollapsed : false,
      aiInsightsEnabled: typeof s.aiInsightsEnabled === "boolean" ? s.aiInsightsEnabled : false,
    };
  }

  // Validate fieldCorrections
  if (state.fieldCorrections && typeof state.fieldCorrections === "object" && !Array.isArray(state.fieldCorrections)) {
    const fc = state.fieldCorrections as Record<string, unknown>;
    const valid: Record<string, FieldCorrection> = {};
    for (const [k, v] of Object.entries(fc)) {
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).value === "string") {
        valid[k] = {
          value: (v as Record<string, unknown>).value as string,
          correctedAt: typeof (v as Record<string, unknown>).correctedAt === "string"
            ? (v as Record<string, unknown>).correctedAt as string
            : new Date().toISOString(),
        };
      }
    }
    result.fieldCorrections = valid;
  }

  // Validate annotations
  if (state.annotations && typeof state.annotations === "object" && !Array.isArray(state.annotations)) {
    const ann = state.annotations as Record<string, unknown>;
    const valid: Record<string, Annotation[]> = {};
    for (const [k, v] of Object.entries(ann)) {
      if (Array.isArray(v)) {
        const validAnns: Annotation[] = [];
        for (const a of v) {
          if (a && typeof a === "object" && typeof (a as Record<string, unknown>).text === "string" && typeof (a as Record<string, unknown>).id === "string") {
            validAnns.push({
              id: (a as Record<string, unknown>).id as string,
              text: (a as Record<string, unknown>).text as string,
              createdAt: typeof (a as Record<string, unknown>).createdAt === "string"
                ? (a as Record<string, unknown>).createdAt as string
                : new Date().toISOString(),
            });
          }
        }
        valid[k] = validAnns;
      }
    }
    result.annotations = valid;
  }

  return result;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useDoclyzeStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeDocumentId: null,
      documents: [],
      aiInsights: {},
      settings: {
        theme: "system",
        sidebarCollapsed: false,
        aiInsightsEnabled: false,
      },
      fieldCorrections: {},
      annotations: {},

      setActiveDocument: (id) => set({ activeDocumentId: id }),

      openDocument: (id) => set({ activeDocumentId: id }),

      /**
       * Idempotent document add/update.
       * If a document with the same `id` exists, it is replaced (moved to front).
       * This prevents duplicates at the write layer — the sidebar dedup filter
       * remains as a defensive safety net but is now redundant.
       */
      addDocument: (doc) =>
        set((state) => {
          const existingIdx = state.documents.findIndex((d) => d.id === doc.id);
          let updated: StoredDocument[];
          if (existingIdx !== -1) {
            // Replace in place and move to front
            updated = [
              doc,
              ...state.documents.slice(0, existingIdx),
              ...state.documents.slice(existingIdx + 1),
            ];
          } else {
            updated = [doc, ...state.documents];
          }
          return {
            documents: updated.slice(0, RECENT_DOC_LIMIT),
            activeDocumentId: doc.id,
          };
        }),

      removeDocument: (id) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
          activeDocumentId:
            state.activeDocumentId === id ? null : state.activeDocumentId,
        })),

      clearDocuments: () => set({ documents: [], activeDocumentId: null }),

      setAIInsights: (docId, aiState) =>
        set((state) => ({
          aiInsights: { ...state.aiInsights, [docId]: aiState },
        })),

      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),

      toggleSidebar: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            sidebarCollapsed: !state.settings.sidebarCollapsed,
          },
        })),

      // ── Field corrections ────────────────────────────────────────────────
  clearAllData: () =>
        set({ documents: [], activeDocumentId: null, aiInsights: {}, fieldCorrections: {}, annotations: {} }),

      setFieldCorrection: (docId, fieldKey, value) =>
        set((state) => ({
          fieldCorrections: {
            ...state.fieldCorrections,
            [`${docId}::${fieldKey}`]: {
              value,
              correctedAt: new Date().toISOString(),
            },
          },
        })),

      removeFieldCorrection: (docId, fieldKey) =>
        set((state) => {
          const next = { ...state.fieldCorrections };
          delete next[`${docId}::${fieldKey}`];
          return { fieldCorrections: next };
        }),

      // ── Annotations ──────────────────────────────────────────────────────
      addAnnotation: (key, text) =>
        set((state) => {
          const existing = state.annotations[key] ?? [];
          return {
            annotations: {
              ...state.annotations,
              [key]: [
                ...existing,
                {
                  id: crypto.randomUUID(),
                  text,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          };
        }),

      removeAnnotation: (key, annotationId) =>
        set((state) => ({
          annotations: {
            ...state.annotations,
            [key]: (state.annotations[key] ?? []).filter(
              (a) => a.id !== annotationId
            ),
          },
        })),
    }),
    {
      name: "doclyze-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        documents: state.documents.map((d) => ({
          ...d,
          result: undefined, // Strip full result — too large for localStorage
        })),
        settings: state.settings,
        fieldCorrections: state.fieldCorrections,
        annotations: state.annotations,
      }),
      merge: (persisted, current) => {
        // Validate persisted state before merging
        const validated = validateState(persisted);
        return {
          ...current,
          // Only accept validated fields from persistence
          ...(validated.documents !== undefined && { documents: validated.documents }),
          ...(validated.settings !== undefined && { settings: validated.settings }),
          ...(validated.fieldCorrections !== undefined && { fieldCorrections: validated.fieldCorrections }),
          ...(validated.annotations !== undefined && { annotations: validated.annotations }),
        };
      },
    }
  )
);

/** Helper: get the active document (with full result) from the store. */
export function useActiveDocument(): StoredDocument | null {
  return useDoclyzeStore((s) => {
    if (!s.activeDocumentId) return null;
    return s.documents.find((d) => d.id === s.activeDocumentId) ?? null;
  });
}

/** Helper: build the correction key for a field. */
export function correctionKey(docId: string, fieldKey: string): string {
  return `${docId}::${fieldKey}`;
}

/** Helper: build the annotation key for a document or field. */
export function annotationKey(docId: string, fieldKey?: string): string {
  return fieldKey ? `${docId}::${fieldKey}` : docId;
}
