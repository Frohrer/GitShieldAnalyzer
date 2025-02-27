import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "@db";
import { sql } from "drizzle-orm";
import * as fs from 'fs';
import postgres from "postgres";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Database initialization function
async function initializeDatabase() {
  try {
    // First, connect to the default 'postgres' database to create our database if it doesn't exist
    const initClient = postgres({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: 'postgres', // Connect to default database first
      ssl: false,
    });

    try {
      // Check if our database exists
      const dbExists = await initClient`
        SELECT 1 FROM pg_database WHERE datname = ${process.env.PGDATABASE}
      `;

      if (dbExists.length === 0) {
        log('Creating database...');
        // Use raw string for database name since it's coming from env var
        const dbName = process.env.PGDATABASE;
        await initClient.unsafe(`CREATE DATABASE "${dbName}"`);
        log('Database created successfully');
      }
    } finally {
      // Always close the initial connection
      await initClient.end();
    }

    // Now check if tables exist
    try {
      const tables = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      if (tables.length === 0) {
        log('Initializing database tables...');
        // Use the SQL from init.sql to create tables
        const initSql = await fs.promises.readFile('./init.sql', 'utf-8');
        await db.execute(sql.raw(initSql));
        log('Database tables initialized successfully');
      } else {
        log('Database tables already exist');
      }
    } catch (err) {
      console.error('Error checking/creating tables:', err);
      throw new Error(`Failed to initialize tables: ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Initialize database before starting the server
    await initializeDatabase();

    const server = registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const PORT = 5000;
    server.listen(PORT, "0.0.0.0", () => {
      log(`serving on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();