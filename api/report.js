// Vercel serverless: POST /api/report
import { handleApi } from '../server/baatcheet-engine.mjs';

export default async function handler(req, res) {
  await handleApi(req, res);
}
