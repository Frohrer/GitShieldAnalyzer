import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

// Check for required environment variables
const requiredEnvVars = ['PGUSER', 'PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Create a new postgres client with explicit connection parameters
const client = postgres({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Max idle time for connections in seconds
  connect_timeout: 10, // Connection timeout in seconds
  ssl: { rejectUnauthorized: false }, // Allow self-signed certificates
});

export const db = drizzle(client, { schema });