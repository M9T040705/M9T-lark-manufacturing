import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, AuthUser, Public } from '../common/current-user.decorator';
import { Roles } from '../common/roles.guard';
import { FeishuService } from './feishu.service';
import { FeishuConfigDto, SsoDto, WebhookDto } from './dto/feishu.dto';

@Controller('feishu')
export class FeishuController {
  constructor(private feishu: FeishuService) {}

  @Get('config')
  @Roles('super_admin', 'boss')
  getConfig(@CurrentUser() u: AuthUser) {
    return this.feishu.getConfig(u);
  }

  @Put('config')
  @Roles('super_admin', 'boss')
  putConfig(@CurrentUser() u: AuthUser, @Body() dto: FeishuConfigDto) {
    return this.feishu.upsertConfig(u, dto);
  }

  // 登录前公开：按企业编码获取 SSO 开关与 appId（不含密钥）
  @Public()
  @Get('public-config')
  publicConfig(@Query('tenantCode') tenantCode: string) {
    return this.feishu.getPublicConfig(tenantCode || '');
  }

  @Public()
  @Post('sso')
  sso(@Body() dto: SsoDto) {
    return this.feishu.sso(dto.code, dto.tenantCode);
  }

  @Post('webhook-test')
  @Roles('super_admin', 'boss')
  test(@CurrentUser() u: AuthUser, @Body() dto: WebhookDto) {
    return this.feishu.sendWebhook(u.tenantId as string, dto.text);
  }

  // 飞书事件订阅回调（无需登录）
  @Public()
  @Post('event/:tenantId')
  event(@Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.feishu.handleEvent(tenantId, body);
  }
}
