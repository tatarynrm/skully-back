import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LikeRepository } from '../repositories/like.repository';
import { MatchRepository, MatchWithProfileEntity } from '../repositories/match.repository';
import { ProfileRepository, ProfileEntity } from '../repositories/profile.repository';
import { UserRepository, UserEntity } from '../repositories/user.repository';
import { PhotoRepository } from '../repositories/photo.repository';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

export interface SwipeResult {
  isMatch: boolean;
  matchedProfile?: ProfileEntity;
  matchedUser?: UserEntity;
}

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly likeRepository: LikeRepository,
    private readonly matchRepository: MatchRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly userRepository: UserRepository,
    private readonly photoRepository: PhotoRepository,
    @InjectBot() private readonly bot: Telegraf<Context>,
  ) {}

  /**
   * Process user swipe inside a PostgreSQL transaction.
   * If mutual like is detected, creates a match atomically, marks likes as notified, and sends full profile cards with ALL photos to both users.
   */
  async processSwipe(
    fromUserId: number,
    toUserId: number,
    action: 'LIKE' | 'DISLIKE' | 'SUPERLIKE',
    message?: string | null,
  ): Promise<SwipeResult> {
    if (fromUserId === toUserId) {
      this.logger.warn(`User #${fromUserId} attempted to swipe on themselves. Action ignored.`);
      return { isMatch: false };
    }

    return this.db.transaction(async (client) => {
      // 1. Record the like/dislike action inside transaction
      await this.likeRepository.createLike(fromUserId, toUserId, action, message, client);

      if (action === 'DISLIKE') {
        return { isMatch: false };
      }

      // 2. Check if the target user has already liked the swiping user
      const isMutual = await this.likeRepository.checkMutualLike(fromUserId, toUserId, client);

      if (isMutual) {
        // 3. Atomically create a match record
        const matchRecord = await this.matchRepository.createMatch(fromUserId, toUserId, client);

        // 4. Mark likes between both users as notified so NO discrete "new like" alert is ever sent!
        await this.likeRepository.markLikesNotifiedBetweenUsers(fromUserId, toUserId, client);

        // 5. Retrieve both users, profiles, and photos
        const targetUser = await this.userRepository.findById(toUserId, client);
        const targetProfile = await this.profileRepository.findByUserId(toUserId, client);
        const swiperUser = await this.userRepository.findById(fromUserId, client);
        const swiperProfile = await this.profileRepository.findByUserId(fromUserId, client);

        if (matchRecord && targetUser && targetProfile && swiperUser && swiperProfile) {
          // Immediately mark match as notified so background worker doesn't duplicate
          await this.matchRepository.markMatchNotified(matchRecord.id, client);

          const targetPhotos = await this.photoRepository.findByProfileId(targetProfile.id, client);
          const swiperPhotos = await this.photoRepository.findByProfileId(swiperProfile.id, client);

          const swiperUsername = swiperUser.username ? `@${this.escapeHtml(swiperUser.username)}` : `(ID: ${swiperUser.telegram_id})`;
          const targetUsername = targetUser.username ? `@${this.escapeHtml(targetUser.username)}` : `(ID: ${targetUser.telegram_id})`;

          // Caption for Swiper (fromUser) showing Target's Profile
          const swiperCaption =
            `💖 <b>ІТС А МАТЧ!</b> 🎉\n\n` +
            `🔥 <b>${this.escapeHtml(targetProfile.name)}</b>, ${targetProfile.age}\n` +
            `📍 ${this.escapeHtml(targetProfile.city || 'Місто не вказано')}\n\n` +
            `📝 ${this.escapeHtml(targetProfile.bio || '-')}\n\n` +
            `💬 <b>Контакт для зв'язку в Telegram</b>: ${targetUsername}`;

          // Caption for Target (toUser) showing Swiper's Profile
          const targetCaption =
            `💖 <b>ІТС А МАТЧ!</b> 🎉\n\n` +
            `🔥 <b>${this.escapeHtml(swiperProfile.name)}</b>, ${swiperProfile.age}\n` +
            `📍 ${this.escapeHtml(swiperProfile.city || 'Місто не вказано')}\n\n` +
            `📝 ${this.escapeHtml(swiperProfile.bio || '-')}\n\n` +
            `💬 <b>Контакт для зв'язку в Telegram</b>: ${swiperUsername}`;

          // Send ALL photos to Swiper
          await this.sendUserMatchCard(swiperUser.telegram_id, targetPhotos, swiperCaption);

          // Send ALL photos to Target
          await this.sendUserMatchCard(targetUser.telegram_id, swiperPhotos, targetCaption);
        }

        this.logger.log(`MATCH CREATED & ALL PHOTOS SENT! User #${fromUserId} <-> User #${toUserId}`);
        return { isMatch: true, matchedProfile: targetProfile || undefined, matchedUser: targetUser || undefined };
      }

      return { isMatch: false };
    });
  }

  async getUserMatches(userId: number, page: number = 1, limit: number = 10): Promise<{ matches: MatchWithProfileEntity[]; total: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    const [matches, total] = await Promise.all([
      this.matchRepository.getUserMatches(userId, limit, offset),
      this.matchRepository.getMatchesCount(userId),
    ]);
    const totalPages = Math.ceil(total / limit) || 1;
    return { matches, total, totalPages };
  }

  private async sendUserMatchCard(telegramId: number, photos: any[], caption: string) {
    try {
      if (photos.length === 0) {
        await this.bot.telegram.sendMessage(telegramId, caption, { parse_mode: 'HTML' });
      } else if (photos.length === 1) {
        await this.bot.telegram.sendPhoto(telegramId, photos[0].file_id, {
          caption,
          parse_mode: 'HTML',
        });
      } else {
        // Send all 2 or 3 photos as a Telegram media group album
        const media = photos.map((p, idx) => ({
          type: 'photo' as const,
          media: p.file_id,
          caption: idx === 0 ? caption : undefined,
          parse_mode: 'HTML' as const,
        }));
        await this.bot.telegram.sendMediaGroup(telegramId, media);
      }
    } catch (err) {
      this.logger.error(`Failed to send match card to telegram user ${telegramId}: ${err.message}`);
    }
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
