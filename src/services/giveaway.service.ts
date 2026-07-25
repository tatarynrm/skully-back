import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { UserRepository } from '../repositories/user.repository';
import Redis from 'ioredis';
import { ProfileService } from './profile.service';

@Injectable()
export class GiveawayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GiveawayService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly userRepository: UserRepository,
    private readonly profileService: ProfileService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  onModuleInit() {
    this.logger.log('Starting Kyiv Premium Giveaway Scheduler (checks every 30s)...');
    // Check every 30 seconds to make sure we don't miss the 19:30 or 20:00 marks
    this.intervalId = setInterval(() => this.checkSchedule(), 30000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Giveaway Scheduler stopped.');
    }
  }

  private async checkSchedule() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      // Format current time in Europe/Kiev timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Kiev',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const dateParts: { [key: string]: string } = {};
      parts.forEach((p) => {
        dateParts[p.type] = p.value;
      });

      const year = dateParts['year'];
      const month = dateParts['month'];
      const day = dateParts['day'];
      const hour = parseInt(dateParts['hour'], 10);
      const minute = parseInt(dateParts['minute'], 10);

      const kyivDateStr = `${year}-${month}-${day}`;

      // 1. Stage 1: Send invitation message at 19:30
      if (hour === 19 && minute === 30) {
        const postRunKey = `giveaway:post-run:${kyivDateStr}`;
        const postRun = await this.redis.get(postRunKey);

        if (postRun !== 'Y') {
          // Acquire lock to post exactly once
          const lockAcquired = await this.redis.set(postRunKey, 'Y', 'EX', 86400, 'NX');
          if (lockAcquired === 'OK') {
            this.logger.log(`📢 Time is 19:30 Kyiv! Sending daily giveaway entry post for date: ${kyivDateStr}`);
            await this.sendGiveawayPost();
          }
        }
      }

      // 2. Stage 2: Perform the draw at 20:00
      if (hour === 20 && minute === 0) {
        const drawRunKey = `giveaway:draw-run:${kyivDateStr}`;
        const drawRun = await this.redis.get(drawRunKey);

        if (drawRun !== 'Y') {
          // Acquire lock to draw exactly once
          const lockAcquired = await this.redis.set(drawRunKey, 'Y', 'EX', 86400, 'NX');
          if (lockAcquired === 'OK') {
            this.logger.log(`🎉 Time is 20:00 Kyiv! Executing daily Premium Giveaway draw for date: ${kyivDateStr}`);
            await this.runGiveawayDraw(kyivDateStr);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Error checking giveaway schedule: ${err.message}`, err.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendGiveawayPost() {
    try {
      const botInfo = await this.bot.telegram.getMe();
      const botUsername = botInfo.username;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🎁 Взяти участь', 'join_giveaway')],
        [Markup.button.url('🤖 Перейти в бот', `https://t.me/${botUsername}`)]
      ]);

      const channel = this.configService.get<string>('GIVEAWAY_CHANNEL', '@test_roman_noris');
      const invitationMessage = 
        `🏆 <b>Щоденний розіграш ⭐ ПРЕМІУМУ!</b> 🏆\n\n` +
        `Бажаєте отримати ⭐ <b>Преміум підписку на 2 дні</b> абсолютно безкоштовно?\n\n` +
        `👇 Натискайте кнопку <b>«🎁 Взяти участь»</b> під цим повідомленням!\n\n` +
        `⏱️ Результати розіграшу будуть опубліковані о <b>20:00</b> за київським часом!`;

      await this.bot.telegram.sendMessage(channel, invitationMessage, {
        parse_mode: 'HTML',
        ...keyboard
      });
      this.logger.log(`Posted giveaway card successfully to channel ${channel}`);
    } catch (err) {
      this.logger.error(`Failed to post giveaway invitation card: ${err.message}`, err.stack);
    }
  }

  private async runGiveawayDraw(kyivDateStr: string) {
    try {
      const queueKey = `giveaway:participants:${kyivDateStr}`;
      
      // Get up to 3 random winners from the Redis set using SRANDMEMBER
      const winnerIdsStr = await this.redis.srandmember(queueKey, 3);
      
      const channel = this.configService.get<string>('GIVEAWAY_CHANNEL', '@test_roman_noris');

      if (!winnerIdsStr || winnerIdsStr.length === 0) {
        const noParticipantsMessage = 
          `🏆 <b>Щоденний розіграш ⭐ ПРЕМІУМУ!</b> 🏆\n\n` +
          `На жаль, сьогодні ніхто не взяв участь у розіграші. 😔\n\n` +
          `Не пропустіть наступний шанс завтра о 19:30! 🇺🇦`;
        await this.bot.telegram.sendMessage(channel, noParticipantsMessage, { parse_mode: 'HTML' });
        this.logger.warn('Giveaway Draw: No participants registered today.');
        return;
      }

      const winnerIds = winnerIdsStr.map(id => parseInt(id, 10));
      const winnersData: Array<{ name: string; mention: string; telegramId: number }> = [];

      for (const winnerId of winnerIds) {
        // 1. Grant premium for 2 days
        const days = 2;
        await this.userRepository.activatePremium(winnerId, days);

        // 2. Invalidate profile cache
        await this.redis.del(`profile:${winnerId}`);

        // 3. Log to history table
        await this.userRepository.logGiveawayWinner(winnerId, days);

        // 4. Fetch details for announcement
        const user = await this.userRepository.findById(winnerId);
        const profileInfo = await this.profileService.getProfile(winnerId);
        
        if (user && profileInfo && profileInfo.profile) {
          const name = profileInfo.profile.name;
          const mention = user.username ? `@${user.username}` : `ID: ${user.telegram_id}`;
          winnersData.push({ name, mention, telegramId: user.telegram_id });

          // 5. Send direct message to the winner
          try {
            const directMessage = 
              `🎉 <b>ВІТАЄМО! Ви виграли!</b> 🏆\n\n` +
              `Ви стали одним із переможців у нашому щоденному розіграші в каналі ${channel}!\n` +
              `Вам нараховано ⭐ <b>Преміум підписку на 2 дні</b> абсолютно безкоштовно! 🎁\n\n` +
              `Бажаємо приємного спілкування! 🥰`;
            await this.bot.telegram.sendMessage(user.telegram_id, directMessage, { parse_mode: 'HTML' });
          } catch (err) {
            this.logger.warn(`Failed to notify winner ${user.telegram_id} directly: ${err.message}`);
          }
        }
      }

      // 6. Post announcement to channel
      let winnersListText = '';
      winnersData.forEach((w, index) => {
        winnersListText += `${index + 1}. <b>${this.escapeHtml(w.name)}</b> (${w.mention})\n`;
      });

      const channelMessage = 
        `🏆 <b>Результати щоденного розіграшу ⭐ ПРЕМІУМУ!</b> 🏆\n\n` +
        `Вітаємо наших <b>${winnersData.length}</b> випадкових переможців, які виграли ⭐ <b>Преміум на 2 дні</b>: 🎉\n\n` +
        winnersListText +
        `\nПреміум активовано автоматично! Наступний розіграш завтра о 19:30! 🎁`;

      await this.bot.telegram.sendMessage(channel, channelMessage, { parse_mode: 'HTML' });
      this.logger.log(`Posted giveaway draw results to channel ${channel}`);

      // 7. Clean up the Redis participants list for today
      await this.redis.del(queueKey);

    } catch (err) {
      this.logger.error(`Error running daily premium giveaway draw: ${err.message}`, err.stack);
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
