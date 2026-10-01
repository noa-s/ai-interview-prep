import { generateText } from 'ai';
import { z } from 'zod';
import { anthropic } from '../lib/anthropic.js';
import type { CvDocument } from '@cv-helper/shared-types';

export interface TargetJob {
  company?: string;
  title?: string;
  jobDescription?: string;
}

export interface InterviewQuestion {
  id: string;
  category: 'Behavioral' | 'Technical' | 'Systemic' | 'Coding';
  question: string;
  intentHint: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  answerStrategy: {
    interviewerExpectation: string;
    coachingBlueprint: string;
    samplePhrasingStart: string;
  };
}

export interface InterviewResult {
  candidateName: string;
  targetRole: string;
  questions: InterviewQuestion[];
  usage: { promptTokens: number; completionTokens: number; modelUsed: string };
}

const TECHNICAL_ROLE_KEYWORDS = [
  'engineer', 'engineering', 'developer', 'dev', 'software', 'fullstack',
  'full-stack', 'frontend', 'front-end', 'backend', 'back-end',
  'sre', 'devops', 'platform', 'infrastructure', 'data engineer',
  'data scientist', 'ml', 'ai', 'principal', 'staff', 'architect',
  'cto', 'vp engineering', 'tech lead', 'technical lead',
];

function detectTechnicalRole(cvData: CvDocument, targetJob?: TargetJob): boolean {
  const haystack = [
    targetJob?.title ?? '',
    targetJob?.jobDescription?.slice(0, 500) ?? '',
    ...cvData.experience.slice(0, 3).map(e => e.role),
    cvData.professionalSummary?.slice(0, 200) ?? '',
  ].join(' ').toLowerCase();
  return TECHNICAL_ROLE_KEYWORDS.some(kw => haystack.includes(kw));
}

function parseYear(dateStr: string): number {
  const match = dateStr.match(/\d{4}/);
  return match ? parseInt(match[0], 10) : 0;
}

