import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @InjectQueue('tg-webhooks') private readonly webhookQueue: Queue,
  ) {}

  @Post('/webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() update: any) {
    if (!update || !update.update_id) {
      return { ok: false, error: 'Invalid update payload' };
    }

    try {
      // Add job to BullMQ queue for async processing
      await this.webhookQueue.add('tg-update', update, {
        removeOnComplete: true,
        removeOnFail: 1000, // Keep last 1000 failed jobs for debugging
        attempts: 3,        // Retry up to 3 times on failure
        backoff: {
          type: 'exponential',
          delay: 1000,      // Delay 1s, then 2s, then 4s...
        },
      });
      return { ok: true };
    } catch (err) {
      this.logger.error(`Failed to enqueue Telegram update: ${err.message}`, err.stack);
      // Return HTTP 200 OK to Telegram to avoid infinite retries if queue is temporarily down,
      // but return error flag in JSON.
      return { ok: false, error: 'Queue error' };
    }
  }
}
