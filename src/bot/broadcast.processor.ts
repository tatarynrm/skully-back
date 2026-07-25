import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { BroadcastRepository } from '../repositories/broadcast.repository';
import { join } from 'path';
import * as fs from 'fs';

@Processor('broadcast', {
  concurrency: 1, // Only one dispatcher or message sender at a time per worker instance, but we will use limiting for send-message
  limiter: {
    max: 20, // 20 messages per second max to avoid Telegram 30msg/s limit
    duration: 1000,
  }
})
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly broadcastRepo: BroadcastRepository,
    @InjectQueue('broadcast') private readonly broadcastQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    switch (job.name) {
      case 'dispatch-broadcast':
        return this.handleDispatchBroadcast(job);
      case 'send-message':
        return this.handleSendMessage(job);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleDispatchBroadcast(job: Job) {
    const { broadcastId, lastId = 0 } = job.data;
    const broadcast = await this.broadcastRepo.getBroadcastById(broadcastId);
    
    if (!broadcast) return;
    
    // If it was cancelled or failed manually, stop dispatching
    if (broadcast.status === 'failed') return;
    
    if (broadcast.status === 'scheduled') {
      await this.broadcastRepo.updateBroadcastStatus(broadcastId, 'processing');
    }

    if (broadcast.target_type === 'channel') {
      const channels = broadcast.target_channels || [];
      if (lastId > 0) {
        this.logger.log(`Broadcast ${broadcastId} channel dispatching completed.`);
        await this.broadcastRepo.updateBroadcastStatus(broadcastId, 'completed');
        return { status: 'completed' };
      }
      for (const channelId of channels) {
        await this.broadcastQueue.add(
          'send-message',
          { broadcastId, telegramId: channelId },
          { 
            attempts: 5, 
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: true
          }
        );
      }
      await this.broadcastRepo.updateBroadcastStatus(broadcastId, 'completed');
      return { status: 'completed', count: channels.length };
    }

    const BATCH_SIZE = 1000;
    const users = await this.broadcastRepo.getTargetUsersBatch(
      broadcast.target_type,
      broadcast.target_ids,
      lastId,
      BATCH_SIZE
    );

    if (users.length === 0) {
      this.logger.log(`Broadcast ${broadcastId} dispatching completed.`);
      await this.broadcastRepo.updateBroadcastStatus(broadcastId, 'completed');
      return { status: 'completed' };
    }

    // Add send-message jobs to the queue
    for (const user of users) {
      // Adding them individually so BullMQ rate limiter can control the flow
      // Note: in a massive scale, addBulk is better
      await this.broadcastQueue.add(
        'send-message',
        { broadcastId, telegramId: user.telegram_id, userId: user.id },
        { 
          attempts: 5, 
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: true // we log failures in DB instead of keeping jobs around
        }
      );
    }

    const nextLastId = users[users.length - 1].id;

    // Schedule next dispatch batch immediately
    await this.broadcastQueue.add(
      'dispatch-broadcast',
      { broadcastId, lastId: nextLastId },
      { jobId: `dispatch-${broadcastId}-${nextLastId}` }
    );

    return { status: 'dispatching', count: users.length };
  }

  private async handleSendMessage(job: Job) {
    const { broadcastId, telegramId } = job.data;
    
    // Quick check if broadcast was cancelled
    const broadcast = await this.broadcastRepo.getBroadcastById(broadcastId);
    if (!broadcast || broadcast.status === 'failed') {
      return;
    }

    try {
      const extra: any = {};
      
      // Inline Keyboard parsing
      if (broadcast.inline_keyboard) {
        const keyboard = typeof broadcast.inline_keyboard === 'string'
          ? JSON.parse(broadcast.inline_keyboard)
          : broadcast.inline_keyboard;
        
        if (Array.isArray(keyboard) && keyboard.length > 0) {
          extra.reply_markup = {
            inline_keyboard: keyboard,
          };
        }
      }
      
      extra.parse_mode = 'HTML'; // or 'MarkdownV2', maybe store in DB? Defaulting to HTML for now

      let mediaInput: any = broadcast.media_url;
      if (broadcast.media_url && (broadcast.media_url.includes('localhost') || broadcast.media_url.includes('127.0.0.1') || broadcast.media_url.startsWith('/uploads/'))) {
        const parts = broadcast.media_url.split('/');
        const filename = parts[parts.length - 1];
        const filePath = join(__dirname, '..', '..', 'uploads', filename);
        if (fs.existsSync(filePath)) {
          mediaInput = { source: filePath };
        }
      }

      if (broadcast.media_type === 'photo' && broadcast.media_url) {
        await this.bot.telegram.sendPhoto(telegramId, mediaInput, {
          caption: broadcast.content,
          ...extra,
        });
      } else if (broadcast.media_type === 'video' && broadcast.media_url) {
        await this.bot.telegram.sendVideo(telegramId, mediaInput, {
          caption: broadcast.content,
          ...extra,
        });
      } else {
        await this.bot.telegram.sendMessage(telegramId, broadcast.content, extra);
      }

      await this.broadcastRepo.logSend(broadcastId, telegramId, 'sent');
    } catch (error: any) {
      // Check for rate limit error (429) to throw it back so BullMQ retries
      if (error.response?.error_code === 429) {
        this.logger.warn(`Rate limit hit sending to ${telegramId}, retrying...`);
        throw error;
      }

      // Other errors like Blocked By User (403), etc.
      await this.broadcastRepo.logSend(broadcastId, telegramId, 'failed', error.message || 'Unknown error');
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.name} (ID: ${job.id}) failed: ${error.message}`);
  }
}
