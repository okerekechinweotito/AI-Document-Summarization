
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

