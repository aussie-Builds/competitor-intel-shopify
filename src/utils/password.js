import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  console.log('[DEBUG] hashPassword - salt:', salt);
  const buf = await scryptAsync(password, salt, 64);
  const hash = `${buf.toString('hex')}.${salt}`;
  console.log('[DEBUG] hashPassword - result format:', `${hash.substring(0, 20)}... (length: ${hash.length})`);
  return hash;
}

export async function verifyPassword(password, stored) {
  console.log('[DEBUG] verifyPassword called');
  console.log('[DEBUG] stored hash format:', stored ? `${stored.substring(0, 20)}... (length: ${stored.length})` : 'NULL/UNDEFINED');

  const [hashedPassword, salt] = stored.split('.');
  console.log('[DEBUG] parsed hashedPassword length:', hashedPassword?.length);
  console.log('[DEBUG] parsed salt:', salt);

  const buf = await scryptAsync(password, salt, 64);
  console.log('[DEBUG] computed hash length:', buf.length);

  const storedBuf = Buffer.from(hashedPassword, 'hex');
  console.log('[DEBUG] stored hash buffer length:', storedBuf.length);

  const match = timingSafeEqual(storedBuf, buf);
  console.log('[DEBUG] passwords match:', match);

  return match;
}
