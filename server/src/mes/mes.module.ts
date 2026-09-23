import { Module } from '@nestjs/common';
import { MesService } from './mes.service';
import { BomsController, ProductsController, WorkOrdersController, WorkReportsController } from './mes.controller';
import { FeishuModule } from '../feishu/feishu.module';

@Module({
  imports: [FeishuModule],
  controllers: [ProductsController, BomsController, WorkOrdersController, WorkReportsController],
  providers: [MesService],
  exports: [MesService],
})
export class MesModule {}
