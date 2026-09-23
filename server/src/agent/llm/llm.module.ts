import { Module } from '@nestjs/common';
import { LlmProvider } from '../agent.types';
import { OpenAICompatibleProvider } from './openai.compatible';
import { RuleBasedProvider } from './rule.based';

export const LLM_PROVIDER = 'LLM_PROVIDER';

const providerFactory = {
  provide: LLM_PROVIDER,
  useFactory: (): LlmProvider & { model?: string } => {
    const apiKey = process.env.LLM_API_KEY || '';
    const baseUrl = process.env.LLM_BASE_URL || '';
    const model = process.env.LLM_MODEL || '';
    const timeout = Number(process.env.LLM_TIMEOUT || 30);
    if (apiKey && baseUrl && model) {
      const p = new OpenAICompatibleProvider(baseUrl, apiKey, model, timeout);
      return Object.assign(p, { model });
    }
    return new RuleBasedProvider();
  },
};

@Module({
  providers: [providerFactory, RuleBasedProvider],
  exports: [LLM_PROVIDER, RuleBasedProvider],
})
export class LlmModule {}
