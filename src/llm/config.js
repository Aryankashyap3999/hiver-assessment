try {
  process.loadEnvFile();
} catch {
  // no .env file present; rely on environment variables being set directly
}

export const config = {
  provider: process.env.LLM_PROVIDER || 'openai',
  model: process.env.LLM_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
};
