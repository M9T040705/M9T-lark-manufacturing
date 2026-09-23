import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export const APPROVAL_TYPES = ['leave', 'overtime', 'purchase', 'pick', 'scrap', 'order_change', 'expense'];

export class ApprovalDto {
  @IsIn(APPROVAL_TYPES)
  type: string;

  @IsString() title: string;

  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class DecisionDto {
  @IsOptional() @IsString() comment?: string;
}
