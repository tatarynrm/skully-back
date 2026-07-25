import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TelegrafModule, InjectBot } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { session, Telegraf, Context, Markup } from 'telegraf';
import { BotUpdate } from './bot.update';
import { ProfileWizardScene } from './scenes/profile-wizard.scene';
import { ReportWizardScene } from './scenes/report-wizard.scene';
import { LikeMessageWizardScene } from './scenes/like-message-wizard.scene';
import { IntimateWizardScene } from './scenes/intimate-wizard.scene';
import { IntimatePreferencesScene } from './scenes/intimate-preferences.scene';
import { AddStoryScene } from './scenes/add-story.scene';
import { CommentStoryScene } from './scenes/comment-story.scene';
import { SuggestionsWizardScene } from './scenes/suggestions-wizard.scene';
import { OnlineChatScene } from './scenes/online-chat.scene';
import { QuizScene } from './scenes/quiz.scene';
import {
  EditNameScene,
  EditAgeScene,
  EditGenderScene,
  EditSearchGenderScene,
  EditLocationScene,
  EditBioScene,
  EditPhotosScene,
} from './scenes/edit-field.scenes';
import { UserRepository } from '../repositories/user.repository';
import { ProfileRepository } from '../repositories/profile.repository';
import { PhotoRepository } from '../repositories/photo.repository';
import { LikeRepository } from '../repositories/like.repository';
import { MatchRepository } from '../repositories/match.repository';
import { ReportRepository } from '../repositories/report.repository';
import { IntimateRepository } from '../repositories/intimate.repository';
import { SuggestionRepository } from '../repositories/suggestion.repository';
import { ReferralRepository } from '../repositories/referral.repository';
import { QuizRepository } from '../repositories/quiz.repository';
import { UserService } from '../services/user.service';
import { ProfileService } from '../services/profile.service';
import { MatchService } from '../services/match.service';
import { DiscoveryService } from '../services/discovery.service';
import { GeocodingService } from '../services/geocoding.service';
import { NotificationWorkerService } from '../services/notification-worker.service';
import { GiveawayService } from '../services/giveaway.service';
import { ReferralService } from '../services/referral.service';
import { QuizService } from '../services/quiz.service';
import { TiktokService } from '../services/tiktok.service';
import { TiktokRepository } from '../repositories/tiktok.repository';
import { TiktokController } from '../admin/tiktok.controller';
import { BroadcastRepository } from '../repositories/broadcast.repository';
import { BroadcastService } from '../services/broadcast.service';
import { redisSession } from './redis-session.middleware';
import { WebhookController } from './webhook.controller';
import { WebhookConsumer } from './webhook.consumer';

import { BroadcastProcessor } from './broadcast.processor';

