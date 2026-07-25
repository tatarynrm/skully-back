import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { IntimateRepository } from '../../repositories/intimate.repository';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const ADD_STORY_WIZARD_ID = 'ADD_STORY_WIZARD_SCENE';

@Wizard(ADD_STORY_WIZARD_ID)
export class AddStoryScene {
  private readonly logger = new Logger(AddStoryScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly intimateRepository: IntimateRepository,
  ) {}

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.scene.leave();

    ctx.wizard.state['userId'] = user.id;

    await ctx.reply(
      '📖 **Додавання інтимної історії (Анонімно)**\n\n' +
      'Напишіть свою інтимну історію чи фантазію текстом. Інші користувачі зможуть читати її та залишати свої коментарі під нею!',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_add_story')]]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2Submit(@Ctx() ctx: WizardContext) {
    const userId = ctx.wizard.state['userId'];
    const text = (ctx.message as any)?.text?.trim();

    if (!text || text.startsWith('/') || text.length < 10) {
      await ctx.reply('Будь ласка, напишіть історію текстом (мінімум 10 символів):');
      return;
    }

    try {
      await this.intimateRepository.createStory(userId, text);
      await ctx.reply(
        '🎉 **Дякуємо! Вашу історію опубліковано.**\nВона з\'явиться у стрічці "🔥 Читати історії".',
        MAIN_KEYBOARD,
      );
    } catch (err) {
      this.logger.error(`Error saving story: ${err.message}`, err.stack);
      await ctx.reply('❌ Не вдалося зберегти історію.', MAIN_KEYBOARD);
    }

    await ctx.scene.leave();
  }

  @Action('cancel_add_story')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}
