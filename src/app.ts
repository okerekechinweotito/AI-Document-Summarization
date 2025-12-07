import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { logger } from "hono/logger";
import documentsRoutes from "./modules/documents/documents.route";
import { swaggerUI } from "@hono/swagger-ui";
import { Scalar } from "@scalar/hono-api-reference";
import { formatSuccess } from "./shared/utils/response.ts";

const app = new Hono();

app.use("*", cors());
app.use("*", prettyJSON());
app.use("*", logger());

app.get("/", (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json(
    formatSuccess(
      {
        docs: {
          scalar: `${baseUrl}/scalar`,
          swagger: `${baseUrl}/swagger`,
          openapi: `${baseUrl}/openapi`,
        },
      },
      { text: "AI Document Summarization API" },
      200
    ),
    200
  );
});

app.get("/openapi", async (c) => {
  const openapiText = await Bun.file("src/shared/docs/openapi.json").text();
  return c.newResponse(openapiText, 200, {
    "content-type": "application/json",
  });
});

app.get("/swagger", swaggerUI({ url: "/openapi" }));

app.get(
  "/scalar",
  Scalar({
    url: "/openapi",
    theme: "moon",
    pageTitle: "API Docs",
  })
);

app.route("/documents", documentsRoutes);

export default app;
