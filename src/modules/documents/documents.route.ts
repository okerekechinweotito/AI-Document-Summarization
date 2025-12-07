import { Hono } from "hono";
import * as docController from "./documents.controller.ts";
import { zValidator } from "@hono/zod-validator";
import { documentIdParam } from "./document.schema.ts";

const router = new Hono();

router.post("/upload", ...docController.upload_document);
router.get("/", ...docController.list_documents);
router.post(
  "/:id/analyze",
  zValidator("param", documentIdParam),
  ...docController.analyze_document
);
router.get(
  "/:id",
  zValidator("param", documentIdParam),
  ...docController.get_document
);

export default router;
