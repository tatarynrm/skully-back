import { Wizard, WizardStep, Ctx, On, Action } from 'nestjs-telegraf';
import { WizardContext } from 'telegraf/typings/scenes';
import { Markup } from 'telegraf';
import { UserService } from '../../services/user.service';
import { ProfileService } from '../../services/profile.service';
import { GeocodingService } from '../../services/geocoding.service';
import { Logger } from '@nestjs/common';
import { MAIN_KEYBOARD } from './profile-wizard.scene';

export const EDIT_NAME_SCENE_ID = 'EDIT_NAME_SCENE';
export const EDIT_AGE_SCENE_ID = 'EDIT_AGE_SCENE';
export const EDIT_GENDER_SCENE_ID = 'EDIT_GENDER_SCENE';
export const EDIT_SEARCH_GENDER_SCENE_ID = 'EDIT_SEARCH_GENDER_SCENE';
export const EDIT_LOCATION_SCENE_ID = 'EDIT_LOCATION_SCENE';
export const EDIT_BIO_SCENE_ID = 'EDIT_BIO_SCENE';
export const EDIT_PHOTOS_SCENE_ID = 'EDIT_PHOTOS_SCENE';

// --- 1. EDIT NAME ---
@Wizard(EDIT_NAME_SCENE_ID)
export class EditNameScene {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
  ) {}

  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    await ctx.reply('✏️ **Редагування імені**', Markup.removeKeyboard());
    await ctx.reply('Введіть нове ім\'я:', Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_edit')]]));
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2(@Ctx() ctx: WizardContext) {
    const text = (ctx.message as any)?.text?.trim();
    if (!text || text.startsWith('/')) {
      await ctx.reply('Будь ласка, введіть ім\'я текстом:');
      return;
    }

    const user = await this.userService.findByTelegramId(ctx.from!.id);
    if (user) {
      await this.profileService.updateSingleField(user.id, 'name', text);
      await ctx.reply(`✅ Ім'я успішно оновлено на: **${text}**`, MAIN_KEYBOARD);
    }
    await ctx.scene.leave();
  }

  @Action('cancel_edit')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}

// --- 2. EDIT AGE ---
@Wizard(EDIT_AGE_SCENE_ID)
export class EditAgeScene {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
  ) {}

  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    await ctx.reply('🎂 **Редагування віку**', Markup.removeKeyboard());
    await ctx.reply('Введіть новий вік (від 16 до 99 років):', Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_edit')]]));
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2(@Ctx() ctx: WizardContext) {
    const text = (ctx.message as any)?.text?.trim();
    const age = parseInt(text, 10);
    if (isNaN(age) || age < 16 || age > 99) {
      await ctx.reply('❌ Будь ласка, вкажіть число від 16 до 99 років:');
      return;
    }

    const user = await this.userService.findByTelegramId(ctx.from!.id);
    if (user) {
      await this.profileService.updateSingleField(user.id, 'age', age);
      await ctx.reply(`✅ Вік успішно оновлено на: **${age}**`, MAIN_KEYBOARD);
    }
    await ctx.scene.leave();
  }

  @Action('cancel_edit')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}

// --- 3. EDIT GENDER ---
@Wizard(EDIT_GENDER_SCENE_ID)
export class EditGenderScene {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
  ) {}

  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    await ctx.reply('👤 **Редагування статі**', Markup.removeKeyboard());
    await ctx.reply(
      'Оберіть вашу стать:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('👨 Хлопець', 'set_g_MALE'),
          Markup.button.callback('👩 Дівчина', 'set_g_FEMALE'),
        ],
        [Markup.button.callback('❌ Скасувати', 'cancel_edit')],
      ]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @Action(/^set_g_(MALE|FEMALE|OTHER)$/)
  async step2(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const cbData = (ctx.callbackQuery as any)?.data || '';
    const gender = cbData.replace('set_g_', '');

    const user = await this.userService.findByTelegramId(ctx.from!.id);
    if (user) {
      await this.profileService.updateSingleField(user.id, 'gender', gender);
      const genderLabel = gender === 'MALE' ? '👨 Хлопець' : '👩 Дівчина';
      await ctx.reply(`✅ Стать оновлено на: **${genderLabel}**`, MAIN_KEYBOARD);
    }
    await ctx.scene.leave();
  }

  @Action('cancel_edit')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}

