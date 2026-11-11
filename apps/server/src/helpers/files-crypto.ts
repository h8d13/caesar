import crypto from 'crypto';
import { getHmacSecret } from '../utils/hmac-secret';

const generateFileToken = (
  fileId: number,
  channelAccessToken: string
): string => {
  const hmac = crypto.createHmac('sha256', getHmacSecret());

  hmac.update(`${fileId}:${channelAccessToken}`);

  return hmac.digest('hex');
};

const verifyFileToken = (
  fileId: number,
  channelAccessToken: string,
  providedToken: string
): boolean => {
  const expectedToken = generateFileToken(fileId, channelAccessToken);

  if (expectedToken.length !== providedToken.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedToken),
    Buffer.from(providedToken)
  );
};

export { generateFileToken, verifyFileToken };
