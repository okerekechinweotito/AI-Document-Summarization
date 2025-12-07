import { createFactory } from "hono/factory";
import { customLogger } from "../../shared/utils/logger.ts";
import * as docService from "./document.service.ts";
import * as fileStorage from "../../shared/services/fileStorage.service.ts";
import * as textExtraction from "../../shared/services/textExtraction.service.ts";
import * as llmService from "../../shared/services/llm.service.ts";
import type { Document_GET } from "./document.schema.ts";
import { documentIdParam } from "./document.schema.ts";
import { formatSuccess, formatError } from "../../shared/utils/response.ts";

const factory = createFactory();
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export const upload_document = factory.createHandlers(async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";
    if (!contentType.startsWith("multipart/form-data")) {
      return c.json(
        formatError({ text: "Content must be multipart/form-data" }, 400),
        400
      );
    }
    const form = await c.req.formData();
    const file = form.get("file") as unknown as File | null;
    if (!file)
      return c.json(formatError({ text: "file field is required" }, 400), 400);

    const filename = file.name;
    let mime = file.type || "";
    if (!mime) {
      // infer from filename extension
      if (filename.endsWith(".pdf")) mime = "application/pdf";
      if (filename.endsWith(".docx"))
        mime =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_BYTES) {
      return c.json(formatError({ text: "File size exceeds 5MB" }, 400), 400);
    }
    // validate file types
    if (
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(mime)
    ) {
      return c.json(
        formatError({ text: "File must be PDF or DOCX" }, 400),
        400
      );
    }
    // store file
    const stored = await fileStorage.storeFile(
      buffer,
      `${Date.now()}-${filename}`
    );
    // create DB record
    const doc = await docService.createDocumentRecord({
      filename,
      size: buffer.length,
      mime_type: mime,
      s3_url: stored.s3Url,
      s3_key: stored.s3Key,
      local_path: stored.localPath,
    });
    // extract text synchronously so the response includes extracted_text
    try {
      const text = await textExtraction.extractText(buffer, mime);
      await docService.saveExtractedText(doc.id, text);
      (doc as any).extracted_text = text;
    } catch (error) {
      // log the extraction error but still return the created record without extracted_text
      customLogger(error, "upload_document:extraction");
      return c.json(
        formatError({ text: "File uploaded but text extraction failed" }, 500, {
          error: (error as any)?.message ?? String(error),
        }),
        500
      );
    }

    // Build nested response shape: file_info, metadata, analysis
    const file_info = {
      id: doc.id,
      filename: doc.filename,
      size: doc.size,
      mime_type: doc.mime_type,
      s3_url: doc.s3_url,
      s3_key: (doc as any).s3_key,
      local_path: doc.local_path,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };

    const metadata = {
      extracted_text: (doc as any).extracted_text,
    };

    let analysis = (doc as any).analysis ?? undefined;
    if (analysis) {
      (analysis as any).mime_type = doc.mime_type;
    }

    const responseData = { file_info, metadata, analysis };

    return c.json(
      formatSuccess(responseData, { text: "Created" }, 201),
      201
    );
  } catch (error) {
    customLogger(error, "upload_document");
    const msg = (error && (error as any).message) || String(error);
    if (msg.includes("ECONNREFUSED") || msg.includes("connect ECONNREFUSED")) {
      return c.json(
        formatError(
          {
            text: "Database (Postgres) not available; please ensure DATABASE_URL is correct and database is running.",
          },
          503
        ),
        503
      );
    }
    return c.json(formatError({ text: "Something went wrong" }, 500), 500);
  }
});
export const analyze_document = factory.createHandlers(async (c) => {
  // no schema validation here; param validated by route
  try {
    const { id } = c.req.valid("param");
    const doc = await docService.getDocument(id);
    customLogger({ doc }, "analyze_document:getDocument");
    if (!doc)
      return c.json(formatError({ text: "Document not found" }, 404), 404);
    if (!doc.extracted_text) {
      // attempt to re-extract from stored file
      if (!doc.local_path && !doc.s3_url)
        return c.json(
          formatError(
            { text: "Document text not extracted and file not available" },
            409
          ),
          409
        );
      try {
        let buf: Buffer | undefined;
        if (doc.local_path) {
          buf = await fileStorage.getFileBuffer(doc.local_path, undefined);
        } else if (doc.s3_url) {
          buf = await fileStorage.getFileBuffer(undefined, doc.s3_url);
        } else if ((doc as any).s3_key) {
          const signed = await fileStorage.getPresignedUrl((doc as any).s3_key);
          buf = await fileStorage.getFileBuffer(undefined, signed);
        }
        if (!buf) throw new Error("Could not read file for extraction");
        const text = await textExtraction.extractText(buf, doc.mime_type);
        await docService.saveExtractedText(doc.id, text);
        (doc as any).extracted_text = text;
      } catch (err) {
        customLogger(err, "analyze_document:re-extract");
        return c.json(
          formatError({ text: "Failed to extract document text" }, 500),
          500
        );
      }
    }
    const aiResult = await llmService.analyzeTextWithLLM(doc.extracted_text!);
    customLogger({ aiResult }, "analyze_document:aiResult");
    await docService.saveAnalysis(id, aiResult);

    // Build nested response shape: file_info, metadata, analysis
    const file_info = {
      id: doc.id,
      filename: doc.filename,
      size: doc.size,
      mime_type: doc.mime_type,
      s3_url: doc.s3_url,
      s3_key: (doc as any).s3_key,
      local_path: doc.local_path,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };

    const metadata = {
      extracted_text: doc.extracted_text,
    };

    const analysis = { ...aiResult, mime_type: doc.mime_type } as any;

    const responseData = { file_info, metadata, analysis };

    return c.json(
      formatSuccess(responseData, { text: "Analysis complete" }, 200),
      200
    );
  } catch (error) {
    customLogger(error, "analyze_document");
    const msg = (error && (error as any).message) || String(error);
    if (msg.includes("ECONNREFUSED") || msg.includes("connect ECONNREFUSED")) {
      return c.json(
        formatError(
          {
            text: "Database (Postgres) not available; please ensure DATABASE_URL is correct and database is running.",
          },
          503
        ),
        503
      );
    }
    return c.json(formatError({ text: "Something went wrong" }, 500), 500);
  }
});

