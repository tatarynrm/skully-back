import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { IntimateRepository } from '../../repositories/intimate.repository';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const COMMENT_STORY_WIZARD_ID = 'COMMENT_STORY_WIZARD_SCENE';

@Wizard(COMMENT_STORY_WIZARD_ID)
export class CommentStoryScene {
  private readonly logger = new Logger(CommentStoryScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly intimateRepository: IntimateRepository,
  ) {}

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    const storyId = ctx.wizard.state['storyId'];
    if (!storyId) {
      await ctx.reply('❌ Не знайдено історію.');
      return ctx.scene.leave();
    }

    await ctx.reply(
      '💬 **Коментар / Відповідь під історією**\n\nНапишіть ваше повідомлення чи враження від історії:',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_comment')]]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2Submit(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const storyId = ctx.wizard.state['storyId'];
    const text = (ctx.message as any)?.text?.trim();

    if (!text || text.startsWith('/')) {
      await ctx.reply('Будь ласка, введіть текст коментаря:');
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (user) {
        await this.intimateRepository.addStoryComment(storyId, user.id, text);
        await ctx.reply('💬 **Коментар опубліковано!** Автор історії отримає сповіщення.', MAIN_KEYBOARD);
      }
    } catch (err) {
      this.logger.error(`Error adding story comment: ${err.message}`, err.stack);
      await ctx.reply('❌ Помилка публікації коментаря.', MAIN_KEYBOARD);
    }

    await ctx.scene.leave();
  }

  @Action('cancel_comment')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}
