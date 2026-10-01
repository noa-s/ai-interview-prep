# CV Helper App — Core Architecture & AI Mandates

This file serves as the strict operational directive for all AI assistants working on this codebase. These guidelines must never be overwritten, ignored, or compromised during feature iteration.

## 1. System Architecture & Boundaries
* **Strict Monorepo Isolation:** * `/apps/web` (Frontend): Solely handles UI forms, local client states, and client-side PDF compilation. **Zero AI prompting logic lives here.**
  * `/apps/api` (Backend): Solely handles authentication, user profile database operations, rate-limiting, and native file parsing (raw text extraction). 
  * `/apps/agents` (AI Workers): Fully isolated, **stateless** microservices executing prompt engineering pipelines.
* **State Management:** The backend database is the single source of truth. The AI agents are completely stateless—no historical memory sessions, no direct database reads/writes.

## 2. Low-Token & Performance Controls
* **No Layouts via AI:** The AI must never generate HTML, Markdown, CSS, or dictate visual paddings/margins. All layout structures are strictly written in the frontend application code. The AI only consumes and returns raw, unformatted text strings or strict JSON strings matching the schema.
* **Model Tiering Strategy:**
  * **Tier 1 (Cheap/Fast - e.g., Claude 3.5 Haiku / GPT-4o-mini):** Must be used for 90% of routine actions (parsing raw text, optimizing individual bullet points).
  * **Tier 2 (Premium - e.g., Claude 3.5 Sonnet):** Used *exclusively* for the Professional Summary section.
* **Interaction Trigger:** AI execution must be event-driven via explicit user interactions (button clicks). Never trigger automated AI processes on keypresses or text inputs.

## 3. Tech Stack & Data Guardrails
* **Package Management:** Managed via `pnpm` workspaces.
* **Agent Framework:** Built using the provider-agnostic **Vercel AI SDK** (`ai` package).
* **Schema Validation:** Every data transfer mapping to a CV format must strictly enforce the shared schema (`/packages/shared-types`) via `zod` and the Vercel SDK's `generateObject` mechanism.
* **Resiliency Rule:** All agent execution blocks must include an automated retry loop (maximum 2 attempts) handling schema validation errors natively by passing the schema error trace back into the fallback LLM layer.

## 4. Product & Formatting Standards
* **The CV Formula:** Professional experience bullet points must strictly follow the accomplishment framework: `[Action Verb] + [Context/What you did] + [Measurable Result]`. Keep optimizations brief and under 25 words.
* **Design Mandate:** The layout utilizes clean typography and generous whitespace over heavy graphical elements. Do not implement progress/skill bars, complex nested multi-column tables, or graphics.