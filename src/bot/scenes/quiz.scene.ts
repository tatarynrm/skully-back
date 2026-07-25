import { Wizard, WizardStep, Ctx, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { QuizService } from '../../services/quiz.service';
import { UserService } from '../../services/user.service';
import { Logger } from '@nestjs/common';

export const QUIZ_SCENE_ID = 'QUIZ_SCENE';

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '🟢 Легкий',
  medium: '🟡 Середній',
  hard: '🔴 Складний',
};

/**
 * Build answer keyboard with progress counter (e.g. "2/160")
 */
function buildAnswerKeyboard(questionIndex: 1 | 2, answeredSoFar: number, total: number) {
  const progress = `${answeredSoFar}/${total}`;
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`A`, `qz_ans_${questionIndex}_A`),
      Markup.button.callback(`B`, `qz_ans_${questionIndex}_B`),
    ],
    [
      Markup.button.callback(`C`, `qz_ans_${questionIndex}_C`),
      Markup.button.callback(`D`, `qz_ans_${questionIndex}_D`),
    ],
    [
      Markup.button.callback(`📊 Прогрес: ${progress} питань`, `qz_noop`),
    ],
  ]);
}

function formatQuestion(q: any, index: 1 | 2): string {
  return (
    `${q.category_emoji} <b>${q.category_name}</b> · ${DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}\n\n` +
    `<b>Питання ${index} з 2:</b>\n` +
    `${q.question_text}\n\n` +
    `<b>A)</b> ${q.option_a}\n` +
    `<b>B)</b> ${q.option_b}\n` +
    `<b>C)</b> ${q.option_c}\n` +
    `<b>D)</b> ${q.option_d}\n\n` +
    `⏱ <i>У вас ${60} секунд на обидва питання!</i>`
  );
}

@Wizard(QUIZ_SCENE_ID)
export class QuizScene {
  private readonly logger = new Logger(QuizScene.name);

  constructor(
    private readonly quizService: QuizService,
    private readonly userService: UserService,
  ) {}

  // ─── Step 0: Entry point ─────────────────────────────────────────────────────
  @WizardStep(0)
  async onSceneEnter(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) { await ctx.scene.leave(); return; }

    const userRecord = await this.userService.findByTelegramId(telegramId);
    if (!userRecord) { await ctx.scene.leave(); return; }

    const userId = userRecord.id;

    // Check if already played today
    const todaySession = await this.quizService.getTodaySession(userId);
    if (todaySession) {
      await this.showTodayResult(ctx, todaySession, userId);
      await ctx.scene.leave();
      return;
    }

    ctx.wizard.state['userId'] = userId;

    // Show intro with stats and category selection option
    await this.showIntro(ctx, userId);

