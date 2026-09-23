import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.guard';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';

@Controller('users')
@Roles('super_admin', 'boss', 'hr')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }

  @Post(':id/reset-password')
  reset(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(user, id, dto.password);
  }
}
