import { config } from './config.js';
import { OpenAIAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';

export function createLLMAdapter() {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter();
    case 'gemini':
      return new GeminiAdapter();
    default:
      throw new Error(`Unsupported LLM_PROVIDER: "${config.provider}"`);
  }
}
