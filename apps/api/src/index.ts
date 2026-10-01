import 'dotenv/config';
import express from 'express';
import { validateEnv, env } from './env.js';
import { cvRouter } from './routes/cv.route.js';
import { interviewRouter } from './routes/interview.route.js';
import { interviewExportRouter } from './routes/interview-export.route.js';

validateEnv();

const app = express();
app.use((req, _res, next) => {
  if (req.path === '/cv/upload') return next();
  express.json()(req, _res, next);
});

app.use('/cv', cvRouter);
app.use('/interview', interviewRouter);
app.use('/interview-export', interviewExportRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(env.PORT, () => {
  console.log(`[api] Server running on port ${env.PORT}`);
});

// Prevent ECONNRESET on long-running AI routes: keepalive sockets must outlive the request
server.keepAliveTimeout = 130000;
server.headersTimeout = 135000;
