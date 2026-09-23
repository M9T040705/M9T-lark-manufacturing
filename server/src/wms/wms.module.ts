import { Module } from '@nestjs/common';
import { WmsService } from './wms.service';
import { InventoryController, StockMovesController } from './wms.controller';
import { FeishuModule } from '../feishu/feishu.module';

@Module({
  imports: [FeishuModule],
  controllers: [InventoryController, StockMovesController],
  providers: [WmsService],
  exports: [WmsService],
})
export class WmsModule {}
