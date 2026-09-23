import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  tenantCode: string;

  @IsString()
  username: string;

  @IsString()
  @MinLength(3)
  password: string;
}
