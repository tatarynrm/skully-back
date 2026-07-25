import { Injectable, Logger } from '@nestjs/common';
import { ReferralRepository, ReferralWithProfile } from '../repositories/referral.repository';
import { UserRepository } from '../repositories/user.repository';

const REFERRALS_NEEDED = 2;       // Invite 2 friends to get premium
const PREMIUM_DAYS_PER_TIER = 2;  // 2 days premium per tier (every 2 friends)

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly referralRepository: ReferralRepository,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * Generate a referral link for a user
   */
  async getReferralLink(botUsername: string, userId: number): Promise<string> {
    return `https://t.me/${botUsername}?start=ref_${userId}`;
  }

  /**
   * Process a start command with a referral parameter
   * Returns true if premium was awarded to the referrer
   */
  async processReferral(referrerId: number, newUserId: number): Promise<boolean> {
    if (referrerId === newUserId) return false;

    // Check if this new user was already referred by someone
    const alreadyReferred = await this.referralRepository.referralExists(newUserId);
    if (alreadyReferred) return false;

    // Check if referrer exists
    const referrer = await this.userRepository.findById(referrerId);
    if (!referrer) return false;

    // Register the referral
    const added = await this.referralRepository.addReferral(referrerId, newUserId);
    if (!added) return false;

    // Count total referrals for this user
    const totalReferrals = await this.referralRepository.countReferrals(referrerId);

    // Award premium for every REFERRALS_NEEDED invited users
    if (totalReferrals % REFERRALS_NEEDED === 0) {
      await this.userRepository.activatePremium(referrerId, PREMIUM_DAYS_PER_TIER);
      this.logger.log(`Referral premium awarded: user ${referrerId} now has +${PREMIUM_DAYS_PER_TIER} days premium (total referrals: ${totalReferrals})`);
      return true; // Signal to notify the referrer
    }

    return false;
  }

  async countReferrals(userId: number): Promise<number> {
    return this.referralRepository.countReferrals(userId);
  }

  async getReferrals(userId: number, page: number = 1, limit: number = 10): Promise<{
    referrals: ReferralWithProfile[];
    total: number;
    totalPages: number;
    page: number;
  }> {
    const [referrals, total] = await Promise.all([
      this.referralRepository.getReferrals(userId, page, limit),
      this.referralRepository.countReferralsTotal(userId),
    ]);
    return {
      referrals,
      total,
      totalPages: Math.ceil(total / limit),
      page,
    };
  }

  getRequiredReferrals(): number {
    return REFERRALS_NEEDED;
  }

  getPremiumDaysPerTier(): number {
    return PREMIUM_DAYS_PER_TIER;
  }
}
