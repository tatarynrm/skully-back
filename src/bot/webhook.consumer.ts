import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { Logger } from '@nestjs/common';

@Processor('tg-webhooks')
export class WebhookConsumer extends WorkerHost {
  private readonly logger = new Logger(WebhookConsumer.name);

  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const update = job.data;
    if (!update || !update.update_id) {
      this.logger.warn(`Skipping invalid job ${job.id}`);
      return;
    }

    try {
      this.logger.debug(`Processing Telegram update: ${update.update_id}`);
      // Execute the Telegraf update handlers
      await this.bot.handleUpdate(update);
    } catch (err) {
      this.logger.error(`Failed to process update ${update.update_id}: ${err.message}`, err.stack);
      throw err; // Re-throw to trigger BullMQ retry logic
    }
  }
}
