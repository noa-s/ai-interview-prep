# API Architecture & Security Mandates — /apps/api

This file defines the strict backend engineering and data-handling rules for the Next.js/Fastify/Express server. AI assistants must adhere to these rules without exception.

## 1. Zero-Token Data Extraction Rules
* **No Multimodal AI for Files:** The API must never send raw binary PDF or DOCX files directly to an LLM vision or multimodal model. 
* **Native-First Parsing:** Document text extraction must be performed entirely locally on the server using open-source, cost-free libraries (`pdf-parse` for PDFs, `mammoth` for DOCX). 
* **Data Sanitization:** Extracted text must be aggressively sanitized (removing null bytes, hidden control characters, and excess whitespace) before being forwarded to `/apps/agents`. This protects your prompt context windows and slashes token consumption.

## 2. Stateless Gateway Rules
* **No Prompt Pollution:** System prompts and AI engineering instructions must *never* live in this backend package. The API layer treats AI interaction as a pure network request to the stateless `/apps/agents` microservice.
* **Rate-Limiting & Cost Guards:** Every AI-dependent route (e.g., `/api/cv/upload`, `/api/cv/optimize-bullet`) must be backed by a strict rate-limiting middleware (IP-based or token-bucket). This prevents programmatic loops from exhausting your API budget.

## 3. Schema & Validation Hardening
* **Fail-Safe Type Inference:** Every inbound and outbound payload representing a CV dataset must be strictly validated at the API runtime layer using the shared Zod schema from `@packages/shared-types`.
* **Graceful Degradation:** If an upload fails native text extraction, or if the AI agent returns an error, the API must return a structured error response (e.g., `{ error: "PARSE_FAILED", message: "..." }`) with an appropriate HTTP status code (400 or 500). The server process must never be allowed to crash.