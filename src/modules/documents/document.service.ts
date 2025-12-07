import { v4 as uuidv4 } from "uuid";
import { customLogger } from "../../shared/utils/logger.ts";
import type { Document_GET, AnalyzeResponse } from "./document.schema.ts";
import prisma from "../../shared/services/prisma.client.ts";

export const createDocumentRecord = async (payload: {
  filename: string;
  size: number;
  mime_type: string;
  s3_url?: string;
  s3_key?: string;
  local_path?: string;
  extracted_text?: string;
}): Promise<Document_GET> => {
  const id = uuidv4();
  const created_at = new Date().toISOString();
  const doc: Document_GET = {
    id,
    filename: payload.filename,
    size: payload.size,
    mime_type: payload.mime_type,
    s3_url: payload.s3_url,
    s3_key: payload.s3_key,
    local_path: payload.local_path,
    extracted_text: payload.extracted_text,
    created_at,
    updated_at: created_at,
  };
  // If pool is configured, try to insert into Postgres; otherwise keep in-memory.
  try {
    const created = await prisma.document.create({
      data: {
        id,
        filename: payload.filename,
        size: payload.size,
        mime_type: payload.mime_type,
        s3_url: payload.s3_url,
        s3_key: payload.s3_key,
        local_path: payload.local_path,
        extracted_text: payload.extracted_text,
      },
    });
    return {
      id: created.id,
      filename: created.filename,
      size: created.size ?? 0,
      mime_type: created.mime_type ?? "",
      s3_url: created.s3_url ?? undefined,
      s3_key: created.s3_key ?? undefined,
      local_path: created.local_path ?? undefined,
      extracted_text: created.extracted_text ?? undefined,
      analysis: created.analysis ?? undefined,
      created_at: created.created_at.toISOString(),
      updated_at: created.updated_at.toISOString(),
    };
  } catch (error) {
    customLogger(error, "createDocumentRecord:prisma");
    throw error;
  }
};

export const getDocument = async (id: string): Promise<Document_GET | null> => {
  try {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return null;
    return {
      id: doc.id,
      filename: doc.filename,
      size: doc.size ?? 0,
      mime_type: doc.mime_type ?? "",
      s3_url: doc.s3_url ?? undefined,
      s3_key: doc.s3_key ?? undefined,
      local_path: doc.local_path ?? undefined,
      extracted_text: doc.extracted_text ?? undefined,
      analysis: doc.analysis ?? undefined,
      created_at: doc.created_at.toISOString(),
      updated_at: doc.updated_at ? doc.updated_at.toISOString() : undefined,
    };
  } catch (error) {
    customLogger(error, "getDocument:prisma");
    throw error;
  }
};

export const saveExtractedText = async (id: string, text: string) => {
  try {
    await prisma.document.update({
      where: { id },
      data: { extracted_text: text },
    });
    return;
  } catch (error) {
    customLogger(error, "saveExtractedText:prisma");
    throw error;
  }
};

export const saveAnalysis = async (id: string, analysis: AnalyzeResponse) => {
  try {
    await prisma.document.update({ where: { id }, data: { analysis } });
    return;
  } catch (error) {
    customLogger(error, "saveAnalysis:prisma");
    throw error;
  }
};

export const listDocuments = async (): Promise<Document_GET[]> => {
  try {
    const docs = await prisma.document.findMany({
      orderBy: { created_at: "desc" },
    });
    return docs.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      size: doc.size ?? 0,
      mime_type: doc.mime_type ?? "",
      s3_url: doc.s3_url ?? undefined,
      s3_key: doc.s3_key ?? undefined,
      local_path: doc.local_path ?? undefined,
      extracted_text: doc.extracted_text ?? undefined,
      analysis: doc.analysis ?? undefined,
      created_at: doc.created_at.toISOString(),
      updated_at: doc.updated_at ? doc.updated_at.toISOString() : undefined,
    }));
  } catch (error) {
    customLogger(error, "listDocuments:prisma");
    throw error;
  }
};
