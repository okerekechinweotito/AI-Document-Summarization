import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { customLogger } from "../utils/logger.ts";

export const extractTextFromPDF = async (
  fileBuffer: Buffer
): Promise<string> => {
  try {
    const data = await pdfParse(fileBuffer);
    return data.text || "";
  } catch (error) {
    customLogger(
      error,
      "extractTextFromPDF:pdf-parse failed, falling back to utf8"
    );
    try {
      return fileBuffer.toString("utf-8");
    } catch (e) {
      customLogger(e, "extractTextFromPDF:fallback failed");
      throw error;
    }
  }
};

export const extractTextFromDocx = async (
  fileBuffer: Buffer
): Promise<string> => {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value || "";
  } catch (error) {
    customLogger(
      error,
      "extractTextFromDocx:mammoth failed, falling back to utf8"
    );
    try {
      return fileBuffer.toString("utf-8");
    } catch (e) {
      customLogger(e, "extractTextFromDocx:fallback failed");
      throw error;
    }
  }
};

export const extractText = async (fileBuffer: Buffer, mimeType: string) => {
  if (mimeType === "application/pdf") {
    return await extractTextFromPDF(fileBuffer);
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return await extractTextFromDocx(fileBuffer);
  }
  // fallback: try to decode buffer as utf-8 text
  try {
    return fileBuffer.toString("utf-8");
  } catch (error) {
    customLogger(error, "extractText: fallback");
    return "";
  }
};
