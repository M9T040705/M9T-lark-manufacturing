import { Controller, Get } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { BiService } from './bi.service';

@Controller('bi')
export class BiController {
  constructor(private bi: BiService) {}

  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.bi.overview(u);
  }

  @Get('sales')
  sales(@CurrentUser() u: AuthUser) {
    return this.bi.sales(u);
  }

  @Get('production')
  production(@CurrentUser() u: AuthUser) {
    return this.bi.production(u);
  }
}
