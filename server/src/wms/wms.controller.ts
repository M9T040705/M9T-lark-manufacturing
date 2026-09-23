import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.guard';
import { WmsService } from './wms.service';
import { StockMoveDto } from './dto/wms.dto';

@Controller('inventory')
@Roles('super_admin', 'boss', 'manager', 'warehouse', 'quality')
export class InventoryController {
  constructor(private wms: WmsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('lowOnly') lowOnly?: string) {
    return this.wms.listInventory(u, lowOnly === 'true' || lowOnly === '1');
  }
}

@Controller('stock-moves')
@Roles('super_admin', 'boss', 'manager', 'warehouse', 'worker')
export class StockMovesController {
  constructor(private wms: WmsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('type') type?: string) {
    return this.wms.listMoves(u, type);
  }

  @Post()
  move(@CurrentUser() u: AuthUser, @Body() dto: StockMoveDto) {
    return this.wms.move(u, dto);
  }
}
