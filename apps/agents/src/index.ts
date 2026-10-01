import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { validateEnv, env } from './env.js';
import { parseCvText } from './modules/parser.js';
import { optimizeBullet, chatWithSummary, chatWithBullet } from './modules/optimizer.js';
import { generateInterviewPlaybook } from './modules/interviewer.js';

validateEnv();

const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/parse', async (req: Request, res: Response) => {
  const { rawText } = req.body as { rawText?: string };
  if (!rawText?.trim()) {
    res.status(400).json({ error: 'rawText is required and must not be empty' });
    return;
  }
  try {
    const cvDocument = await parseCvText(rawText);
    res.json(cvDocument);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/optimize', async (req: Request, res: Response) => {
  const { rawSentence, targetField } = req.body as { rawSentence?: string; targetField?: string };
  if (!rawSentence?.trim()) {
    res.status(400).json({ error: 'rawSentence is required and must not be empty' });
    return;
  }
  const field = (targetField === 'professionalSummary' || targetField === 'skills') ? targetField : 'experienceBullet';
  try {
    const result = await optimizeBullet(rawSentence, field);
    res.json({ optimized: result.text, extractedData: result.extractedData ?? null, usage: result.usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/optimize-batch', async (req: Request, res: Response) => {
  const { items } = req.body as { items?: Array<{ id: string; text: string; targetField: string }> };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items array is required and must not be empty' });
    return;
  }

  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const field = (item.targetField === 'professionalSummary' || item.targetField === 'skills')
        ? item.targetField as 'professionalSummary' | 'skills'
        : 'experienceBullet' as const;
      const result = await optimizeBullet(item.text, field);
      return { id: item.id, result };
    })
  );

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let modelUsed = 'policy/haiku-general';

  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled') {
      totalPromptTokens += s.value.result.usage.promptTokens;
      totalCompletionTokens += s.value.result.usage.completionTokens;
      modelUsed = s.value.result.usage.modelUsed;
      return { id: items[i].id, optimized: s.value.result.text, success: true };
    }
    return { id: items[i].id, optimized: items[i].text, success: false };
  });

  res.json({
    results,
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens, modelUsed },
  });
});

app.post('/chat-summary', async (req: Request, res: Response) => {
  const { currentSummary, messages, cvContext } = req.body as {
    currentSummary?: string;
    messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
    cvContext?: { skills: string[]; jobTitles: string[] };
  };
  if (typeof currentSummary !== 'string') {
    res.status(400).json({ error: 'currentSummary is required' });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required and must not be empty' });
    return;
  }
  try {
    const result = await chatWithSummary(currentSummary, messages, cvContext);
    res.json({ suggestion: result.suggestion, explanation: result.explanation, usage: result.usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/chat-bullet', async (req: Request, res: Response) => {
  const { currentBullet, messages, context } = req.body as {
    currentBullet?: string;
    messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
    context?: { jobTitle?: string; company?: string };
  };
  if (typeof currentBullet !== 'string') {
    res.status(400).json({ error: 'currentBullet is required' });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required and must not be empty' });
    return;
  }
  try {
    const result = await chatWithBullet(currentBullet, messages, context);
    res.json({ suggestion: result.suggestion, explanation: result.explanation, usage: result.usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/interview', async (req: Request, res: Response) => {
  const { cvData, targetJob, batchNumber, questionsPerBatch, batchFocus } = req.body as {
    cvData?: unknown;
    targetJob?: unknown;
    batchNumber?: number;
    questionsPerBatch?: number;
    batchFocus?: string;
  };
  if (!cvData || typeof cvData !== 'object') {
    res.status(400).json({ error: 'cvData is required and must be an object' });
    return;
  }
  try {
    const result = await generateInterviewPlaybook(
      cvData as import('@cv-helper/shared-types').CvDocument,
      targetJob as import('./modules/interviewer.js').TargetJob | undefined,
      { batchNumber, questionsPerBatch, batchFocus },
    );
    res.json({
      questions: result.questions,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.listen(env.AGENTS_PORT, () => {
  console.log(`[agents] Service running on port ${env.AGENTS_PORT}`);
});
