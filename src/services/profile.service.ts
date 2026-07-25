import { Injectable, Inject } from '@nestjs/common';
import { ProfileRepository, ProfileEntity, CreateProfileData } from '../repositories/profile.repository';
import { PhotoRepository, PhotoEntity } from '../repositories/photo.repository';
import Redis from 'ioredis';

@Injectable()
export class ProfileService {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly photoRepository: PhotoRepository,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getProfile(userId: number): Promise<{ profile: ProfileEntity | null; photos: PhotoEntity[] }> {
    const cacheKey = `profile:${userId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      // Ignore cache errors and fallback to DB
    }

    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      return { profile: null, photos: [] };
    }
    const photos = await this.photoRepository.findByProfileId(profile.id);
    const result = { profile, photos };

    try {
      // Cache for 1 hour (3600 seconds)
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);
    } catch (err) {
      // Ignore write errors
    }

    return result;
  }

  async saveProfile(data: CreateProfileData): Promise<ProfileEntity> {
    const profile = await this.profileRepository.upsert(data);
    await this.invalidateCache(data.userId);
    return profile;
  }

  async updateSingleField(
    userId: number,
    field: 'name' | 'age' | 'gender' | 'search_gender' | 'bio' | 'city',
    value: any,
  ): Promise<ProfileEntity | null> {
    const profile = await this.profileRepository.updateSingleField(userId, field, value);
    await this.invalidateCache(userId);
    return profile;
  }

  async updateLocation(
    userId: number,
    city: string | null,
    lat: number | null,
    lon: number | null,
  ): Promise<ProfileEntity | null> {
    const profile = await this.profileRepository.updateLocation(userId, city, lat, lon);
    await this.invalidateCache(userId);
    return profile;
  }

  async addPhoto(userId: number, fileId: string): Promise<PhotoEntity> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new Error('Спочатку необхідно створити анкету.');
    }
    const count = await this.photoRepository.getPhotoCount(profile.id);
    if (count >= 3) {
      throw new Error('Максимум 3 фотографії! Видаліть старі фото перед додаванням нового.');
    }
    const photo = await this.photoRepository.addPhoto(profile.id, fileId, count);
    await this.invalidateCache(userId);
    return photo;
  }

  async clearPhotos(userId: number): Promise<void> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (profile) {
      await this.photoRepository.deletePhotosByProfileId(profile.id);
      await this.invalidateCache(userId);
    }
  }

  private async invalidateCache(userId: number): Promise<void> {
    try {
      await this.redis.del(`profile:${userId}`);
    } catch (err) {
      // Ignore cache deletion errors
    }
  }
}
