import { generateText } from 'ai';
import { anthropic } from '../lib/anthropic.js';

export type OptimizeTargetField = 'experienceBullet' | 'professionalSummary' | 'skills';

export interface ChatMessage { role: 'user' | 'assistant'; text: string; }
export interface CvContext { skills: string[]; jobTitles: string[]; }
export interface ChatSummaryResult {
  suggestion: string;
  explanation: string;
  usage: { promptTokens: number; completionTokens: number; modelUsed: string };
}

export interface BulletChatResult {
  suggestion: string;
  explanation: string;
  usage: { promptTokens: number; completionTokens: number; modelUsed: string };
}

export interface ExtractedSummaryData {
  skills: string[];
  experience: string[];
}

export interface OptimizeResult {
  text: string;
  extractedData?: ExtractedSummaryData;
  usage: { promptTokens: number; completionTokens: number; modelUsed: string };
}

const EXPERIENCE_BULLET_PROMPT = `You are a professional CV bullet point optimizer. Your sole task is to rewrite a single raw job responsibility into a polished CV bullet point. You must ALWAYS output a rewritten bullet — never ask for clarification, never explain your reasoning, never output a conversational response.

You MUST follow this formula exactly:
[Action Verb] + [Context / What you did] + [Measurable Result]

Hard constraints:
- Output MUST be under 25 words.
- Begin with a strong past-tense action verb (e.g. Led, Built, Reduced, Increased, Automated, Delivered).
- Include a quantifiable result where one exists in the source. If no metric is present, use a concrete qualitative outcome.
- Do NOT use first-person pronouns (no "I", "my", "we").
- Do NOT add any information not present in the source sentence.
- Do NOT include markdown, bullet symbols, quotation marks, explanations, or conversational filler.
- Return ONLY the rewritten bullet — nothing else.

CRITICAL: You are strictly forbidden from inventing, estimating, or fabricating metrics, business outcomes, numbers, or scale factors (e.g., do NOT invent phrases like "resulting in 10x scalability" or "boosted efficiency by 40%"). If the user's input string does not contain an explicit numeric result, focus the [Result] section of the formula purely on the qualitative logical outcome of the action (e.g., "ensuring clean system deployment stability" or "streamlining workspace file delivery").

IDEMPOTENCY: If the input string already perfectly matches the [Action Verb] + [Context] + [Result] formula and cannot be improved without fabricating details, return the input string exactly as-is without modification.`;

const PROFESSIONAL_SUMMARY_PROMPT = `You are an expert executive resume writer and career coach specializing in high-growth tech industries. Transform the provided CV summary into a highly strategic, impactful, executive-level professional summary.

CRITICAL DATA PRESERVATION RULE:
Do not lose any valuable information. Specific technologies, tools, metrics, percentages, or achievements that are removed from the summary must be preserved in the Extracted Section Data below.

Refactor the summary according to these strict guidelines:
1. Shift from Tasks to Scope: Emphasize scope of ownership, system architecture, and long-term technical strategy. Avoid day-to-day task listings.
2. Remove Keyword Stuffing: Remove dense technology lists (they belong in the Skills section). Group into broader architectural concepts (e.g. "cloud-native infrastructure across AWS/GCP").
3. Abstract the Metrics (Teaser Approach): Do not include specific percentages or raw metrics. Hint at achievements instead (e.g. "Recognized for driving impactful platform improvements through AI-driven automation").
4. Highlight Cross-Functional Influence: Mention collaboration with Product, Data Science, QA, Architects, and Engineering leadership to demonstrate senior/principal-level influence.
5. Use Strong Action Verbs: Start clauses with Leading, Driving, Architecting, Owning, Translating, or Spearheading. Avoid "Responsible for" or "Experienced in." HOWEVER — never use an action verb as a noun to fabricate a title (e.g. do NOT write "Architect of large-scale systems" if the candidate's title is "Senior Software Engineer"). Action verbs describe what the person does, not what they are called.
6. Preserve the Candidate's Actual Title: The summary must reflect the candidate's real job title from the source text. Do NOT promote, elevate, or rename the title. If the source says "Senior Software Engineer", the summary must describe them as a Senior Software Engineer — not as an "Architect", "Principal", "Lead", or any other title not explicitly in the source.
7. No Redundant Tenure Statements: Do NOT mention total years of experience (e.g. "10+ years of experience") if that tenure is already self-evident from the Experience section. Only include a years-of-experience claim if it reflects something genuinely non-obvious — such as unusually early career advancement or experience that predates the listed roles.
8. Short, Punchy Sentences: Each individual sentence must be under 20 words. This is a per-sentence limit — NOT a limit on the total paragraph length. The paragraph should still contain 3-4 full sentences. Avoid long compound clauses chained with commas. One clear idea per sentence.
9. Formatting: A single well-crafted paragraph containing exactly 3-4 sentences. Each sentence under 20 words. No markdown, no bullet symbols, no quotation marks.

Output EXACTLY this format and nothing else:
### Improved Summary
[single paragraph, 3-4 sentences, no markdown]

### Extracted Section Data
- Skills: [specific languages, frameworks, tools stripped from summary, or "none"]
- Experience: [specific metrics, percentages, project wins stripped from summary, or "none"]

CRITICAL: You are strictly forbidden from fabricating skills, timelines, company names, metrics, titles, or any facts not explicitly present in the input. Do NOT invent accomplishments, infer roles, or upgrade the candidate's title. Ground every word in the source text.`;

