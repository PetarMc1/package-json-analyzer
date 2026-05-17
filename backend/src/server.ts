import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import analyzeRoutes from './analyze';

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json({ limit: '2mb' }));

// Allow all CORS requests (development convenience)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/', analyzeRoutes);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof Error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
