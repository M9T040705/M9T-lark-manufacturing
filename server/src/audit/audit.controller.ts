import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get('logs')
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.audit.list(user.tenantId, query);
  }
}
