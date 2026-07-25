import { Wizard, WizardStep, Ctx, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { IntimateRepository } from '../../repositories/intimate.repository';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const INTIMATE_PREFERENCES_WIZARD_ID = 'INTIMATE_PREFERENCES_WIZARD_SCENE';

const PREFERENCE_OPTIONS: { id: string; label: string }[] = [
  { id: 'flirt', label: '🌶️ Легкий флірт' },
  { id: 'roleplay', label: '⛓️ Рольові ігри & БДСМ' },
  { id: 'nodates', label: '🍷 Побачення без зобов\'язань' },
  { id: 'secret', label: '🔒 Таємні зустрічі' },
  { id: 'experiments', label: '⚡ Експерименти 18+' },
  { id: 'chat', label: '💬 Просто спілкування 18+' },
];

@Wizard(INTIMATE_PREFERENCES_WIZARD_ID)
export class IntimatePreferencesScene {
  private readonly logger = new Logger(IntimatePreferencesScene.name);

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

    const profile = await this.intimateRepository.findByUserId(user.id);
    const selected = new Set<string>(profile?.preferences || []);
    ctx.wizard.state['selectedPreferences'] = selected;

    await this.renderPreferencesMenu(ctx);
    ctx.wizard.next();
  }

  @WizardStep(2)
  @Action(/^toggle_pref_(flirt|roleplay|nodates|secret|experiments|chat)$/)
  @Action('save_preferences')
  async step2HandleToggle(@Ctx() ctx: WizardContext) {
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();

    const cbData = (ctx.callbackQuery as any)?.data || '';

    if (cbData === 'save_preferences') {
      const userId = ctx.wizard.state['userId'];
      const selectedSet: Set<string> = ctx.wizard.state['selectedPreferences'] || new Set();
      const selectedArray = Array.from(selectedSet);

      try {
        await this.intimateRepository.updatePreferences(userId, selectedArray);
        await ctx.reply(
          `✅ **Ваші вподобання збережено!**\n\nОбрано: ${selectedArray.length > 0 ? selectedArray.map(id => PREFERENCE_OPTIONS.find(o => o.id === id)?.label).join(', ') : 'Нічого'}`,
          MAIN_KEYBOARD,
        );
      } catch (err) {
        this.logger.error(`Error saving preferences: ${err.message}`, err.stack);
        await ctx.reply('❌ Помилка збереження вподобань.', MAIN_KEYBOARD);
      }

      await ctx.scene.leave();
      return;
    }

    const prefId = cbData.replace('toggle_pref_', '');
    const selectedSet: Set<string> = ctx.wizard.state['selectedPreferences'] || new Set();

    if (selectedSet.has(prefId)) {
      selectedSet.delete(prefId);
    } else {
      selectedSet.add(prefId);
    }

    ctx.wizard.state['selectedPreferences'] = selectedSet;
    await this.renderPreferencesMenu(ctx);
  }

  @Action('cancel_preferences')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }

  private async renderPreferencesMenu(ctx: WizardContext) {
    const selectedSet: Set<string> = ctx.wizard.state['selectedPreferences'] || new Set();

    const rows = PREFERENCE_OPTIONS.map((opt) => {
      const isSelected = selectedSet.has(opt.id);
      const icon = isSelected ? '✅' : '▫️';
      return [Markup.button.callback(`${icon} ${opt.label}`, `toggle_pref_${opt.id}`)];
    });

    rows.push([
      Markup.button.callback('💾 Зберегти вподобання', 'save_preferences'),
      Markup.button.callback('❌ Скасувати', 'cancel_preferences'),
    ]);

    const text =
      '🎯 **Оберіть ваші вподобання та побажання кнопками**:\n\n' +
      'Натискайте на кнопки, щоб відмітити або зняти вибір, потім натисніть "💾 Зберегти вподобання".';

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(rows),
      });
    } else {
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(rows),
      });
    }
  }
}
