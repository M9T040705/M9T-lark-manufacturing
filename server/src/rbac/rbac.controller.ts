import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { RbacService } from './rbac.service';

@UseGuards(JwtAuthGuard)
@Controller('rbac')
export class RbacController {
  constructor(private rbac: RbacService) {}

  @Get('permissions')
  listPermissions() {
    return this.rbac.listPermissions();
  }

  @Get('roles')
  listRoles(@CurrentUser() user: AuthUser) {
    return this.rbac.listRoles(user.tenantId);
  }

  @Post('roles')
  createRole(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.rbac.createRole(user.tenantId, dto);
  }

  @Patch('roles/:id')
  updateRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.rbac.updateRole(user.tenantId, id, dto);
  }

  @Get('my-permissions')
  async myPermissions(@CurrentUser() user: AuthUser) {
    const perms = await this.rbac.getUserPermissions(user.tenantId, user.role);
    return Array.from(perms);
  }
}
