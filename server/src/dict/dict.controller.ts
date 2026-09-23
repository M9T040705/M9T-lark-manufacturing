import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DictService } from './dict.service';

@UseGuards(JwtAuthGuard)
@Controller('dict')
export class DictController {
  constructor(private dict: DictService) {}

  @Get('types')
  listTypes(@CurrentUser() user: AuthUser) {
    return this.dict.listTypes(user.tenantId);
  }

  @Post('types')
  createType(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.dict.createType(user.tenantId, dto);
  }

  @Get('items/:typeCode')
  listItems(@CurrentUser() user: AuthUser, @Param('typeCode') typeCode: string) {
    return this.dict.listItems(user.tenantId, typeCode);
  }

  @Post('items/:typeCode')
  createItem(@CurrentUser() user: AuthUser, @Param('typeCode') typeCode: string, @Body() dto: any) {
    return this.dict.createItem(user.tenantId, typeCode, dto);
  }

  @Patch('items/:id')
  updateItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.dict.updateItem(user.tenantId, id, dto);
  }

  @Delete('items/:id')
  removeItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dict.removeItem(user.tenantId, id);
  }
}
