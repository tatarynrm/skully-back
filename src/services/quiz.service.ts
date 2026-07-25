import { Injectable, Logger } from '@nestjs/common';
import { QuizRepository, QuizQuestion, QuizUserStats, QuizRankEntry, QuizCategory } from '../repositories/quiz.repository';
import { UserRepository } from '../repositories/user.repository';

const POINTS_PER_CORRECT = 10;
const POINTS_BONUS_BOTH_FAST = 30;
const MAX_TOTAL_SECONDS = 60; // Both questions must be answered within 60 seconds total

export interface QuizSessionResult {
  q1Correct: boolean;
  q2Correct: boolean;
  bothCorrect: boolean;
  totalSeconds: number;
  tooSlow: boolean;
  premiumAwarded: boolean;
  pointsEarned: number;
}

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    private readonly quizRepository: QuizRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async getTodaySession(userId: number) {
    return this.quizRepository.getTodaySession(userId);
  }

  async getCategories(userId: number) {
    return this.quizRepository.getCategories(userId);
  }

  async getTotalQuestionsCount(): Promise<number> {
    return this.quizRepository.getTotalQuestionsCount();
  }

  async getUserAnsweredCount(userId: number): Promise<number> {
    return this.quizRepository.getUserAnsweredCount(userId);
  }

  async pickDailyQuestions(userId: number): Promise<QuizQuestion[]> {
    return this.quizRepository.pickDailyQuestions(userId);
  }

  async pickDailyQuestionsByCategory(userId: number, categoryId: number): Promise<QuizQuestion[]> {
    return this.quizRepository.pickDailyQuestionsByCategory(userId, categoryId);
  }

  async createSession(userId: number, q1Id: number, q2Id: number, categoryId: number) {
    return this.quizRepository.createDailySession(userId, q1Id, q2Id, categoryId);
  }

  async getQuestionById(qId: number): Promise<QuizQuestion | null> {
    return this.quizRepository.getQuestionById(qId);
  }

  /**
   * Finalize a quiz session, award premium if applicable, update stats
   */
  async finalizeSession(
    userId: number,
    q1Correct: boolean,
    q2Correct: boolean,
    sessionStartMs: number,
  ): Promise<QuizSessionResult> {
    const totalSeconds = Math.floor((Date.now() - sessionStartMs) / 1000);
    const bothCorrect = q1Correct && q2Correct;
    const tooSlow = totalSeconds > MAX_TOTAL_SECONDS;
    const premiumAwarded = bothCorrect && !tooSlow;

    let pointsEarned = 0;
    if (q1Correct) pointsEarned += POINTS_PER_CORRECT;
    if (q2Correct) pointsEarned += POINTS_PER_CORRECT;
    if (premiumAwarded) pointsEarned += POINTS_BONUS_BOTH_FAST;

    const addCorrect = (q1Correct ? 1 : 0) + (q2Correct ? 1 : 0);

    await this.quizRepository.completeDailySession(userId, bothCorrect, totalSeconds, premiumAwarded);
    await this.quizRepository.updateUserStats(userId, pointsEarned, addCorrect, 1, premiumAwarded ? 1 : 0);

    if (premiumAwarded) {
      try {
        await this.userRepository.activatePremium(userId, 1);
        this.logger.log(`Quiz premium awarded to user ${userId} (${totalSeconds}s total)`);
      } catch (e) {
        this.logger.error(`Failed to grant quiz premium to user ${userId}: ${e.message}`);
      }
    }

    return { q1Correct, q2Correct, bothCorrect, totalSeconds, tooSlow, premiumAwarded, pointsEarned };
  }

  async recordAnswer(userId: number, questionId: number, isCorrect: boolean): Promise<void> {
    await this.quizRepository.recordAnswer(userId, questionId, isCorrect);
  }

  async getUserStats(userId: number): Promise<QuizUserStats> {
    return this.quizRepository.getUserStats(userId);
  }

  async getTopRanking(): Promise<QuizRankEntry[]> {
    return this.quizRepository.getTopRanking();
  }

  async getUserRank(userId: number): Promise<number | null> {
    return this.quizRepository.getUserRank(userId);
  }

  getMaxSeconds(): number {
    return MAX_TOTAL_SECONDS;
  }
}
