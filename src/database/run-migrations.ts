import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function runCliMigrations() {
  console.log('--- Database Migration CLI Runner ---');
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'dating_bot_db',
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.warn(`Migrations folder not found: ${migrationsDir}`);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const executedRes = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const executedSet = new Set(executedRes.rows.map((r) => r.name));

    for (const file of files) {
      if (!executedSet.has(file)) {
        console.log(`[MIGRATE] Running ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');

        console.log(`[MIGRATE] Completed ${file}`);
      } else {
        console.log(`[SKIP] Already executed ${file}`);
      }
    }
    console.log('--- Migrations finished successfully ---');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runCliMigrations();
