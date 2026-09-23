import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CustomersController, OrdersController, PaymentsController, QuotesController } from './crm.controller';

@Module({
  controllers: [CustomersController, QuotesController, OrdersController, PaymentsController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
