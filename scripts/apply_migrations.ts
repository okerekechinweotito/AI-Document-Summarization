console.log(
  "This script is deprecated. Use 'bunx prisma migrate deploy' or 'bunx prisma db push' instead."
);
process.exit(0);
// Small helper to validate DB connection early to surface clearer errors
async function testConnection() {
  try {
    await pool.query("SELECT 1");
    console.log("Database connection successful");
  } catch (e) {
    customLogger(e, "apply_migrations:testConnection");
    // print additional error details when available
    try {
      console.error(
        "DB connection error:",
        JSON.stringify(e, Object.getOwnPropertyNames(e))
      );
    } catch (ex) {
      console.error("DB connection error (string):", String(e));
    }
    throw e;
  }
}

async function run() {
  try {
    await testConnection();
    // Show DB host/port (non-sensitive) for debugging
    try {
      const url = new URL(DATABASE_URL);
      console.log(
        `Connecting to DB host: ${url.hostname}:${url.port}, db: ${url.pathname}`
      );
    } catch (err) {
      // ignore parsing errors
    }
    // Create a migrations table if it doesn't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    // Read migrations from the migrations directory
    const migrationsDir = new URL("../../migrations", import.meta.url);
    const fs = Bun.fs;
    const dirpath = new URL("../../migrations", import.meta.url).pathname;
    const files = await fs.readdir(dirpath);
    const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort();

    for (const file of migrationFiles) {
      const res = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (res.rowCount > 0) {
        continue; // already applied
      }
      const sql = await Bun.file(`${dirpath}/${file}`).text();
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations(filename) VALUES($1)", [
        file,
      ]);
      console.log(`Applied migration: ${file}`);
    }
    console.log("Migrations applied successfully");
    process.exit(0);
  } catch (error) {
    customLogger(error, "apply_migrations");
    // Show the error message details to help debugging connection issues
    if (error && typeof (error as any).message === "string") {
      console.error("Migration error:", (error as any).message);
    }
    process.exit(1);
  }
}

run();
