import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsIn(['end', 'dealer']) type?: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() settlementType?: string;
  @IsOptional() @IsString() billingCycle?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() remark?: string;
}

export class QuoteDto {
  @IsString() customerId: string;
  @IsOptional() @IsString() productId?: string;
  @IsString() productName: string;
  @IsOptional() @IsString() spec?: string;
  @IsNumber() @Min(1) @Type(() => Number) qty: number;
  @IsNumber() @Min(0) @Type(() => Number) unitPrice: number;
  @IsOptional() @IsString() remark?: string;
}

export class OrderDto {
  @IsString() customerId: string;
  @IsOptional() @IsString() quoteId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsString() productName: string;
  @IsOptional() @IsString() spec?: string;
  @IsNumber() @Min(1) @Type(() => Number) qty: number;
  @IsNumber() @Min(0) @Type(() => Number) unitPrice: number;
  @IsOptional() @IsString() deliveryDate?: string;
  @IsOptional() @IsString() remark?: string;
}

export class PaymentDto {
  @IsString() customerId: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() period?: string;
  @IsNumber() @Min(0) @Type(() => Number) amount: number;
  @IsOptional() @IsString() payDate?: string;
}
