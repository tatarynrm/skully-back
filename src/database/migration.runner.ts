import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MigrationRunner implements OnModuleInit {
  private readonly logger = new Logger(MigrationRunner.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    try {
      await this.runMigrations();
    } catch (err) {
      this.logger.error(`Migration error on bootstrap: ${err.message}`, err.stack);
    }
  }

  async runMigrations() {
    this.logger.log('Checking and running database migrations...');

    // 1. Ensure migrations tracking table exists
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Read migration SQL files from database/migrations directory
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      this.logger.warn(`Migrations directory not found at: ${migrationsDir}`);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // 3. Get already executed migrations
    const executedRes = await this.db.query<{ name: string }>('SELECT name FROM schema_migrations');
    const executedSet = new Set(executedRes.rows.map((row) => row.name));

    // 4. Run missing migrations in transaction
    for (const file of files) {
      if (!executedSet.has(file)) {
        this.logger.log(`Executing migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        await this.db.transaction(async (client) => {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        });

        this.logger.log(`Migration ${file} applied successfully.`);
      }
    }

    this.logger.log('All migrations are up to date.');
  }
}
