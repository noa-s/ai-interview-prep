import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../env.js';

export const interviewRouter: ReturnType<typeof Router> = Router();

const BATCH_FOCUS: Record<number, string> = {
  1: 'Behavioral + Metric cross-examinations (4 questions)',
  2: 'Technical execution and role-specific architecture (4 questions)',
  3: 'Systemic alignment, situational problem solving, and leadership (4 questions)',
};

const interviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many interview generation requests. Please wait before trying again.' },
});

interviewRouter.post(
  '/',
  interviewLimiter,
  async (req: Request, res: Response): Promise<void> => {
    req.setTimeout(120000);
    res.setTimeout(120000);

    console.log('[Interview Route Triggered]');
    console.log('CV Data Object Attached:', !!req.body.cvData);
    console.log('Target Job Object Attached:', !!req.body.targetJob);

    const cvData = req.body.cvData;
    const batchNumber: number = typeof req.body.batchNumber === 'number' ? req.body.batchNumber : 1;
    const questionsPerBatch: number = typeof req.body.questionsPerBatch === 'number' ? req.body.questionsPerBatch : 4;
    const existingQuestions: string[] = Array.isArray(req.body.existingQuestions) ? (req.body.existingQuestions as string[]).filter((q): q is string => typeof q === 'string').slice(0, 50) : [];

    const company: string = req.body.targetJob?.company || 'Target Company';
    const title: string = req.body.targetJob?.title || 'Target Position';
    const jobDescription: string = String(req.body.targetJob?.jobDescription || 'Standard Role Profile').slice(0, 4000);

    if (!cvData || typeof cvData !== 'object') {
      if (!res.headersSent) {
        res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'cvData is required and must be an object.' });
      }
      return;
    }

    try {
      const safeTargetJob = { company, title, jobDescription };
      const batchFocus = BATCH_FOCUS[batchNumber] ?? BATCH_FOCUS[1];

      console.log(`[Interview Route] Batch ${batchNumber}/${questionsPerBatch}q — focus: ${batchFocus}`);
      console.log('[Interview Route] Forwarding to agents service:', env.AGENTS_SERVICE_URL);

      const agentRes = await fetch(`${env.AGENTS_SERVICE_URL}/interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvData,
          targetJob: safeTargetJob,
          batchNumber,
          questionsPerBatch,
          batchFocus,
          existingQuestions,
        }),
        signal: AbortSignal.timeout(110000),
      });

      if (!agentRes.ok) {
        const rawBody = await agentRes.text();
        console.error('[Interview Route] Agent service error:', agentRes.status, rawBody);
        let agentErrorMessage = rawBody;
        try {
          const parsed = JSON.parse(rawBody) as { error?: string; message?: string };
          agentErrorMessage = parsed.message ?? parsed.error ?? rawBody;
        } catch {
          // rawBody is not JSON — use as-is
        }
        if (!res.headersSent) {
          res.status(502).json({
            error: 'AGENT_ERROR',
            message: `Interview generation failed: ${agentErrorMessage}`,
          });
        }
        return;
      }

      const data = await agentRes.json() as { questions: unknown[] };
      console.log(`[Interview Route] Success — batch ${batchNumber}, questions returned: ${data.questions?.length ?? 'unknown'}`);
      res.status(200).json(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CRITICAL INTERVIEW ROUTE CRASH ERROR]:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: `Interview generation encountered an unexpected error: ${errorMessage}`,
        });
      }
    }
  }
);
