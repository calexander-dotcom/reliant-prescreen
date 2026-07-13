import { Router, type Request, type Response } from 'express';

export function healthRouter(): Router {
  const router = Router();
  router.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });
  return router;
}
