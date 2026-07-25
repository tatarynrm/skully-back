import { Controller, Get, Post, Body, Param, Query, UseGuards, Headers, UnauthorizedException } from '@nestjs/common';
import { BroadcastService, CreateBroadcastDto } from '../services/broadcast.service';
import { ConfigService } from '@nestjs/config';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';

// Ensure uploads folder exists
const uploadDir = join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Temporary auth guard for admin (similar to TiktokController)
const requireAdminToken = (reqHeaders: any, configService: ConfigService) => {
  const secret = configService.get<string>('ADMIN_SECRET', 'Aa527465182');
  if (reqHeaders['x-admin-token'] !== secret) {
    throw new UnauthorizedException('Invalid admin token');
  }
};

@Controller('api/admin/broadcasts')
export class BroadcastController {
  constructor(
    private readonly broadcastService: BroadcastService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async createBroadcast(@Headers() headers: any, @Body() dto: CreateBroadcastDto) {
    requireAdminToken(headers, this.configService);
    return this.broadcastService.createBroadcast(dto);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(__dirname, '..', '..', 'uploads'),
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadFile(@Headers() headers: any, @UploadedFile() file: any) {
    requireAdminToken(headers, this.configService);
    if (!file) {
      throw new UnauthorizedException('No file uploaded');
    }
    const backendUrl = this.configService.get<string>('BACKEND_URL', 'http://localhost:5000');
    return {
      url: `${backendUrl}/uploads/${file.filename}`,
      filename: file.filename,
    };
  }

  @Get('channels')
  async getChannels(@Headers() headers: any) {
    requireAdminToken(headers, this.configService);
    return this.broadcastService.getActiveChannels();
  }

  @Post('channels/:id/delete')
  async deleteChannel(@Headers() headers: any, @Param('id') id: string) {
    requireAdminToken(headers, this.configService);
    return this.broadcastService.deleteChannel(parseInt(id, 10));
  }

  @Get()
  async getBroadcasts(
    @Headers() headers: any, 
    @Query('cursor') cursor?: string, 
    @Query('limit') limit: string = '20'
  ) {
    requireAdminToken(headers, this.configService);
    const parsedCursor = cursor ? parseInt(cursor, 10) : undefined;
    const parsedLimit = parseInt(limit, 10) || 20;
    const broadcasts = await this.broadcastService.getBroadcasts(parsedCursor, parsedLimit);
    
    // Calculate next cursor
    const nextCursor = broadcasts.length === parsedLimit ? broadcasts[broadcasts.length - 1].id : null;
    
    return {
      broadcasts,
      nextCursor
    };
  }

  @Post(':id/cancel')
  async cancelBroadcast(@Headers() headers: any, @Param('id') id: string) {
    requireAdminToken(headers, this.configService);
    return this.broadcastService.cancelBroadcast(parseInt(id, 10));
  }

  @Post(':id/delete')
  async deleteBroadcast(@Headers() headers: any, @Param('id') id: string) {
    requireAdminToken(headers, this.configService);
    return this.broadcastService.deleteBroadcast(parseInt(id, 10));
  }
}