function buildSystemPrompt(questionsPerBatch: number, batchFocus?: string, includeCoding?: boolean): string {
  const coding = includeCoding ? 1 : 0;
  const behavioral = Math.round(questionsPerBatch * 0.4);
  const technical = Math.round(questionsPerBatch * 0.4) - coding;
  const systemic = questionsPerBatch - behavioral - technical - coding;

  return `You are an elite corporate interview coach. Generate exactly ${questionsPerBatch} high-impact, tailored interview questions based on the candidate's CV and target role. For each question, provide a zero-hallucination answer strategy that coaches the candidate on how to frame their REAL experience — never invent metrics, achievements, or stories.
${batchFocus ? `\nFocus for this batch: ${batchFocus}\n` : ''}
Question mix:
- ${behavioral} Behavioral: probe specific CV achievements, ask for metrics, expand or defend stated impact
- ${technical} Technical: hard, role-specific execution questions based on the candidate's tech stack and experience
- ${systemic} Systemic: culture fit, leadership philosophy, or strategic alignment questions${includeCoding ? `
- ${coding} Coding: LeetCode-style algorithm/data-structure problem OR code review/debugging challenge, directly tied to the candidate's tech stack and most recent experience` : ''}

For each question's answerStrategy:
- interviewerExpectation: one sentence describing what the interviewer is truly evaluating beneath the surface
- coachingBlueprint: 2-3 sentences coaching the candidate on HOW to structure their real memory using STAR (Situation, Task, Action, Result) or CAR frameworks. NEVER invent examples or metrics — direct them to recall their own experience.
- samplePhrasingStart: a strong, confident opening phrase the candidate can adapt (e.g. "In my role at [company], the most impactful example of this was...")

Rules:
- Output ONLY valid JSON — no markdown, no HTML, no code fences, no backticks
- Every behavioral question must reference a specific detail from the CV
- NEVER fabricate metrics, project names, or outcomes not in the CV
- coachingBlueprint must guide the candidate to use their own real story, never provide a fake one${includeCoding ? `
- For Coding questions: set difficulty to "Easy", "Medium", or "Hard" based on seniority implied by the candidate's most recent role. Ground the problem in the specific languages/frameworks from the recent-experience section.` : ''}

Output JSON with this exact shape:
{
  "candidateName": string,
  "targetRole": string,
  "questions": [
    {
      "id": string,
      "category": "Behavioral" | "Technical" | "Systemic" | "Coding",
      "question": string,
      "intentHint": string,
      "answerStrategy": {
        "interviewerExpectation": string,
        "coachingBlueprint": string,
        "samplePhrasingStart": string
      }
    }
  ]
}

Note: for Coding questions only, also include "difficulty": "Easy" | "Medium" | "Hard" as a sibling of "category".`;
}

function extractJson(raw: string): string {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return stripped;
  return stripped.slice(start, end + 1);
}

const InterviewQuestionSchema = z.object({
  id: z.string(),
  category: z.enum(['Behavioral', 'Technical', 'Systemic', 'Coding']),
  question: z.string(),
  intentHint: z.string(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
  answerStrategy: z.object({
    interviewerExpectation: z.string(),
    coachingBlueprint: z.string(),
    samplePhrasingStart: z.string(),
  }),
});

const InterviewResultSchema = z.object({
  candidateName: z.string().optional(),
  targetRole: z.string().optional(),
  questions: z.array(InterviewQuestionSchema),
});

export interface BatchOptions {
  batchNumber?: number;
  questionsPerBatch?: number;
  batchFocus?: string;
  existingQuestions?: string[];
}

export async function generateInterviewPlaybook(
  cvData: CvDocument,
  targetJob?: TargetJob,
  batchOptions?: BatchOptions,
): Promise<InterviewResult> {
  const questionsPerBatch = batchOptions?.questionsPerBatch ?? 4;
  const batchFocus = batchOptions?.batchFocus;
  const existingQuestions = batchOptions?.existingQuestions ?? [];

  const isTechnical = detectTechnicalRole(cvData, targetJob);
  const includeCoding = isTechnical && (batchOptions?.batchNumber ?? 1) >= 2;

  const recentExp = [...cvData.experience]
    .sort((a, b) => parseYear(b.dates.start) - parseYear(a.dates.start))
    .slice(0, 2);

  const candidateName = cvData.contactInfo.name || 'Candidate';
  const targetRole = [targetJob?.title, targetJob?.company].filter(Boolean).join(' at ') || 'General Role';

  const userPrompt = `Candidate: ${candidateName}
Target Role: ${targetRole}
${targetJob?.jobDescription ? `Job Description: ${targetJob.jobDescription}` : ''}

CV Summary:
- Skills: ${cvData.skills.slice(0, 20).join(', ')}
- Experience: ${cvData.experience.map(e => `${e.role} at ${e.company} (${e.dates.start}–${e.dates.end})`).join('; ')}
- Key bullets: ${cvData.experience.flatMap(e => e.bullets).slice(0, 8).join(' | ')}
- Summary: ${cvData.professionalSummary?.slice(0, 400) || 'Not provided'}
${includeCoding ? `
Recent Experience (for Coding questions only — do NOT draw coding questions from older roles):
${recentExp.map(e => `- ${e.role} at ${e.company}: ${e.bullets.slice(0, 3).join(' | ')}`).join('\n')}
Tech stack context: ${cvData.skills.slice(0, 15).join(', ')}` : ''}
${existingQuestions.length > 0 ? `
IMPORTANT — Do NOT repeat or closely paraphrase any of these already-asked questions:
${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
Generate questions on different topics, angles, or CV details not covered above.` : ''}
Generate exactly ${questionsPerBatch} interview questions with answer strategies. Return ONLY valid JSON with no markdown wrapping.`;

  const MAX_ATTEMPTS = 3;
  let lastError = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const prompt = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\nPrevious attempt failed validation: ${lastError}\nPlease output ONLY valid JSON matching the required shape.`;

    const { text, usage } = await generateText({
      model: anthropic('policy/haiku-general'),
      system: buildSystemPrompt(questionsPerBatch, batchFocus, includeCoding),
      prompt,
      temperature: 0.4,
      maxTokens: 16000,
    });

    try {
      const cleaned = extractJson(text);
      const raw = JSON.parse(cleaned) as unknown;
      const result = InterviewResultSchema.safeParse(raw);

      if (!result.success) {
        lastError = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        console.warn(`[interviewer] Attempt ${attempt + 1} schema validation failed: ${lastError}`);
        continue;
      }

      const { data } = result;
      if (!data.questions || data.questions.length === 0) {
        lastError = 'questions array is empty';
        continue;
      }

      return {
        candidateName: data.candidateName || candidateName,
        targetRole: data.targetRole || targetRole,
        questions: data.questions,
        usage: {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          modelUsed: 'policy/haiku-general',
        },
      };
    } catch (parseErr) {
      lastError = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.warn(`[interviewer] Attempt ${attempt + 1} JSON parse failed: ${lastError}`);
    }
  }

  throw new Error(`Interview model failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}`);
}
