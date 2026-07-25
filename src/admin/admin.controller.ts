import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  private checkAuth(headers: Record<string, string>) {
    const secret = this.configService.get<string>('ADMIN_SECRET', 'Aa527465182');
    const token = headers['x-admin-token'];
    if (!token || token !== secret) {
      throw new UnauthorizedException('Invalid admin token');
    }
  }

  // ─── STATS ─────────────────────────────────────────────────────────

  @Get('stats')
  async getDashboardStats(@Headers() headers: Record<string, string>) {
    this.checkAuth(headers);
    return this.adminService.getDashboardStats();
  }

  // ─── USERS ─────────────────────────────────────────────────────────

  @Get('users')
  async getUsers(
    @Headers() headers: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search = '',
  ) {
    this.checkAuth(headers);
    return this.adminService.getUsers(page, limit, search);
  }

  @Post('users/:id/block')
  async blockUser(
    @Headers() headers: Record<string, string>,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    this.checkAuth(headers);
    return this.adminService.blockUser(id, reason);
  }

  @Post('users/:id/unblock')
  async unblockUser(
    @Headers() headers: Record<string, string>,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.checkAuth(headers);
    return this.adminService.unblockUser(id);
  }

  @Post('users/:id/premium')
  async grantPremium(
    @Headers() headers: Record<string, string>,
    @Param('id', ParseIntPipe) id: number,
    @Body('days', ParseIntPipe) days: number,
  ) {
    this.checkAuth(headers);
    return this.adminService.grantPremium(id, days);
  }

  // ─── PROFILES ──────────────────────────────────────────────────────

  @Get('profiles')
  async getProfiles(
    @Headers() headers: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search = '',
  ) {
    this.checkAuth(headers);
    return this.adminService.getProfiles(page, limit, search);
  }

  // ─── GIVEAWAYS ─────────────────────────────────────────────────────

  @Get('giveaways')
  async getGiveaways(
    @Headers() headers: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.checkAuth(headers);
    return this.adminService.getGiveaways(page, limit);
  }

  @Post('giveaways/trigger')
  async triggerGiveaway(@Headers() headers: Record<string, string>) {
    this.checkAuth(headers);
    return this.adminService.triggerManualGiveaway();
  }

  // ─── REFERRALS ─────────────────────────────────────────────────────

  @Get('referrals')
  async getReferrals(
    @Headers() headers: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.checkAuth(headers);
    return this.adminService.getReferrals(page, limit);
  }

  // ─── BOT ───────────────────────────────────────────────────────────

  @Get('bot/info')
  async getBotInfo(@Headers() headers: Record<string, string>) {
    this.checkAuth(headers);
    return this.adminService.getBotInfo();
  }

  @Post('bot/broadcast')
  async broadcast(
    @Headers() headers: Record<string, string>,
    @Body('text') text: string,
  ) {
    this.checkAuth(headers);
    return this.adminService.broadcastMessage(text);
  }

  // ─── DB SCHEMA ─────────────────────────────────────────────────────

  @Get('schema')
  async getSchema(@Headers() headers: Record<string, string>) {
    this.checkAuth(headers);
    return this.adminService.getSchema();
  }

  @Post('schema/add-column')
  async addColumn(
    @Headers() headers: Record<string, string>,
    @Body('tableName') tableName: string,
    @Body('columnName') columnName: string,
    @Body('columnType') columnType: string,
  ) {
    this.checkAuth(headers);
    return this.adminService.addColumn(tableName, columnName, columnType);
  }

  @Post('schema/delete-table')
  async deleteTable(
    @Headers() headers: Record<string, string>,
    @Body('tableName') tableName: string,
  ) {
    this.checkAuth(headers);
    return this.adminService.deleteTable(tableName);
  }

  @Post('schema/delete-column')
  async deleteColumn(
    @Headers() headers: Record<string, string>,
    @Body('tableName') tableName: string,
    @Body('columnName') columnName: string,
  ) {
    this.checkAuth(headers);
    return this.adminService.deleteColumn(tableName, columnName);
  }

  // ─── TIKTOK SUBMISSIONS ─────────────────────────────────────────────

  @Get('tiktok')
  async getTiktokSubmissions(
    @Headers() headers: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.checkAuth(headers);
    return this.adminService.getTiktokSubmissions(page, limit);
  }

  @Post('tiktok/:id/approve')
  async approveTiktok(
    @Headers() headers: Record<string, string>,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.checkAuth(headers);
    return this.adminService.approveTiktokSubmission(id);
  }

  @Post('tiktok/:id/reject')
  async rejectTiktok(
    @Headers() headers: Record<string, string>,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    this.checkAuth(headers);
    return this.adminService.rejectTiktokSubmission(id, reason);
  }
}
