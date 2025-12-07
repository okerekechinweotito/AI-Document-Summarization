import { customLogger } from "../utils/logger.ts";
import path from "path";
import fs from "fs";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
// remove static import for presigner to avoid module not found at runtime in some envs
import type { Readable } from "stream";

const uploadsDir = path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (error) {
  customLogger(error, "fileStorage.service:init");
}

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL; // optional override for public URL

let s3Client: S3Client | null = null;
if (S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && S3_BUCKET) {
  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  } as any);
}

export const storeFileLocally = async (
  fileBuffer: Buffer,
  filename: string
): Promise<string> => {
  try {
    const filepath = path.join(uploadsDir, filename);
    // write the file (create/overwrite)
    await Bun.write(filepath, fileBuffer);
    return filepath;
  } catch (error) {
    customLogger(error, "storeFileLocally");
    throw error;
  }
};

export const storeFileS3 = async (
  fileBuffer: Buffer,
  filename: string
): Promise<{ s3Url: string; key: string }> => {
  if (!s3Client || !S3_BUCKET) {
    throw new Error("S3 client not configured");
  }
  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: filename,
      Body: fileBuffer,
    });
    await s3Client.send(command);
    const publicUrl =
      S3_PUBLIC_URL || `${S3_ENDPOINT}/${S3_BUCKET}/${filename}`;
    return { s3Url: publicUrl, key: filename };
  } catch (error) {
    customLogger(error, "storeFileS3");
    throw error;
  }
};

export const storeFile = async (fileBuffer: Buffer, filename: string) => {
  let localPath: string | undefined;
  let s3Url: string | undefined;
  let s3Key: string | undefined;

  // If S3 client is configured, try uploading to S3 first and avoid
  // writing a local copy when S3 upload succeeds.
  if (s3Client && S3_BUCKET) {
    try {
      const stored = await storeFileS3(fileBuffer, filename);
      s3Url = stored.s3Url;
      s3Key = stored.key;
      return { localPath, s3Url, s3Key };
    } catch (error) {
      customLogger(error, "storeFile: s3 upload failed, falling back to local");
      // fall-through to store locally
    }
  }

  // No S3 client configured or S3 upload failed — store locally.
  localPath = await storeFileLocally(fileBuffer, filename);
  return { localPath, s3Url, s3Key };
};
export const getPresignedUrl = async (key: string, expiresIn = 60 * 60) => {
  if (!s3Client || !S3_BUCKET) throw new Error("S3 client not configured");
  try {
    // dynamic import to avoid bundling/import errors; pkg may not be available in some runtimes
    const pkg = await import("@aws-sdk/s3-request-presigner");
    const { getSignedUrl } = pkg as any;
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (err) {
    customLogger(err, "getPresignedUrl:presigner-missing");
    // If presigner isn't available, attempt to return a public URL (if configured)
    if (S3_PUBLIC_URL) return `${S3_PUBLIC_URL}/${key}`;
    if (S3_ENDPOINT) return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
    throw new Error(
      "No presigner available and no public S3 endpoint configured"
    );
  }
};

export const getFileBuffer = async (localPath?: string, s3Url?: string) => {
  if (localPath) {
    try {
      customLogger({ localPath }, "getFileBuffer:reading local file");
      const ab = await Bun.file(localPath).arrayBuffer();
      return Buffer.from(ab);
    } catch (error) {
      customLogger(error, "getFileBuffer:local");
    }
  }
  if (s3Url) {
    try {
      const res = await fetch(s3Url);
      if (!res.ok) throw new Error(`fetch s3 failed ${res.status}`);
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    } catch (error) {
      customLogger(error, "getFileBuffer:s3");
    }
  }
  throw new Error("Could not read file from local or S3");
};

export const getS3BrowserLink = (key?: string) => {
  if (!key) return undefined;
  try {
    // If S3_PUBLIC_URL is set and looks like a S3 endpoint, prefer using it
    if (S3_PUBLIC_URL) {
      // If public URL uses port 9000 (typical MinIO), guess console at 9001
      if (S3_PUBLIC_URL.includes(":9000")) {
        return (
          S3_PUBLIC_URL.replace(":9000", ":9001") +
          `/browser/${S3_BUCKET}/${encodeURIComponent(key)}`
        );
      }
      return `${S3_PUBLIC_URL}/${encodeURIComponent(key)}`;
    }

    // If S3_ENDPOINT is set and looks like localhost:9000, guess console
    if (S3_ENDPOINT) {
      if (S3_ENDPOINT.includes(":9000")) {
        // replace port 9000 with 9001 for console
        return (
          S3_ENDPOINT.replace(":9000", ":9001") +
          `/browser/${S3_BUCKET}/${encodeURIComponent(key)}`
        );
      }
      return `${S3_ENDPOINT}/${S3_BUCKET}/${encodeURIComponent(key)}`;
    }
  } catch (err) {
    customLogger(err, "getS3BrowserLink");
  }
  return undefined;
};
