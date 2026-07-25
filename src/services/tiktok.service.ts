import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { TiktokRepository } from '../repositories/tiktok.repository';
import { UserRepository } from '../repositories/user.repository';
import { DatabaseService } from '../database/database.service';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);

  constructor(
    private readonly tiktokRepo: TiktokRepository,
    private readonly userRepo: UserRepository,
    private readonly db: DatabaseService,
    @InjectBot() private readonly bot: Telegraf<Context>,
  ) {}

  async submitVideo(telegramId: string, videoUrl: string) {
    let telegramIdNum = parseInt(telegramId, 10);
    let user = await this.userRepo.findByTelegramId(telegramIdNum);
    if (!user && process.env.NODE_ENV !== 'production') {
      const allUsers = await this.db.query('SELECT telegram_id FROM users LIMIT 1');
      if (allUsers.rows.length > 0) {
        telegramIdNum = parseInt(allUsers.rows[0].telegram_id, 10);
        user = await this.userRepo.findByTelegramId(telegramIdNum);
      }
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isTestUrl = videoUrl.includes('localhost') || videoUrl.includes('aiuxplayground.com');
    if (!videoUrl || (!videoUrl.includes('tiktok.com') && !isTestUrl)) {
      throw new BadRequestException('Invalid TikTok URL');
    }

    const submission = await this.tiktokRepo.createSubmission(user.id, videoUrl);
    this.logger.log(`User ${user.id} submitted TikTok video: ${videoUrl}`);

    // Notify user in bot
    try {
      await this.bot.telegram.sendMessage(
        telegramId,
        `⏳ <b>Ваше відео відправлено на перевірку!</b>\n\nМи перевіримо його найближчим часом. Якщо воно відповідає всім правилам, ви отримаєте Premium на 30 днів!`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      this.logger.error(`Could not notify user ${telegramId} about submission: ${e.message}`);
    }

    return submission;
  }

  async getPendingSubmissions(page: number, limit: number) {
    return this.tiktokRepo.getPendingSubmissions(page, limit);
  }

  async approveSubmission(id: number) {
    const submission = await this.tiktokRepo.updateStatus(id, 'APPROVED');
    if (!submission) throw new NotFoundException('Submission not found');

    const user = await this.userRepo.findById(submission.user_id);
    if (user) {
      // Grant 30 days premium
      const now = new Date();
      let newPremiumUntil = new Date();
      
      if (user.is_premium && user.premium_until) {
        newPremiumUntil = new Date(Math.max(now.getTime(), new Date(user.premium_until).getTime()));
      }
      
      newPremiumUntil.setDate(newPremiumUntil.getDate() + 30);
      await this.userRepo.updatePremium(user.id, true, newPremiumUntil);

      try {
        await this.bot.telegram.sendMessage(
          user.telegram_id,
          `🎉 <b>Вітаємо!</b>\n\nВаше відео в TikTok було перевірено та схвалено!\nВам нараховано <b>Premium на 30 днів</b>! Дякуємо за активність! 🚀`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
    }
    return submission;
  }

  async rejectSubmission(id: number, reason: string) {
    if (!reason) throw new BadRequestException('Reason is required for rejection');
    const submission = await this.tiktokRepo.updateStatus(id, 'REJECTED', reason);
    if (!submission) throw new NotFoundException('Submission not found');

    const user = await this.userRepo.findById(submission.user_id);
    if (user) {
      try {
        await this.bot.telegram.sendMessage(
          user.telegram_id,
          `❌ <b>На жаль, ваше відео в TikTok було відхилено.</b>\n\n📝 <b>Причина:</b> ${reason}\n\nУважно перечитайте правила і спробуйте ще раз!`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}
    }
    return submission;
  }
}
