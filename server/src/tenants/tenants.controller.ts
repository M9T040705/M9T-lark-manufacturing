import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { TenantsService } from './tenants.service';
import { Roles } from '../common/roles.guard';
import { Public } from '../common/current-user.decorator';

class CreateTenantDto {
  @IsString() @MinLength(2)
  code: string;

  @IsString() @MinLength(2)
  name: string;

  @IsOptional() @IsString()
  contact?: string;

  @IsOptional() @IsString()
  phone?: string;
}

class RegisterDto {
  @IsString() @MinLength(2)
  tenantCode: string;

  @IsString() @MinLength(2)
  tenantName: string;

  @IsString() @MinLength(3)
  adminUsername: string;

  @IsString() @MinLength(2)
  adminName: string;

  @IsString() @MinLength(6)
  adminPassword: string;

  @IsOptional() @IsString()
  contact?: string;

  @IsOptional() @IsString()
  phone?: string;
}

@Controller('tenants')
export class TenantsController {
  constructor(private tenants: TenantsService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.tenants.selfRegister(dto);
  }

  @Get()
  @Roles('super_admin')
  list() {
    return this.tenants.list();
  }

  @Post()
  @Roles('super_admin')
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }
}
