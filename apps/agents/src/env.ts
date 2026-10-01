const REQUIRED_VARS = [
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[agents] Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

export const env = {
  ANTHROPIC_AUTH_TOKEN: process.env['ANTHROPIC_AUTH_TOKEN'] as string,
  ANTHROPIC_BASE_URL: process.env['ANTHROPIC_BASE_URL'],
  OPENAI_API_KEY: process.env['OPENAI_API_KEY'] as string,
  AGENTS_PORT: Number(process.env['AGENTS_PORT'] ?? 3002),
};
