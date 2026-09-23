import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.guard';
import { MesService } from './mes.service';
import { AssignDto, BomDto, ProductDto, ReportDto, WorkOrderDto } from './dto/mes.dto';

@Controller('products')
@Roles('super_admin', 'boss', 'manager', 'warehouse', 'sales')
export class ProductsController {
  constructor(private mes: MesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('type') type?: string, @Query('keyword') keyword?: string) {
    return this.mes.listProducts(u, type, keyword);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: ProductDto) {
    return this.mes.createProduct(u, dto);
  }
}

@Controller('boms')
@Roles('super_admin', 'boss', 'manager')
export class BomsController {
  constructor(private mes: MesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.mes.listBoms(u);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.mes.getBom(u, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: BomDto) {
    return this.mes.createBom(u, dto);
  }
}

@Controller('work-orders')
@Roles('super_admin', 'boss', 'manager', 'worker', 'quality')
export class WorkOrdersController {
  constructor(private mes: MesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.mes.listWorkOrders(u, status);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: WorkOrderDto) {
    return this.mes.createWorkOrder(u, dto);
  }

  @Post('from-order/:orderId')
  fromOrder(@CurrentUser() u: AuthUser, @Param('orderId') orderId: string, @Body() dto: Partial<WorkOrderDto>) {
    return this.mes.createFromOrder(u, orderId, dto);
  }

  @Post(':id/assign')
  assign(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.mes.assign(u, id, dto);
  }

  @Post(':id/report')
  report(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReportDto) {
    return this.mes.report(u, id, dto);
  }
}

@Controller('work-reports')
@Roles('super_admin', 'boss', 'manager', 'worker')
export class WorkReportsController {
  constructor(private mes: MesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.mes.listReports(u);
  }
}
