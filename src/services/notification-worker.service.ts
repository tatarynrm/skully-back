import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { MatchRepository } from '../repositories/match.repository';
import { LikeRepository } from '../repositories/like.repository';
import { PhotoRepository } from '../repositories/photo.repository';

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly matchRepository: MatchRepository,
    private readonly likeRepository: LikeRepository,
    private readonly photoRepository: PhotoRepository,
  ) {}

  onModuleInit() {
    this.logger.log('Starting Notification Worker (every 10s, batch size 30)...');
    this.intervalId = setInterval(() => this.processNotifications(), 10000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Notification Worker stopped.');
    }
  }

  private async processNotifications() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Process unnotified matches (up to 30) concurrently
      const pendingMatches = await this.matchRepository.getPendingUnnotifiedMatches(30);

      if (pendingMatches.length > 0) {
        await Promise.allSettled(
          pendingMatches.map(async (m) => {
            const user1Username = m.user1_username ? `@${this.escapeHtml(m.user1_username)}` : `(ID: ${m.user1_telegram_id})`;
            const user2Username = m.user2_username ? `@${this.escapeHtml(m.user2_username)}` : `(ID: ${m.user2_telegram_id})`;

            await Promise.allSettled([
              this.bot.telegram.sendMessage(
                m.user1_telegram_id,
                `💖 <b>ІТС А МАТЧ!</b> 🎉\n\nВи сподобалися одне одному з <b>${this.escapeHtml(m.user2_name)}</b>!\nКонтакт: ${user2Username}`,
                { parse_mode: 'HTML' },
              ),
              this.bot.telegram.sendMessage(
                m.user2_telegram_id,
                `💖 <b>ІТС А МАТЧ!</b> 🎉\n\nВи сподобалися одне одному з <b>${this.escapeHtml(m.user1_name)}</b>!\nКонтакт: ${user1Username}`,
                { parse_mode: 'HTML' },
              ),
            ]);

            await this.matchRepository.markMatchNotified(m.match_id);
          }),
        );
      }

      // 2. Process pending unnotified likes (up to 30) - discrete alert only (excluding mutual matches)
      const pendingLikes = await this.likeRepository.getUnnotifiedLikes(30);

      if (pendingLikes.length > 0) {
        await Promise.allSettled(
          pendingLikes.map(async (l) => {
            try {
              await this.bot.telegram.sendMessage(
                l.to_telegram_id,
                '🔔 <b>У вас нове вподобання!</b>\nПерегляньте його у розділі меню «💌 Вподобання».',
                { parse_mode: 'HTML' },
              );
            } catch (err) {
              this.logger.error(`Failed to send discrete like notification to telegram user ${l.to_telegram_id}: ${err.message}`);
            } finally {
              await this.likeRepository.markLikeNotified(l.like_id);
            }
          }),
        );
      }
    } catch (err) {
      this.logger.error(`Error in notification worker loop: ${err.message}`, err.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