export const get_document = factory.createHandlers(async (c) => {
  try {
    const { id } = c.req.valid("param");
    const doc = await docService.getDocument(id);
    if (!doc)
      return c.json(formatError({ text: "Document not found" }, 404), 404);
    // if s3 key exists and S3 configured, provide a signed url to download
    if (!doc.s3_url && (doc as any).s3_key) {
      try {
        const signed = await fileStorage.getPresignedUrl((doc as any).s3_key);
        (doc as any).s3_signed_url = signed;
      } catch (err) {
        customLogger(err, "get_document:presign");
      }
    }
    // If extracted_text is missing, try to read the stored file and extract synchronously
    if (!doc.extracted_text) {
      try {
        let buf: Buffer | undefined;
        if (doc.local_path) {
          buf = await fileStorage.getFileBuffer(doc.local_path, undefined);
        } else if (doc.s3_url) {
          buf = await fileStorage.getFileBuffer(undefined, doc.s3_url);
        } else if ((doc as any).s3_key) {
          const signed = await fileStorage.getPresignedUrl((doc as any).s3_key);
          buf = await fileStorage.getFileBuffer(undefined, signed);
        }
        if (buf) {
          const text = await textExtraction.extractText(buf, doc.mime_type);
          await docService.saveExtractedText(doc.id, text);
          (doc as any).extracted_text = text;
        }
      } catch (err) {
        customLogger(err, "get_document:extract_fallback");
      }
    }

    // If analysis (summary/metadata) is missing but we have extracted text, run LLM synchronously
    if (
      (!doc.analysis || Object.keys(doc.analysis).length === 0) &&
      doc.extracted_text
    ) {
      try {
        const aiResult = await llmService.analyzeTextWithLLM(
          doc.extracted_text!
        );
        await docService.saveAnalysis(doc.id, aiResult);
        (doc as any).analysis = aiResult;
      } catch (err) {
        customLogger(err, "get_document:analyze_fallback");
      }
    }

    // Structure the response into file_info, metadata, and analysis sections
    const file_info = {
      id: doc.id,
      filename: doc.filename,
      size: doc.size,
      mime_type: doc.mime_type,
      s3_url: doc.s3_url,
      s3_key: (doc as any).s3_key,
      local_path: doc.local_path,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };

    const metadata = {
      extracted_text: doc.extracted_text,
    };

    // ensure analysis payload includes mime_type for client convenience
    let analysis = doc.analysis ?? undefined;
    if (analysis) {
      (analysis as any).mime_type = doc.mime_type;
    }

    const responseData = {
      file_info,
      metadata,
      analysis,
    };

    return c.json(
      formatSuccess(responseData, { text: "Retrieval Successful" }, 200),
      200
    );
  } catch (error) {
    customLogger(error, "get_document");
    const msg = (error && (error as any).message) || String(error);
    if (msg.includes("ECONNREFUSED") || msg.includes("connect ECONNREFUSED")) {
      return c.json(
        formatError(
          {
            text: "Database (Postgres) not available; please ensure DATABASE_URL is correct and database is running.",
          },
          503
        ),
        503
      );
    }
    return c.json(formatError({ text: "Something went wrong" }, 500), 500);
  }
});
