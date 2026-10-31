import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import type { IncomingMessage } from 'http';
import { createContext } from '../utils/wss';

type TMockContextOptions = {
  customToken?: string;
  // per-IP rate limits: simulated concurrent users need distinct addresses
  remoteAddress?: string;
};

const createMockContextOptions = async (
  opts?: TMockContextOptions
): Promise<CreateWSSContextFnOptions> => {
  const { customToken, remoteAddress = '127.0.0.1' } = opts ?? {};

  const token = customToken;

  return {
    info: {
      connectionParams: {
        token
      },
      accept: 'application/jsonl',
      type: 'subscription',
      isBatchCall: false,
      calls: [],
      signal: new AbortController().signal,
      url: new URL('ws://localhost:3000')
    },
    req: {
      headers: {},
      socket: {
        remoteAddress
      }
    } as IncomingMessage,
    res: undefined as any
  };
};

const createMockContext = async (opts?: TMockContextOptions) => {
  const contextOpts = await createMockContextOptions(opts);
  const ctx = await createContext(contextOpts);

  return ctx;
};

export { createMockContext };
