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

export interface CaptureInboxRepository {
  /** Extracts comparable sales immediately, once, and stores the result alongside the raw HTML. */
  saveCapture(html: string, sourceUrl: string | null): Promise<SaveCaptureResult>;
  listPendingCaptures(): Promise<PendingCapture[]>;
  /** Writes the capture's already-extracted sales onto the item, then deletes the capture. */
  importCapture(captureId: string, itemId: string): Promise<ImportCaptureOutcome>;
  /** Discards a capture without importing it (e.g. the wrong page was saved). */
  deleteCapture(captureId: string): Promise<{ ok: boolean }>;
}
