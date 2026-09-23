import { Module } from '@nestjs/common';
import { ImportExportService } from './import-export.service';

@Module({
  providers: [ImportExportService],
  exports: [ImportExportService],
})
export class ImportExportModule {}