const SKILLS_PROMPT = `You are a professional resume ATS optimizer. Your sole task is to clean a raw skills block into a pristine, comma-separated list of technical and professional keywords.

Rules:
- Output MUST be a flat comma-separated list. No bullets, no headings, no sentences.
- Remove all narrative phrasing (e.g. "Proficient in", "Experience with", "Knowledge of", "Familiar with").
- Remove duplicates and near-duplicates (e.g. keep "React" not both "React" and "ReactJS").
- Group related tools logically if they naturally belong together (e.g. "AWS, GCP, Azure" before "React, Vue").
- Strip filler words that are not actual skills (e.g. remove "and also have basic knowledge of").
- Do NOT invent, add, or infer skills not explicitly present in the input.
- Return ONLY the cleaned comma-separated list — nothing else.

CRITICAL: You are strictly forbidden from adding any skill, tool, technology, or certification not explicitly named in the input text.
IDEMPOTENCY: If the input is already a clean comma-separated list with no narrative, return it exactly as-is.`;

function getPrompt(targetField: OptimizeTargetField): string {
  if (targetField === 'professionalSummary') return PROFESSIONAL_SUMMARY_PROMPT;
  if (targetField === 'skills') return SKILLS_PROMPT;
  return EXPERIENCE_BULLET_PROMPT;
}

function getUserPrompt(targetField: OptimizeTargetField, rawText: string): string {
  if (targetField === 'professionalSummary') return `Transform this professional summary into an executive-level one:\n${rawText}`;
  if (targetField === 'skills') return `Clean this skills block into a comma-separated list:\n${rawText}`;
  return `Rewrite this CV bullet point (output ONLY the rewritten bullet, nothing else):\n${rawText}`;
}

function getMaxTokens(targetField: OptimizeTargetField): number {
  if (targetField === 'professionalSummary') return 500;
  if (targetField === 'skills') return 200;
  return 80;
}

