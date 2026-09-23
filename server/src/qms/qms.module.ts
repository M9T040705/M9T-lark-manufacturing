import { Module } from '@nestjs/common';
import { QmsService } from './qms.service';
import { InspectionsController } from './qms.controller';

@Module({
  controllers: [InspectionsController],
  providers: [QmsService],
  exports: [QmsService],
})
export class QmsModule {}
