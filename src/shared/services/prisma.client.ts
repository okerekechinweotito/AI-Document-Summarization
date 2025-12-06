import { PrismaClient } from "@prisma/client";
import { customLogger } from "../utils/logger.ts";

const prisma = new PrismaClient();

prisma.$on("error", (e) => customLogger(e, "prisma:error"));
prisma.$on("warn", (e) => customLogger(e, "prisma:warn"));

// Try to connect early so we surface DB connection errors at server start
async function initPrisma() {
  try {
    await prisma.$connect();
    console.log("Prisma connected to the database");
  } catch (err) {
    customLogger(err, "prisma:connect");
    console.error(
      "Prisma could not connect to the database. Ensure DATABASE_URL is correct and the DB is running."
    );
  }
}

initPrisma();

export default prisma;
