import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { ProfileService } from '../../services/profile.service';
import { IntimateRepository } from '../../repositories/intimate.repository';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const INTIMATE_WIZARD_ID = 'INTIMATE_WIZARD_SCENE';

@Wizard(INTIMATE_WIZARD_ID)
export class IntimateWizardScene {
  private readonly logger = new Logger(IntimateWizardScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly intimateRepository: IntimateRepository,
  ) {}

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.scene.leave();

    const { profile } = await this.profileService.getProfile(user.id);
    if (!profile || profile.age < 18) {
      await ctx.reply('⚠️ Категорія доступна тільки для користувачів від 18 років.', MAIN_KEYBOARD);
      return ctx.scene.leave();
    }

    ctx.wizard.state['userId'] = user.id;

    await ctx.reply(
      '🔥 **Заповнення інтим-анкети (18+)**\n\n' +
      'У цій категорії **немає фотографій**! Тільки ваші побажання та інтимні історії.\n\n' +
      '💭 **Крок 1/2: Побажання**\n' +
      'Опишіть свої побажання, фантазії чи переваги:',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_intimate')]]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2Wishes(@Ctx() ctx: WizardContext) {
    const text = (ctx.message as any)?.text?.trim();
    if (!text || text.startsWith('/')) {
      await ctx.reply('Будь ласка, введіть свої побажання текстом:');
      return;
    }

    ctx.wizard.state['wishes'] = text;

    await ctx.reply(
      '📖 **Крок 2/2: Інтимна історія**\n\n' +
      'Напишіть свою інтимну історію (або відправте /skip):',
      Markup.inlineKeyboard([[Markup.button.callback('⏩ Пропустити (/skip)', 'skip_story')]]),
    );
    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('text')
  @Action('skip_story')
  async step3Finish(@Ctx() ctx: WizardContext) {
    const userId = ctx.wizard.state['userId'];
    const wishes = ctx.wizard.state['wishes'];

    let story: string | null = null;
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    } else {
      const text = (ctx.message as any)?.text?.trim();
      if (text && text !== '/skip') {
        story = text;
      }
    }

    try {
      await this.intimateRepository.upsert(userId, wishes, story);
      await ctx.reply(
        '🔥 **Інтим-анкету успішно збережено!**\n\nТепер ви можете шукати анонімні інтимні анкети у меню.',
        MAIN_KEYBOARD,
      );
    } catch (err) {
      this.logger.error(`Error saving intimate profile: ${err.message}`, err.stack);
      await ctx.reply('❌ Не вдалося зберегти інтим-анкету.', MAIN_KEYBOARD);
    }

    await ctx.scene.leave();
  }

  @Action('cancel_intimate')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}
