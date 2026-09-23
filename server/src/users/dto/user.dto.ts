import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const ROLES = [
  'super_admin',
  'boss',
  'sales',
  'manager',
  'worker',
  'warehouse',
  'quality',
  'hr',
  'finance',
];

export class CreateUserDto {
  @IsString() @MinLength(2)
  username: string;

  @IsString() @MinLength(2)
  name: string;

  @IsIn(ROLES)
  role: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString()
  password?: string;

  // 仅超级管理员创建跨租户用户时使用
  @IsOptional() @IsString()
  tenantId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(ROLES) role?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ResetPasswordDto {
  @IsString() @MinLength(6)
  password: string;
}
