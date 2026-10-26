// Vercel serverless: POST /api/job
import { handleApi } from '../server/baatcheet-engine.mjs';

export default async function handler(req, res) {
  await handleApi(req, res);
}
