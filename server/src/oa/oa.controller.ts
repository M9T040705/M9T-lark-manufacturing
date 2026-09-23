import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { OaService } from './oa.service';
import { ApprovalDto, DecisionDto } from './dto/oa.dto';

@Controller('approvals')
export class ApprovalsController {
  constructor(private oa: OaService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('scope') scope?: string) {
    return this.oa.list(u, status, scope);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: ApprovalDto) {
    return this.oa.create(u, dto);
  }

  @Post(':id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.oa.approve(u, id, dto.comment);
  }

  @Post(':id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.oa.reject(u, id, dto.comment);
  }
}
