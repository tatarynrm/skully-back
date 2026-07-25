import { Update, Ctx, Start, Command, Action, On, Hears } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { UserService } from '../services/user.service';
import { ProfileService } from '../services/profile.service';
import { MatchService } from '../services/match.service';
import { DiscoveryService } from '../services/discovery.service';
import { LikeRepository } from '../repositories/like.repository';
import { PhotoRepository, PhotoEntity } from '../repositories/photo.repository';
import { MatchRepository } from '../repositories/match.repository';
import { UserRepository } from '../repositories/user.repository';
import { Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PROFILE_WIZARD_ID, MAIN_KEYBOARD, SEARCH_MODE_KEYBOARD } from './scenes/profile-wizard.scene';
import { REPORT_WIZARD_ID } from './scenes/report-wizard.scene';
import { LIKE_MESSAGE_WIZARD_ID } from './scenes/like-message-wizard.scene';
import { SUGGESTIONS_WIZARD_ID } from './scenes/suggestions-wizard.scene';
import { ONLINE_CHAT_SCENE_ID } from './scenes/online-chat.scene';
import {
  EDIT_NAME_SCENE_ID,
  EDIT_AGE_SCENE_ID,
  EDIT_GENDER_SCENE_ID,
  EDIT_SEARCH_GENDER_SCENE_ID,
  EDIT_LOCATION_SCENE_ID,
  EDIT_BIO_SCENE_ID,
  EDIT_PHOTOS_SCENE_ID,
} from './scenes/edit-field.scenes';
import { ReferralService } from '../services/referral.service';
import { QuizService } from '../services/quiz.service';
import { QUIZ_SCENE_ID } from './scenes/quiz.scene';
import { BroadcastRepository } from '../repositories/broadcast.repository';

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);
  private readonly activeCandidateMap = new Map<number, number>();

  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly matchService: MatchService,
    private readonly discoveryService: DiscoveryService,
    private readonly likeRepository: LikeRepository,
    private readonly photoRepository: PhotoRepository,
    private readonly matchRepository: MatchRepository,
    private readonly userRepository: UserRepository,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly referralService: ReferralService,
    private readonly quizService: QuizService,
    private readonly broadcastRepository: BroadcastRepository,
  ) { }

  @On('my_chat_member')
  async onMyChatMember(@Ctx() ctx: Context) {
    const update = ctx.myChatMember;
    if (!update) return;

    const chat = update.chat;
    const status = update.new_chat_member?.status;

    // Check if bot is administrator
    const isBotAdmin = status === 'administrator';

    if (chat.type === 'channel' || chat.type === 'supergroup' || chat.type === 'group') {
      const type = chat.type === 'channel' ? 'channel' : 'group';
      const title = chat.title || 'Unknown Title';
      const username = (chat as any).username || null;
      
      try {
        if (isBotAdmin) {
          await this.broadcastRepository.upsertChannel(chat.id, title, username, type, true);
          this.logger.log(`Bot added to ${type} ${title} (${chat.id}) as admin.`);
        } else {
          // Bot was kicked or demoted
          await this.broadcastRepository.upsertChannel(chat.id, title, username, type, false);
          this.logger.log(`Bot removed/demoted from ${type} ${title} (${chat.id}).`);
        }
      } catch (e) {
        this.logger.error(`Failed to handle my_chat_member update: ${e.message}`);
      }
    }
  }

  @Start()
  async onStart(@Ctx() ctx: WizardContext) {
    console.log('dsassssss-------------------');

    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.userService.findOrCreateUser(telegramId, ctx.from?.username);
      const { profile } = await this.profileService.getProfile(user.id);

      // Handle referral link: /start ref_<userId>
      const startPayload = (ctx.message as any)?.text?.split(' ')[1];
      if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = parseInt(startPayload.replace('ref_', ''), 10);
        if (!isNaN(referrerId) && referrerId !== user.id) {
          const premiumAwarded = await this.referralService.processReferral(referrerId, user.id);
          if (premiumAwarded) {
            try {
              await ctx.telegram.sendMessage(
                referrerId,
                `🎉 <b>Вітаємо! Ваш друг приєднався за вашим посиланням!</b>\n\n` +
                `Ви запросили достатньо друзів і <b>отримуєте +2 дні Premium</b> абсолютно безкоштовно! ⭐\n\n` +
                `Продовжуйте запрошувати друзів — кожні 2 друзі = ще +2 дні Premium! 🚀`,
                { parse_mode: 'HTML' },
              );
            } catch (e) {
              this.logger.warn(`Could not notify referrer ${referrerId}: ${e.message}`);
            }
          }
        }
      }

      const welcomeMsg =
        `🇺🇦 <b>Ласкаво просимо до українського сервісу знайомств!</b> 👋\n\n` +
        `🏆 <b>Щоденний розіграш Premium-підписки!</b>\n` +
        `Кожного дня у нашому каналі проводиться розіграш серед усіх, хто натиснув кнопку «🎁 Взяти участь».\n` +
        `🎁 <b>Приз:</b> Безкоштовна Premium-підписка на 2 дні для кожного з трьох переможців!\n\n` +
        `Усе здійснюється повністю офіційно та чесно! Деталі в меню «🏆 Розіграш». 🎁\n\n`;

      if (!profile) {
        const FUN_GIFS = [
          'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
          'https://media.giphy.com/media/26FPpSuhgHvU6hOQo/giphy.gif',
          'https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif',
          'https://media.giphy.com/media/DhstvI3zZ598Nb1rFf/giphy.gif',
          'https://media.giphy.com/media/fsQbx1hX7hPBBpIM5b/giphy.gif',
          'https://media.giphy.com/media/11sBLVxIRwn5v2/giphy.gif',
          'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
          'https://media.giphy.com/media/nXXU1DVGVAD60/giphy.gif',
          'https://media.giphy.com/media/chzz1FQgqhytWRWbp3/giphy.gif',
          'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif'
        ];
        const randomGif = FUN_GIFS[Math.floor(Math.random() * FUN_GIFS.length)];
        const startText = welcomeMsg + `\n\n👇 <b>Для користування ботом необхідно створити анкету</b> (вік від 16 до 99 років).`;

        try {
          await ctx.replyWithAnimation(randomGif, {
            caption: startText,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🚀 Створити анкету', 'start_registration')]])
          });
        } catch (e) {
          // Fallback if animation fails to send
          await ctx.reply(startText, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🚀 Створити анкету', 'start_registration')]])
          });
        }
      } else {
        await ctx.reply(
          welcomeMsg + `Вітаємо знову, ${profile.name}! 🌟\nОберіть дію в меню нижче:`,
          { parse_mode: 'HTML', ...this.getKeyboardForUser(profile) },
        );
      }
    } catch (err) {
      this.logger.error(`Error in onStart: ${err.message}`, err.stack);
      try {
        await ctx.reply('Сталася помилка при запуску. Спробуйте пізніше.');
      } catch (e) { }
    }
  }

  @Command('giveaway')
  @Hears('🏆 Розіграш')
  async onGiveawayInfo(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const infoText =
      `🏆 <b>Розіграші в нашому боті!</b> 🇺🇦\n\n` +
      `У нас проходять два типи розіграшів:\n` +
      `1️⃣ <b>Щоденний розіграш Premium-підписки</b>\n` +
      `2️⃣ <b>Щотижневий грошовий розіграш</b>\n\n` +
      `👇 Оберіть розіграш за допомогою кнопок нижче, щоб дізнатися деталі.\n\n` +
      `⚠️ <b>Обов'язкова умова участі:</b>\n` +
      `Для участі в будь-якому розіграші необхідно надати свій номер телефону.\n\n` +
      `🔒 <b>Запевнення конфіденційності:</b>\n` +
      `Ваш номер телефону потрібен <i>виключно</i> для того, щоб адміністратор міг зв'язатися з вами у разі виграшу. Ваш номер <b>ніколи і ніде не буде відображатись</b>.`;

    const giveawayKeyboard = [
      ['📅 Щоденний (Premium)', '🗓 Щотижневий (Гроші)'],
      user.phone ? [Markup.button.contactRequest('📱 Оновити номер телефону')] : [Markup.button.contactRequest('📱 Поділитися контактом')],
      ['↩️ Головне меню']
    ];

    if (user.phone) {
      await ctx.reply(
        infoText +
        `\n\n✅ <b>Ваш номер телефону:</b> <code>${user.phone}</code>\n` +
        `Дякуємо, ваш номер телефону вже є в базі! Ви можете брати участь у розіграшах.`,
        {
          parse_mode: 'HTML',
          ...Markup.keyboard(giveawayKeyboard).resize(),
        }
      );
    } else {
      await ctx.reply(
        infoText +
        `\n\n👇 Будь ласка, натисніть кнопку <b>«📱 Поділитися контактом»</b> нижче, щоб надати свій номер телефону та отримати можливість брати участь:`,
        {
          parse_mode: 'HTML',
          ...Markup.keyboard(giveawayKeyboard).resize(),
        }
      );
    }
  }

  @Hears('📅 Щоденний (Premium)')
  async onDailyGiveaway(@Ctx() ctx: WizardContext) {
    const channel = this.configService.get<string>('GIVEAWAY_CHANNEL', '@test_roman_noris');
    const channelClean = channel.startsWith('@') ? channel.slice(1) : channel;
    const channelUrl = `https://t.me/${channelClean}`;

    const text =
      `🏆 <b>Щоденний розіграш Premium-підписки!</b> 🇺🇦\n\n` +
      `Кожного дня о <b>19:30 за київським часом</b> у нашому каналі публікується пост для розіграшу.\n` +
      `О <b>20:00 за київським часом</b> бот автоматично вибирає <b>3 випадкових переможців</b> серед усіх, хто натиснув кнопку «🎁 Взяти участь»!\n\n` +
      `🎁 <b>Приз:</b> Безкоштовна Premium-підписка на <b>2 дні</b> для кожного з трьох переможців!`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.url('📢 Перейти до каналу', channelUrl)]]),
    });
  }

  @Hears('🗓 Щотижневий (Гроші)')
  async onWeeklyGiveaway(@Ctx() ctx: WizardContext) {
    const text =
      `🏆 <b>Щотижневий грошовий розіграш призів!</b> 🇺🇦\n\n` +
      `Кожного тижня серед активних користувачів автоматично проводиться розіграш грошового фонду:\n` +
      `🥇 1 місце — <b>500 грн</b>\n` +
      `🥈 2 місце — <b>250 грн</b>\n` +
      `🥉 3 місце — <b>100 грн</b>\n\n` +
      `Усе здійснюється повністю офіційно та чесно з підтвердженнями і трансляціями! 🎁`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
    });
  }

  @Command('proposals')
  @Command('suggestions')
  @Hears('💡 Пропозиції')
  async onProposals(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;
    await ctx.scene.enter(SUGGESTIONS_WIZARD_ID);
  }

  @Hears('🧠 Цікавинка')
  async onQuiz(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;
    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await this.promptRegistration(ctx);
      return;
    }
    await ctx.scene.enter(QUIZ_SCENE_ID);
  }

  @Action('open_proposals')
  async onProposalsAction(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;
    await ctx.scene.enter(SUGGESTIONS_WIZARD_ID);
  }

  @Command('information')
  @Hears('ℹ️ Інформація')
  async onInformation(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const botInfo = await ctx.telegram.getMe();
    const referralLink = await this.referralService.getReferralLink(botInfo.username, user.id);
    const referralCount = await this.referralService.countReferrals(user.id);
    const needed = this.referralService.getRequiredReferrals();
    const premiumDays = this.referralService.getPremiumDaysPerTier();
    const nextMilestone = needed - (referralCount % needed);
    const nextMilestoneText = nextMilestone === needed ? 0 : nextMilestone;

    const infoText =
      `ℹ️ <b>Інформація про Telegram Dating Bot</b>\n\n` +
      `<b>📋 Основні команди бота:</b>\n` +
      `• /profile — 👤 Перегляд та редагування вашого профілю\n` +
      `• /proposals — 💡 Надати пропозиції та ідеї щодо функціоналу\n` +
      `• /information — ℹ️ Інформація про бота\n` +
      `• /giveaway — 🏆 Розіграш призів\n` +
      `• /matches — ❤️ Перегляд ваших співпадінь (по 10 на сторінку)\n\n` +
      `<b>🌟 Правила та ліміти:</b>\n` +
      `• <b>Денний ліміт 20 лайків</b> для безкоштовних анкет (оновлюється щодня о <b>01:00 ночі</b>).\n` +
      `• <b>Пропуски (дизлайки) безлімітні</b> і не витрачають денний ліміт.\n` +
      `• <b>⭐ Преміум</b> дає нескінченні лайки без обмежень.\n\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `🎁 <b>Реферальна програма</b>\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `Запрошуй друзів — отримуй <b>безкоштовний Premium</b>! 🚀\n\n` +
      `🔗 Як це працює:\n` +
      `1️⃣ Натисни кнопку <b>«🔗 Моє реферальне посилання»</b>\n` +
      `2️⃣ Поділись ним з друзями — вони реєструються у боті\n` +
      `3️⃣ За кожних <b>${needed} запрошених друзів</b> ти отримуєш <b>⭐ Premium на ${premiumDays} дні</b>\n` +
      `💡 Якщо Premium вже активний — дні <b>додаються</b> до поточного терміну!\n\n` +
      `📊 <b>Твоя статистика:</b> ${referralCount} запрошено | ще ${nextMilestoneText === 0 ? needed : nextMilestoneText} до наступного Premium`;

    const buttons: any[] = [
      [Markup.button.callback('🔗 Моє реферальне посилання', 'show_referral_link')],
      [Markup.button.callback('⭐ Переваги Premium', 'show_premium_info')],
      [Markup.button.callback('💡 Надіслати пропозиції', 'open_proposals')],
    ];
    if (referralCount > 0) {
      buttons.push([Markup.button.callback(`👥 Мої реферали (${referralCount})`, 'show_my_referrals')]);
    }

    await ctx.reply(infoText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  }

  @Action('show_premium_info')
  async onShowPremiumInfo(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const text =
      `⭐ <b>Що дає Premium-підписка?</b>\n\n` +
      `Premium-акаунт відкриває повний доступ до всіх можливостей нашого сервісу знайомств:\n\n` +
      `🔥 <b>Нескінченні лайки без обмежень</b>\n` +
      `Забудьте про ліміт 20 лайків на день! Гортайте анкети та висловлюйте симпатії стільки, скільки забажаєте.\n\n` +
      `⭐ <b>Преміум-значок у профілі</b>\n` +
      `Ваша анкета виділятиметься в стрічці спеціальним значком, що суттєво підвищує зацікавленість та кількість переглядів.\n\n` +
      `🔒 <b>Доступ до Інтим-анкет та Сторіс</b>\n` +
      `Отримуйте ексклюзивний доступ до прихованих інтимних анкет, чуттєвих фото/відео та коментування таємних сторіс.\n\n` +
      `🚀 <b>Пріоритетний показ вашої анкети</b>\n` +
      `Ваша анкета буде частіше та пріоритетніше відображатися іншим користувачам бота у вашому місті.\n\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `💡 <b>Як отримати Premium безкоштовно?</b>\n` +
      `• Беріть участь у щоденних розіграшах у нашому каналі.\n` +
      `• Запрошуйте друзів через реферальну програму (кожні 2 друзі = +2 дні Premium).\n` +
      `• Проходьте квіз «Цікавинка» (обидві правильні відповіді за 60 секунд = +1 день Premium).`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  @Action('show_referral_link')
  async onShowReferralLink(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const botInfo = await ctx.telegram.getMe();
    const referralLink = await this.referralService.getReferralLink(botInfo.username, user.id);
    const referralCount = await this.referralService.countReferrals(user.id);
    const needed = this.referralService.getRequiredReferrals();
    const premiumDays = this.referralService.getPremiumDaysPerTier();

    const text =
      `🔗 <b>Твоє реферальне посилання:</b>\n\n` +
      `<code>${referralLink}</code>\n\n` +
      `📤 Просто скопіюй і надішли другу!\n\n` +
      `🏆 <b>Як нараховується Premium:</b>\n` +
      `• За кожних <b>${needed} нових друзів</b> → <b>+${premiumDays} дні Premium</b> ⭐\n` +
      `• Якщо Premium вже є — дні додаються до залишку\n\n` +
      `📊 <b>Поточний прогрес:</b> ${referralCount} / ${needed + (Math.floor(referralCount / needed) * needed)} запрошень виконано`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  @Action('show_my_referrals')
  async onShowMyReferrals(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await this.renderReferralsPage(ctx, 1);
  }

  @Action(/^referrals_page_(\d+)$/)
  async onReferralsPage(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const cbData = (ctx.callbackQuery as any)?.data || '';
    const page = parseInt(cbData.replace('referrals_page_', ''), 10);
    if (!isNaN(page)) {
      await this.renderReferralsPage(ctx, page);
    }
  }

  @Action('referrals_page_noop')
  async onReferralsNoop(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
  }

  private async renderReferralsPage(ctx: WizardContext, page: number) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const PAGE_SIZE = 10;
    const { referrals, total, totalPages } = await this.referralService.getReferrals(user.id, page, PAGE_SIZE);

    if (total === 0) {
      await ctx.reply('👥 У вас поки немає запрошених друзів. Поділіться реферальним посиланням!', {
        parse_mode: 'HTML',
      });
      return;
    }

    const startIdx = (page - 1) * PAGE_SIZE;
    let text = `👥 <b>Ваші запрошені друзі (${total})</b> — Сторінка ${page}/${totalPages}:\n\n`;
    referrals.forEach((r, i) => {
      const name = r.name ? this.escapeHtml(r.name) : 'Користувач';
      const date = new Date(r.created_at).toLocaleDateString('uk-UA');
      text += `${startIdx + i + 1}. <b>${name}</b> — приєднався ${date}\n`;
    });

    const needed = this.referralService.getRequiredReferrals();
    const premiumDays = this.referralService.getPremiumDaysPerTier();
    const nextMilestone = needed - (total % needed);
    text += `\n💡 Ще <b>${nextMilestone === needed ? 0 : nextMilestone}</b> друг(ів) і ви отримаєте <b>+${premiumDays} дні Premium</b>! 🚀`;

    // Build pagination row
    const paginationRow: any[] = [];
    if (page > 1) {
      paginationRow.push(Markup.button.callback('⬅️ Назад', `referrals_page_${page - 1}`));
    }
    paginationRow.push(Markup.button.callback(`${page} / ${totalPages}`, 'referrals_page_noop'));
    if (page < totalPages) {
      paginationRow.push(Markup.button.callback('Вперед ➡️', `referrals_page_${page + 1}`));
    }

    const inlineKeyboard = Markup.inlineKeyboard(totalPages > 1 ? [paginationRow] : []);

    if (ctx.callbackQuery && page > 1) {
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...inlineKeyboard });
      } catch {
        await ctx.reply(text, { parse_mode: 'HTML', ...inlineKeyboard });
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...inlineKeyboard });
    }
  }

  @Action('start_registration')
  @Command('create_profile')
  async onStartRegistration(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    await ctx.scene.enter(PROFILE_WIZARD_ID);
  }

  @Hears('✏️ Редагувати анкету')
  async onEditProfileMenu(@Ctx() ctx: WizardContext) {
    await ctx.scene.enter(PROFILE_WIZARD_ID);
  }

  @Command('profile')
  @Hears('👤 Мій профіль')
  async onProfile(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile, photos } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await this.promptRegistration(ctx);
      return;
    }

    await ctx.reply('👤 Відкриваємо вашу анкету...', this.getKeyboardForUser(profile));

    const matchesCount = await this.matchRepository.getMatchesCount(user.id);
    const likesReceivedCount = await this.likeRepository.getLikesReceivedCount(user.id);

    const genderText = this.formatGender(profile.gender);
    const searchGenderText = this.formatSearchGender(profile.search_gender);

    const isPremium = user.is_premium && user.premium_until && new Date(user.premium_until) > new Date();
    const premiumBadge = isPremium ? ' ⭐ <b>[PREMIUM]</b>' : '';

    const text =
      `👤 <b>Ваша анкета</b>:\n\n` +
      `Ім'я: <b>${this.escapeHtml(profile.name)}</b>${premiumBadge}\n` +
      `Вік: <b>${profile.age}</b>\n` +
      `Стать: <b>${genderText}</b>\n` +
      `Шукаю: <b>${searchGenderText}</b>\n` +
      `Місто: <b>${this.escapeHtml(profile.city || 'Не вказано')}</b>\n` +
      `Про себе: ${this.escapeHtml(profile.bio || '-')}\n\n` +
      `📊 <b>Ваша статистика</b>:\n` +
      `❤️ Взаємних співпадінь: <b>${matchesCount}</b>\n` +
      `💌 Отримано вподобань: <b>${likesReceivedCount}</b>`;

    const editButtons = Markup.inlineKeyboard([
      [
        Markup.button.callback('✏️ Змінити ім\'я', 'edit_field_name'),
        Markup.button.callback('🎂 Змінити вік', 'edit_field_age'),
      ],
      [
        Markup.button.callback('👤 Змінити стать', 'edit_field_gender'),
        Markup.button.callback('🔍 Змінити пошук', 'edit_field_search'),
      ],
      [
        Markup.button.callback('📍 Змінити локацію', 'edit_field_location'),
        Markup.button.callback('✍️ Змінити опис', 'edit_field_bio'),
      ],
      [
        Markup.button.callback('🖼️ Керувати фото', 'edit_field_photos'),
        Markup.button.callback('🔄 Перезаповнити всю анкету', 'start_registration'),
      ],
    ]);

    await this.replyWithCardAndPhotos(ctx, photos, text, editButtons);
  }

  // --- DEDICATED SINGLE FIELD EDIT ROUTING ---
  @Action('edit_field_name')
  async onEditName(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.scene.enter(EDIT_NAME_SCENE_ID);
  }

  @Action('edit_field_age')
  async onEditAge(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.scene.enter(EDIT_AGE_SCENE_ID);
  }

  @Action('edit_field_gender')
  async onEditGender(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.scene.enter(EDIT_GENDER_SCENE_ID);
  }

  @Action('edit_field_search')
  async onEditSearch(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.scene.enter(EDIT_SEARCH_GENDER_SCENE_ID);
  }

  @Action('edit_field_location')
  async onEditLocation(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.scene.enter(EDIT_LOCATION_SCENE_ID);
  }

  @Action('edit_field_bio')
  async onEditBio(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.scene.enter(EDIT_BIO_SCENE_ID);
  }

  @Action('edit_field_photos')
  async onEditPhotos(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    await ctx.scene.enter(EDIT_PHOTOS_SCENE_ID);
  }

  @Hears('🌐 Онлайн спілкування')
  async onOnlineChat(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;
    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await this.promptRegistration(ctx);
      return;
    }
    await ctx.scene.enter(ONLINE_CHAT_SCENE_ID);
  }

  // --- CANDIDATE SEARCH WITH PRE-CHECK TO PREVENT KEYBOARD FLASH ---

  @Command('search')
  @Hears('🔍 Шукати анкети')
  async onSearch(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await this.promptRegistration(ctx);
      return;
    }

    if (!user.username) {
      await ctx.reply(
        '⚠️ <b>Помилка: У вашому Telegram-профілі відсутній Username (ім\'я користувача)!</b>\n\n' +
        'Щоб шукати анкети та спілкуватися, будь ласка, створіть Username у налаштуваннях Telegram (наприклад, @your_name) та запустіть бота знову!',
        {
          parse_mode: 'HTML',
          ...this.getKeyboardForUser(profile),
        }
      );
      return;
    }

    // 1. Check 20 Daily Likes Limit FIRST to avoid keyboard flash
    const isPremium = user.is_premium && user.premium_until && new Date(user.premium_until) > new Date();
    if (!isPremium) {
      const dailyLikes = await this.likeRepository.getDailyLikesCount(user.id);
      if (dailyLikes >= 20) {
        await ctx.reply(
          '⚠️ **Ви вичерпали свій денний ліміт 20 лайків!**\n\n' +
          'Ліміт безкоштовних лайків відновиться о **01:00 ночі**.\n' +
          'Придбайте ⭐ Преміум для нескінченних лайків!',
          {
            parse_mode: 'Markdown',
            ...this.getKeyboardForUser(profile),
          },
        );
        return;
      }
    }

    // 2. Check Candidate Existence FIRST to avoid keyboard flash
    const candidateResult = await this.discoveryService.getNextCandidate(user.id);
    if (!candidateResult) {
      this.activeCandidateMap.delete(user.id);
      await ctx.reply(
        '⌛ **Наразі нових анкет за вашими критеріями більше немає.**\n\n' +
        'Спробуйте завітати пізніше!',
        {
          parse_mode: 'Markdown',
          ...this.getKeyboardForUser(profile),
        },
      );
      return;
    }

    // 3. Only if candidate exists & limit OK -> Render candidate with SEARCH_MODE_KEYBOARD
    const { profile: candProfile, photos } = candidateResult;
    this.activeCandidateMap.set(user.id, candProfile.user_id);

    const candUser = await this.userService.getUserById(candProfile.user_id);
    const candIsPremium = candUser?.is_premium && candUser.premium_until && new Date(candUser.premium_until) > new Date();
    const premiumBadge = candIsPremium ? ' ⭐' : '';

    const distanceStr = candProfile.distance_km != null ? ` (📍 ~${candProfile.distance_km} км від вас)` : '';
    const caption = `🔥 <b>${this.escapeHtml(candProfile.name)}</b>${premiumBadge}, ${candProfile.age}\n📍 ${this.escapeHtml(candProfile.city || 'Місто не вказано')}${distanceStr}\n\n📝 ${this.escapeHtml(candProfile.bio || '-')}`;

    await this.replyWithCardAndPhotos(ctx, photos, caption, SEARCH_MODE_KEYBOARD);
  }

  @Hears('❤️ Лайк')
  async onKeyboardLike(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    const targetUserId = this.activeCandidateMap.get(user.id);
    if (!targetUserId) {
      await ctx.reply('🔍 Натисніть «🔍 Шукати анкети», щоб почати перегляд.', this.getKeyboardForUser(profile));
      return;
    }

    // Check 20 Daily Likes Limit for non-premium users
    const isPremium = user.is_premium && user.premium_until && new Date(user.premium_until) > new Date();
    if (!isPremium) {
      const dailyLikes = await this.likeRepository.getDailyLikesCount(user.id);
      if (dailyLikes >= 20) {
        this.activeCandidateMap.delete(user.id);
        await ctx.reply(
          '⚠️ **Ви вичерпали свій денний ліміт 20 лайків!**\n\n' +
          'Ліміт безкоштовних лайків відновиться о **01:00 ночі**.\n' +
          'Ви повернулися до головного меню.',
          {
            parse_mode: 'Markdown',
            ...this.getKeyboardForUser(profile),
          },
        );
        return;
      }
    }

    await this.matchService.processSwipe(user.id, targetUserId, 'LIKE');
    await this.sendNextCandidateCard(ctx, user.id);
  }

  @Hears('💌 Написати')
  async onKeyboardMessageLike(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    const targetUserId = this.activeCandidateMap.get(user.id);
    if (!targetUserId) {
      await ctx.reply('🔍 Натисніть «🔍 Шукати анкети», щоб почати перегляд.', this.getKeyboardForUser(profile));
      return;
    }

    // Check 20 Daily Likes Limit for non-premium users
    const isPremium = user.is_premium && user.premium_until && new Date(user.premium_until) > new Date();
    if (!isPremium) {
      const dailyLikes = await this.likeRepository.getDailyLikesCount(user.id);
      if (dailyLikes >= 20) {
        this.activeCandidateMap.delete(user.id);
        await ctx.reply(
          '⚠️ **Ви вичерпали свій денний ліміт 20 лайків!**\n\n' +
          'Ліміт безкоштовних лайків відновиться о **01:00 ночі**.\n' +
          'Ви повернулися до головного меню.',
          {
            parse_mode: 'Markdown',
            ...this.getKeyboardForUser(profile),
          },
        );
        return;
      }
    }

    await ctx.scene.enter(LIKE_MESSAGE_WIZARD_ID, { targetUserId });
  }

  @Hears('❌ Пропустити')
  async onKeyboardDislike(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    const targetUserId = this.activeCandidateMap.get(user.id);
    if (!targetUserId) {
      await ctx.reply('🔍 Натисніть «🔍 Шукати анкети», щоб почати перегляд.', this.getKeyboardForUser(profile));
      return;
    }

    // Dislikes do NOT count towards daily likes limit!
    await this.matchService.processSwipe(user.id, targetUserId, 'DISLIKE');
    await this.sendNextCandidateCard(ctx, user.id);
  }

  @Hears('⚠️ Поскаржитись')
  async onKeyboardReport(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const targetUserId = this.activeCandidateMap.get(user.id);
    if (!targetUserId) {
      await ctx.reply('🔍 Оберіть анкету для скарги.');
      return;
    }

    await ctx.scene.enter(REPORT_WIZARD_ID, { reportedUserId: targetUserId });
  }

  @Hears('↩️ Головне меню')
  async onExitSearchMode(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    this.activeCandidateMap.delete(user.id);

    await ctx.reply(
      '↩️ **Ви повернулися до головного меню.**',
      { parse_mode: 'Markdown', ...this.getKeyboardForUser(profile) },
    );
  }

  @Command('likes')
  @Hears('💌 Вподобання')
  async onIncomingLikes(@Ctx() ctx: WizardContext) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await this.promptRegistration(ctx);
      return;
    }

    await this.sendNextIncomingLikeCard(ctx, user.id);
  }

  @On('contact')
  async onContact(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const contact = (ctx.message as any)?.contact;
    if (!contact) return;

    if (contact.user_id !== telegramId) {
      await ctx.reply('⚠️ Будь ласка, надішліть саме свій номер телефону за допомогою кнопки «📱 Поділитися контактом».');
      return;
    }

    const user = await this.userService.findByTelegramId(telegramId);
    if (user) {
      let phoneStr = contact.phone_number;
      if (!phoneStr.startsWith('+')) {
        phoneStr = '+' + phoneStr;
      }
      await this.userService.updatePhone(user.id, phoneStr);
      const { profile } = await this.profileService.getProfile(user.id);
      await ctx.reply(
        `✅ <b>Дякуємо!</b> Ваш номер телефону (<code>${phoneStr}</code>) успішно збережено.\n\n` +
        `Він потрібен виключно для зв'язку з вами у разі виграшу і ніколи не буде показаний іншим користувачам бота.\n\n` +
        `Тепер ви можете брати участь у розіграшах у нашому каналі!`,
        {
          parse_mode: 'HTML',
          ...this.getKeyboardForUser(profile),
        }
      );
    }
  }

  // --- MATCHES WITH 10 ITEMS PAGINATION ---

  @Command('matches')
  @Hears('❤️ Мої співпадіння')
  async onMatches(@Ctx() ctx: WizardContext) {
    await this.renderMatchesPage(ctx, 1);
  }

  @Action(/^matches_page_(\d+)$/)
  async onMatchesPageAction(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const cbData = (ctx.callbackQuery as any)?.data || '';
    const page = parseInt(cbData.replace('matches_page_', ''), 10);
    if (!isNaN(page)) {
      await this.renderMatchesPage(ctx, page);
    }
  }

  private async renderMatchesPage(ctx: WizardContext, page: number) {
    const user = await this.getAuthenticatedUser(ctx);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await this.promptRegistration(ctx);
      return;
    }

    const { matches, total, totalPages } = await this.matchService.getUserMatches(user.id, page, 10);

    if (total === 0) {
      await ctx.reply('У вас поки немає співпадінь. Продовжуйте шукати анкети! 🔍', this.getKeyboardForUser(profile));
      return;
    }

    let response = `🎉 <b>Ваші співпадіння (${total})</b> — Сторінка ${page}/${totalPages}:\n\n`;
    const startIdx = (page - 1) * 10;
    matches.forEach((m, i) => {
      const username = m.username ? `@${this.escapeHtml(m.username)}` : `ID: ${m.telegram_id}`;
      response += `${startIdx + i + 1}. <b>${this.escapeHtml(m.name)}</b>, ${m.age} (${this.escapeHtml(m.city || 'Місто не вказано')}) — ${username}\n`;
    });

    const paginationRow: any[] = [];
    if (page > 1) {
      paginationRow.push(Markup.button.callback('⬅️ Попередня', `matches_page_${page - 1}`));
    }
    paginationRow.push(Markup.button.callback(`Стор. ${page}/${totalPages}`, 'matches_page_noop'));
    if (page < totalPages) {
      paginationRow.push(Markup.button.callback('Наступна ➡️', `matches_page_${page + 1}`));
    }

    const inlineKeyboard = Markup.inlineKeyboard([paginationRow]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(response, {
        parse_mode: 'HTML',
        ...inlineKeyboard,
      });
    } else {
      await ctx.reply(response, {
        parse_mode: 'HTML',
        ...inlineKeyboard,
      });
    }
  }

  @Action('matches_page_noop')
  async onMatchesNoop(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
  }

  @Action('join_giveaway')
  async onJoinGiveaway(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Verify if they are a registered user in our database
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.answerCbQuery(
        '⚠️ Спочатку необхідно зареєструватись у боті! Натисніть кнопку «🤖 Перейти в бот» нижче.',
        { show_alert: true }
      );
      return;
    }

    if (!user.phone) {
      await ctx.answerCbQuery(
        '⚠️ Для участі в розіграші вам потрібно перейти в бот і надати ваш номер телефону.В розділі розіграш',
        { show_alert: true }
      );
      return;
    }

    // Get current Kyiv date string
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Kiev',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const dateParts: { [key: string]: string } = {};
    parts.forEach((p) => {
      dateParts[p.type] = p.value;
    });
    const kyivDateStr = `${dateParts['year']}-${dateParts['month']}-${dateParts['day']}`;

    const queueKey = `giveaway:participants:${kyivDateStr}`;
    try {
      const added = await this.redis.sadd(queueKey, user.id);
      if (added === 1) {
        await ctx.answerCbQuery('🎉 Ви взяли участь у розіграші', { show_alert: true });
      } else {
        await ctx.answerCbQuery('ℹ️ Ви уже приємате участь в даному розіграші !', { show_alert: true });
      }
    } catch (err) {
      await ctx.answerCbQuery('⚠️ Помилка реєстрації. Спробуйте пізніше.');
    }
  }

  @Action(/^accept_like_(\d+)$/)
  async onAcceptLike(@Ctx() ctx: WizardContext) {
    await this.handleIncomingLikeSwipeAction(ctx, 'LIKE');
  }

  @Action(/^decline_like_(\d+)$/)
  async onDeclineLike(@Ctx() ctx: WizardContext) {
    await this.handleIncomingLikeSwipeAction(ctx, 'DISLIKE');
  }

  @On('photo')
  async onPhotoUpload(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return;

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile) {
      await this.promptRegistration(ctx);
      return;
    }

    const photos = (ctx.message as any)?.photo;
    if (!photos || photos.length === 0) return;

    const largestPhoto = photos[photos.length - 1];

    try {
      await this.profileService.addPhoto(user.id, largestPhoto.file_id);
      await ctx.reply('📸 Фотографію успішно додано до вашої анкети (максимум 3 фото)!', this.getKeyboardForUser(profile));
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`, this.getKeyboardForUser(profile));
    }
  }

  private async getAuthenticatedUser(ctx: Context) {
    if (ctx.state && (ctx.state as any).user) {
      return (ctx.state as any).user;
    }
    const telegramId = ctx.from?.id;
    if (!telegramId) return null;
    return this.userService.findOrCreateUser(telegramId, ctx.from?.username);
  }

  private async promptRegistration(ctx: WizardContext) {
    await ctx.reply(
      '⚠️ У вас ще немає анкети. Пройдіть швидку реєстрацію (від 16 до 99 років), щоб отримати доступ до меню!',
      Markup.removeKeyboard(),
    );
    await ctx.scene.enter(PROFILE_WIZARD_ID);
  }

  private async handleIncomingLikeSwipeAction(ctx: WizardContext, action: 'LIKE' | 'DISLIKE') {
    await ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return;

    const cbData = (ctx.callbackQuery as any)?.data || '';
    const parts = cbData.split('_');
    const targetUserId = parseInt(parts[parts.length - 1], 10);

    if (isNaN(targetUserId)) return;

    await this.matchService.processSwipe(user.id, targetUserId, action);
    await this.sendNextIncomingLikeCard(ctx, user.id);
  }

  private async sendNextCandidateCard(ctx: WizardContext, userId: number) {
    const candidateResult = await this.discoveryService.getNextCandidate(userId);
    const { profile: userProf } = await this.profileService.getProfile(userId);

    if (!candidateResult) {
      this.activeCandidateMap.delete(userId);
      await ctx.reply(
        '⌛ **Наразі нових анкет за вашими критеріями більше немає.**\n\n' +
        'Спробуйте завітати пізніше!\n' +
        'Ви повернулися до головного меню.',
        {
          parse_mode: 'Markdown',
          ...this.getKeyboardForUser(userProf),
        },
      );
      return;
    }

    const { profile, photos } = candidateResult;
    this.activeCandidateMap.set(userId, profile.user_id);

    const distanceStr = profile.distance_km != null ? ` (📍 ~${profile.distance_km} км від вас)` : '';
    const caption = `🔥 <b>${this.escapeHtml(profile.name)}</b>, ${profile.age}\n📍 ${this.escapeHtml(profile.city || 'Місто не вказано')}${distanceStr}\n\n📝 ${this.escapeHtml(profile.bio || '-')}`;

    await this.replyWithCardAndPhotos(ctx, photos, caption, SEARCH_MODE_KEYBOARD);
  }

  private async sendNextIncomingLikeCard(ctx: WizardContext, userId: number) {
    const incomingLikes = await this.likeRepository.getIncomingLikes(userId, 1);
    const { profile: userProf } = await this.profileService.getProfile(userId);
    const keyboard = this.getKeyboardForUser(userProf);

    if (!incomingLikes || incomingLikes.length === 0) {
      await ctx.reply(
        'У вас немає нових вподобань. Продовжуйте шукати анкети! 🔍',
        keyboard,
      );
      return;
    }

    const item = incomingLikes[0];
    const { profile } = await this.profileService.getProfile(item.from_user_id);
    const photos = profile ? await this.photoRepository.findByProfileId(profile.id) : [];

    const msgStr = item.message ? `\n💬 <b>Повідомлення</b>: "${this.escapeHtml(item.message)}"` : '';
    const caption = `💌 <b>Вас лайкнув(-ла) ${this.escapeHtml(item.name)}</b>, ${item.age}\n📍 ${this.escapeHtml(item.city || 'Місто не вказано')}${msgStr}\n\n📝 ${this.escapeHtml(item.bio || '-')}`;

    const inlineKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('❤️ Прийняти', `accept_like_${item.from_user_id}`),
        Markup.button.callback('❌ Відхилити', `decline_like_${item.from_user_id}`),
      ],
    ]);

    await this.replyWithCardAndPhotos(ctx, photos, caption, inlineKeyboard);
  }

  private async replyWithCardAndPhotos(
    ctx: WizardContext,
    photos: PhotoEntity[],
    caption: string,
    extraKeyboard?: any,
  ) {
    if (!photos || photos.length === 0) {
      await ctx.reply(caption, { parse_mode: 'HTML', ...extraKeyboard });
    } else if (photos.length === 1) {
      await ctx.replyWithPhoto(photos[0].file_id, {
        caption,
        parse_mode: 'HTML',
        ...extraKeyboard,
      });
    } else {
      // 2 or 3 photos: Send as Media Group Album
      const media = photos.map((p, idx) => ({
        type: 'photo' as const,
        media: p.file_id,
        caption: idx === 0 ? caption : undefined,
        parse_mode: 'HTML' as const,
      }));
      await ctx.replyWithMediaGroup(media);
      if (extraKeyboard) {
        await ctx.reply('Оберіть дію:', { parse_mode: 'HTML', ...extraKeyboard });
      }
    }
  }

  private getKeyboardForUser(profile?: any) {
    return MAIN_KEYBOARD;
  }

  private formatGender(gender: string): string {
    if (gender === 'MALE') return '👨 Хлопець';
    if (gender === 'FEMALE') return '👩 Дівчина';
    return '🧑 Невідомо';
  }

  private formatSearchGender(searchGender: string): string {
    if (searchGender === 'FEMALE') return '👩 Дівчину';
    if (searchGender === 'MALE') return '👨 Хлопця';
    return '👥 Усіх';
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
