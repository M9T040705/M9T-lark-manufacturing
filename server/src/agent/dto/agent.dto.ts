import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class AgentChatDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsBoolean()
  thinking?: boolean; // 深度思考模式
}

export class DepartmentDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  feishuChatId?: string;

  @IsOptional()
  @IsString()
  feishuWebhook?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class DataSourceDto {
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  feishuAppToken?: string;

  @IsOptional()
  @IsString()
  feishuTableId?: string;

  @IsOptional()
  @IsString()
  feishuViewId?: string;

  @IsOptional()
  @IsString()
  syncKeyField?: string;

  @IsOptional()
  @IsString()
  config?: string;
}
