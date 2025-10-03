import { generateOllamaJson } from './ollama';
import { logger } from '../../utils/logger';

interface IcebreakerInput {
  contact: Record<string, unknown>;
  company?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

interface IcebreakerResponse {
  text: string;
}

const MAX_CONTEXT_LENGTH = 1200;

function truncate(value: string, max = MAX_CONTEXT_LENGTH): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}

export async function generateIcebreaker({ contact, company, context }: IcebreakerInput): Promise<IcebreakerResponse> {
  const promptParts = [
    'Write a warm, 1-2 sentence icebreaker for a cold outreach email. Use the provided contact and company context.',
    'Tone: curious, positive, no assumptions about prior relationship. Do not include greetings or closings.',
    'Keep it under 220 characters. Output JSON with key "text".',
    `Contact: ${truncate(JSON.stringify(contact))}`,
  ];

  if (company) {
    promptParts.push(`Company: ${truncate(JSON.stringify(company))}`);
  }
  if (context) {
    promptParts.push(`Context: ${truncate(JSON.stringify(context))}`);
  }
  promptParts.push('JSON:');

  try {
    const aiResponse = (await generateOllamaJson(promptParts.join('\n'), { maxTokens: 200 })) as
      | IcebreakerResponse
      | null;
    if (aiResponse?.text) {
      return { text: aiResponse.text.slice(0, 220) };
    }
  } catch (error) {
    logger.warn({ err: error }, 'Icebreaker generation failed');
  }

  const fallbackText = (() => {
    const firstName = (contact.first_name as string) || (contact.full_name as string) || 'there';
    const title = (contact.title as string) || 'your role';
    const companyName = (company?.name as string) || (contact.company as string) || 'your company';
    return `Hi ${firstName}, I was impressed by the recent work ${companyName} is doing and wanted to learn more about how you lead ${title.toLowerCase()}.`;
  })();

  return { text: fallbackText.slice(0, 220) };
}
