const REQUIRED_VARS = ['AGENTS_SERVICE_URL'] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[api] Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

export const env = {
  AGENTS_SERVICE_URL: process.env['AGENTS_SERVICE_URL'] as string,
  PORT: Number(process.env['API_PORT'] ?? process.env['PORT'] ?? 3003),
};
