import app from "./app.ts";
import "dotenv/config";
import { customLogger } from "./shared/utils/logger.ts";

const port = Number(process.env.PORT) || 3000;

const server = Bun.serve({
  port: port,
  fetch: app.fetch,
});

console.log(`Server is running at http://${server.hostname}:${server.port}`);

process.once("SIGTERM", () => {
  try {
    server.stop();
  } catch (error) {
    customLogger(error, "SIGTERM");
    process.exit(1);
  }
});

