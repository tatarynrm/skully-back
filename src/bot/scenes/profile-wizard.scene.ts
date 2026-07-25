import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { ProfileService } from '../../services/profile.service';
import { GeocodingService } from '../../services/geocoding.service';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProfileDto } from '../dto/create-profile.dto';
import { Logger } from '@nestjs/common';

export const PROFILE_WIZARD_ID = 'PROFILE_WIZARD_SCENE';

const WELCOME_GIFS = [
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif',
  'https://media.giphy.com/media/26FPpSuhgHvU6hOQo/giphy.gif'
];

const FINISH_GIFS = [
  'https://media.giphy.com/media/artj92V8cbuaQ/giphy.gif',
  'https://media.giphy.com/media/nXxOjZrbnbRxS/giphy.gif',
  'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif'
];

export const MAIN_KEYBOARD = Markup.keyboard([
  ['🔍 Шукати анкети', '🌐 Онлайн спілкування'],
  ['👤 Мій профіль', '🏆 Розіграш'],
  ['❤️ Мої співпадіння', '💌 Вподобання'],
  ['🧠 Цікавинка', 'ℹ️ Інформація'],
]).resize();

export const SEARCH_MODE_KEYBOARD = Markup.keyboard([
  ['❤️ Лайк', '💌 Написати', '❌ Пропустити'],
  ['⚠️ Поскаржитись', '↩️ Головне меню'],
]).resize();

function buildWizardLocKeyboard(locations: any[], page: number, limit: number = 5) {
  const startIndex = page * limit;
  const endIndex = Math.min(startIndex + limit, locations.length);
  const totalPages = Math.ceil(locations.length / limit);

  const buttons: any[] = [];

  for (let i = startIndex; i < endIndex; i++) {
    buttons.push([Markup.button.callback(locations[i].display, `wiz_sel_${i}`)]);
  }

  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('◀️ Назад', `wiz_page_${page - 1}`));
  }
  navRow.push(Markup.button.callback(`${page + 1} / ${totalPages}`, 'noop'));
  if (page < totalPages - 1) {
    navRow.push(Markup.button.callback('Далі ▶️', `wiz_page_${page + 1}`));
  }
  buttons.push(navRow);
  buttons.push([Markup.button.callback('❌ Скасувати', 'wiz_cancel')]);

  return Markup.inlineKeyboard(buttons);
}

@Wizard(PROFILE_WIZARD_ID)
export class ProfileWizardScene {
  private readonly logger = new Logger(ProfileWizardScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly geocodingService: GeocodingService,
  ) {}

