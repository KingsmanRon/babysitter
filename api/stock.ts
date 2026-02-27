import { getStock, initStock } from './lib/db.js';

export default async function handler(
  req: { method: string },
  res: {
    status: (code: number) => {
      json: (body: Record<string, unknown>) => void;
    };
  }
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await initStock();
  const stock = await getStock();
  return res.status(200).json(stock);
}
