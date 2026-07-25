import { Injectable, Inject } from '@nestjs/common';
import { ProfileRepository, ProfileEntity } from '../repositories/profile.repository';
import { PhotoRepository, PhotoEntity } from '../repositories/photo.repository';
import Redis from 'ioredis';
import { ProfileService } from './profile.service';

export interface CandidateResult {
  profile: ProfileEntity;
  photos: PhotoEntity[];
}

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly photoRepository: PhotoRepository,
    private readonly profileService: ProfileService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getNextCandidate(userId: number): Promise<CandidateResult | null> {
    const userProfileResult = await this.profileService.getProfile(userId);
    if (!userProfileResult || !userProfileResult.profile) {
      return null;
    }
    const userProfile = userProfileResult.profile;
    const queueKey = `discovery-queue:${userId}`;

    // 1. Try to pop the next candidate user ID from Redis queue
    let nextCandidateIdStr: string | null = null;
    try {
      nextCandidateIdStr = await this.redis.lpop(queueKey);
    } catch (err) {
      // Fallback on Redis failures
    }

    let nextCandidateId = nextCandidateIdStr ? parseInt(nextCandidateIdStr, 10) : null;

    // 2. If the queue is empty, fetch a new batch of 40 candidates from PostgreSQL
    if (!nextCandidateId) {
      const candidates = await this.profileRepository.findCandidates(
        userId,
        userProfile.search_gender,
        userProfile.gender,
        userProfile.location_lat,
        userProfile.location_lon,
        userProfile.city,
        40, // Batch fetch 40 candidates to avoid individual DB lookups
      );

      if (!candidates || candidates.length === 0) {
        return null;
      }

      // Pop the first one for immediate return
      const firstCand = candidates[0];
      nextCandidateId = firstCand.user_id;

      // Push the remaining 39 candidate user IDs to the Redis list
      if (candidates.length > 1) {
        const remainingIds = candidates.slice(1).map((c) => c.user_id.toString());
        try {
          await this.redis.rpush(queueKey, ...remainingIds);
          // Set TTL of 30 minutes on the cached queue
          await this.redis.expire(queueKey, 1800);
        } catch (err) {
          // Log or ignore Redis write errors
        }
      }
    }

    // 3. Fetch candidate profile and photos using ProfileService (utilizes profile cache)
    const candidateProfile = await this.profileService.getProfile(nextCandidateId);
    if (!candidateProfile || !candidateProfile.profile) {
      // If candidate profile not found, fetch the next candidate recursively
      return this.getNextCandidate(userId);
    }

    return candidateProfile as CandidateResult;
  }
}