  @WizardStep(1)
  async step1Init(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const user = await this.userService.findOrCreateUser(telegramId, ctx.from?.username);
    const { profile } = await this.profileService.getProfile(user.id);

    ctx.wizard.state['user'] = user;
    ctx.wizard.state['existingProfile'] = profile;
    ctx.wizard.state['profileData'] = profile
      ? {
          name: profile.name,
          age: profile.age,
          gender: profile.gender,
          searchGender: profile.search_gender,
          bio: profile.bio,
          city: profile.city,
          locationLat: profile.location_lat,
          locationLon: profile.location_lon,
        }
      : {};
    ctx.wizard.state['uploadedPhotos'] = [];

    const keepBtn = profile ? [Markup.button.callback(`▶️ Залишити (${profile.name})`, 'keep_name')] : [];
    
    if (!profile) {
      const randomGif = WELCOME_GIFS[Math.floor(Math.random() * WELCOME_GIFS.length)];
      try {
        await ctx.replyWithAnimation(randomGif, {
          caption: '🎉 **Вітаємо в Touch | Знайомства!** 🎉\n\nТи за крок до нових знайомств та цікавих розмов. Давай створимо твою ідеальну анкету! ✨',
          parse_mode: 'Markdown'
        });
      } catch (e) {
        await ctx.reply('🎉 **Вітаємо в Touch | Знайомства!** 🎉\n\nТи за крок до нових знайомств та цікавих розмов. Давай створимо твою ідеальну анкету! ✨');
      }
      
      await ctx.reply(
        '📝 **Крок 1/6: Ім\'я**\n\nЯк тебе звати? Напиши своє ім\'я нижче 👇',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_wizard')]]),
      );
    } else {
      await ctx.reply(
        '📝 **Крок 1/6: Ім\'я**\n\nЯк тебе звати?',
        Markup.inlineKeyboard([keepBtn, [Markup.button.callback('❌ Скасувати', 'cancel_wizard')]]),
      );
    }

    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  @Action('keep_name')
  async step2Age(@Ctx() ctx: WizardContext) {
    const existing = ctx.wizard.state['existingProfile'];
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    } else {
      const text = (ctx.message as any)?.text?.trim();
      if (!text || text.startsWith('/')) {
        await ctx.reply('Будь ласка, вкажи ім\'я текстом:');
        return;
      }
      ctx.wizard.state['profileData'].name = text;
    }

    const keepBtn = existing ? [Markup.button.callback(`▶️ Залишити (${existing.age})`, 'keep_age')] : [];

    await ctx.reply(
      '🎂 **Крок 2/6: Вік**\n\nСкільки тобі років? (від 16 до 99)',
      Markup.inlineKeyboard([keepBtn, [Markup.button.callback('❌ Скасувати', 'cancel_wizard')]].filter(b => b.length > 0)),
    );
    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('text')
  @Action('keep_age')
  async step3Gender(@Ctx() ctx: WizardContext) {
    const existing = ctx.wizard.state['existingProfile'];

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    } else {
      const text = (ctx.message as any)?.text?.trim();
      const age = parseInt(text, 10);

      if (isNaN(age) || age < 16 || age > 99) {
        await ctx.reply('❌ Будь ласка, вкажи число від 16 до 99 років:');
        return;
      }
      ctx.wizard.state['profileData'].age = age;
    }

    const inlineButtons = [
      [
        Markup.button.callback('👨 Хлопець', 'gender_MALE'),
        Markup.button.callback('👩 Дівчина', 'gender_FEMALE'),
      ]
    ];

    if (existing) {
      inlineButtons.push([Markup.button.callback(`▶️ Залишити (${existing.gender})`, 'keep_gender')]);
    }
    inlineButtons.push([Markup.button.callback('❌ Скасувати', 'cancel_wizard')]);

    await ctx.reply('👤 **Крок 3/6: Власна стать**\n\nОбери свою стать:', Markup.inlineKeyboard(inlineButtons));
    ctx.wizard.next();
  }

  @WizardStep(4)
  @Action(/^gender_(MALE|FEMALE|OTHER)$/)
  @Action('keep_gender')
  async step4SearchGender(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const existing = ctx.wizard.state['existingProfile'];
    const cbData = (ctx.callbackQuery as any)?.data || '';

    if (cbData.startsWith('gender_')) {
      ctx.wizard.state['profileData'].gender = cbData.replace('gender_', '');
    }

    const inlineButtons = [
      [
        Markup.button.callback('👩 Дівчину', 'search_FEMALE'),
        Markup.button.callback('👨 Хлопця', 'search_MALE'),
      ],
      [Markup.button.callback('👥 Усіх', 'search_ANY')],
    ];

    if (existing) {
      inlineButtons.push([Markup.button.callback(`▶️ Залишити (${existing.search_gender})`, 'keep_search_gender')]);
    }
    inlineButtons.push([Markup.button.callback('❌ Скасувати', 'cancel_wizard')]);

    await ctx.reply('🔍 **Крок 4/6: Кого шукаєш**\n\nОбери кого шукаєш:', Markup.inlineKeyboard(inlineButtons));
    ctx.wizard.next();
  }

  @WizardStep(5)
  @Action(/^search_(MALE|FEMALE|ANY)$/)
  @Action('keep_search_gender')
  async step5Location(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const existing = ctx.wizard.state['existingProfile'];
    const cbData = (ctx.callbackQuery as any)?.data || '';

    if (cbData.startsWith('search_')) {
      ctx.wizard.state['profileData'].searchGender = cbData.replace('search_', '');
    }

    const keyboardButtons: any[] = [
      [Markup.button.locationRequest('📍 Надіслати геолокацію')],
    ];
    if (existing) {
      keyboardButtons.push([Markup.button.text('▶️ Залишити попереднє місто')]);
    }

    await ctx.reply(
      '📍 **Крок 5/6: Місто / Геолокація**\n\nНатисни кнопку нижче щоб відправити свої координати або напиши назву міста вручну:',
      Markup.keyboard(keyboardButtons).oneTime().resize(),
    );
    ctx.wizard.next();
  }

