import { z } from "zod";

export const documentUploadSchema = z.object({
  // uploads come via multipart/form-data; no JSON body required
});

export const documentIdParam = z.object({ id: z.string() });

export const analyzeResponseSchema = z.object({
  summary: z.string(),
  document_type: z.string(),
  attributes: z.record(z.string(), z.any()),
});

export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

export const documentGetSchema = z.object({
  id: z.string(),
  filename: z.string(),
  size: z.number(),
  mime_type: z.string(),
  s3_url: z.string().optional(),
  s3_key: z.string().optional(),
  s3_signed_url: z.string().optional(),
  local_path: z.string().optional(),
  extracted_text: z.string().optional(),
  analysis: analyzeResponseSchema.optional(),
  updated_at: z.string().optional(),
  created_at: z.string(),
});

export type Document_GET = z.infer<typeof documentGetSchema>;

export const documentsListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().positive().optional(),
});
