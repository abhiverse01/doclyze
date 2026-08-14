/**
 * Doclyze Store Regression Tests (v4)
 * =====================================
 * Tests that would have caught every bug found in v3/v4.
 * Run with: bun run test
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage for zustand persist
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn(() => null),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2) },
  writable: true,
});

const { useDoclyzeStore } = await import("@/lib/store");
import type { StoredDocument } from "@/lib/store";

function makeDoc(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: `doc-${Math.random().toString(36).slice(2, 8)}`,
    filename: "test.pdf",
    detectedType: "resume",
    fileSizeBytes: 1024,
    extractedAt: new Date().toISOString(),
    completenessScore: 75,
    ocrUsed: false,
    ...overrides,
  };
}

function resetStore() {
  useDoclyzeStore.setState({
    activeDocumentId: null,
    documents: [],
    aiInsights: {},
    settings: { theme: "system", sidebarCollapsed: false, aiInsightsEnabled: false },
    fieldCorrections: {},
    annotations: {},
  });
  localStorageMock.clear();
}

describe("Doclyze Store", () => {
  beforeEach(resetStore);

  describe("addDocument idempotency", () => {
    it("should NOT create duplicates when the same doc ID is added twice", () => {
      const doc = makeDoc({ id: "same-id" });
      useDoclyzeStore.getState().addDocument(doc);
      expect(useDoclyzeStore.getState().documents).toHaveLength(1);

      const updated = makeDoc({ id: "same-id", filename: "updated.pdf" });
      useDoclyzeStore.getState().addDocument(updated);

      const state = useDoclyzeStore.getState();
      expect(state.documents).toHaveLength(1);
      expect(state.documents[0].filename).toBe("updated.pdf");
      expect(state.documents[0].id).toBe("same-id");
    });

    it("should handle rapid double-add without duplicates", () => {
      const doc = makeDoc({ id: "rapid-id" });
      useDoclyzeStore.getState().addDocument(doc);
      useDoclyzeStore.getState().addDocument(doc);
      expect(useDoclyzeStore.getState().documents).toHaveLength(1);
    });

    /**
     * v5 regression test — models the ACTUAL duplicate bug.
     * The real bug was that the Dropzone fired both onFile and onFiles for
     * a single file drop, causing two runExtractionPipeline calls that each
     * generated a DIFFERENT crypto.randomUUID(). The store's same-ID
     * dedup didn't help because the IDs were different.
     * This test simulates that exact pattern and verifies the store behavior.
     */
    it("should create TWO entries when two DIFFERENT IDs are added for the same logical file", () => {
      // This documents the known limitation: the store cannot dedup
      // across different IDs — the fix must be at the call site (Dropzone),
      // not the reducer. This test exists to prove the store correctly
      // stores what it receives.
      const docA = makeDoc({ id: "uuid-A", filename: "report.pdf" });
      const docB = makeDoc({ id: "uuid-B", filename: "report.pdf" });
      useDoclyzeStore.getState().addDocument(docA);
      useDoclyzeStore.getState().addDocument(docB);
      // With different IDs, the store treats them as different docs.
      // The fix (Dropzone no longer fires both onFile and onFiles) prevents
      // this from happening at the source.
      expect(useDoclyzeStore.getState().documents).toHaveLength(2);
    });

    it("should keep different documents separate", () => {
      useDoclyzeStore.getState().addDocument(makeDoc({ id: "doc-1" }));
      useDoclyzeStore.getState().addDocument(makeDoc({ id: "doc-2" }));
      expect(useDoclyzeStore.getState().documents).toHaveLength(2);
    });

    it("should enforce the RECENT_DOC_LIMIT of 20", () => {
      for (let i = 0; i < 25; i++) {
        useDoclyzeStore.getState().addDocument(makeDoc({ id: `limit-${i}` }));
      }
      expect(useDoclyzeStore.getState().documents).toHaveLength(20);
      expect(useDoclyzeStore.getState().documents[0].id).toBe("limit-24");
    });
  });

  describe("field corrections", () => {
    it("should set and retrieve a field correction", () => {
      useDoclyzeStore.getState().setFieldCorrection("doc-1", "email", "corrected@email.com");
      const c = useDoclyzeStore.getState().fieldCorrections["doc-1::email"];
      expect(c).toBeDefined();
      expect(c.value).toBe("corrected@email.com");
      expect(c.correctedAt).toBeTruthy();
    });

    it("should remove a field correction", () => {
      useDoclyzeStore.getState().setFieldCorrection("doc-1", "email", "wrong@email.com");
      useDoclyzeStore.getState().removeFieldCorrection("doc-1", "email");
      expect(useDoclyzeStore.getState().fieldCorrections["doc-1::email"]).toBeUndefined();
    });

    it("should update an existing correction", () => {
      useDoclyzeStore.getState().setFieldCorrection("doc-1", "email", "first@email.com");
      useDoclyzeStore.getState().setFieldCorrection("doc-1", "email", "second@email.com");
      expect(useDoclyzeStore.getState().fieldCorrections["doc-1::email"].value).toBe("second@email.com");
    });
  });

  describe("annotations", () => {
    it("should add and retrieve document-level annotations", () => {
      useDoclyzeStore.getState().addAnnotation("doc-1", "Check this date with HR");
      const anns = useDoclyzeStore.getState().annotations["doc-1"];
      expect(anns).toHaveLength(1);
      expect(anns[0].text).toBe("Check this date with HR");
      expect(anns[0].id).toBeTruthy();
    });

    it("should add and retrieve field-level annotations", () => {
      useDoclyzeStore.getState().addAnnotation("doc-1::email", "This might be outdated");
      const anns = useDoclyzeStore.getState().annotations["doc-1::email"];
      expect(anns).toHaveLength(1);
      expect(anns[0].text).toBe("This might be outdated");
    });

    it("should remove an annotation by ID", () => {
      useDoclyzeStore.getState().addAnnotation("doc-1", "Note 1");
      const id = useDoclyzeStore.getState().annotations["doc-1"][0].id;
      useDoclyzeStore.getState().removeAnnotation("doc-1", id);
      expect(useDoclyzeStore.getState().annotations["doc-1"]).toHaveLength(0);
    });

    it("should accumulate multiple annotations", () => {
      useDoclyzeStore.getState().addAnnotation("doc-1", "First");
      useDoclyzeStore.getState().addAnnotation("doc-1", "Second");
      useDoclyzeStore.getState().addAnnotation("doc-1", "Third");
      expect(useDoclyzeStore.getState().annotations["doc-1"]).toHaveLength(3);
    });
  });

  describe("removeDocument", () => {
    it("should clear activeDocumentId when removing the active doc", () => {
      useDoclyzeStore.getState().addDocument(makeDoc({ id: "to-remove" }));
      expect(useDoclyzeStore.getState().activeDocumentId).toBe("to-remove");
      useDoclyzeStore.getState().removeDocument("to-remove");
      expect(useDoclyzeStore.getState().activeDocumentId).toBeNull();
      expect(useDoclyzeStore.getState().documents).toHaveLength(0);
    });

    it("should keep activeDocumentId when removing a different doc", () => {
      useDoclyzeStore.getState().addDocument(makeDoc({ id: "keep" }));
      useDoclyzeStore.getState().addDocument(makeDoc({ id: "remove" }));
      useDoclyzeStore.getState().setActiveDocument("keep");
      useDoclyzeStore.getState().removeDocument("remove");
      expect(useDoclyzeStore.getState().activeDocumentId).toBe("keep");
      expect(useDoclyzeStore.getState().documents).toHaveLength(1);
    });
  });

  describe("settings", () => {
    it("should toggle sidebar", () => {
      expect(useDoclyzeStore.getState().settings.sidebarCollapsed).toBe(false);
      useDoclyzeStore.getState().toggleSidebar();
      expect(useDoclyzeStore.getState().settings.sidebarCollapsed).toBe(true);
      useDoclyzeStore.getState().toggleSidebar();
      expect(useDoclyzeStore.getState().settings.sidebarCollapsed).toBe(false);
    });

    it("should update individual settings without affecting others", () => {
      useDoclyzeStore.getState().updateSettings({ theme: "dark" });
      expect(useDoclyzeStore.getState().settings.theme).toBe("dark");
      expect(useDoclyzeStore.getState().settings.sidebarCollapsed).toBe(false);
    });
  });

  describe("store invariants", () => {
    it("should always have unique document IDs after mixed adds", () => {
      for (let i = 0; i < 30; i++) {
        const id = i % 5 === 0 ? "dupe-id" : `unique-${i}`;
        useDoclyzeStore.getState().addDocument(makeDoc({ id }));
      }
      const ids = useDoclyzeStore.getState().documents.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it("activeDocumentId should always point to an existing doc or be null", () => {
      useDoclyzeStore.getState().addDocument(makeDoc({ id: "exists" }));
      useDoclyzeStore.getState().addDocument(makeDoc({ id: "also-exists" }));
      useDoclyzeStore.getState().setActiveDocument("exists");
      const state = useDoclyzeStore.getState();
      if (state.activeDocumentId !== null) {
        expect(state.documents.some((d) => d.id === state.activeDocumentId)).toBe(true);
      }
      useDoclyzeStore.getState().removeDocument("exists");
      expect(useDoclyzeStore.getState().activeDocumentId).toBeNull();
    });
  });
});