  @WizardStep(6)
  @On(['text', 'location'])
  async step6Bio(@Ctx() ctx: WizardContext) {
    const existing = ctx.wizard.state['existingProfile'];
    const msg = ctx.message as any;

    if (msg?.location) {
      const lat = msg.location.latitude;
      const lon = msg.location.longitude;
      const cityName = await this.geocodingService.reverseGeocode(lat, lon);
      ctx.wizard.state['profileData'].locationLat = lat;
      ctx.wizard.state['profileData'].locationLon = lon;
      ctx.wizard.state['profileData'].city = cityName;
      await this.proceedToBioPrompt(ctx);
    } else if (msg?.text === '▶️ Залишити попереднє місто' && existing) {
      await this.proceedToBioPrompt(ctx);
    } else if (msg?.text) {
      const cityName = msg.text.trim();
      const locations = await this.geocodingService.searchCities(cityName);

      if (locations.length === 0) {
        await ctx.reply('❌ Не вдалося знайти таку локацію. Будь ласка, введіть назву міста чи села ще раз:');
        return;
      }

      if (locations.length === 1) {
        ctx.wizard.state['profileData'].city = locations[0].city;
        ctx.wizard.state['profileData'].locationLat = locations[0].lat;
        ctx.wizard.state['profileData'].locationLon = locations[0].lon;
        await this.proceedToBioPrompt(ctx);
        return;
      }

      // Multiple locations found
      ctx.wizard.state['locs'] = locations;
      ctx.wizard.state['locPage'] = 0;
      await ctx.reply(
        '📍 Знайдено кілька схожих локацій. Будь ласка, оберіть вашу:',
        buildWizardLocKeyboard(locations, 0),
      );
    }
  }

  private async proceedToBioPrompt(ctx: WizardContext) {
    const existing = ctx.wizard.state['existingProfile'];
    const keepBtn = existing ? [Markup.button.callback('▶️ Залишити опис', 'keep_bio')] : [];

    await ctx.reply(
      '✍️ **Крок 6/6: Про себе**\n\nНапиши кілька слів про себе (або надішли /skip):',
      Markup.inlineKeyboard([keepBtn, [Markup.button.callback('⏩ Пропустити (/skip)', 'skip_bio')]].filter(b => b.length > 0)),
    );
    ctx.wizard.next();
  }

  @Action(/^wiz_sel_(\d+)$/)
  async onSelectWizLocation(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const match = (ctx.callbackQuery as any).data.match(/^wiz_sel_(\d+)$/);
    const index = parseInt(match[1], 10);
    const locations = ctx.wizard.state['locs'] || [];
    const loc = locations[index];

    if (loc) {
      ctx.wizard.state['profileData'].city = loc.city;
      ctx.wizard.state['profileData'].locationLat = loc.lat;
      ctx.wizard.state['profileData'].locationLon = loc.lon;
      
      await ctx.editMessageText(`✅ Локацію обрано: <b>${loc.display}</b>`, { parse_mode: 'HTML' }).catch(() => {});
      await this.proceedToBioPrompt(ctx);
    }
  }

  @Action(/^wiz_page_(\d+)$/)
  async onPageWizLocation(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const match = (ctx.callbackQuery as any).data.match(/^wiz_page_(\d+)$/);
    const page = parseInt(match[1], 10);
    const locations = ctx.wizard.state['locs'] || [];
    
    ctx.wizard.state['locPage'] = page;
    await ctx.editMessageReplyMarkup(buildWizardLocKeyboard(locations, page).reply_markup).catch(() => {});
  }

  @Action('wiz_cancel')
  async onCancelWizLocation(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply('Будь ласка, введіть назву міста чи села ще раз:');
  }

  @Action('noop')
  async onNoop(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
  }

  @WizardStep(7)
  @On('text')
  @Action('keep_bio')
  @Action('skip_bio')
  async step7PhotoPrompt(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    } else {
      const text = (ctx.message as any)?.text?.trim();
      if (text && text !== '/skip') {
        ctx.wizard.state['profileData'].bio = text;
      }
    }

