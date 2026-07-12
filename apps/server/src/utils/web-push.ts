import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { DATA_PATH } from '../helpers/paths';
import { logger } from '../logger';

// VAPID keypair for Web Push. Same persistence rules as jwt.key: lives on
// the data volume, never in the settings table, so the private key can't
// leak through a settings query. The public key is served to clients via
// public server settings (it is meant to be public).
const VAPID_KEY_PATH = path.join(DATA_PATH, 'vapid.json');

// Push services require a contact in the VAPID `sub` claim.
const VAPID_SUBJECT = 'https://github.com/h8d13/caesar';

type TVapidKeys = {
  publicKey: string;
  privateKey: string;
};

let vapidKeys: TVapidKeys | undefined;

// Read the key file, or mint and persist one on first boot. Safe under a
// parallel-boot race: `wx` fails if another process already wrote the file,
// in which case we re-read it.
const loadVapidKeys = async (): Promise<TVapidKeys> => {
  if (vapidKeys) return vapidKeys;

  try {
    const existing = JSON.parse(
      await fs.promises.readFile(VAPID_KEY_PATH, 'utf8')
    ) as TVapidKeys;

    if (existing.publicKey && existing.privateKey) {
      vapidKeys = existing;
      return vapidKeys;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const generated = webpush.generateVAPIDKeys();

  try {
    // 0600: readable only by the server user.
    await fs.promises.writeFile(VAPID_KEY_PATH, JSON.stringify(generated), {
      mode: 0o600,
      flag: 'wx'
    });
    vapidKeys = generated;
    logger.info('[Push] Generated new VAPID keypair at %s', VAPID_KEY_PATH);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      vapidKeys = JSON.parse(
        await fs.promises.readFile(VAPID_KEY_PATH, 'utf8')
      ) as TVapidKeys;
    } else {
      throw err;
    }
  }

  return vapidKeys;
};

// Lazy accessor so request-time paths work even when boot init was skipped
// (e.g. tests that drive the DB layer directly).
const getVapidPublicKey = async (): Promise<string> =>
  (await loadVapidKeys()).publicKey;

type TPushPayload = {
  title: string;
  body: string;
};

type TPushSendOptions = {
  // seconds the push service holds the message for an unreachable device;
  // short for calls (a ring delivered later than the ring window is noise)
  ttl?: number;
  // 'high' wakes devices in doze, reserve it for time-critical pushes
  urgency?: 'normal' | 'high';
};

// Send one notification. Returns 'gone' when the push service reports the
// subscription is dead (unsubscribed/expired) so the caller can prune it.
const sendWebPush = async (
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: TPushPayload,
  options?: TPushSendOptions
): Promise<'sent' | 'gone' | 'failed'> => {
  const keys = await loadVapidKeys();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: VAPID_SUBJECT,
          publicKey: keys.publicKey,
          privateKey: keys.privateKey
        },
        TTL: options?.ttl ?? 24 * 60 * 60,
        urgency: options?.urgency ?? 'normal'
      }
    );

    return 'sent';
  } catch (err) {
    const statusCode = (err as webpush.WebPushError).statusCode;

    if (statusCode === 404 || statusCode === 410) {
      return 'gone';
    }

    logger.error('[Push] send failed (status %s):', statusCode, err);
    return 'failed';
  }
};

export { getVapidPublicKey, loadVapidKeys, sendWebPush };
