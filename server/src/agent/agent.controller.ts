import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.guard';
import { AgentService } from './agent.service';
import { AgentChatDto, DataSourceDto, DepartmentDto } from './dto/agent.dto';

@Controller('agent')
export class AgentController {
  constructor(private agent: AgentService) {}

  // 当前部门与可查询范围（前端顶部/快捷问题）
  @Get('scope')
  scope(@CurrentUser() u: AuthUser) {
    return this.agent.currentScope(u);
  }

  // 提问
  @Post('chat')
  chat(@CurrentUser() u: AuthUser, @Body() dto: AgentChatDto) {
    return this.agent.chat(u, dto);
  }

  // 会话历史
  @Get('conversations')
  conversations(@CurrentUser() u: AuthUser) {
    return this.agent.listConversations(u.tenantId, u.userId);
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.agent.getConversation(u.tenantId, u.userId, id);
  }

  // ---------- 部门与群配置（仅老板/超管） ----------

  @Roles('boss', 'super_admin')
  @Get('departments')
  departments(@CurrentUser() u: AuthUser) {
    return this.agent.listDepartments(u.tenantId);
  }

  @Roles('boss', 'super_admin')
  @Post('departments')
  createDepartment(@CurrentUser() u: AuthUser, @Body() dto: DepartmentDto) {
    return this.agent.createDepartment(u.tenantId, dto);
  }

  @Roles('boss', 'super_admin')
  @Patch('departments/:id')
  updateDepartment(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: DepartmentDto,
  ) {
    return this.agent.updateDepartment(u.tenantId, id, dto);
  }

  // ---------- 数据源 / 多维表配置（仅老板/超管） ----------

  @Roles('boss', 'super_admin')
  @Get('data-sources')
  dataSources(@CurrentUser() u: AuthUser) {
    return this.agent.listDataSources(u.tenantId);
  }

  // 当前用户可见的多维表数据源（部门隔离，普通用户可用）
  @Get('data-sources/visible')
  visibleDataSources(@CurrentUser() u: AuthUser) {
    return this.agent.listVisibleDataSources(u.tenantId, u);
  }

  @Roles('boss', 'super_admin')
  @Post('data-sources')
  createDataSource(@CurrentUser() u: AuthUser, @Body() dto: DataSourceDto) {
    return this.agent.createDataSource(u.tenantId, dto);
  }

  @Roles('boss', 'super_admin')
  @Patch('data-sources/:id')
  updateDataSource(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: DataSourceDto,
  ) {
    return this.agent.updateDataSource(u.tenantId, id, dto);
  }

  @Roles('boss', 'super_admin')
  @Delete('data-sources/:id')
  removeDataSource(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.agent.removeDataSource(u.tenantId, id);
  }

  // ---------- 群会话记录（部门隔离：总经办全部，其他仅本部门） ----------

  @Get('group-conversations')
  groupConversations(@CurrentUser() u: AuthUser) {
    return this.agent.listGroupConversations(u.tenantId, u);
  }

  @Get('group-conversations/:id/messages')
  groupConversationMessages(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.agent.getGroupConversationMessages(u.tenantId, u, id);
  }

  // ---------- 多维表数据浏览（部门隔离） ----------

  @Get('data-sources/:id/records')
  browseDataSource(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.agent.browseDataSourceRecords(u.tenantId, u, id);
  }

  // ---------- Token 使用统计展板 ----------

  @Get('token-stats')
  tokenStats(@CurrentUser() u: AuthUser) {
    return this.agent.tokenStats(u.tenantId, u);
  }

  // ---------- 对话评价反馈 ----------

  @Post('feedback')
  feedback(@CurrentUser() u: AuthUser, @Body() dto: { messageId: string; rating: number; comment?: string }) {
    return this.agent.createFeedback(u.tenantId, dto);
  }
}
