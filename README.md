
# AI Document Summarization + Metadata Extraction Workflow

## Prerequisites

This project requires the [Bun](https://bun.sh/) runtime. If you don't have Bun installed, please visit the [official Bun website](https://bun.sh/) and follow the installation instructions.

## Setup Instructions

1. **Clone the repository**
2. **Install dependencies**
	 ```sh
	 bun install
	 ```
3. **Configure environment variables**
	 - Copy `.env.example` to `.env` and fill in the required values:
		 ```sh
		 cp .env.example .env
		 ```
	 - Edit `.env` with your database credentials, API keys, and other settings.

4. **Run database migrations**
	 - Ensure Prisma client is installed and generated:
		 ```sh
		 bunx prisma generate
		 ```
	 - Push schema (optional during early development):
		 ```sh
		 bunx prisma db push
		 ```
	 - Run migrations in a production-like environment:
		 ```sh
		 bunx prisma migrate deploy
		 ```

	 If you don't have a Postgres instance running locally, you can start one with Docker:
	 ```sh
	 docker run -d --name local-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=files -p 5432:5432 postgres:15
	 ```
	 Then configure `DATABASE_URL` in your `.env` file as:
	 ```
	 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/files
	 ```

## Running the App

Start the development server:
```sh
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Documentation

- Swagger UI: [http://localhost:3000/swagger](http://localhost:3000/swagger)
- Scalar API reference: [http://localhost:3000/scalar](http://localhost:3000/scalar)

## Environment Variables

All required environment variables are listed in `.env.example`. Copy this file to `.env` and update the values as needed.

Example variables (used by the app):

- `DATABASE_URL` (required) — Postgres connection string used by Prisma
- `OPENROUTER_API_KEY` (required if using LLM features) — API key for OpenRouter
- `OPENROUTER_URL` (optional) — OpenRouter HTTP endpoint (default: `https://api.openrouter.ai/v1/chat/completions`)
- `OPENROUTER_MODEL` (optional) — Model name to request from OpenRouter (default: `gpt-4o-mini`)
- `PORT` (optional) — Server port (default: `3000`)

- `S3_ENDPOINT` (optional) — S3/Minio endpoint (e.g. `https://minio.local:9000`)
- `S3_BUCKET` (optional) — S3/Minio bucket name
- `S3_ACCESS_KEY_ID` (optional) — S3/Minio access key
- `S3_SECRET_ACCESS_KEY` (optional) — S3/Minio secret key
- `S3_REGION` (optional) — S3 region (default: `us-east-1`)
- `S3_PUBLIC_URL` (optional) — Public base URL for objects (overrides constructed URL)

Notes:

- The app writes uploads to the local `uploads/` directory by default (no `FILE_STORAGE_PATH` env var is required).
- Copy `.env.example` to `.env` and fill in the values before running the app.


## Using MinIO (local S3) with Docker

If you want to test S3-compatible storage locally, MinIO is a lightweight server that's compatible with the AWS S3 API. The project favors uploading to S3 when S3 env vars are present, and falls back to the local `uploads/` directory if the S3 upload fails.

Below is a minimal `docker-compose.yml` you can use to run MinIO locally (ports `9000` for the S3 API and `9001` for the MinIO Console):

```yaml
version: "3.8"
services:
	minio:
		image: minio/minio:latest
		container_name: minio
		command: server /data --console-address ":9001"
		ports:
			- "9000:9000"
			- "9001:9001"
		environment:
			MINIO_ROOT_USER: minioadmin
			MINIO_ROOT_PASSWORD: minioadmin123
		volumes:
			- ./minio-data:/data
		restart: unless-stopped
```

Start MinIO with:

```sh
docker-compose up -d
```

Open the MinIO Console at: `http://localhost:9001`
Login with the default credentials shown above:

- Username: `minioadmin`
- Password: `minioadmin123`

Create a bucket (for example `documents`) using the Console UI or the `mc` CLI. Example using the `mc` client locally (install `mc` from https://min.io/docs/minio/linux/reference/minio-mc.html):

```sh
mc alias set myminio http://localhost:9000 minioadmin minioadmin123
mc mb myminio/documents
```

Environment variables to set in your `.env` when using MinIO:

```
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=documents
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_REGION=us-east-1
# Optional: expose a public base URL (useful when serving files directly)
# S3_PUBLIC_URL=http://localhost:9000
```

Notes and tips:

- When these S3 env vars are present the app will attempt to upload files to the configured S3 bucket. If the S3 upload fails the app will store files under the local `uploads/` directory as a fallback.
- The repository includes helper code that builds a browser-friendly `s3_link` (useful for opening objects in the MinIO Console). The link format may differ depending on your MinIO configuration.
- If you want pre-signed URLs instead of direct S3 links, consider enabling presigning in the storage service or calling the S3 presigner manually; this project currently documents and returns `s3_url` and a convenience `s3_link` (console/browser link), but does not expose presigned URLs by default.

After setting `.env` and starting MinIO, restart the app and verify uploads in the MinIO Console or in the `uploads/` directory.

