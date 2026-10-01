import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CvDocumentSchema } from '@cv-helper/shared-types';
import { env } from '../env.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth: typeof import('mammoth/lib/index.d.ts') = require('mammoth');

const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (ALLOWED_MIMETYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf, .docx, and .txt files are supported'));
    }
  },
});

function sanitizeText(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars except \t \n \r
    .replace(/[ \t]+/g, ' ')                             // collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n')                          // collapse 3+ blank lines to 2
    .trim();
}

async function extractText(file: Express.Multer.File): Promise<string> {
  const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();

  if (ext === '.txt' || file.mimetype === 'text/plain') {
    return file.buffer.toString('utf-8');
  }

  if (ext === '.pdf' || file.mimetype === 'application/pdf') {
    const result = await pdfParse(file.buffer);
    return result.text;
  }

  if (
    ext === '.docx' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export const cvRouter: ReturnType<typeof Router> = Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // max 10 upload+parse calls per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many upload requests. Please wait a moment before trying again.' },
});

const optimizeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,             // max 20 optimizer calls per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many optimize requests. Please wait a moment before trying again.' },
});

const OptimizeBulletBodySchema = z.object({
  rawBullet: z.string().min(1),
  targetField: z.enum(['experienceBullet', 'professionalSummary', 'skills']).optional(),
});

cvRouter.post(
  '/upload',
  uploadLimiter,
  upload.single('cv'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'NO_FILE', message: 'No file uploaded. Send a .pdf, .docx, or .txt file as the "cv" field.' });
      return;
    }

    let rawText: string;
    try {
      rawText = await extractText(req.file);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction error';
      res.status(422).json({ error: 'EXTRACTION_FAILED', message: `Failed to extract text from document: ${message}` });
      return;
    }

    const cleanText = sanitizeText(rawText);

    if (!cleanText) {
      res.status(422).json({
        error: 'EMPTY_DOCUMENT',
        message: 'Could not extract readable text from document. Ensure the file contains selectable text (not a scanned image).',
      });
      return;
    }

    let agentData: unknown;
    try {
      const agentRes = await fetch(`${env.AGENTS_SERVICE_URL}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: cleanText }),
      });

      if (!agentRes.ok) {
        const body = await agentRes.text();
        res.status(502).json({ error: 'AGENT_ERROR', message: `Parsing agent returned an error: ${body}` });
        return;
      }

      agentData = await agentRes.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent communication error';
      res.status(500).json({ error: 'PARSE_FAILED', message: `CV parsing pipeline failed: ${message}` });
      return;
    }

    const parseResult = CvDocumentSchema.safeParse(agentData);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(502).json({ error: 'SCHEMA_MISMATCH', message: `Agent response did not conform to CV schema: ${details}` });
      return;
    }

    res.status(200).json(parseResult.data);
  }
);

cvRouter.post(
  '/optimize-bullet',
  optimizeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = OptimizeBulletBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      const details = bodyResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: `Invalid request body: ${details}` });
      return;
    }

    const { rawBullet, targetField } = bodyResult.data;

    try {
      const agentRes = await fetch(`${env.AGENTS_SERVICE_URL}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawSentence: rawBullet, targetField: targetField ?? 'experienceBullet' }),
      });

      if (!agentRes.ok) {
        const body = await agentRes.text();
        res.status(502).json({ error: 'AGENT_ERROR', message: `Optimizer agent returned an error: ${body}` });
        return;
      }

      const data = (await agentRes.json()) as { optimized: string; extractedData?: { skills: string[]; experience: string[] } | null; usage: { promptTokens: number; completionTokens: number; modelUsed: string } };
      res.status(200).json({ optimized: data.optimized, extractedData: data.extractedData ?? null, usage: data.usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent communication error';
      res.status(500).json({ error: 'OPTIMIZE_FAILED', message: `Bullet optimization failed: ${message}` });
    }
  }
);

const OptimizeBodySchema = z.object({
  text: z.string().min(1),
  targetField: z.enum(['experienceBullet', 'professionalSummary', 'skills']).default('experienceBullet'),
});

