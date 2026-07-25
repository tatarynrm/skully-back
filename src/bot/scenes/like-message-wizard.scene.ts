import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { MatchService } from '../../services/match.service';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const LIKE_MESSAGE_WIZARD_ID = 'LIKE_MESSAGE_WIZARD_SCENE';

@Wizard(LIKE_MESSAGE_WIZARD_ID)
export class LikeMessageWizardScene {
  private readonly logger = new Logger(LikeMessageWizardScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly matchService: MatchService,
  ) {}

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    await ctx.reply(
      '💌 **Надіслати симпатію з повідомленням**\n\nНапишіть текст повідомлення, яке побачить користувач:',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_like_message')]]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2Submit(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const targetUserId = ctx.wizard.state['targetUserId'];
    if (!targetUserId) {
      await ctx.reply('❌ Помилка: не знайдено адресата.');
      return ctx.scene.leave();
    }

    const messageText = (ctx.message as any)?.text?.trim();
    if (!messageText || messageText.startsWith('/')) {
      await ctx.reply('Будь ласка, введіть текст вашого повідомлення:');
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (user) {
        const result = await this.matchService.processSwipe(user.id, targetUserId, 'SUPERLIKE', messageText);

        if (result.isMatch && result.matchedProfile) {
          await ctx.reply(
            `💖 **ІТС А МАТЧ!** 🎉\nВи сподобалися одне одному з **${result.matchedProfile.name}**!`,
            MAIN_KEYBOARD,
          );
        } else {
          await ctx.reply('💌 Симпатію з повідомленням успішно надіслано!', MAIN_KEYBOARD);
        }
      }
    } catch (err) {
      this.logger.error(`Error saving message like: ${err.message}`, err.stack);
      await ctx.reply('❌ Не вдалося надіслати симпатію.', MAIN_KEYBOARD);
    }

    await ctx.scene.leave();
  }

  @Action('cancel_like_message')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}
