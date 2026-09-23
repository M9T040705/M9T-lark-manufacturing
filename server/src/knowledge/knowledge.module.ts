import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { EmbeddingService } from './embedding.service';
import { DocParserService } from './doc-parser.service';

@Module({
  providers: [KnowledgeService, EmbeddingService, DocParserService],
  controllers: [KnowledgeController],
  exports: [KnowledgeService, EmbeddingService, DocParserService],
})
export class KnowledgeModule {}
