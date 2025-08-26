import { NextApiRequest, NextApiResponse } from 'next';
import * as uptimeAPI from '@/lib/uptimeAPI';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stats = await uptimeAPI.fetchStats();

  res.status(200).json(stats);
}
