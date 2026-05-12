import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("DATABASE_URL não está definida nas variáveis de ambiente.");
}

export const sql = neon(databaseUrl || "postgresql://user:password@localhost:5432/db");

export type SyncStatus = "running" | "success" | "error";
export type SyncType = "orders" | "products" | "full";
export type TriggerSource = "manual" | "cron" | "first_sync";