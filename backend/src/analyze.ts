import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { analyzePackageJson, fetchPackageJson, type FetchPackageJsonRequest } from './analyzer';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname === 'package.json' || file.mimetype === 'application/json') {
      cb(null, true);
      return;
    }

    cb(new Error('Only package.json files are accepted.'));
  },
});

router.post('/analyze', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const raw = getRawContent(req);

  if (!raw || raw.trim() === '') {
    res.status(400).json({
      error: 'No package.json content provided. Send { content } in JSON body or upload a file.',
    });
    return;
  }

  try {
    const result = await analyzePackageJson(raw);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    res.status(422).json({ error: message });
  }
});

router.post('/fetch-package-json', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as FetchPackageJsonRequest;

  if (!body || (body.source !== 'github' && body.source !== 'link')) {
    res.status(400).json({
      error: 'Invalid source. Use source="github" or source="link".',
    });
    return;
  }

  try {
    const result = await fetchPackageJson(body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not fetch package.json.';
    res.status(422).json({ error: message });
  }
});

function getRawContent(req: Request): string | null {
  if (req.file) {
    return req.file.buffer.toString('utf-8');
  }

  if (typeof req.body?.content === 'string') {
    return req.body.content;
  }

  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }

  return null;
}

export default router;
