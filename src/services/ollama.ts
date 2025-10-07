/**
 * Ollama AI Service
 * Centralized service for interacting with Ollama API
 */

import { logger } from '../utils/logger';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  stop?: string[];
}

export interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json' | string;
  options?: OllamaOptions;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaService {
  private baseUrl: string;
  private defaultModel: string;
  private timeout: number;

  constructor(
    baseUrl: string = process.env.OLLAMA_URL || 'http://localhost:11434',
    defaultModel: string = process.env.OLLAMA_MODEL || 'deepseek-r1:14b',
    timeout: number = 60000 // 60 seconds
  ) {
    // Normalize URL - remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultModel = defaultModel;
    this.timeout = timeout;
  }

  /**
   * Send a chat completion request to Ollama
   */
  async chat(
    messages: OllamaMessage[],
    options?: {
      model?: string;
      temperature?: number;
      format?: 'json';
      systemPrompt?: string;
    }
  ): Promise<string | null> {
    try {
      // If systemPrompt is provided, prepend it to messages
      const finalMessages = options?.systemPrompt
        ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
        : messages;

      const request: OllamaRequest = {
        model: options?.model || this.defaultModel,
        messages: finalMessages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.3,
          top_p: 0.9,
        },
      };

      if (options?.format === 'json') {
        request.format = 'json';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data: OllamaResponse = await response.json();
      return data.message?.content || null;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.error({ timeout: this.timeout }, 'Ollama request timed out');
        return null;
      }
      logger.error({ error: error.message }, 'Ollama API request failed');
      return null;
    }
  }

  /**
   * Simple completion helper - single user message
   */
  async complete(
    prompt: string,
    options?: {
      model?: string;
      systemPrompt?: string;
      temperature?: number;
      format?: 'json';
    }
  ): Promise<string | null> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  /**
   * Extract structured JSON from text using Ollama
   */
  async extractJSON<T = any>(
    prompt: string,
    systemPrompt?: string,
    options?: { model?: string; temperature?: number }
  ): Promise<T | null> {
    try {
      const response = await this.complete(prompt, {
        ...options,
        systemPrompt,
        format: 'json',
      });

      if (!response) {
        return null;
      }

      // Try to parse as JSON
      try {
        return JSON.parse(response) as T;
      } catch {
        // If format=json didn't work, try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as T;
        }
        logger.warn('Could not parse Ollama response as JSON');
        return null;
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to extract JSON from Ollama');
      return null;
    }
  }

  /**
   * Check if Ollama service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }
}

// Singleton instance
let ollamaInstance: OllamaService | null = null;

/**
 * Get or create the Ollama service instance
 */
export function getOllamaService(): OllamaService {
  if (!ollamaInstance) {
    ollamaInstance = new OllamaService();
  }
  return ollamaInstance;
}

/**
 * Initialize Ollama service with custom config
 */
export function initOllamaService(
  baseUrl?: string,
  defaultModel?: string,
  timeout?: number
): OllamaService {
  ollamaInstance = new OllamaService(baseUrl, defaultModel, timeout);
  return ollamaInstance;
}
