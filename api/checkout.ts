import crypto from 'crypto';
import { saveOrder } from './lib/db.js';

interface CheckoutRequest {
  email: string;
  name: string;
  amount: number;
  item_name: string;
  payment_id: string;
  items?: { size: string; quantity: number }[];
}

export default async function handler(
  req: { method: string; body: CheckoutRequest; headers: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => {
      json: (body: Record<string, unknown>) => void;
      end: () => void;
    };
    setHeader: (name: string, value: string) => void;
  }
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, amount, item_name, payment_id, items } = req.body;

  // Basic validation
  if (!email || !name || !amount || !item_name || !payment_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Save order as pending in database
  const now = new Date().toISOString();
  await saveOrder({
    orderId: payment_id,
    email,
    name,
    items: items || [],
    amount,
    itemName: item_name,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  // Server-side credentials (never exposed to browser)
  const merchant_id = process.env.PAYFAST_MERCHANT_ID || '10000100';
  const merchant_key = process.env.PAYFAST_MERCHANT_KEY || '46f0cd694581a';
  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  const sandbox = process.env.PAYFAST_SANDBOX === 'true';
  const site_url = process.env.SITE_URL || (req.headers.origin as string) || '';

  // Build PayFast parameter object in the exact order PayFast expects
  const pfData: Record<string, string> = {
    merchant_id,
    merchant_key,
    return_url: `${site_url}?payment=success`,
    cancel_url: `${site_url}?payment=cancelled`,
    notify_url: `${site_url}/api/webhooks/payfast`,
    name_first: name.split(' ')[0] || '',
    name_last: name.split(' ').slice(1).join(' ') || '',
    email_address: email,
    m_payment_id: payment_id,
    amount: parseFloat(String(amount)).toFixed(2),
    item_name,
  };

  // Generate MD5 signature
  const paramString = Object.entries(pfData)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`)
    .join('&');

  const signatureString = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : paramString;

  const signature = crypto.createHash('md5').update(signatureString).digest('hex');

  // Return all form data + signature for the frontend to submit
  return res.status(200).json({
    ...pfData,
    signature,
    action_url: sandbox
      ? 'https://sandbox.payfast.co.za/eng/process'
      : 'https://www.payfast.co.za/eng/process',
  });
}