import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
export const REDIS_CLIENT = 'REDIS_CLIENT';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'tg-webhooks',
    }),
    BullModule.registerQueue({
      name: 'broadcast',
    }),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, ModuleRef],
      useFactory: (configService: ConfigService, moduleRef: ModuleRef) => {
        const token = configService.get<string>('BOT_TOKEN', 'placeholder_token');
        const webhookDomain = configService.get<string>('WEBHOOK_DOMAIN');

        const redis = new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        });

        const options: any = {
          token,
          middlewares: [
            redisSession(redis),
            async (ctx: any, next: () => Promise<void>) => {
              const telegramId = ctx.from?.id;
              if (!telegramId) {
                return next();
              }

              // Force-leave active scenes if the user inputs a global command
              if (ctx.message?.text && (
                ctx.message.text.startsWith('/start') || 
                ctx.message.text.startsWith('/profile') || 
                ctx.message.text.startsWith('/matches') || 
                ctx.message.text.startsWith('/giveaway') ||
                ctx.message.text.startsWith('/proposals') ||
                ctx.message.text === '/cancel'
              )) {
                if (ctx.session) {
                  delete ctx.session.__scenes;
                  delete ctx.session.scene;
                }
              }

              const userService = moduleRef.get(UserService, { strict: false });
              const user = await userService.findOrCreateUser(telegramId, ctx.from?.username);

              // Auto-update username if it changed in Telegram
              if (ctx.from?.username && user.username !== ctx.from.username) {
                await userService.updateUsername(user.id, ctx.from.username);
                user.username = ctx.from.username;
              } else if (!ctx.from?.username && user.username !== null) {
                await userService.updateUsername(user.id, null);
                user.username = null;
              }

              if (user && user.is_blocked) {
                await ctx.reply(
                  `❌ <b>Ваш акаунт заблоковано!</b>\n\n` +
                  `📝 <b>Причина:</b> ${user.blocked_reason || 'Не вказано'}`,
                  {
                    parse_mode: 'HTML',
                    ...Markup.removeKeyboard(),
                  }
                );
                return;
              }
              if (!ctx.state) ctx.state = {};
              ctx.state.user = user;
              console.log('Passing update to Telegraf stage/handlers. Message:', ctx.message?.text);
              return next();
            }
          ],
        };

        if (webhookDomain) {
          options.launchOptions = false;
        }

        return options;
      },
    }),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        });
      },
      inject: [ConfigService],
    },
    BotUpdate,
    ProfileWizardScene,
    ReportWizardScene,
    LikeMessageWizardScene,
    IntimateWizardScene,
    IntimatePreferencesScene,
    AddStoryScene,
    CommentStoryScene,
    QuizScene,
    SuggestionsWizardScene,
    OnlineChatScene,
    EditNameScene,
    EditAgeScene,
    EditGenderScene,
    EditSearchGenderScene,
    EditLocationScene,
    EditBioScene,
    EditPhotosScene,
    NotificationWorkerService,
    UserRepository,
    ProfileRepository,
    PhotoRepository,
    LikeRepository,
    MatchRepository,
    ReportRepository,
    IntimateRepository,
    SuggestionRepository,
    ReferralRepository,
    QuizRepository,
    UserService,
    ProfileService,
    MatchService,
    DiscoveryService,
    GeocodingService,
    WebhookConsumer,
    GiveawayService,
    ReferralService,
    QuizService,
    TiktokService,
    TiktokRepository,
    BroadcastProcessor,
    BroadcastRepository,
    BroadcastService,
  ],
  exports: [
    UserService,
    ProfileService,
    MatchService,
    DiscoveryService,
    GeocodingService,
    NotificationWorkerService,
    UserRepository,
    ProfileRepository,
    PhotoRepository,
    LikeRepository,
    MatchRepository,
    ReportRepository,
    IntimateRepository,
    SuggestionRepository,
    ReferralRepository,
    QuizRepository,
    REDIS_CLIENT,
    GiveawayService,
    ReferralService,
    QuizService,
    TiktokService,
    BroadcastRepository,
    BroadcastService,
  ],
  controllers: [WebhookController, TiktokController],
})
export class BotModule implements OnModuleInit {
  private readonly logger = new Logger(BotModule.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
  ) { }

  async onModuleInit() {
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'profile', description: '👤 Мій профіль' },
        { command: 'proposals', description: '💡 Надати пропозиції та ідеї' },
        { command: 'information', description: 'ℹ️ Інформація про бота' },
        { command: 'giveaway', description: '🏆 Щотижневий розіграш' },
        { command: 'matches', description: '❤️ Мої співпадіння' },
      ]);

      await this.bot.telegram.setMyDescription(
        '🇺🇦 Перший офіційний український сервіс для сучасних знайомств!\n\n' +
        '✨ Шукайте пару у своєму місті\n' +
        '💬 Обмінюйтесь вподобаннями та контактами\n' +
        '🏆 Беріть участь у щотижневих грошових розіграшах 500 грн, 250 грн, 100 грн!\n\n' +
        'Натисніть Start для створення своєї анкети 🚀',
      );

      await this.bot.telegram.setMyShortDescription(
        '🇺🇦 Перший український ЦІКАВИЙ сервіс знайомств! Знайомства + Щотижневі грошові розіграші 🏆',
      );

      this.logger.log('Telegram Bot Commands & Description initialized successfully.');
    } catch (err) {
      this.logger.error(`Failed to register bot commands/description: ${err.message}`);
    }

    const webhookDomain = this.configService.get<string>('WEBHOOK_DOMAIN');
    const webhookPath = this.configService.get<string>('WEBHOOK_PATH', '/webhook');

    if (webhookDomain) {
      const fullWebhookUrl = `${webhookDomain}${webhookPath}`;
      try {
        await this.bot.telegram.setWebhook(fullWebhookUrl);
        this.logger.log(`📡 Webhook successfully set at Telegram API: ${fullWebhookUrl}`);
      } catch (err) {
        this.logger.error(`Failed to set Telegram webhook: ${err.message}`);
      }
    } else {
      try {
        await this.bot.telegram.deleteWebhook({ drop_pending_updates: false });
        this.logger.log('🔄 Webhook deleted. Bot running in Polling mode.');
      } catch (err) {
        this.logger.warn(`Failed to delete webhook: ${err.message}`);
      }
    }
  }
}
