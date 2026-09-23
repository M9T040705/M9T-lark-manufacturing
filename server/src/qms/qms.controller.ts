import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.guard';
import { QmsService } from './qms.service';
import { HandleDefectDto, InspectionDto } from './dto/qms.dto';

@Controller('inspections')
@Roles('super_admin', 'boss', 'manager', 'quality')
export class InspectionsController {
  constructor(private qms: QmsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('type') type?: string, @Query('result') result?: string) {
    return this.qms.list(u, type, result);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: InspectionDto) {
    return this.qms.create(u, dto);
  }

  @Get('defects')
  defects(@CurrentUser() u: AuthUser, @Query('closed') closed?: string) {
    return this.qms.listDefects(u, closed);
  }

  @Post('defects/:id/handle')
  handle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: HandleDefectDto) {
    return this.qms.handleDefect(u, id, dto);
  }
}
