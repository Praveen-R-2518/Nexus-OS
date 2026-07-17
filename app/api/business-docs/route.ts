import { jsonError, rateLimit, requireApiTenantContext } from "@/lib/api-security";
import { extractText, isSupportedDoc } from "@/lib/documents/extract";
import { deleteEmbeddingsForSource, upsertDocEmbeddings } from "@/lib/embeddings/store";
import { isOpenAiConfigured } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "business-docs";

function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

/** GET /api/business-docs → this team's uploaded business documents (newest first). */
export async function GET(request: Request) {
  const limited = rateLimit(request, "api:business-docs:get", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;
  const { supabase, teamId } = tenant;

  const { data, error } = await supabase
    .from("business_documents")
    .select("id, file_name, mime_type, char_count, chunk_count, status, error, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return jsonError(error.message, 500);
  return Response.json({ documents: data ?? [] });
}

/**
 * POST /api/business-docs (multipart form-data, field `file`)
 * Uploads a business document, extracts its text, chunks + embeds it into the vector store,
 * and tracks ingestion status on business_documents.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:business-docs:post", 10, 60_000);
  if (limited) return limited;

  // Embedding requires the model — fail fast + clearly.
  if (!isOpenAiConfigured()) {
    return jsonError("Document ingest is not configured (OPENAI_API_KEY missing)", 503);
  }

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;
  const { supabase, teamId, workspaceId } = tenant;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("file is required", 400);
  }
  if (file.size === 0) {
    return jsonError("file is empty", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonError("file exceeds the 5 MB limit", 413);
  }
  const fileName = safeFileName(file.name || "document");
  const mimeType = file.type || "";
  if (!isSupportedDoc(fileName, mimeType)) {
    return jsonError("Unsupported file type. Upload a PDF, TXT, or Markdown file.", 415);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 1. Track the document (status: processing) so the UI can show progress immediately.
  const { data: docRow, error: insertErr } = await supabase
    .from("business_documents")
    .insert({
      team_id: teamId,
      workspace_id: workspaceId,
      file_name: fileName,
      storage_path: "",
      mime_type: mimeType,
      status: "processing",
    })
    .select("id")
    .single();
  if (insertErr || !docRow) {
    return jsonError(insertErr?.message ?? "Could not create document record", 500);
  }
  const docId = docRow.id as string;
  const storagePath = `${teamId}/${docId}/${fileName}`;

  const markFailed = async (reason: string) => {
    await supabase
      .from("business_documents")
      .update({ status: "failed", error: reason.slice(0, 500) })
      .eq("id", docId)
      .eq("team_id", teamId);
  };

  try {
    // 2. Store the original file (team-scoped path enforced by storage RLS).
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType || undefined, upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);

    await supabase
      .from("business_documents")
      .update({ storage_path: storagePath })
      .eq("id", docId)
      .eq("team_id", teamId);

    // 3. Extract → chunk → embed.
    const text = await extractText(buffer, mimeType, fileName);
    if (!text || text.trim().length === 0) {
      await markFailed("No extractable text (scanned or image-only document?)");
      return jsonError("Could not extract any text from this document.", 422);
    }

    const chunkCount = await upsertDocEmbeddings({
      supabase,
      teamId,
      workspaceId,
      sourceId: docId,
      fileName,
      text,
    });

    const { data: finalRow, error: finalErr } = await supabase
      .from("business_documents")
      .update({
        status: "ready",
        char_count: text.length,
        chunk_count: chunkCount,
        error: null,
      })
      .eq("id", docId)
      .eq("team_id", teamId)
      .select("id, file_name, mime_type, char_count, chunk_count, status, error, created_at")
      .single();
    if (finalErr) throw new Error(finalErr.message);

    return Response.json({ document: finalRow }, { status: 201 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Ingest failed";
    await markFailed(reason);
    return jsonError(reason, 500);
  }
}

/** DELETE /api/business-docs?id=<uuid> → remove the document, its embeddings, and its file. */
export async function DELETE(request: Request) {
  const limited = rateLimit(request, "api:business-docs:delete", 30, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;
  const { supabase, teamId } = tenant;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return jsonError("id is required", 400);

  const { data: doc, error: fetchErr } = await supabase
    .from("business_documents")
    .select("id, storage_path")
    .eq("id", id)
    .eq("team_id", teamId)
    .maybeSingle();
  if (fetchErr) return jsonError(fetchErr.message, 500);
  if (!doc) return jsonError("Document not found", 404);

  await deleteEmbeddingsForSource({ supabase, teamId, sourceId: id });
  if (doc.storage_path) {
    await supabase.storage.from(BUCKET).remove([doc.storage_path as string]);
  }
  const { error: delErr } = await supabase
    .from("business_documents")
    .delete()
    .eq("id", id)
    .eq("team_id", teamId);
  if (delErr) return jsonError(delErr.message, 500);

  return Response.json({ ok: true });
}
