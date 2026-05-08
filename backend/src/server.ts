import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import analyzeRoutes from './analyze';

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json({ limit: '2mb' }));

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
