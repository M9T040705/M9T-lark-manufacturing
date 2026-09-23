import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { NotificationService } from './notification.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private notify: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.notify.list(user.tenantId, user.userId, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notify.unreadCount(user.tenantId, user.userId);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notify.markRead(user.tenantId, user.userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notify.markAllRead(user.tenantId, user.userId);
  }
}
