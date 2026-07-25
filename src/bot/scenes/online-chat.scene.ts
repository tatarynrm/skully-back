import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup, Telegraf } from 'telegraf';
import { UserService } from '../../services/user.service';
import { ProfileService } from '../../services/profile.service';
import { UserRepository } from '../../repositories/user.repository';
import { Inject, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import Redis from 'ioredis';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const ONLINE_CHAT_SCENE_ID = 'ONLINE_CHAT_SCENE';

const CHAT_SEARCH_KEYBOARD = Markup.keyboard([
  ['🔍 Шукати співрозмовника'],
  ['↩️ Головне меню'],
]).resize();

const CHAT_WAITING_KEYBOARD = Markup.keyboard([
  ['❌ Зупинити пошук'],
]).resize();

const CHAT_ACTIVE_KEYBOARD = Markup.keyboard([
  ['⛔ Закінчити діалог', '🔄 Шукати далі'],
  ['🚫 Заблокувати'],
]).resize();

@Wizard(ONLINE_CHAT_SCENE_ID)
export class OnlineChatScene {
  private readonly logger = new Logger(OnlineChatScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly userRepository: UserRepository,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @InjectBot() private readonly bot: Telegraf<any>,
  ) { }

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('⚠️ Зареєструйтеся спочатку в боті!', MAIN_KEYBOARD);
      return ctx.scene.leave();
    }

    if (!user.username) {
      await ctx.reply(
        '⚠️ <b>Помилка: У вашому Telegram-профілі відсутній Username (ім\'я користувача)!</b>\n\n' +
        'Щоб користуватися чатом, будь ласка, створіть Username у налаштуваннях Telegram (наприклад, @your_name) та запустіть чат знову!',
        { parse_mode: 'HTML', ...MAIN_KEYBOARD }
      );
      return ctx.scene.leave();
    }

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await ctx.reply('⚠️ Створіть анкету, перш ніж розпочати спілкування!', MAIN_KEYBOARD);
      return ctx.scene.leave();
    }

    // Clean up any stale chat/search states for safety
    await this.cleanupUserChatState(user.id);

    await ctx.reply(
      '🌐 <b>Онлайн спілкування</b>\n\n' +
      'Тут ви можете анонімно спілкуватися зі співрозмовниками вашої вікової категорії.\n\n' +
      'Натисніть «🔍 Шукати співрозмовника», щоб почати пошук!',
      {
        parse_mode: 'HTML',
        ...CHAT_SEARCH_KEYBOARD,
      }
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('message')
  async step2Loop(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.scene.leave();

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) return ctx.scene.leave();

    const text = (ctx.message as any)?.text?.trim();

    // Check if user is in an active chat
    const partnerId = await this.redis.get(`chat:active:${user.telegram_id}`);

    if (partnerId) {
      const partnerTelegramId = parseInt(partnerId, 10);

      // Handle active chat menu commands
      if (text === '⛔ Закінчити діалог') {
        await this.endChat(user.telegram_id, partnerTelegramId);
        return;
      }

      if (text === '🔄 Шукати далі') {
        await ctx.reply(
          'Бажаєте знайти іншого співрозмовника?',
          Markup.inlineKeyboard([
            [Markup.button.callback('Так, шукати іншого', 'confirm_search_next')],
            [Markup.button.callback('Ні, залишитись тут', 'cancel_search_next')],
          ])
        );
        return;
      }

      if (text === '🚫 Заблокувати') {
        // Stop the chat immediately
        await this.redis.del(`chat:active:${user.telegram_id}`);
        await this.redis.del(`chat:active:${partnerTelegramId}`);

        // Notify partner
        try {
          await this.bot.telegram.sendMessage(
            partnerTelegramId,
            '⛔ Співрозмовник завершив діалог.',
            CHAT_SEARCH_KEYBOARD
          );
        } catch (err) { }

        // Enter block reason phase
        ctx.wizard.state['blockTargetId'] = partnerTelegramId;
        ctx.wizard.selectStep(2); // keep on step 2 for input
        ctx.wizard.state['inBlockPrompt'] = true;

        await ctx.reply(
          '🚫 <b>Блокування співрозмовника</b>\n\n' +
          'Вкажіть причину блокування або натисніть кнопку «⏩ Пропустити»:\n' +
          '(Цей користувач більше ніколи не трапиться вам у пошуці)',
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('⏩ Пропустити', 'skip_block_reason')]]),
          }
        );
        return;
      }

      // If they are in a block prompt, don't forward messages
      if (ctx.wizard.state['inBlockPrompt']) {
        await this.handleBlockReasonInput(ctx, user.id);
        return;
      }

      // Forward message anonymously to partner
      try {
        await ctx.copyMessage(partnerTelegramId);
      } catch (err) {
        await ctx.reply('⚠️ Не вдалося доставити повідомлення. Співрозмовник, можливо, закрив чат.');
        await this.endChat(user.telegram_id, partnerTelegramId);
      }
      return;
    }

    // User is in block prompt (but partner is already disconnected)
    if (ctx.wizard.state['inBlockPrompt']) {
      await this.handleBlockReasonInput(ctx, user.id);
      return;
    }

    if (text === '🔍 Шукати співрозмовника') {
      await this.searchPartner(ctx, user.id, profile.age);
      return;
    }

    if (text === '❌ Зупинити пошук') {
      await this.cleanupUserChatState(user.id);
      await ctx.reply('🛑 Пошук зупинено.', CHAT_SEARCH_KEYBOARD);
      return;
    }

    if (text === '↩️ Головне меню') {
      await this.cleanupUserChatState(user.id);
      await ctx.reply('Повернення в головне меню.', MAIN_KEYBOARD);
      return ctx.scene.leave();
    }

    await ctx.reply('Натисніть «🔍 Шукати співрозмовника» або скористайтеся меню.');
  }

  @Action('confirm_search_next')
  async onConfirmSearchNext(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => { });

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) return;

    const partnerId = await this.redis.get(`chat:active:${user.telegram_id}`);
    if (partnerId) {
      const partnerTelegramId = parseInt(partnerId, 10);
      await this.endChat(user.telegram_id, partnerTelegramId);
    }

    // Immediately search for another partner
    await this.searchPartner(ctx, user.id, profile.age);
  }

  @Action('cancel_search_next')
  async onCancelSearchNext(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => { });
    await ctx.reply('Діалог продовжується. Надішліть повідомлення:');
  }

  @Action('skip_block_reason')
  async onSkipBlockReason(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => { });

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return;

    await this.saveBlockRelation(ctx, user.id, 'Не вказано');
  }

  private async handleBlockReasonInput(ctx: WizardContext, userId: number) {
    const text = (ctx.message as any)?.text?.trim();
    if (!text || text.startsWith('/')) {
      await ctx.reply('Будь ласка, введіть причину текстом або натисніть «⏩ Пропустити»:');
      return;
    }
    await this.saveBlockRelation(ctx, userId, text);
  }

  private async saveBlockRelation(ctx: WizardContext, userId: number, reason: string) {
    const targetTelegramId = ctx.wizard.state['blockTargetId'];
    delete ctx.wizard.state['blockTargetId'];
    delete ctx.wizard.state['inBlockPrompt'];

    if (targetTelegramId) {
      const partnerUser = await this.userService.findByTelegramId(targetTelegramId);
      if (partnerUser) {
        // Log block in PostgreSQL
        await this.userRepository.addChatBlock(userId, partnerUser.id, reason);

        // Update Redis block lists for rapid matching filters
        await this.redis.sadd(`chat:blocked:${userId}`, partnerUser.id);
        await this.redis.sadd(`chat:blocked:${partnerUser.id}`, userId);
      }
    }

    await ctx.reply('✅ Користувача заблоковано. Діалог завершено.', CHAT_SEARCH_KEYBOARD);
  }

  private async searchPartner(ctx: WizardContext, userId: number, userAge: number) {
    const user = await this.userService.getUserById(userId);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(userId);
    if (!profile) return;

    const lon = profile.location_lon;
    const lat = profile.location_lat;

    if (lon == null || lat == null) {
      await ctx.reply('⚠️ У вашому профілі немає координат! Будь ласка, оновіть ваше місто / геолокацію.');
      return;
    }

    // Clean up states just in case
    await this.cleanupUserChatState(userId);

    // Get blocked relations from DB
    const dbBlockedUserIds = await this.userRepository.getChatBlockedUsers(userId);

    try {
      // Find nearby searching users sorted by distance (up to 20,000 km)
      const results = await this.redis.georadius('chat:searching_geo', lon, lat, 20000, 'km', 'ASC');

      if (results && results.length > 0) {
        for (const candIdStr of results as string[]) {
          const candId = parseInt(candIdStr, 10);
          if (candId === userId) continue;

          // Skip if blocked
          if (dbBlockedUserIds.includes(candId)) continue;

          // Fetch candidate profile (cached)
          const candProfileData = await this.profileService.getProfile(candId);
          if (!candProfileData || !candProfileData.profile) continue;

          // Check age limit (+/- 3 years)
          const ageDiff = Math.abs(candProfileData.profile.age - userAge);
          if (ageDiff > 3) continue;

          // Try to pop candidate atomically from searching pool
          const claimed = await this.redis.srem('chat:searching_users', candId);
          if (claimed === 1) {
            // Match found! Remove candidate and self from geosearch
            await this.redis.zrem('chat:searching_geo', candId.toString(), userId.toString());
            await this.redis.del(`chat:searching:${candId}`);

            const partnerUser = await this.userService.getUserById(candId);
            const currentUser = await this.userService.getUserById(userId);

            if (partnerUser && currentUser) {
              // Establish active chat link
              await this.redis.set(`chat:active:${currentUser.telegram_id}`, partnerUser.telegram_id);
              await this.redis.set(`chat:active:${partnerUser.telegram_id}`, currentUser.telegram_id);

              const currentProfileData = await this.profileService.getProfile(userId);

              // Inform current user
              await ctx.reply(
                '🎉 <b>Співрозмовника знайдено!</b>\n\n' +
                'Діалог розпочато. Спілкування повністю анонімне.\n' +
                'Ви можете писати повідомлення або надсилати медіа.',
                { parse_mode: 'HTML' }
              );

              // Inform partner user
              try {
                await this.bot.telegram.sendMessage(
                  partnerUser.telegram_id,
                  '🎉 <b>Співрозмовника знайдено!</b>\n\n' +
                  'Діалог розпочато. Спілкування повністю анонімне.\n' +
                  'Ви можете писати повідомлення або надсилати медіа.',
                  { parse_mode: 'HTML' }
                );
              } catch (err) { }

              // Swap profile cards
              if (candProfileData.profile && currentProfileData.profile) {
                try {
                  // Send partner's profile to current user
                  await this.sendProfileCard(
                    currentUser.telegram_id,
                    candProfileData.profile,
                    candProfileData.photos,
                    CHAT_ACTIVE_KEYBOARD
                  );
                } catch (err) { }

                try {
                  // Send current user's profile to partner user
                  await this.sendProfileCard(
                    partnerUser.telegram_id,
                    currentProfileData.profile,
                    currentProfileData.photos,
                    CHAT_ACTIVE_KEYBOARD
                  );
                } catch (err) { }
              }
              return;
            }
          }
        }
      }
    } catch (err) {
      this.logger.error(`Error in geo matching: ${err.message}`, err.stack);
    }

    // If no candidate found, place self on waiting list
    await this.redis.sadd('chat:searching_users', userId);
    await this.redis.geoadd('chat:searching_geo', lon, lat, userId.toString());
    await this.redis.set(`chat:searching:${userId}`, userAge);

    await ctx.reply(
      '🔍 <b>Шукаємо найближчого співрозмовника вашої вікової категорії (+/- 3 роки)...</b>\n' +
      'Зачекайте, будь ласка. Ви отримаєте сповіщення, як тільки хтось знайдеться.',
      {
        parse_mode: 'HTML',
        ...CHAT_WAITING_KEYBOARD,
      }
    );
  }

  private async endChat(myTelegramId: number, partnerTelegramId: number) {
    await this.redis.del(`chat:active:${myTelegramId}`);
    await this.redis.del(`chat:active:${partnerTelegramId}`);

    try {
      await this.bot.telegram.sendMessage(
        partnerTelegramId,
        '⛔ Діалог завершено співрозмовником.',
        CHAT_SEARCH_KEYBOARD
      );
    } catch (err) { }

    try {
      await this.bot.telegram.sendMessage(
        myTelegramId,
        '⛔ Діалог завершено.',
        CHAT_SEARCH_KEYBOARD
      );
    } catch (err) { }
  }

  private async sendProfileCard(telegramId: number, profile: any, photos: any[], extraKeyboard?: any) {
    const genderText = profile.gender === 'MALE' ? '👨 Хлопець' : '👩 Дівчина';
    const caption =
      `👤 <b>Співрозмовник:</b>\n\n` +
      `Ім'я: <b>${this.escapeHtml(profile.name)}</b>\n` +
      `Вік: <b>${profile.age}</b>\n` +
      `Стать: <b>${genderText}</b>\n` +
      `Місто: <b>${this.escapeHtml(profile.city || 'Не вказано')}</b>\n` +
      `Про себе: ${this.escapeHtml(profile.bio || '-')}`;

    if (!photos || photos.length === 0) {
      await this.bot.telegram.sendMessage(telegramId, caption, { parse_mode: 'HTML', ...extraKeyboard });
    } else if (photos.length === 1) {
      await this.bot.telegram.sendPhoto(telegramId, photos[0].file_id, {
        caption,
        parse_mode: 'HTML',
        ...extraKeyboard,
      });
    } else {
      const media = photos.map((p, idx) => ({
        type: 'photo' as const,
        media: p.file_id,
        caption: idx === 0 ? caption : undefined,
        parse_mode: 'HTML' as const,
      }));
      await this.bot.telegram.sendMediaGroup(telegramId, media);
      if (extraKeyboard) {
        await this.bot.telegram.sendMessage(telegramId, 'Оберіть дію:', { parse_mode: 'HTML', ...extraKeyboard });
      }
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

  private async cleanupUserChatState(userId: number) {
    await this.redis.srem('chat:searching_users', userId);
    await this.redis.zrem('chat:searching_geo', userId.toString());
    await this.redis.del(`chat:searching:${userId}`);
  }
}
