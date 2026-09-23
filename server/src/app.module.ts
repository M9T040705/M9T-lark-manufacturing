import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/roles.guard';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { RateLimitMiddleware } from './common/rate-limit.middleware';
import { AuditInterceptor } from './common/audit.interceptor';
import { AuditModule } from './audit/audit.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { CrmModule } from './crm/crm.module';
import { MesModule } from './mes/mes.module';
import { WmsModule } from './wms/wms.module';
import { QmsModule } from './qms/qms.module';
import { OaModule } from './oa/oa.module';
import { BiModule } from './bi/bi.module';
import { FeishuModule } from './feishu/feishu.module';
import { AgentBridgeModule } from './agent/agent-bridge.module';
import { AgentModule } from './agent/agent.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { NotificationModule } from './notification/notification.module';
import { FileModule } from './file/file.module';
import { DictModule } from './dict/dict.module';
import { RbacModule } from './rbac/rbac.module';
import { ImportExportModule } from './import-export/import-export.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'] }),
    PrismaModule,
    AuthModule,
    AuditModule,
    NotificationModule,
    FileModule,
    DictModule,
    RbacModule,
    ImportExportModule,
    SubscriptionModule,
    TenantsModule,
    UsersModule,
    CrmModule,
    MesModule,
    WmsModule,
    QmsModule,
    OaModule,
    BiModule,
    AgentBridgeModule,
    FeishuModule,
    AgentModule,
    KnowledgeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware, RateLimitMiddleware).forRoutes('*');
  }
}
