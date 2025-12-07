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
    const files = (form.getAll("file") as unknown as File[]) || [];
    if (!files || files.length === 0)
      return c.json(formatError({ text: "file field is required" }, 400), 400);

    const results: any[] = [];

    for (const fileEntry of files) {
      try {
        const filename = fileEntry.name;
        let mime = fileEntry.type || "";
        if (!mime) {
          if (filename.endsWith(".pdf")) mime = "application/pdf";
          if (filename.endsWith(".docx"))
            mime =
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }
        const arrayBuffer = await fileEntry.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // Validate MIME/type first so unsupported file types (eg. MP4)
        // return a type error rather than a size error.
        if (
          ![
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ].includes(mime)
        ) {
          results.push({ filename, error: "File must be PDF or DOCX" });
          continue;
        }
        if (buffer.length > MAX_BYTES) {
          results.push({ filename, error: "File size exceeds 5MB" });
          continue;
        }

        // store file (S3-first)
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
            formatError(
              { text: "File uploaded but text extraction failed" },
              500,
              {
                error: (error as any)?.message ?? String(error),
              }
            ),
            500
          );
        }

        // attempt extraction
        try {
          const text = await textExtraction.extractText(buffer, mime);
          await docService.saveExtractedText(doc.id, text);
          (doc as any).extracted_text = text;
        } catch (err) {
          customLogger(err, "upload_document:extraction");
        }

        // build per-file response
        const s3Link = stored.s3Key
          ? fileStorage.getS3BrowserLink(stored.s3Key)
          : undefined;
        const file_info = {
          id: doc.id,
          filename: doc.filename,
          size: doc.size,
          mime_type: doc.mime_type,
          s3_url: doc.s3_url,
          s3_key: (doc as any).s3_key,
          s3_link: s3Link,
          local_path: doc.local_path,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        };

        const metadata = {
          extracted_text: (doc as any).extracted_text,
          extracted_metadata:
            (doc as any).analysis && (doc as any).analysis.attributes
              ? (doc as any).analysis.attributes
              : undefined,
        };

        let analysis = (doc as any).analysis ?? undefined;

        results.push({ file_info, metadata, analysis });
      } catch (err) {
        customLogger(err, "upload_document:per-file");
        results.push({
          filename: (fileEntry as any)?.name || "unknown",
          error: (err as any)?.message || String(err),
        });
      }
    }

    // If any file had an error, return an error status and include per-file results
    const hasErrors = results.some((r) => Boolean((r as any).error));
    if (hasErrors) {
      return c.json(
        formatError({ text: "One or more files failed to upload" }, 400, {
          results,
        }),
        400
      );
    }

    return c.json(formatSuccess(results, { text: "Uploaded" }, 201), 201);
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
export const list_documents = factory.createHandlers(async (c) => {
  try {
    const docs = await docService.listDocuments();

    const items = docs.map((doc) => {
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
        extracted_metadata:
          (doc.analysis && (doc.analysis as any).attributes) || undefined,
      };

      let analysis = doc.analysis ?? undefined;

      return { file_info, metadata, analysis };
    });

    return c.json(formatSuccess(items, { text: "List retrieved" }, 200), 200);
  } catch (error) {
    customLogger(error, "list_documents");
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
      extracted_metadata:
        aiResult?.attributes ??
        (doc.analysis && (doc.analysis as any).attributes) ??
        undefined,
    };

    const analysis = { ...aiResult } as any;

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
      extracted_metadata:
        (doc.analysis && (doc.analysis as any).attributes) || undefined,
    };

    let analysis = doc.analysis ?? undefined;

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
