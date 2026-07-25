import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BroadcastRepository } from '../repositories/broadcast.repository';

export interface CreateBroadcastDto {
  title: string;
  content: string;
  media_url?: string;
  media_type?: string;
  inline_keyboard?: any;
  target_type: 'all' | 'users' | 'channel';
  target_ids?: string[];
  target_channels?: string[]; // Array of channel telegram_ids
  schedule_type: 'now' | 'scheduled' | 'draft';
  scheduled_at?: Date;
}

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly broadcastRepo: BroadcastRepository,
    @InjectQueue('broadcast') private readonly broadcastQueue: Queue,
  ) {}

  async createBroadcast(dto: CreateBroadcastDto) {
    let status = 'draft';
    if (dto.schedule_type === 'now') {
      status = 'processing';
    } else if (dto.schedule_type === 'scheduled') {
      status = 'scheduled';
      if (!dto.scheduled_at) {
        throw new BadRequestException('scheduled_at is required for scheduled broadcasts');
      }
    }

    const cleanContent = this.cleanHtml(dto.content);

    const broadcast = await this.broadcastRepo.createBroadcast(
      dto.title,
      cleanContent,
      dto.media_url || null,
      dto.media_type || null,
      dto.inline_keyboard || null,
      dto.target_type,
      dto.target_ids || null,
      status,
      dto.schedule_type === 'scheduled' ? new Date(dto.scheduled_at) : null,
      dto.target_channels || null,
    );

    if (status === 'processing') {
      // Start dispatching immediately
      await this.startDispatching(broadcast.id);
    } else if (status === 'scheduled') {
      // Schedule the dispatcher
      const delay = new Date(dto.scheduled_at!).getTime() - Date.now();
      if (delay > 0) {
        await this.broadcastQueue.add(
          'dispatch-broadcast',
          { broadcastId: broadcast.id },
          { delay, jobId: `dispatch-${broadcast.id}` }
        );
      } else {
        // If the date is already passed, start immediately
        await this.broadcastRepo.updateBroadcastStatus(broadcast.id, 'processing');
        await this.startDispatching(broadcast.id);
      }
    }

    return broadcast;
  }

  async getBroadcasts(cursorId?: number, limit = 20) {
    return this.broadcastRepo.getBroadcasts(cursorId, limit);
  }

  async cancelBroadcast(id: number) {
    const broadcast = await this.broadcastRepo.getBroadcastById(id);
    if (!broadcast) throw new BadRequestException('Broadcast not found');

    if (broadcast.status === 'completed') {
      throw new BadRequestException('Broadcast is already completed');
    }

    // Attempt to remove from queue if it was scheduled
    if (broadcast.status === 'scheduled') {
      const job = await this.broadcastQueue.getJob(`dispatch-${id}`);
      if (job) await job.remove();
    }

    // Wait, cancelling active processing is tricky without tracking all jobs, 
    // but updating status to "failed" or "cancelled" will stop the dispatcher loop.
    return this.broadcastRepo.updateBroadcastStatus(id, 'failed'); // using failed/cancelled
  }

  async deleteBroadcast(id: number) {
     return this.broadcastRepo.deleteBroadcast(id);
  }

  // Channel operations
  async getActiveChannels() {
    return this.broadcastRepo.getActiveChannels();
  }

  async deleteChannel(id: number) {
    return this.broadcastRepo.deleteChannel(id);
  }

  cleanHtml(html: string): string {
    if (!html) return '';

    // Replace paragraphs and list items with clean linebreaks
    let cleaned = html
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<ul>/gi, '')
      .replace(/<\/ul>/gi, '')
      .replace(/<ol>/gi, '')
      .replace(/<\/ol>/gi, '');

    // Map common TipTap tags to Telegram ones
    cleaned = cleaned
      .replace(/<strong>/gi, '<b>')
      .replace(/<\/strong>/gi, '</b>')
      .replace(/<em>/gi, '<i>')
      .replace(/<\/em>/gi, '</i>');

    // Convert spoiler tags (e.g. <span data-spoiler="true"> or <span class="spoiler">)
    cleaned = cleaned.replace(/<span[^>]*class="[^"]*spoiler[^"]*"[^>]*>(.*?)<\/span>/gi, '<span class="tg-spoiler">$1</span>');
    cleaned = cleaned.replace(/<span[^>]*data-spoiler[^>]*>(.*?)<\/span>/gi, '<span class="tg-spoiler">$1</span>');

    // Strip unapproved tags but keep their content
    const allowedTags = /<\/?(b|strong|i|em|u|ins|s|strike|del|span|a|code|pre)(\s+[^>]*)?>/gi;
    
    // We clean anything else
    cleaned = cleaned.replace(/<(?!\/?(b|strong|i|em|u|ins|s|strike|del|span|a|code|pre)(?=\s|>))\/?([a-z]+)[^>]*>/gi, '');

    return cleaned.trim();
  }

  private async startDispatching(broadcastId: number) {
    await this.broadcastQueue.add(
      'dispatch-broadcast',
      { broadcastId, lastId: 0 },
      { jobId: `dispatch-${broadcastId}-0` }
    );
  }
}
