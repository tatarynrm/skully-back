import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';

export const PG_POOL = 'PG_POOL';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  onModuleInit() {
    this.pool.on('error', (err) => {
      this.logger.error(`Unexpected error on idle PostgreSQL client: ${err.message}`, err.stack);
    });
    this.logger.log('DatabaseService connected to PostgreSQL Pool.');
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL Pool gracefully closed.');
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(sql, params);
      const duration = Date.now() - start;
      if (duration > 200) {
        this.logger.warn(`Slow SQL query (${duration}ms): ${sql.substring(0, 100)}...`);
      } else {
        this.logger.debug(`Executed query: "${sql.trim()}" [${duration}ms] - Rows: ${result.rowCount}`);
      }
      return result;
    } catch (err) {
      this.logger.error(`Database query failed: ${err.message} | Query: ${sql}`, err.stack);
      throw err;
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`Transaction rolled back due to error: ${err.message}`, err.stack);
      throw err;
    } finally {
      client.release();
    }
  }

  getPool(): Pool {
    return this.pool;
  }
}
