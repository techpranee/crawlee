import mongoose from 'mongoose';

import { appConfig } from '../config/env';
import { logger } from '../utils/logger';
import { setMongoReady } from '../utils/metrics';

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectMongo(): Promise<typeof mongoose> {
  if (!connectionPromise) {
    mongoose.set('strictQuery', true);

    connectionPromise = mongoose
      .connect(appConfig.mongoUrl, {
        serverSelectionTimeoutMS: 20000,
      })
      .then((conn) => {
        logger.info('Connected to MongoDB');
        setMongoReady(true);
        return conn;
      })
      .catch((error) => {
        connectionPromise = null;
        logger.error({ err: error }, 'Failed to connect to MongoDB');
        setMongoReady(false);
        throw error;
      });
  }

  return connectionPromise;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
  setMongoReady(false);
  connectionPromise = null;
}
