import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.guard';
import { CustomerDto, OrderDto, PaymentDto, QuoteDto } from './dto/crm.dto';

@Controller('customers')
@Roles('super_admin', 'boss', 'sales', 'finance')
export class CustomersController {
  constructor(private crm: CrmService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('keyword') keyword?: string, @Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.crm.listCustomers(u, keyword, page, pageSize);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CustomerDto) {
    return this.crm.createCustomer(u, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CustomerDto) {
    return this.crm.updateCustomer(u, id, dto);
  }
}

@Controller('quotes')
@Roles('super_admin', 'boss', 'sales')
export class QuotesController {
  constructor(private crm: CrmService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.crm.listQuotes(u);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: QuoteDto) {
    return this.crm.createQuote(u, dto);
  }

  @Post(':id/to-order')
  toOrder(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('deliveryDate') deliveryDate?: string) {
    return this.crm.quoteToOrder(u, id, deliveryDate);
  }
}

@Controller('orders')
@Roles('super_admin', 'boss', 'sales', 'manager', 'finance')
export class OrdersController {
  constructor(private crm: CrmService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('keyword') keyword?: string) {
    return this.crm.listOrders(u, status, keyword);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: OrderDto) {
    return this.crm.createOrder(u, dto);
  }

  @Patch(':id/status')
  status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('status') status: string) {
    return this.crm.updateOrderStatus(u, id, status);
  }
}

@Controller('payments')
@Roles('super_admin', 'boss', 'finance')
export class PaymentsController {
  constructor(private crm: CrmService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.crm.listPayments(u);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: PaymentDto) {
    return this.crm.createPayment(u, dto);
  }

  @Post(':id/paid')
  paid(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('paidAmount') paidAmount: number) {
    return this.crm.markPaid(u, id, paidAmount);
  }
}
