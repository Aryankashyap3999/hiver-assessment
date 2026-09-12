import { config } from './config.js';
import { OpenAIAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';

let cachedAdapter = null;

export function createLLMAdapter() {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  switch (config.provider) {
    case 'openai':
      cachedAdapter = new OpenAIAdapter();
      break;
    case 'gemini':
      cachedAdapter = new GeminiAdapter();
      break;
    default:
      throw new Error(`Unsupported LLM_PROVIDER: "${config.provider}"`);
  }

  return cachedAdapter;
}
