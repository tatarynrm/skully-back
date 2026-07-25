import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseService, PG_POOL } from './database.service';
import { MigrationRunner } from './migration.runner';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      useFactory: (configService: ConfigService) => {
        return new Pool({
          host: configService.get<string>('POSTGRES_HOST', 'localhost'),
          port: configService.get<number>('POSTGRES_PORT', 5432),
          user: configService.get<string>('POSTGRES_USER', 'postgres'),
          password: configService.get<string>('POSTGRES_PASSWORD', 'postgres'),
          database: configService.get<string>('POSTGRES_DB', 'dating_bot_db'),
          ssl: configService.get<string>('POSTGRES_SSL') === 'true' ? { rejectUnauthorized: false } : false,
          max: configService.get<number>('POSTGRES_MAX_CONNECTIONS', 50),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
      },
      inject: [ConfigService],
    },
    DatabaseService,
    MigrationRunner,
  ],
  exports: [DatabaseService, PG_POOL, MigrationRunner],
})
export class DatabaseModule {}
