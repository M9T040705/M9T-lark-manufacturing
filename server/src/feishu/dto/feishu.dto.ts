import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class FeishuConfigDto {
  @IsOptional() @IsString() appId?: string;
  @IsOptional() @IsString() appSecret?: string;
  @IsOptional() @IsString() verifyToken?: string;
  @IsOptional() @IsString() encryptKey?: string;
  @IsOptional() @IsString() webhook?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() ssoEnabled?: boolean;
}

export class SsoDto {
  @IsString() code: string;
  @IsString() tenantCode: string;
  @IsOptional() @IsString() state?: string;
}

export class WebhookDto {
  @IsString() text: string;
}
