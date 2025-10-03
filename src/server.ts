import { mkdir } from 'node:fs/promises';

import { Configuration } from 'crawlee';

import { createApp } from './app';
import { appConfig } from './config/env';
import { connectMongo } from './db/mongoose';
import { initAgenda, getAgenda, stopAgenda } from './jobs/agenda';
import { logger } from './utils/logger';

async function ensureDirectories(): Promise<void> {
  const dirs = [appConfig.crawleeStorageDir, appConfig.exportDir];
  await Promise.all(
    dirs.map((dir) =>
      mkdir(dir, { recursive: true }).catch((error) => {
        logger.error({ err: error, dir }, 'Failed to create directory');
        throw error;
      }),
    ),
  );
}

async function bootstrap(): Promise<void> {
  await ensureDirectories();
  process.env.CRAWLEE_STORAGE_DIR = appConfig.crawleeStorageDir;
  Configuration.getGlobalConfig().set('storageClientOptions', {
    localDataDirectory: appConfig.crawleeStorageDir,
  });

  await connectMongo();
  await initAgenda();

  const agenda = getAgenda();
  const app = createApp({ agenda });

  const server = app.listen(appConfig.port, () => {
    logger.info({ port: appConfig.port }, 'Crawlee server listening');
  });

  const shutdown = async () => {
    logger.info('Received shutdown signal, closing server');
    await stopAgenda();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to start server');
  process.exit(1);
});
