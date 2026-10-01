import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

export const interviewExportRouter: ReturnType<typeof Router> = Router();

const ExportBodySchema = z.object({
  htmlContent: z.string().min(1),
  candidateName: z.string().default('Candidate'),
});

interviewExportRouter.post(
  '/',
  (req: Request, res: Response): void => {
    const bodyResult = ExportBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'htmlContent is required' });
      return;
    }

    const { htmlContent, candidateName } = bodyResult.data;

    const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Interview Playbook — ${escapeHtml(candidateName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.7;
      color: #1a1a1a;
      background: #f9f9f7;
    }
    .page-wrapper {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 32px 80px;
      background: #fff;
      min-height: 100vh;
    }
    h2 { font-size: 1.15rem; font-weight: 700; margin: 2rem 0 0.75rem; color: #111; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.4rem; }
    ul { padding-left: 1.4rem; margin-bottom: 1rem; }
    li { margin-bottom: 0.9rem; }
    .rationale { font-size: 0.82rem; color: #6b7280; font-style: italic; margin-top: 0.25rem; }
    .no-print {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #1e1e2e;
      color: #fff;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.85rem;
    }
    .no-print strong { font-size: 0.95rem; }
    .no-print button {
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 7px 18px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .no-print button:hover { background: #4f46e5; }
    @media print {
      .no-print { display: none !important; }
      body { background: #fff; font-size: 13px; }
      .page-wrapper { padding: 20px 16px; min-height: unset; }
      h2 { page-break-after: avoid; }
      li { page-break-inside: avoid; }
      @page { margin: 2cm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <strong>📋 Interview Playbook — ${escapeHtml(candidateName)}</strong>
    <button onclick="window.print()">📥 Save Playbook as PDF</button>
  </div>
  <div class="page-wrapper">
    <h1 style="font-size:1.4rem;font-weight:800;margin-bottom:1.5rem;color:#111;">Interview Playbook</h1>
    ${htmlContent}
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(page);
  }
);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