cvRouter.post(
  '/optimize',
  optimizeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = OptimizeBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      const details = bodyResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: `Invalid request body: ${details}` });
      return;
    }

    const { text, targetField } = bodyResult.data;

    try {
      const agentRes = await fetch(`${env.AGENTS_SERVICE_URL}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawSentence: text, targetField }),
      });

      if (!agentRes.ok) {
        const body = await agentRes.text();
        res.status(502).json({ error: 'AGENT_ERROR', message: `Optimizer agent returned an error: ${body}` });
        return;
      }

      const data = (await agentRes.json()) as { optimized: string; usage: { promptTokens: number; completionTokens: number; modelUsed: string } };
      res.status(200).json({ optimizedText: data.optimized, usage: data.usage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent communication error';
      res.status(500).json({ error: 'OPTIMIZE_FAILED', message: `Optimization failed: ${message}` });
    }
  }
);

const OptimizeBatchBodySchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    text: z.string().min(1),
    targetField: z.enum(['experienceBullet', 'professionalSummary', 'skills']).default('experienceBullet'),
  })).min(1).max(50),
});

const ChatSummaryBodySchema = z.object({
  currentSummary: z.string(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1),
  })).min(1).max(20),
  cvContext: z.object({
    skills: z.array(z.string()),
    jobTitles: z.array(z.string()),
  }).optional(),
});

const ChatBulletBodySchema = z.object({
  currentBullet: z.string(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1),
  })).min(1).max(20),
  context: z.object({
    jobTitle: z.string().optional(),
    company: z.string().optional(),
  }).optional(),
});

cvRouter.post(
  '/optimize-batch',
  optimizeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = OptimizeBatchBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      const details = bodyResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: `Invalid request body: ${details}` });
      return;
    }

    const { items } = bodyResult.data;

    try {
      const agentRes = await fetch(`${env.AGENTS_SERVICE_URL}/optimize-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!agentRes.ok) {
        const body = await agentRes.text();
        res.status(502).json({ error: 'AGENT_ERROR', message: `Batch optimizer returned an error: ${body}` });
        return;
      }

      const data = await agentRes.json() as { results: Array<{ id: string; optimized: string; success: boolean }>; usage: { promptTokens: number; completionTokens: number; modelUsed: string } };
      res.status(200).json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent communication error';
      res.status(500).json({ error: 'OPTIMIZE_FAILED', message: `Batch optimization failed: ${message}` });
    }
  }
);

cvRouter.post(
  '/chat-summary',
  optimizeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = ChatSummaryBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      const details = bodyResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: `Invalid request body: ${details}` });
      return;
    }

    const { currentSummary, messages, cvContext } = bodyResult.data;

    try {
      const agentRes = await fetch(`${env.AGENTS_SERVICE_URL}/chat-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentSummary, messages, cvContext }),
      });

      if (!agentRes.ok) {
        const body = await agentRes.text();
        res.status(502).json({ error: 'AGENT_ERROR', message: `Chat summary agent returned an error: ${body}` });
        return;
      }

      const data = (await agentRes.json()) as {
        suggestion: string;
        explanation: string;
        usage: { promptTokens: number; completionTokens: number; modelUsed: string };
      };
      res.status(200).json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent communication error';
      res.status(500).json({ error: 'CHAT_FAILED', message: `Chat summary failed: ${message}` });
    }
  }
);

cvRouter.post(
  '/chat-bullet',
  optimizeLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = ChatBulletBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      const details = bodyResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: `Invalid request body: ${details}` });
      return;
    }

    const { currentBullet, messages, context } = bodyResult.data;

    try {
      const agentRes = await fetch(`${env.AGENTS_SERVICE_URL}/chat-bullet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentBullet, messages, context }),
      });

      if (!agentRes.ok) {
        const body = await agentRes.text();
        res.status(502).json({ error: 'AGENT_ERROR', message: `Chat bullet agent returned an error: ${body}` });
        return;
      }

      const data = (await agentRes.json()) as {
        suggestion: string;
        explanation: string;
        usage: { promptTokens: number; completionTokens: number; modelUsed: string };
      };
      res.status(200).json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent communication error';
      res.status(500).json({ error: 'CHAT_FAILED', message: `Chat bullet failed: ${message}` });
    }
  }
);