// --- 4. EDIT SEARCH GENDER ---
@Wizard(EDIT_SEARCH_GENDER_SCENE_ID)
export class EditSearchGenderScene {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
  ) {}

  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    await ctx.reply('🔍 **Редагування пошуку**', Markup.removeKeyboard());
    await ctx.reply(
      'Кого ви шукаєте:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('👩 Дівчину', 'set_sg_FEMALE'),
          Markup.button.callback('👨 Хлопця', 'set_sg_MALE'),
        ],
        [Markup.button.callback('👥 Усіх', 'set_sg_ANY')],
        [Markup.button.callback('❌ Скасувати', 'cancel_edit')],
      ]),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @Action(/^set_sg_(MALE|FEMALE|ANY)$/)
  async step2(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const cbData = (ctx.callbackQuery as any)?.data || '';
    const searchGender = cbData.replace('set_sg_', '');

    const user = await this.userService.findByTelegramId(ctx.from!.id);
    if (user) {
      await this.profileService.updateSingleField(user.id, 'search_gender', searchGender);
      const label = searchGender === 'FEMALE' ? '👩 Дівчину' : searchGender === 'MALE' ? '👨 Хлопця' : '👥 Усіх';
      await ctx.reply(`✅ Пошук оновлено на: **${label}**`, MAIN_KEYBOARD);
    }
    await ctx.scene.leave();
  }

  @Action('cancel_edit')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}

function buildEditLocKeyboard(locations: any[], page: number, limit: number = 5) {
  const startIndex = page * limit;
  const endIndex = Math.min(startIndex + limit, locations.length);
  const totalPages = Math.ceil(locations.length / limit);

  const buttons: any[] = [];

  for (let i = startIndex; i < endIndex; i++) {
    buttons.push([Markup.button.callback(locations[i].display, `editloc_sel_${i}`)]);
  }

  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('◀️ Назад', `editloc_page_${page - 1}`));
  }
  navRow.push(Markup.button.callback(`${page + 1} / ${totalPages}`, 'noop'));
  if (page < totalPages - 1) {
    navRow.push(Markup.button.callback('Далі ▶️', `editloc_page_${page + 1}`));
  }
  buttons.push(navRow);
  buttons.push([Markup.button.callback('❌ Скасувати', 'editloc_cancel')]);

  return Markup.inlineKeyboard(buttons);
}

