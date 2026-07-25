import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { ProfileService } from '../../services/profile.service';
import { SuggestionRepository } from '../../repositories/suggestion.repository';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const SUGGESTIONS_WIZARD_ID = 'SUGGESTIONS_WIZARD_SCENE';

@Wizard(SUGGESTIONS_WIZARD_ID)
export class SuggestionsWizardScene {
  private readonly logger = new Logger(SuggestionsWizardScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly suggestionRepository: SuggestionRepository,
  ) {}

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    // Hide main reply keyboard upon entering suggestions scene
    await ctx.reply(
      '💡 **Пропозиції та ідеї розвитку бота**\n\n' +
      'Опишіть вашу пропозицію чи ідею щодо додавання нового функціоналу або меню:',
      Markup.removeKeyboard(),
    );
    await ctx.reply(
      'Для відміни натисніть кнопку нижче:',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_suggestion')]]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2Review(@Ctx() ctx: WizardContext) {
    const text = (ctx.message as any)?.text?.trim();
    if (!text || text.startsWith('/')) {
      await ctx.reply('Будь ласка, напишіть ваші пропозиції текстом:');
      return;
    }

    ctx.wizard.state['suggestionText'] = text;

    await ctx.reply(
      `📝 <b>Ваша пропозиція</b>:\n\n"${this.escapeHtml(text)}"\n\nПідтверджуєте надсилання?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Підтвердити та відправити', 'confirm_suggestion')],
          [Markup.button.callback('❌ Скасувати', 'cancel_suggestion')],
        ]),
      },
    );
    ctx.wizard.next();
  }

  @WizardStep(3)
  @Action('confirm_suggestion')
  async step3Confirm(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const text = ctx.wizard.state['suggestionText'];

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (user && text) {
        await this.suggestionRepository.createSuggestion(user.id, text);
        const { profile } = await this.profileService.getProfile(user.id);
        const keyboard = this.getKeyboardForUser(profile);

        await ctx.reply(
          '💡 <b>Дякуємо! Вашу пропозицію успішно збережено та надіслано.</b>\nМи обов\'язково її розглянемо!',
          { parse_mode: 'HTML', ...keyboard },
        );
      }
    } catch (err) {
      this.logger.error(`Error saving suggestion: ${err.message}`, err.stack);
      await ctx.reply('❌ Помилка збереження пропозиції.', MAIN_KEYBOARD);
    }

    await ctx.scene.leave();
  }

  @Action('cancel_suggestion')
  async onCancel(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery();

    const telegramId = ctx.from?.id;
    let keyboard = MAIN_KEYBOARD;

    if (telegramId) {
      const user = await this.userService.findByTelegramId(telegramId);
      if (user) {
        const { profile } = await this.profileService.getProfile(user.id);
        keyboard = this.getKeyboardForUser(profile);
      }
    }

    await ctx.reply('❌ Надсилання пропозиції скасовано.', keyboard);
    await ctx.scene.leave();
  }

  private getKeyboardForUser(profile?: any) {
    return MAIN_KEYBOARD;
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
