# AI Interview Prep — CV Helper Monorepo

A high-performance, cost-effective CV Helper Web Application using Turborepo + pnpm workspaces.

## Architecture

```
ai-interview-prep/
├── apps/
│   ├── web/          # Next.js 14 App Router frontend
│   ├── api/          # Express Node.js backend
│   └── agents/       # Vercel AI SDK stateless microservices
└── packages/
    └── shared-types/ # Zod schemas + TypeScript interfaces
```

## Getting Started

> **ZoomInfo employees:** your global `~/.npmrc` routes traffic through the internal Artifactory registry, which is unreachable for personal projects. Create a project-level `.npmrc` override before installing:
>
> ```bash
> echo "registry=https://registry.npmjs.org/" > .npmrc
> ```

```bash
# Install/update Node.js 22+ (corepack 0.35+ requires Node >=22)
# Using nvm:
nvm install 22
nvm use 22

# Update corepack and activate pnpm
npm install -g corepack@latest
corepack prepare pnpm@9.15.0 --activate

# Install dependencies
pnpm install

# Copy environment variables and fill in the required values
cp .env.example .env

# Build all packages (required before dev — agents/api need shared-types dist/)
pnpm build

# Run all apps in dev mode
pnpm dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:
- `ANTHROPIC_AUTH_TOKEN` — Anthropic API key (sent as `x-api-key`)
- `ANTHROPIC_BASE_URL` — Anthropic API base URL (default: `https://api.anthropic.com/v1`)
- `OPENAI_API_KEY` — OpenAI API key (fallback AI provider)
- `GOOGLE_GENERATIVE_AI_API_KEY` — Google Gemini API key (optional tertiary)
- `AGENTS_SERVICE_URL` — URL where the agents microservice listens
- `API_PORT` — API server port (default: 3003)
- `PORT` — Frontend dev server port (default: 3005)
- `AGENTS_PORT` — Agents service port (default: 3002)

## Adding a New Package

1. Create the directory under `apps/` or `packages/`
2. Add a `package.json` with the appropriate `name`, `build`, and `type-check` scripts
3. Add the package to `pnpm-workspace.yaml` (already covered by `apps/*`/`packages/*` globs)
4. Reference it from other packages using `workspace:*` in `dependencies`
