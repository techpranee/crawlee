import { setTimeout as delay } from 'node:timers/promises';

import { appConfig } from '../../config/env';
import { logger } from '../../utils/logger';

interface OllamaOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function generateOllamaJson(
  prompt: string,
  options: OllamaOptions = {},
): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${appConfig.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: appConfig.ollamaModel,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 512,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Ollama request failed');
      return null;
    }

    const data = (await response.json()) as { response?: string };
    if (!data?.response) {
      return null;
    }
    try {
      return JSON.parse(data.response);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to parse Ollama JSON response');
      return null;
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      logger.warn('Ollama request aborted due to timeout');
    } else {
      logger.warn({ err: error }, 'Ollama call failed');
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function backoffRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelay = 500,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) {
        throw error;
      }
      await delay(baseDelay * attempt);
    }
  }
}