// --- 5. EDIT LOCATION ---
@Wizard(EDIT_LOCATION_SCENE_ID)
export class EditLocationScene {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly geocodingService: GeocodingService,
  ) {}

  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    await ctx.reply(
      '📍 **Надішліть вашу нову геолокацію або напишіть місто текстом:**',
      Markup.keyboard([[Markup.button.locationRequest('📍 Надіслати геолокацію')]]).oneTime().resize(),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On(['text', 'location'])
  async step2(@Ctx() ctx: WizardContext) {
    const msg = ctx.message as any;

    if (msg?.location) {
      const lat = msg.location.latitude;
      const lon = msg.location.longitude;
      const city = await this.geocodingService.reverseGeocode(lat, lon);
      
      const user = await this.userService.findByTelegramId(ctx.from!.id);
      if (user && city) {
        await this.profileService.updateLocation(user.id, city, lat, lon);
        await ctx.reply(`✅ Місто успішно оновлено: **${city}**`, MAIN_KEYBOARD);
      }
      await ctx.scene.leave();
    } else if (msg?.text) {
      const cityName = msg.text.trim();
      const locations = await this.geocodingService.searchCities(cityName);

      if (locations.length === 0) {
        await ctx.reply('❌ Не вдалося знайти таку локацію. Будь ласка, введіть назву міста чи села ще раз:');
        return;
      }

      if (locations.length === 1) {
        const user = await this.userService.findByTelegramId(ctx.from!.id);
        if (user) {
          await this.profileService.updateLocation(user.id, locations[0].city, locations[0].lat, locations[0].lon);
          await ctx.reply(`✅ Місто успішно оновлено: **${locations[0].city}**`, MAIN_KEYBOARD);
        }
        await ctx.scene.leave();
        return;
      }

      // Multiple locations found
      ctx.wizard.state['locs'] = locations;
      ctx.wizard.state['locPage'] = 0;
      await ctx.reply(
        '📍 Знайдено кілька схожих локацій. Будь ласка, оберіть вашу:',
        buildEditLocKeyboard(locations, 0),
      );
    }
  }

  @Action(/^editloc_sel_(\d+)$/)
  async onSelectEditLocation(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const match = (ctx.callbackQuery as any).data.match(/^editloc_sel_(\d+)$/);
    const index = parseInt(match[1], 10);
    const locations = ctx.wizard.state['locs'] || [];
    const loc = locations[index];

    if (loc) {
      const user = await this.userService.findByTelegramId(ctx.from!.id);
      if (user) {
        await this.profileService.updateLocation(user.id, loc.city, loc.lat, loc.lon);
        await ctx.editMessageText(`✅ Локацію обрано: <b>${loc.display}</b>`, { parse_mode: 'HTML' }).catch(() => {});
        await ctx.reply(`✅ Місто успішно оновлено: **${loc.city}**`, MAIN_KEYBOARD);
      }
      await ctx.scene.leave();
    }
  }

  @Action(/^editloc_page_(\d+)$/)
  async onPageEditLocation(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    const match = (ctx.callbackQuery as any).data.match(/^editloc_page_(\d+)$/);
    const page = parseInt(match[1], 10);
    const locations = ctx.wizard.state['locs'] || [];
    
    ctx.wizard.state['locPage'] = page;
    await ctx.editMessageReplyMarkup(buildEditLocKeyboard(locations, page).reply_markup).catch(() => {});
  }

  @Action('editloc_cancel')
  async onCancelEditLocation(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply('Редагування локації скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}

// --- 6. EDIT BIO ---
@Wizard(EDIT_BIO_SCENE_ID)
export class EditBioScene {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
  ) {}

  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    await ctx.reply('✍️ **Редагування опису**', Markup.removeKeyboard());
    await ctx.reply('Введіть новий опис про себе:', Markup.inlineKeyboard([[Markup.button.callback('❌ Скасувати', 'cancel_edit')]]));
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('text')
  async step2(@Ctx() ctx: WizardContext) {
    const text = (ctx.message as any)?.text?.trim();
    if (!text || text.startsWith('/')) {
      await ctx.reply('Будь ласка, введіть опис текстом:');
      return;
    }

    const user = await this.userService.findByTelegramId(ctx.from!.id);
    if (user) {
      await this.profileService.updateSingleField(user.id, 'bio', text);
      await ctx.reply('✅ Опис про себе оновлено!', MAIN_KEYBOARD);
    }
    await ctx.scene.leave();
  }

  @Action('cancel_edit')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}

// --- 7. EDIT PHOTOS ---
@Wizard(EDIT_PHOTOS_SCENE_ID)
export class EditPhotosScene {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
  ) {}

  @WizardStep(1)
  async step1(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.scene.leave();

    const { photos } = await this.profileService.getProfile(user.id);
    ctx.wizard.state['existingPhotos'] = photos || [];
    ctx.wizard.state['newPhotos'] = [];

    // Hide reply keyboard during editing
    await ctx.reply('✏️ **Редагування фотографій**', Markup.removeKeyboard());

    const inlineButtons: any[] = [];
    if (photos && photos.length > 0) {
      const btnLabel = photos.length === 1 ? '▶️ Залишити попереднє фото' : '▶️ Залишити попередні фото';
      inlineButtons.push([Markup.button.callback(btnLabel, 'keep_photos')]);
    }
    inlineButtons.push([Markup.button.callback('🗑️ Очистити всі фото', 'clear_photos')]);
    inlineButtons.push([Markup.button.callback('❌ Скасувати', 'cancel_edit')]);

    await ctx.reply(
      '🖼️ **Керування фотографіями (максимум 3)**\n\n' +
      'Надішліть від 1 до 3 нових фото. Вони автоматично замінять ваші попередні фотографії.\n' +
      'Коли закінчите, натисніть кнопку «✅ Завершити».',
      Markup.inlineKeyboard(inlineButtons),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  @On('photo')
  @Action('keep_photos')
  @Action('clear_photos')
  @Action('finish_photos')
  async step2(@Ctx() ctx: WizardContext) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.scene.leave();

    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.scene.leave();

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      const cbData = (ctx.callbackQuery as any).data;

      if (cbData === 'keep_photos') {
        await ctx.reply('✅ Попередні фотографії залишено без змін.', MAIN_KEYBOARD);
        return ctx.scene.leave();
      }

      if (cbData === 'clear_photos') {
        await this.profileService.clearPhotos(user.id);
        await ctx.reply('🗑️ Усі фотографії видалено з вашої анкети!', MAIN_KEYBOARD);
        return ctx.scene.leave();
      }

      if (cbData === 'finish_photos') {
        const newPhotos = ctx.wizard.state['newPhotos'] || [];
        if (newPhotos.length === 0) {
          await ctx.reply('⚠️ Надішліть хоча б одне фото або скасуйте операцію.');
          return;
        }

        // Save new photos, replacing old ones
        await this.profileService.clearPhotos(user.id);
        for (const fileId of newPhotos) {
          await this.profileService.addPhoto(user.id, fileId);
        }

        await ctx.reply('📸 Фотографії успішно оновлено!', MAIN_KEYBOARD);
        return ctx.scene.leave();
      }
    }

    // Handle photo uploads
    const photos = (ctx.message as any)?.photo;
    if (photos && photos.length > 0) {
      const largest = photos[photos.length - 1].file_id;
      const list: string[] = ctx.wizard.state['newPhotos'] || [];

      if (list.length >= 3) {
        await ctx.reply('⚠️ Уже завантажено 3 нових фото! Натисніть «✅ Завершити завантаження».');
        return;
      }

      list.push(largest);
      ctx.wizard.state['newPhotos'] = list;

      const inlineButtons = [
        [Markup.button.callback('✅ Завершити завантаження', 'finish_photos')],
        [Markup.button.callback('❌ Скасувати', 'cancel_edit')],
      ];

      await ctx.reply(
        `📸 Нове фото ${list.length}/3 збережено.\n` +
        `Надішліть ще фото або натисніть кнопку нижче, щоб завершити:`,
        Markup.inlineKeyboard(inlineButtons),
      );

      if (list.length >= 3) {
        // Automatically finish if 3 photos uploaded
        await this.profileService.clearPhotos(user.id);
        for (const fileId of list) {
          await this.profileService.addPhoto(user.id, fileId);
        }
        await ctx.reply('📸 Досягнуто ліміт 3 фото. Фотографії успішно оновлено!', MAIN_KEYBOARD);
        return ctx.scene.leave();
      }
    }
  }

  @Action('cancel_edit')
  async onCancel(@Ctx() ctx: WizardContext) {
    await ctx.answerCbQuery();
    await ctx.reply('Скасовано.', MAIN_KEYBOARD);
    await ctx.scene.leave();
  }
}
