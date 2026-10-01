import { generateObject } from 'ai';
import { anthropic } from '../lib/anthropic.js';
import { ZodError } from 'zod';
import { CvDocumentSchema, type CvDocument } from '@cv-helper/shared-types';

const PARSER_SYSTEM_PROMPT = `You are a precise resume data extraction engine. You receive raw, messy text extracted from an uploaded CV or resume document.

Your sole task is accurate data extraction. Map the text cleanly into the required JSON schema structure.

Rules:
- Extract ALL information present — never invent or hallucinate data not in the source text.
- If a field is absent from the source text, omit it or use the schema default.
- Do NOT polish, upgrade, or alter the candidate's phrasing during this step. Keep their raw descriptions intact so they can be modularly polished later by separate features.
- For "bullets" under each experience entry, extract each responsibility as-is from the source text. Do not rephrase.
- For "dates", use human-readable strings exactly as they appear in the source (e.g., "Jan 2022", "2019–2023", "Present").
- For "skills", extract them as a flat array of individual skill strings.
- For "headline", extract the candidate's job title or professional headline as it appears at the top of the CV (e.g. "Senior Software Engineer", "Product Manager"). This is typically a single line directly below the name. If absent, omit or return empty string.
- For "tagline", extract any short descriptor or area-of-expertise list that appears below the headline (e.g. "Distributed Systems | Cloud Platforms | AI Systems"). If absent, omit or return empty string.
- For "location" inside contactInfo, extract the country only — do NOT include the city or region. If the source says "Tel Aviv, Israel" or "New York, USA", extract "Israel" or "USA" respectively.
- Output MUST conform exactly to the provided JSON schema. No extra keys, no missing required keys.

ABSOLUTE COVERAGE MANDATE: 100% of the usable text in the raw resume dump MUST be accounted for in the output JSON. It is strictly forbidden to discard any paragraph, phrase, bullet point, or section — regardless of how unusual or non-standard the heading is.

ORPHANED SECTION CAPTURE (droppedContentAudit):
After populating the structured fields (contactInfo, headline, tagline, professionalSummary, skills, experience, education), you MUST systematically audit every heading and body block in the raw text against what you have written into those fields.

For EVERY section or block of text that does not belong to the standard structured fields, add one entry to the droppedContentAudit array with the following shape:

{
  "sectionTitle": "<exact heading from the source>",
  "rawContentText": "<complete verbatim text — do NOT truncate or rephrase>",
  "analysis": {
    "status": "<integrated OR missing>",
    "matchedLocation": "<string — only if status is integrated>",
    "suggestedTargetField": "<professionalSummary | skills | professionalExperience — only if status is missing>",
    "justification": "<1-2 sentence explanation of your decision>"
  }
}

CASE 1 — ALREADY INTEGRATED (status: "integrated"):
If the semantic meaning, key metrics, or core keywords of the dropped section are already captured inside any of the structured fields you populated (experience bullets, professional summary, skills), set status to "integrated". Populate matchedLocation with a human-readable location string such as "Professional Experience at TechCorp (2020–2022)" or "Professional Summary". Leave suggestedTargetField absent. Write a brief justification explaining where you found the matching content.

CASE 2 — MISSING CONTENT (status: "missing"):
If the content is valuable but NOT present in any structured field, set status to "missing". Determine which single standard field is best suited to absorb this content and set suggestedTargetField to one of: "professionalSummary", "skills", or "professionalExperience". Leave matchedLocation absent. Write a brief justification explaining what the content is and why you chose that target field.

ROUTING HEURISTICS for suggestedTargetField:
- "skills": Use when the content is a list of tools, technologies, competencies, certifications, or languages.
- "professionalSummary": Use when the content is a narrative paragraph, an executive bio, a mission statement, or a high-level career overview.
- "professionalExperience": Use when the content is a project, an accomplishment statement, a metrics-heavy impact block, or any structured list of deliverables associated with a specific role or initiative.

ZERO DATA LOSS IS MANDATORY. Every section or block of text in the source that does not map perfectly to contactInfo, headline, tagline, professionalSummary, skills, experience, or education MUST appear in droppedContentAudit with a fully populated analysis object. Silently discarding any content is a critical failure. The analysis.justification field is ALWAYS required — never leave it empty or absent.`;

const ParserCvSchema = CvDocumentSchema.omit({ scoreAudit: true });
type ParserCvOutput = import('zod').infer<typeof ParserCvSchema>;

async function parseWithModel(
  model: Parameters<typeof generateObject>[0]['model'],
  rawText: string,
  priorError?: string,
): Promise<CvDocument> {
  const prompt = priorError
    ? `The previous parse attempt failed schema validation with this error:\n${priorError}\n\nPlease correct the output.\n\n---\nRAW CV TEXT:\n${rawText}`
    : `Parse the following raw CV text into the required JSON structure.\n\n---\nRAW CV TEXT:\n${rawText}`;

  const { object } = await generateObject({
    model,
    schema: ParserCvSchema,
    system: PARSER_SYSTEM_PROMPT,
    prompt,
    maxRetries: 2,
  });

  return object;
}

export async function parseCvText(rawText: string): Promise<CvDocument> {
  const MAX_RETRIES = 2;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      try {
        return await parseWithModel(
          anthropic('policy/zoominfo-general'),
          rawText,
          lastError,
        );
      } catch (primaryErr) {
        if (primaryErr instanceof ZodError) {
          throw primaryErr;
        }
        console.warn('[parser] Primary model failed, falling back:', primaryErr instanceof Error ? primaryErr.message.slice(0, 120) : String(primaryErr));
        return await parseWithModel(
          anthropic('policy/haiku-general'),
          rawText,
          lastError,
        );
      }
    } catch (err) {
      // Extract ZodError whether it was thrown directly or wrapped in NoObjectGeneratedError
      const zodErr = err instanceof ZodError
        ? err
        : (err instanceof Error && err.cause instanceof ZodError ? err.cause : null);

      if (zodErr) {
        lastError = zodErr.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        console.warn(`[parser] Schema validation failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError}`);
        if (attempt === MAX_RETRIES - 1) {
          throw new Error(`CV parsing failed after ${MAX_RETRIES} attempts. Last validation error: ${lastError}`);
        }
        continue;
      }
      throw err;
    }
  }

  throw new Error('CV parsing failed: exhausted all retries');
}
