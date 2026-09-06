export interface PendingCapture {
  id: string;
  sourceUrl: string | null;
  pageTitle: string | null;
  createdAt: string;
  extractedCount: number;
}

export type SaveCaptureResult = { id: string; extractedCount: number };

export type ImportCaptureOutcome =
  | { ok: true; imported: number }
  | { ok: false; reason: string };

export type UndoImportOutcome = { ok: true } | { ok: false; reason: string };

export interface CaptureInboxRepository {
  /** Extracts comparable sales immediately, once, and stores the result alongside the raw HTML. */
  saveCapture(html: string, sourceUrl: string | null): Promise<SaveCaptureResult>;
  listPendingCaptures(): Promise<PendingCapture[]>;
  /**
   * Writes the capture's already-extracted sales onto the item and marks the
   * capture imported (it keeps its row and raw html so undoImport can revert
   * this cleanly, rather than being deleted).
   */
  importCapture(captureId: string, itemId: string): Promise<ImportCaptureOutcome>;
  /** Reverts a prior importCapture onto this exact item: removes the sales it added and returns the capture to pending. */
  undoImport(captureId: string, itemId: string): Promise<UndoImportOutcome>;
  /** Discards a capture without importing it (e.g. the wrong page was saved). */
  deleteCapture(captureId: string): Promise<{ ok: boolean }>;
}
