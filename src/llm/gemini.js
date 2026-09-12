import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

// Free tier: 15 requests/minute. Stay safely under that.
const MIN_REQUEST_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;
// ponytail: fallback when retryDelay can't be parsed from the error body; raise if 429s still exhaust retries in practice.
const FALLBACK_RETRY_DELAY_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(error) {
  try {
    const body = JSON.parse(error.message);
    const retryInfo = body?.error?.details?.find((d) =>
      d['@type']?.includes('RetryInfo')
    );
    const match = retryInfo?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
    if (match) {
      return Math.ceil(parseFloat(match[1]) * 1000);
    }
  } catch {
    // error body wasn't parseable JSON; use fallback below
  }
  return FALLBACK_RETRY_DELAY_MS;
}

export class GeminiAdapter {
  constructor() {
    this.client = new GoogleGenAI({ apiKey: config.geminiApiKey });
    this.model = config.model;
    this.lastRequestAt = 0;
  }

  async pace() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
  }

  async generateStructured({ messages, schema, schemaName }) {
    const systemInstruction =
      messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n') || undefined;

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.pace();
      this.lastRequestAt = Date.now();

      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
          },
        });

        return JSON.parse(response.text);
      } catch (error) {
        const isRateLimited = error?.status === 429;

        if (!isRateLimited || attempt === MAX_RETRIES) {
          throw error;
        }

        const delayMs = parseRetryDelayMs(error);
        console.log(
          `Gemini rate limit hit (retry ${attempt + 1}/${MAX_RETRIES}). Waiting ${Math.round(delayMs / 1000)}s...`
        );
        await sleep(delayMs);
      }
    }
  }
}