    await ctx.reply(
      '📸 **Фотографії (максимум 3)**\n\n' +
      'Надішли від 1 до 3 фотографій по черзі.\n' +
      'Коли закінчиш — відправ команду /done або натисни кнопку закінчити.',
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Завершити завантаження', 'finish_photos')],
        [Markup.button.callback('▶️ Залишити попередні фото', 'keep_photos')],
      ]),
    );
    ctx.wizard.next();
  }

  @WizardStep(8)
  @On('photo')
  @On('text')
  @Action('finish_photos')
  @Action('keep_photos')
  async step8HandlePhotos(@Ctx() ctx: WizardContext) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      const cbData = (ctx.callbackQuery as any)?.data;
      if (cbData === 'keep_photos') {
        return this.saveAndFinishWizard(ctx, true);
      } else {
        return this.saveAndFinishWizard(ctx, false);
      }
    }

    const text = (ctx.message as any)?.text?.trim();
    if (text === '/done' || text === '/skip') {
      return this.saveAndFinishWizard(ctx, false);
    }

    const photos = (ctx.message as any)?.photo;
    if (photos && photos.length > 0) {
      const largest = photos[photos.length - 1].file_id;
      const list: string[] = ctx.wizard.state['uploadedPhotos'] || [];
      
      if (list.length >= 3) {
        await ctx.reply('⚠️ Уже завантажено 3 фото! Натисніть "✅ Завершити завантаження".');
        return;
      }

      list.push(largest);
      ctx.wizard.state['uploadedPhotos'] = list;

      await ctx.reply(
        `📸 Фото ${list.length}/3 збережено. ${list.length < 3 ? 'Надішли ще фото або натисни підтвердити:' : 'Досягнуто ліміт 3 фото.'}`,
        Markup.inlineKeyboard([[Markup.button.callback('✅ Підтвердити та зберегти', 'finish_photos')]]),
      );

      if (list.length >= 3) {
        return this.saveAndFinishWizard(ctx, false);
      }
    }
  }

  @Action('cancel_wizard')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('❌ Створення/редагування анкети скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }

  private async saveAndFinishWizard(ctx: WizardContext, keepExistingPhotos: boolean) {
    const user = ctx.wizard.state['user'];
    const rawData = ctx.wizard.state['profileData'] || {};
    const uploadedPhotos: string[] = ctx.wizard.state['uploadedPhotos'] || [];

    try {
      const dto = plainToInstance(CreateProfileDto, rawData);
      await validateOrReject(dto);

      const profile = await this.profileService.saveProfile({
        userId: user.id,
        name: dto.name,
        age: dto.age,
        gender: dto.gender,
        searchGender: dto.searchGender,
        bio: dto.bio,
        city: dto.city,
        locationLat: dto.locationLat,
        locationLon: dto.locationLon,
      });

      if (!keepExistingPhotos && uploadedPhotos.length > 0) {
        await this.profileService.clearPhotos(user.id);
        for (const fileId of uploadedPhotos) {
          await this.profileService.addPhoto(user.id, fileId);
        }
      }

      const isNewProfile = !ctx.wizard.state['existingProfile'];

      if (isNewProfile) {
        const randomFinishGif = FINISH_GIFS[Math.floor(Math.random() * FINISH_GIFS.length)];
        try {
          await ctx.replyWithAnimation(randomFinishGif, {
            caption: `🎉 **Ура! Твою анкету успішно створено!** 🍾\n\n` +
                     `🔥 **${profile.name}**, ${profile.age}\n` +
                     `📍 Місто: ${profile.city || '-'}\n` +
                     `✍️ Про себе: ${profile.bio || '-'}\n\n` +
                     `Ти готовий(а) до нових знайомств! Використовуй меню нижче, щоб розпочати! 🚀`,
            reply_markup: MAIN_KEYBOARD.reply_markup,
            parse_mode: 'Markdown'
          });
        } catch (e) {
          await ctx.reply(
            `🎉 **Ура! Твою анкету успішно створено!** 🍾\n\n` +
            `🔥 **${profile.name}**, ${profile.age}\n` +
            `📍 Місто: ${profile.city || '-'}\n` +
            `✍️ Про себе: ${profile.bio || '-'}\n\n` +
            `Ти готовий(а) до нових знайомств! Використовуй меню нижче, щоб розпочати! 🚀`,
            MAIN_KEYBOARD,
          );
        }
      } else {
        await ctx.reply(
          `✅ **Анкету успішно оновлено!**\n\n` +
          `Ім'я: ${profile.name}, ${profile.age}\n` +
          `Місто: ${profile.city || '-'}\n` +
          `Про себе: ${profile.bio || '-'}`,
          MAIN_KEYBOARD,
        );
      }

      await ctx.scene.leave();
    } catch (err) {
      this.logger.error(`Error finishing profile wizard: ${err.message}`, err.stack);
      await ctx.reply('❌ Помилка валідації! Впевніться, що вік від 16 до 99 років.');
      await ctx.scene.leave();
    }
  }
}
