This repository provides an example Document Upload -> Extract -> Analyze flow using OpenRouter + Postgres + S3/Minio.

Quick setup (macOS) — run these commands in the project root:

1) Install dependencies
```bash
bun install
```

2) Run a local Postgres (Docker) — creates DB `files`
```bash
docker run -d --name local-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=files -p 5432:5432 postgres:15
```

3) (Optional) Run a local Minio for S3 compatibility
```bash
docker run -d --name local-minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data --console-address ":9001"
```

4) Create `.env` using `.env.example` as guide or create it from scratch; required envs:
```env
OPENROUTER_API_KEY=<your_openrouter_key>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/files
# Optional S3/Minio settings
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=files
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_PUBLIC_URL=http://localhost:9000
```

5) Generate Prisma client and push schema
```bash
# ensure Prisma client is installed and generated
```bash
bunx prisma generate
# During early development you can push schema
bunx prisma db push
# For migrations on staging/production
bunx prisma migrate deploy
```
```

6) Start the app (hot reload)
```bash
bun run dev
```

Open http://localhost:3000 to verify the API is running.

DB & schema
------------
If you used Docker in step 2, Postgres listens on port 5432 and `DATABASE_URL` should point to the `files` DB as shown above.

Optional Minio setup (S3)
-------------------------
If you started Minio in step 3, create a bucket using the Minio console at http://localhost:9001 and name it as `S3_BUCKET` in your `.env` (we used `files` above). The app uses `forcePathStyle` to support Minio.

Testing the main endpoints (quick examples)
------------------------------------------
Upload a PDF (max 5MB):
```bash
curl -X POST -F "file=@/path/to/test.pdf" http://localhost:3000/documents/upload
```

The upload returns a JSON wrapper { statusCode, message, data } with `data` containing metadata and `extracted_text` (since extraction is synchronous by default for upload). Example:
```json
{
	"statusCode": 201,
	"message": { "text": "Created" },
	"data": {
		"id": "...",
		"filename": "test.pdf",
		"extracted_text": "...",
		"analysis": null,
		"created_at": "..."
	}
}
```

Trigger LLM analysis (if not already present):
```bash
curl -X POST http://localhost:3000/documents/<id>/analyze
```

Get combined document (file info, extracted text, summary/metadata):
```bash
curl http://localhost:3000/documents/<id>
```

OpenAPI / Swagger UI
--------------------
Visit http://localhost:3000/openapi (raw) or http://localhost:3000/swagger for an interactive UI.

Environment variables (create `.env`):
- `OPENROUTER_API_KEY` (required) — API key for OpenRouter
- `DATABASE_URL` (required) — Postgres connection string used by Prisma, e.g. `postgresql://postgres:postgres@localhost:5432/files`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (optional) — for S3/Minio storage. If you're using Minio, set `S3_ENDPOINT=http://localhost:9000`, `S3_ACCESS_KEY_ID=minioadmin`, `S3_SECRET_ACCESS_KEY=minioadmin`.
- `S3_PUBLIC_URL` (optional) — base public URL for objects (optional; if private buckets use `getPresignedUrl` instead)

Endpoints:
- `POST /documents/upload` -> upload a PDF or DOCX (multipart form-data file field `file`, max 5MB). The endpoint stores raw file (local + S3/Minio) and extracts text. `extracted_text` is persisted to DB and returned in the response.
- `POST /documents/{id}/analyze` -> triggers LLM analysis via OpenRouter; the result (summary, document_type, attributes) is saved to DB.
- `GET /documents/{id}` -> returns combined document info: metadata, `extracted_text`, and `analysis` (summary & attributes). If missing, the endpoint attempts to extract & analyze synchronously.

Notes:
- The project uses Postgres via Prisma if `DATABASE_URL` is configured; there is no in-memory fallback anymore — you must provide a `DATABASE_URL` or the server will return 503 for DB-specific endpoints.
- If you previously used the legacy SQL migration script (`scripts/apply_migrations_legacy.ts`), it is a legacy fallback—use Prisma migrations instead.
Troubleshooting:
- You may see an error like `ReferenceError: pool is not defined` when hitting an endpoint — this usually indicates that a server process is running older code that referenced a Postgres pool (raw `pg`) or ran the legacy migration script. To resolve:
	1. Restart the server to load the newest changes: `bun run dev` or stop the existing Bun process and start again.
	2. Remove any orphaned process using `ps aux | grep bun` and `kill <pid>` if needed.
	3. Make sure `DATABASE_URL` is correct and your Postgres instance is running. Try `bunx prisma migrate deploy` and check for any errors.
	4. If you previously used `bun run migrate` in older versions, switch to `bunx prisma migrate deploy`.
	5. For S3/Minio issues: if your Minio/S3 bucket is private, ensure `S3_ENDPOINT` + keys are set; the code uses presigned URLs for downloads; ensure your Minio host and bucket are reachable.
- The server uses `process.env.OPENROUTER_API_KEY` to contact OpenRouter; keep your key secure.
If you want to use the OpenRouter SDK locally or enable streaming, install the SDK (already added as dependency). The LLM call will be made using the `OPENROUTER_API_KEY` server-side, not from the client.
The server uses `process.env.OPENROUTER_API_KEY` to contact OpenRouter; keep your key secure.
If you want to use the OpenRouter SDK locally or enable streaming, install the SDK (already added as dependency). The LLM call will be made using the `OPENROUTER_API_KEY` server-side, not from the client.