    // Advance to step 1 so actions work
    ctx.wizard.next();
  }

  // ─── Step 1: Placeholder (all handled via @Action) ───────────────────────────
  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    // handled by @Action decorators
  }

  // ─── Show category selection ──────────────────────────────────────────────────
  @Action('qz_pick_category')
  async onPickCategory(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    const userId: number = ctx.wizard?.state?.['userId'];
    if (!userId) { await ctx.scene.leave(); return; }

    await this.showCategoryPicker(ctx, userId);
  }

  // ─── Handle category selection (dynamic action) ───────────────────────────────
  @Action(/^qz_cat_(\d+)$/)
  async onCategorySelected(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();

    const cbData = (ctx.callbackQuery as any)?.data || '';
    const catId = parseInt(cbData.replace('qz_cat_', ''), 10);
    if (isNaN(catId)) return;

    const userId: number = ctx.wizard?.state?.['userId'];
    if (!userId) { await ctx.scene.leave(); return; }

    // Try to pick 2 questions from chosen category
    const questions = await this.quizService.pickDailyQuestionsByCategory(userId, catId);

    if (!questions || questions.length < 2) {
      await ctx.reply(
        '😔 <b>У цій категорії не вистачає нових питань.</b>\n\nОберіть іншу категорію або натисніть «Випадкова»!',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔀 Випадкова категорія', 'qz_random_category')],
            [Markup.button.callback('📂 Обрати іншу', 'qz_pick_category')],
            [Markup.button.callback('↩️ Вийти', 'qz_exit')],
          ]),
        },
      );
      return;
    }

    ctx.wizard.state['q1'] = questions[0];
    ctx.wizard.state['q2'] = questions[1];
    ctx.wizard.state['phase'] = 'q1';
    ctx.wizard.state['sessionStartMs'] = Date.now();

    const [answeredCount, totalCount] = await Promise.all([
      this.quizService.getUserAnsweredCount(userId),
      this.quizService.getTotalQuestionsCount(),
    ]);
    ctx.wizard.state['answeredBefore'] = answeredCount;
    ctx.wizard.state['totalQuestions'] = totalCount;

    const q1 = questions[0];
    await ctx.reply(formatQuestion(q1, 1), {
      parse_mode: 'HTML',
      ...buildAnswerKeyboard(1, answeredCount, totalCount),
    });
  }

  // ─── Random category ──────────────────────────────────────────────────────────
  @Action('qz_random_category')
  async onRandomCategory(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();

    const userId: number = ctx.wizard?.state?.['userId'];
    if (!userId) { await ctx.scene.leave(); return; }

    const questions = await this.quizService.pickDailyQuestions(userId);

    if (!questions || questions.length < 2) {
      await ctx.reply(
        '😔 На жаль, питань для вас більше не залишилось. Приходьте завтра — ми додаємо нові!',
        { parse_mode: 'HTML' },
      );
      await ctx.scene.leave();
      return;
    }

    ctx.wizard.state['q1'] = questions[0];
    ctx.wizard.state['q2'] = questions[1];
    ctx.wizard.state['phase'] = 'q1';
    ctx.wizard.state['sessionStartMs'] = Date.now();

    const [answeredCount, totalCount] = await Promise.all([
      this.quizService.getUserAnsweredCount(userId),
      this.quizService.getTotalQuestionsCount(),
    ]);
    ctx.wizard.state['answeredBefore'] = answeredCount;
    ctx.wizard.state['totalQuestions'] = totalCount;

    const q1 = questions[0];
    await ctx.reply(formatQuestion(q1, 1), {
      parse_mode: 'HTML',
      ...buildAnswerKeyboard(1, answeredCount, totalCount),
    });
  }

  // ─── No-op for progress button ───────────────────────────────────────────────
  @Action('qz_noop')
  async onNoop(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery('📊 Це ваш прогрес');
  }

  // ─── Show ranking ─────────────────────────────────────────────────────────────
  @Action('qz_ranking')
  async onRanking(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    await this.showRanking(ctx);
  }

  // ─── Exit ─────────────────────────────────────────────────────────────────────
  @Action('qz_exit')
  async onExit(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    await ctx.reply('↩️ Ви повернулися до головного меню.', { parse_mode: 'HTML' });
    await ctx.scene.leave();
  }

  // ─── Answer Q1 ───────────────────────────────────────────────────────────────
  @Action(/^qz_ans_1_([ABCD])$/)
  async onAnswerQ1(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    if (ctx.wizard?.state?.['phase'] !== 'q1') return;

    const cbData = (ctx.callbackQuery as any)?.data || '';
    const chosen = cbData.replace('qz_ans_1_', '');
    const q1 = ctx.wizard.state['q1'];
    const isCorrect = chosen === q1.correct_option;

    ctx.wizard.state['q1Correct'] = isCorrect;
    ctx.wizard.state['phase'] = 'q2';

    const feedback = isCorrect
      ? `✅ <b>Правильно!</b> +10 балів`
      : `❌ <b>Неправильно!</b> Правильна відповідь: <b>${q1.correct_option}) ${q1[`option_${q1.correct_option.toLowerCase()}`]}</b>`;

    const userId = ctx.wizard.state['userId'];
    await this.quizService.recordAnswer(userId, q1.id, isCorrect);

    const answeredCount = (ctx.wizard.state['answeredBefore'] ?? 0) + 1;
    const totalCount = ctx.wizard.state['totalQuestions'] ?? 0;
    ctx.wizard.state['answeredBefore'] = answeredCount;

    const q2 = ctx.wizard.state['q2'];
    await ctx.reply(
      `${feedback}\n\n━━━━━━━━━━━━━━━━━\n\n` + formatQuestion(q2, 2),
      { parse_mode: 'HTML', ...buildAnswerKeyboard(2, answeredCount, totalCount) },
    );
  }

  // ─── Answer Q2 ───────────────────────────────────────────────────────────────
  @Action(/^qz_ans_2_([ABCD])$/)
  async onAnswerQ2(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    if (ctx.wizard?.state?.['phase'] !== 'q2') return;

    const cbData = (ctx.callbackQuery as any)?.data || '';
    const chosen = cbData.replace('qz_ans_2_', '');
    const q2 = ctx.wizard.state['q2'];
    const isCorrect = chosen === q2.correct_option;

    ctx.wizard.state['phase'] = 'done';

    const userId = ctx.wizard.state['userId'];
    const q1Correct: boolean = ctx.wizard.state['q1Correct'] ?? false;
    const sessionStartMs: number = ctx.wizard.state['sessionStartMs'] ?? Date.now();

    await this.quizService.recordAnswer(userId, q2.id, isCorrect);

    const q1 = ctx.wizard.state['q1'];
    await this.quizService.createSession(userId, q1.id, q2.id, q1.category_id);

    const result = await this.quizService.finalizeSession(userId, q1Correct, isCorrect, sessionStartMs);

    const q2Feedback = isCorrect
      ? `✅ <b>Правильно!</b> +10 балів`
      : `❌ <b>Неправильно!</b> Правильна відповідь: <b>${q2.correct_option}) ${q2[`option_${q2.correct_option.toLowerCase()}`]}</b>`;

    const answeredCount = (ctx.wizard.state['answeredBefore'] ?? 0) + 1;
    const totalCount = ctx.wizard.state['totalQuestions'] ?? 0;

    let resultText =
      `${q2Feedback}\n\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `🎯 <b>Результати квізу</b>\n` +
      `━━━━━━━━━━━━━━━━━\n\n` +
      `Питання 1: ${result.q1Correct ? '✅' : '❌'}\n` +
      `Питання 2: ${result.q2Correct ? '✅' : '❌'}\n` +
      `⏱ Витрачено часу: <b>${result.totalSeconds}с</b> з ${this.quizService.getMaxSeconds()}с\n` +
      `📊 Прогрес: <b>${answeredCount}/${totalCount}</b> питань відповідано\n\n`;

    if (result.premiumAwarded) {
      resultText +=
        `🎉 <b>Вітаємо! Ви виграли ⭐ Premium на 1 день!</b>\n` +
        `💎 Зароблено балів: <b>+${result.pointsEarned}</b>\n\n` +
        `Приходьте завтра за новими питаннями! 🚀`;
    } else if (result.bothCorrect && result.tooSlow) {
      resultText +=
        `⏱ <b>Обидві відповіді правильні, але час вийшов!</b>\n` +
        `Потрібно відповісти за ${this.quizService.getMaxSeconds()}с, ви витратили ${result.totalSeconds}с.\n` +
        `💎 Зароблено балів: <b>+${result.pointsEarned}</b>\n\n` +
        `Спробуйте завтра — і будьте швидшими! ⚡`;
    } else if (!result.q1Correct && !result.q2Correct) {
      resultText +=
        `😔 <b>На жаль, обидві відповіді були неправильними.</b>\n` +
        `💎 Зароблено балів: <b>+${result.pointsEarned}</b>\n\n` +
        `Не здавайтесь — приходьте завтра! 💪`;
    } else {
      resultText +=
        `🤔 <b>Лише одна правильна відповідь.</b>\n` +
        `Для Premium потрібно обидві правильні та ≤${this.quizService.getMaxSeconds()}с.\n` +
        `💎 Зароблено балів: <b>+${result.pointsEarned}</b>\n\n` +
        `Приходьте завтра — удача на вашому боці! 🍀`;
    }

    await ctx.reply(resultText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏆 Рейтинг гравців', 'qz_ranking_final')],
      ]),
    });

    await ctx.scene.leave();
  }

  @Action('qz_ranking_final')
  async onRankingFinal(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    await this.showRanking(ctx);
  }

  @Action('qz_ranking_static')
  async onRankingStatic(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    await this.showRanking(ctx);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async showIntro(ctx: WizardContext, userId: number) {
    const [stats, rank, answeredCount, totalCount, userRecord] = await Promise.all([
      this.quizService.getUserStats(userId),
      this.quizService.getUserRank(userId),
      this.quizService.getUserAnsweredCount(userId),
      this.quizService.getTotalQuestionsCount(),
      this.userService.findByTelegramId(ctx.from?.id),
    ]);

    const progressBar = this.buildProgressBar(answeredCount, totalCount);

    const isPremium = userRecord?.is_premium && userRecord?.premium_until && new Date(userRecord.premium_until) > new Date();
    let premiumText = '';
    if (isPremium) {
      const date = new Date(userRecord.premium_until);
      const formattedDate = date.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      premiumText = `\n⭐ <b>Premium підписка активна до:</b> <code>${formattedDate}</code>`;
    }

    const intro =
      `🧠 <b>Цікавинка — Щоденний квіз!</b>\n\n` +
      `Оберіть категорію та дайте <b>2 відповіді</b> на питання.\n\n` +
      `🏆 <b>Умови для Premium:</b>\n` +
      `✅ Обидві відповіді правильні\n` +
      `⏱ Загальний час ≤ ${this.quizService.getMaxSeconds()} секунд\n\n` +
      `💡 <b>Нарахування балів:</b>\n` +
      `• Правильна відповідь — <b>+10 балів</b>\n` +
      `• Обидві + швидко — <b>+30 бонусних балів</b> + <b>⭐ Premium на 1 день!</b>\n\n` +
      `📊 <b>Ваша статистика:</b>\n` +
      `💎 Балів: <b>${stats.total_points}</b>${rank ? ` · Місце у рейтингу: <b>#${rank}</b>` : ''}\n` +
      `✅ Правильних відповідей: <b>${stats.correct_answers}</b>\n` +
      `📅 Сесій завершено: <b>${stats.sessions_completed}</b>\n` +
      `⭐ Premium днів зароблено: <b>${stats.premium_days_earned}</b>` +
      premiumText + `\n\n` +
      `📖 <b>Прогрес питань:</b>\n` +
      `${progressBar} <b>${answeredCount}/${totalCount}</b>`;

    await ctx.reply(intro, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📂 Обрати категорію', 'qz_pick_category')],
        [Markup.button.callback('🔀 Випадкова категорія', 'qz_random_category')],
        [Markup.button.callback('🏆 Рейтинг гравців', 'qz_ranking')],
        [Markup.button.callback('↩️ Вийти', 'qz_exit')],
      ]),
    });
  }

  private async showCategoryPicker(ctx: WizardContext, userId: number) {
    const categories = await this.quizService.getCategories(userId);

    let text = `📂 <b>Оберіть категорію:</b>\n\n`;
    text += `<i>Зелений ✅ — є нові питання | Сірий 💤 — всі пройдено</i>\n\n`;

    // Build buttons in 2 columns
    const buttons: any[][] = [];
    const available = categories.filter(c => c.unanswered >= 2);
    const done = categories.filter(c => c.unanswered < 2);

    for (let i = 0; i < available.length; i += 2) {
      const row: any[] = [];
      const c1 = available[i];
      row.push(Markup.button.callback(
        `${c1.emoji} ${c1.name} (${c1.unanswered})`,
        `qz_cat_${c1.id}`,
      ));
      if (available[i + 1]) {
        const c2 = available[i + 1];
        row.push(Markup.button.callback(
          `${c2.emoji} ${c2.name} (${c2.unanswered})`,
          `qz_cat_${c2.id}`,
        ));
      }
      buttons.push(row);
    }

    // Show exhausted categories as disabled-looking (they can still click but get error)
    if (done.length > 0) {
      for (let i = 0; i < done.length; i += 2) {
        const row: any[] = [];
        const c1 = done[i];
        row.push(Markup.button.callback(
          `💤 ${c1.name}`,
          `qz_cat_${c1.id}`,
        ));
        if (done[i + 1]) {
          const c2 = done[i + 1];
          row.push(Markup.button.callback(
            `💤 ${c2.name}`,
            `qz_cat_${c2.id}`,
          ));
        }
        buttons.push(row);
      }
    }

    buttons.push([Markup.button.callback('🔀 Випадкова категорія', 'qz_random_category')]);
    buttons.push([Markup.button.callback('↩️ Назад', 'qz_back_to_intro')]);

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
  }

  @Action('qz_back_to_intro')
  async onBackToIntro(@Ctx() ctx: WizardContext) {
    if (typeof ctx.answerCbQuery === 'function') await ctx.answerCbQuery();
    const userId: number = ctx.wizard?.state?.['userId'];
    if (!userId) { await ctx.scene.leave(); return; }
    await this.showIntro(ctx, userId);
  }

  private async showTodayResult(ctx: WizardContext, session: any, userId: number) {
    const [stats, rank, answeredCount, totalCount, userRecord] = await Promise.all([
      this.quizService.getUserStats(userId),
      this.quizService.getUserRank(userId),
      this.quizService.getUserAnsweredCount(userId),
      this.quizService.getTotalQuestionsCount(),
      this.userService.findByTelegramId(ctx.from?.id),
    ]);

    const progressBar = this.buildProgressBar(answeredCount, totalCount);

    const isPremium = userRecord?.is_premium && userRecord?.premium_until && new Date(userRecord.premium_until) > new Date();
    let premiumText = '';
    if (isPremium) {
      const date = new Date(userRecord.premium_until);
      const formattedDate = date.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      premiumText = `\n⭐ <b>Premium підписка активна до:</b> <code>${formattedDate}</code>`;
    }

    let text =
      `🧠 <b>Ви вже пройшли сьогоднішній квіз!</b>\n\n` +
      `📊 Результат:\n` +
      `${session.both_correct ? '✅ Обидві відповіді правильні' : '❌ Не всі відповіді правильні'}\n`;

    if (session.total_time_seconds !== null) {
      text += `⏱ Час: ${session.total_time_seconds}с\n`;
    }

    if (session.premium_awarded) {
      text += `🏆 <b>Premium на 1 день нараховано!</b>\n`;
    }

    text +=
      `\n📊 <b>Ваша статистика:</b>\n` +
      `💎 Балів: <b>${stats.total_points}</b>${rank ? ` · #${rank} у рейтингу` : ''}\n` +
      `⭐ Premium днів зароблено: <b>${stats.premium_days_earned}</b>` +
      premiumText + `\n\n` +
      `📖 <b>Прогрес питань:</b>\n` +
      `${progressBar} <b>${answeredCount}/${totalCount}</b>\n\n` +
      `📅 Повертайтесь завтра за новими питаннями!`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏆 Рейтинг гравців', 'qz_ranking_static')],
      ]),
    });
  }

  private async showRanking(ctx: WizardContext) {
    const userId = ctx.wizard?.state?.['userId'] ?? null;
    const top = await this.quizService.getTopRanking();
    const userRank = userId ? await this.quizService.getUserRank(userId) : null;
    const userStats = userId ? await this.quizService.getUserStats(userId) : null;

    const medals = ['🥇', '🥈', '🥉'];
    let text = `🏆 <b>Рейтинг гравців Цікавинки</b> 🧠\n\n`;

    if (top.length === 0) {
      text += `Ще ніхто не набрав балів. Будьте першим!\n`;
    } else {
      top.forEach((entry, i) => {
        const medal = medals[i] ?? `${i + 1}.`;
        text += `${medal} <b>${entry.name}</b> — <b>${entry.total_points}</b> балів\n`;
      });
    }

    if (userStats && userStats.total_points > 0) {
      text += `\n━━━━━━━━━━━━━━━━━\n`;
      text += `👤 <b>Ваша позиція:</b> ${userRank ? `#${userRank}` : 'поза топом'} · <b>${userStats.total_points}</b> балів`;
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  private buildProgressBar(answered: number, total: number): string {
    if (total === 0) return '░░░░░░░░░░';
    const filled = Math.round((answered / total) * 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}
