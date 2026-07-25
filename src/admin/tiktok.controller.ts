import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { TiktokService } from '../services/tiktok.service';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';

@Controller('api/tiktok')
export class TiktokController {
  constructor(
    private readonly tiktokService: TiktokService,
    private readonly configService: ConfigService,
  ) { }

  @Post('submit')
  async submitVideo(@Headers('authorization') authHeader: string, @Body('url') url: string) {
    let telegramId = '123456789'; // Default mock ID

    if (authHeader && authHeader.startsWith('tma ')) {
      const initData = authHeader.split(' ')[1];
      if (initData) {
        const urlParams = new URLSearchParams(initData);
        const userStr = urlParams.get('user');
        if (userStr) {
          const tgUser = JSON.parse(decodeURIComponent(userStr));
          telegramId = tgUser.id.toString();
        }

        // Verify initData (optional but recommended for production)
        const token = this.configService.get<string>('BOT_TOKEN');
        if (token) {
          const hash = urlParams.get('hash');
          urlParams.delete('hash');

          const dataCheckString = Array.from(urlParams.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');

          const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
          const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

          if (calculatedHash !== hash) {
            console.warn(`Invalid Telegram hash for user ${telegramId}`);
          }
        }
      }
    }

    return this.tiktokService.submitVideo(telegramId, url);
  }
}
