import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() spec?: string;
  @IsOptional() @IsIn(['raw', 'semi', 'finished']) type?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) safetyStock?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) price?: number;
  @IsOptional() @IsString() drawing?: string;
}

export class BomItemDto {
  @IsString() materialId: string;
  @IsString() materialName: string;
  @IsNumber() @Min(0) @Type(() => Number) qty: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Type(() => Number) sequence?: number;
}

export class BomDto {
  @IsString() bomNo: string;
  @IsString() productId: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsString() processRoute?: string;
  @IsOptional() @IsString() drawing?: string;
  @IsOptional() @IsString() remark?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BomItemDto)
  items: BomItemDto[];
}

export class WorkOrderDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() productName: string;
  @IsOptional() @IsString() spec?: string;
  @IsNumber() @Min(1) @Type(() => Number) qty: number;
  @IsOptional() @IsString() bomId?: string;
  @IsOptional() @IsString() planStart?: string;
  @IsOptional() @IsString() planEnd?: string;
  @IsOptional() @IsString() team?: string;
}

export class AssignDto {
  @IsString() assigneeId: string;
  @IsOptional() @IsString() team?: string;
}

export class ReportDto {
  @IsOptional() @IsString() process?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) workHours?: number;
  @IsNumber() @Min(0) @Type(() => Number) goodQty: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) badQty?: number;
  @IsOptional() @IsString() machine?: string;
  @IsOptional() @IsString() batchNo?: string;
}
