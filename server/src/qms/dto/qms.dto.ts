import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DefectDto {
  @IsString() category: string;
  @IsNumber() @Min(0) @Type(() => Number) qty: number;
  @IsOptional() @IsIn(['rework', 'scrap', 'accept']) handle?: string;
  @IsOptional() @IsString() note?: string;
}

export class InspectionDto {
  @IsIn(['incoming', 'process', 'final'])
  type: string;

  @IsOptional() @IsString() workOrderId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() batchNo?: string;

  @IsNumber() @Min(0) @Type(() => Number) qty: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) defectQty?: number;
  @IsIn(['pass', 'fail']) result: string;
  @IsOptional() @IsString() remark?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DefectDto)
  defects?: DefectDto[];
}

export class HandleDefectDto {
  @IsIn(['rework', 'scrap', 'accept'])
  handle: string;

  @IsOptional() @IsString() note?: string;
  @IsOptional() closed?: boolean;
}
