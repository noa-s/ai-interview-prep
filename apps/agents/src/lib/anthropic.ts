import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '../env.js';

export const anthropic = createAnthropic({
  apiKey: env.ANTHROPIC_AUTH_TOKEN,
  ...(env.ANTHROPIC_BASE_URL && { baseURL: env.ANTHROPIC_BASE_URL }),
});
