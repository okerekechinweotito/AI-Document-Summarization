-- migration: 001_create_documents.sql
-- Creates documents table with sensible indexes
CREATE TABLE IF NOT EXISTS public.documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  size BIGINT,
  mime_type TEXT,
  s3_url TEXT,
  s3_key TEXT,
  local_path TEXT,
  extracted_text TEXT,
  analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents (created_at);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON public.documents (updated_at);
-- Index on JSONB field for document_type inside analysis
CREATE INDEX IF NOT EXISTS idx_documents_analysis_type ON public.documents ((analysis ->> 'document_type'));