function extractSummaryParagraph(raw: string): { paragraph: string; extractedData: ExtractedSummaryData } {
  const summaryMatch = raw.match(/###\s*Improved Summary\s*\n+([\s\S]+?)(?=\n###|$)/i);
  const paragraph = summaryMatch
    ? summaryMatch[1].trim()
    : (raw.split(/\n###/)[0].trim() || raw.trim());

  const extractedData: ExtractedSummaryData = { skills: [], experience: [] };

  const skillsMatch = raw.match(/[-*]\s*Skills?\s*:\s*([^\n]+)/i);
  if (skillsMatch) {
    const raw2 = skillsMatch[1].trim();
    if (!/^none$/i.test(raw2)) {
      extractedData.skills = raw2.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    }
  }

  const expMatch = raw.match(/[-*]\s*Experience\s*:\s*([^\n]+(?:\n(?![-*]|\n)[^\n]+)*)/i);
  if (expMatch) {
    const raw2 = expMatch[1].trim();
    if (!/^none$/i.test(raw2)) {
      extractedData.experience = raw2.split(/\n/).map((s) => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
    }
  }

  return { paragraph, extractedData };
}

async function runWithModel(
  model: Parameters<typeof generateText>[0]['model'],
  rawText: string,
  targetField: OptimizeTargetField,
  modelId: string,
): Promise<OptimizeResult> {
  const { text, usage } = await generateText({
    model,
    system: getPrompt(targetField),
    prompt: getUserPrompt(targetField, rawText),
    maxTokens: getMaxTokens(targetField),
    temperature: 0.2,
  });
  if (targetField === 'professionalSummary') {
    const { paragraph, extractedData } = extractSummaryParagraph(text.trim());
    return { text: paragraph, extractedData, usage: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, modelUsed: modelId } };
  }
  return {
    text: text.trim(),
    usage: {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      modelUsed: modelId,
    },
  };
}

function buildChatPrompt(currentSummary: string, messages: ChatMessage[], cvContext?: CvContext): string {
  const contextLines: string[] = [];
  if (cvContext?.jobTitles?.length) contextLines.push(`Job titles: ${cvContext.jobTitles.join(', ')}`);
  if (cvContext?.skills?.length) contextLines.push(`Skills: ${cvContext.skills.slice(0, 20).join(', ')}`);
  const contextBlock = contextLines.length ? `\n\nCV Context:\n${contextLines.join('\n')}` : '';

  const history = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  return `Current Professional Summary:\n"${currentSummary}"${contextBlock}\n\nConversation:\n${history}\n\nNow respond to the user's latest message.`;
}

function extractChatResponse(raw: string, currentSummary: string): { suggestion: string; explanation: string } {
  const suggestionMatch = raw.match(/###\s*Suggested Summary\s*\n+([\s\S]+?)(?=\n###|$)/i);
  const suggestion = suggestionMatch ? suggestionMatch[1].trim() : currentSummary;

  const explanationMatch = raw.match(/###\s*(?:Explanation|Answer)\s*\n+([\s\S]+?)(?=\n###|$)/i);
  const explanation = explanationMatch ? explanationMatch[1].trim() : '';

  return { suggestion, explanation };
}

export async function chatWithSummary(
  currentSummary: string,
  messages: ChatMessage[],
  cvContext?: CvContext,
): Promise<ChatSummaryResult> {
  const CHAT_SUMMARY_SYSTEM = `You are an expert CV writing assistant helping a candidate refine their Professional Summary. You always respond in exactly this format and nothing else:

### Suggested Summary
[the full updated paragraph — 3-4 sentences, each under 20 words, no markdown, no bullet symbols]

### Explanation
[one sentence explaining the change, or answering the user's question if they asked one]

Rules:
- Never fabricate facts, metrics, titles, or skills not in the current summary or CV context.
- Preserve the candidate's actual job title — do not promote or rename it.
- If the user asks a question rather than requesting a change, answer it in the Explanation section and copy the current summary unchanged into Suggested Summary.
- Each sentence in the summary must be under 20 words. The full paragraph must be 3-4 sentences.
- Do not use first-person pronouns in the summary.`;

  const prompt = buildChatPrompt(currentSummary, messages, cvContext);

  const runChat = async (
    model: Parameters<typeof generateText>[0]['model'],
    modelId: string,
  ): Promise<ChatSummaryResult> => {
    const { text, usage } = await generateText({
      model,
      system: CHAT_SUMMARY_SYSTEM,
      prompt,
      maxTokens: 500,
      temperature: 0.3,
    });
    const { suggestion, explanation } = extractChatResponse(text.trim(), currentSummary);
    return { suggestion, explanation, usage: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, modelUsed: modelId } };
  };

  try {
    return await runChat(anthropic('policy/haiku-general'), 'policy/haiku-general');
  } catch {
    return await runChat(anthropic('policy/zoominfo-general'), 'policy/zoominfo-general');
  }
}

export async function optimizeBullet(rawText: string, targetField: OptimizeTargetField = 'experienceBullet'): Promise<OptimizeResult> {
  let result: OptimizeResult;
  try {
    result = await runWithModel(anthropic('policy/haiku-general'), rawText, targetField, 'policy/haiku-general');
  } catch (primaryErr) {
    console.warn('[optimizer] Primary model failed, falling back to policy/zoominfo-general:', primaryErr);
    result = await runWithModel(anthropic('policy/zoominfo-general'), rawText, targetField, 'policy/zoominfo-general');
  }

  if (targetField === 'experienceBullet') {
    const wordCount = result.text.split(/\s+/).filter(Boolean).length;
    if (wordCount > 25) {
      console.warn(`[optimizer] Result exceeds 25-word limit (${wordCount} words): "${result.text}"`);
    }
  }

  return result;
}

function buildBulletChatPrompt(
  currentBullet: string,
  messages: ChatMessage[],
  context?: { jobTitle?: string; company?: string },
): string {
  const contextLines: string[] = [];
  if (context?.jobTitle) contextLines.push(`Job Title: ${context.jobTitle}`);
  if (context?.company) contextLines.push(`Company: ${context.company}`);
  const contextBlock = contextLines.length ? `\n\nContext:\n${contextLines.join('\n')}` : '';

  const history = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  return `Current Bullet:\n"${currentBullet}"${contextBlock}\n\nConversation:\n${history}\n\nNow respond to the user's latest message.`;
}

function extractBulletChatResponse(raw: string, currentBullet: string): { suggestion: string; explanation: string } {
  const suggestionMatch = raw.match(/###\s*Suggested Bullet\s*\n+([\s\S]+?)(?=\n###|$)/i);
  const suggestion = suggestionMatch ? suggestionMatch[1].trim() : currentBullet;

  const explanationMatch = raw.match(/###\s*Explanation\s*\n+([\s\S]+?)(?=\n###|$)/i);
  const explanation = explanationMatch ? explanationMatch[1].trim() : '';

  return { suggestion, explanation };
}

export async function chatWithBullet(
  currentBullet: string,
  messages: ChatMessage[],
  context?: { jobTitle?: string; company?: string },
): Promise<BulletChatResult> {
  const CHAT_BULLET_SYSTEM = `You are an expert CV bullet point writing assistant helping a candidate refine a single accomplishment bullet. You always respond in exactly this format and nothing else:

### Suggested Bullet
[the improved bullet — must follow: Action Verb + Context + Result, under 25 words, no first-person]

### Explanation
[one sentence explaining the change, or answering the user's question if they asked one]

Rules:
- Never fabricate metrics, numbers, or outcomes not present in the current bullet or user's message.
- Do not change the core action unless the user explicitly asks to.
- Preserve the [Action Verb] + [Context] + [Result] formula at all times.
- The bullet must be under 25 words.
- Do not use first-person pronouns (no "I", "my", "we").
- If the user asks a question rather than requesting a change, answer it in the Explanation section and copy the current bullet unchanged into Suggested Bullet.`;

  const prompt = buildBulletChatPrompt(currentBullet, messages, context);

  const runChat = async (
    model: Parameters<typeof generateText>[0]['model'],
    modelId: string,
  ): Promise<BulletChatResult> => {
    const { text, usage } = await generateText({
      model,
      system: CHAT_BULLET_SYSTEM,
      prompt,
      maxTokens: 200,
      temperature: 0.3,
    });
    const { suggestion, explanation } = extractBulletChatResponse(text.trim(), currentBullet);
    return { suggestion, explanation, usage: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, modelUsed: modelId } };
  };

  try {
    return await runChat(anthropic('policy/haiku-general'), 'policy/haiku-general');
  } catch {
    return await runChat(anthropic('policy/zoominfo-general'), 'policy/zoominfo-general');
  }
}
