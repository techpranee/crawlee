import { load, type CheerioAPI, type Element } from 'cheerio';

interface SelectorSuggestInput {
  html?: string;
  url?: string;
  fields: string[];
}

interface SelectorSuggestOutput {
  selectors: Record<string, string>;
}

const FIELD_SYNONYMS: Record<string, string[]> = {
  name: ['name', 'full name'],
  title: ['title', 'role', 'position'],
  email: ['email', 'e-mail'],
  phone: ['phone', 'telephone'],
  company: ['company', 'organization'],
  linkedin: ['linkedin'],
};

function buildCssSelector(element: Element, $: CheerioAPI): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.type === 'tag') {
    const tag = current.name;
    const id = $(current).attr('id');
    if (id) {
      parts.unshift(`${tag}#${id}`);
      break;
    }
    const className = ($(current).attr('class') ?? '').split(/\s+/).filter(Boolean)[0];
    if (className) {
      parts.unshift(`${tag}.${className}`);
    } else {
      const parent = current.parent as Element | undefined;
      if (parent) {
        const index = $(parent)
          .children(tag)
          .index(current);
        parts.unshift(`${tag}:nth-of-type(${index + 1})`);
      } else {
        parts.unshift(tag);
      }
    }
    current = current.parent as Element | null;
  }
  return parts.join(' > ');
}

function findBestMatch($: CheerioAPI, field: string): string | null {
  const synonyms = FIELD_SYNONYMS[field.toLowerCase()] ?? [field];
  let bestMatch: { selector: string; score: number } | undefined;

  $('body *')
    .toArray()
    .forEach((element) => {
      const text = $(element).text().trim().toLowerCase();
      if (!text) {
        return;
      }
      let score = 0;
      for (const synonym of synonyms) {
        if (text.includes(synonym)) {
          score += synonym.length;
        }
      }
      if (score > 0) {
        const selector = buildCssSelector(element, $);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { selector, score };
        }
      }
    });

  return bestMatch ? bestMatch.selector : null;
}

export async function suggestSelectors({ html, url, fields }: SelectorSuggestInput): Promise<SelectorSuggestOutput> {
  let content = html ?? '';
  if (!content && url) {
    const response = await fetch(url);
    content = await response.text();
  }
  if (!content) {
    throw new Error('Either html or url must be provided');
  }

  const $ = load(content);
  const selectors: Record<string, string> = {};

  for (const field of fields) {
    const match = findBestMatch($, field);
    if (match) {
      selectors[field] = match;
    }
  }

  return { selectors };
}
