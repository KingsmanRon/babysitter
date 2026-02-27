import crypto from 'crypto';
import { getOrder, updateOrderStatus, decrementStock } from '../lib/db.js';

// PayFast server IP ranges (used for production IP validation)
// See: https://developers.payfast.co.za/docs#step_5_confirm_payment
const PAYFAST_IP_RANGES = [
  '197.97.145.144/28',
  '41.74.179.192/27',
  '197.97.145.176/28',
];

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1) >>> 0;
  return (ipToNumber(ip) & mask) === (ipToNumber(range) & mask);
}

function isPayFastIP(ip: string): boolean {
  return PAYFAST_IP_RANGES.some(range => ipInCidr(ip, range));
}

export default async function handler(
  req: {
    method: string;
    body: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
    socket: { remoteAddress?: string };
  },
  res: {
    status: (code: number) => {
      json: (body: Record<string, unknown>) => void;
      send: (body: string) => void;
      end: () => void;
    };
  }
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  // Step 1: Verify source IP (skip in sandbox mode)
  if (!isSandbox) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const sourceIp = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0] : '')?.trim()
      || req.socket.remoteAddress
      || '';

    if (!isPayFastIP(sourceIp)) {
      console.warn(`[PayFast ITN] Rejected: invalid source IP ${sourceIp}`);
      return res.status(403).json({ error: 'Invalid source IP' });
    }
  }

  const body = req.body;
  const passphrase = process.env.PAYFAST_PASSPHRASE || '';

  // Step 2: Validate signature
  const receivedSignature = body.signature;
  const pfData = { ...body };
  delete pfData.signature;

  const paramString = Object.entries(pfData)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value).trim()).replace(/%20/g, '+')}`)
    .join('&');

  const signatureString = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : paramString;

  const calculatedSignature = crypto.createHash('md5').update(signatureString).digest('hex');

  if (calculatedSignature !== receivedSignature) {
    console.warn(`[PayFast ITN] Rejected: invalid signature for order ${body.m_payment_id}`);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Step 3: Process payment status
  const paymentStatus = body.payment_status;
  const orderId = body.m_payment_id;
  const amountGross = body.amount_gross;

  // Verify amount against stored order
  const order = await getOrder(orderId);
  if (order && parseFloat(amountGross) !== order.amount) {
    console.warn(`[PayFast ITN] Amount mismatch for ${orderId}: expected ${order.amount}, got ${amountGross}`);
    return res.status(400).json({ error: 'Amount mismatch' });
  }

  if (paymentStatus === 'COMPLETE') {
    await updateOrderStatus(orderId, 'paid');
    // Decrement stock for paid orders
    if (order?.items?.length) {
      await decrementStock(order.items);
    }
    console.log(`[PayFast ITN] Payment COMPLETE: Order ${orderId}, Amount R${amountGross}`);
  } else if (paymentStatus === 'CANCELLED') {
    await updateOrderStatus(orderId, 'cancelled');
    console.log(`[PayFast ITN] Payment CANCELLED: Order ${orderId}`);
  } else {
    await updateOrderStatus(orderId, 'failed');
    console.log(`[PayFast ITN] Payment ${paymentStatus}: Order ${orderId}`);
  }

  // PayFast expects a 200 OK response to acknowledge receipt
  return res.status(200).send('OK');
}
