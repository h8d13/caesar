import type { TServerInfo } from '@caesar/shared';
import type http from 'http';
import { getSettings } from '../db/queries/server';

const infoRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const settings = await getSettings();

  const info: TServerInfo = {
    name: settings.name,
    description: settings.description,
    logo: settings.logo ? { name: settings.logo.name } : null
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(info));
};

export { infoRouteHandler };
