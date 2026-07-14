import "server-only";

/**
 * Extract plain text from an uploaded business document. Supports PDF, TXT, and Markdown.
 * Scanned/image-only PDFs yield little or no text (no OCR) — the caller treats an empty
 * extraction as a failed ingest.
 */

export const ACCEPTED_DOC_EXTENSIONS = [".pdf", ".txt", ".md"] as const;
export const ACCEPTED_DOC_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
] as const;

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/** True when the file name / mime type is a supported document type. */
export function isSupportedDoc(fileName: string, mimeType: string): boolean {
  const ext = extensionOf(fileName);
  return (
    (ACCEPTED_DOC_EXTENSIONS as readonly string[]).includes(ext) ||
    (ACCEPTED_DOC_MIME_TYPES as readonly string[]).includes(mimeType)
  );
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const ext = extensionOf(fileName);
  const isPdf = mimeType === "application/pdf" || ext === ".pdf";

  if (isPdf) {
    // Import the parser implementation directly to avoid pdf-parse's index.js debug harness.
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = (mod.default ?? mod) as (data: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return (parsed.text ?? "").trim();
  }

  if (
    ext === ".txt" ||
    ext === ".md" ||
    mimeType.startsWith("text/")
  ) {
    return buffer.toString("utf-8").trim();
  }

  throw new Error(`Unsupported document type: ${fileName} (${mimeType || "unknown"})`);
}
