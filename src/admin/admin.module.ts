import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BroadcastController } from './broadcast.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [DatabaseModule, ConfigModule, BotModule],
  controllers: [AdminController, BroadcastController],
  providers: [AdminService],
})
export class AdminModule {}
