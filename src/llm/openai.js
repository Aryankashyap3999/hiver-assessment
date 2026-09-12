import OpenAI from 'openai';
import { config } from './config.js';

export class OpenAIAdapter {
  constructor() {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async generateStructured({ messages, schema, schemaName = 'response' }) {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, schema, strict: true },
      },
    });

    return JSON.parse(completion.choices[0].message.content);
  }
}
