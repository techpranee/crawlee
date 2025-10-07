/**
 * Ollama AI Service (CommonJS version for scripts)
 * Centralized service for interacting with Ollama API
 */

/**
 * Ollama Service Class
 */
class OllamaService {
  constructor(
    baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434',
    defaultModel = process.env.OLLAMA_MODEL || 'deepseek-r1:14b',
    timeout = 60000 // 60 seconds
  ) {
    // Normalize URL - remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultModel = defaultModel;
    this.timeout = timeout;
  }

  /**
   * Send a chat completion request to Ollama
   */
  async chat(messages, options = {}) {
    try {
      // If systemPrompt is provided, prepend it to messages
      const finalMessages = options.systemPrompt
        ? [{ role: 'system', content: options.systemPrompt }, ...messages]
        : messages;

      const request = {
        model: options.model || this.defaultModel,
        messages: finalMessages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          top_p: 0.9,
        },
      };

      if (options.format === 'json') {
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

      const data = await response.json();
      return data.message?.content || null;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`Ollama request timed out after ${this.timeout}ms`);
        return null;
      }
      console.error('Ollama API request failed:', error.message);
      return null;
    }
  }

  /**
   * Simple completion helper - single user message
   */
  async complete(prompt, options = {}) {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  /**
   * Extract structured JSON from text using Ollama
   */
  async extractJSON(prompt, systemPrompt, options = {}) {
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
        return JSON.parse(response);
      } catch {
        // If format=json didn't work, try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        console.warn('Could not parse Ollama response as JSON');
        return null;
      }
    } catch (error) {
      console.error('Failed to extract JSON from Ollama:', error.message);
      return null;
    }
  }

  /**
   * Check if Ollama service is available
   */
  async healthCheck() {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models?.map(m => m.name) || [];
    } catch {
      return [];
    }
  }
}

// Singleton instance
let ollamaInstance = null;

/**
 * Get or create the Ollama service instance
 */
function getOllamaService() {
  if (!ollamaInstance) {
    ollamaInstance = new OllamaService();
  }
  return ollamaInstance;
}

/**
 * Initialize Ollama service with custom config
 */
function initOllamaService(baseUrl, defaultModel, timeout) {
  ollamaInstance = new OllamaService(baseUrl, defaultModel, timeout);
  return ollamaInstance;
}

module.exports = {
  OllamaService,
  getOllamaService,
  initOllamaService,
};
