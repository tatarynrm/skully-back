import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { ReportRepository } from '../../repositories/report.repository';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const REPORT_WIZARD_ID = 'REPORT_WIZARD_SCENE';

@Wizard(REPORT_WIZARD_ID)
export class ReportWizardScene {
  private readonly logger = new Logger(ReportWizardScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly reportRepository: ReportRepository,
  ) {}

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    await ctx.reply(
      '⚠️ **Поскаржитися на анкету**\n\nОберіть причину скарги або опишіть проблему текстом:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🚫 Спам / Фейк', 'reason_spam')],
        [Markup.button.callback('🔞 Образливий / Непристойний контент', 'reason_inappropriate')],
        [Markup.button.callback('❌ Скасувати', 'cancel_report')],
      ]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  @Action(/^reason_(spam|inappropriate)$/)
  async step2Submit(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const reportedUserId = ctx.wizard.state['reportedUserId'];
    if (!reportedUserId) {
      await ctx.reply('❌ Помилка: не знайдено анкету для скарги.');
      return ctx.scene.leave();
    }

    let reason = '';
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      const cbData = (ctx.callbackQuery as any)?.data || '';
      reason = cbData === 'reason_spam' ? 'Спам / Фейковий профіль' : 'Образливий / Непристойний контент';
    } else {
      reason = (ctx.message as any)?.text?.trim() || 'Без опису';
    }

    try {
      const reporter = await this.userService.findByTelegramId(telegramId);
      if (reporter) {
        await this.reportRepository.createReport(reporter.id, reportedUserId, reason);
        await ctx.reply('✅ Дякуємо! Скаргу прийнято. Наша команда перевірить цю анкету.', MAIN_KEYBOARD);
      }
    } catch (err) {
      this.logger.error(`Error saving report: ${err.message}`, err.stack);
      await ctx.reply('❌ Не вдалося зберегти скаргу.', MAIN_KEYBOARD);
    }

    await ctx.scene.leave();
  }

  @Action('cancel_report')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасування скарги.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}
