import { Module } from '@nestjs/common';
import { BiService } from './bi.service';
import { BiController } from './bi.controller';

@Module({
  controllers: [BiController],
  providers: [BiService],
})
export class BiModule {}
