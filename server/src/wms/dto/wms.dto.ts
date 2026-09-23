import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StockMoveDto {
  @IsIn(['in', 'out', 'pick'])
  type: string;

  @IsString() productId: string;

  @IsNumber() @Min(0.01) @Type(() => Number)
  qty: number;

  @IsOptional() @IsString() batchNo?: string;
  @IsOptional() @IsString() warehouse?: string;
  @IsOptional() @IsString() refType?: string;
  @IsOptional() @IsString() refNo?: string;
  @IsOptional() @IsString() remark?: string;
}
