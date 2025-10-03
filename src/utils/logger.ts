import pino from 'pino';
import pinoHttp from 'pino-http';

import { appConfig } from '../config/env';

const isDev = appConfig.nodeEnv !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  customProps: () => ({ service: 'crawlee-server' }),
});
