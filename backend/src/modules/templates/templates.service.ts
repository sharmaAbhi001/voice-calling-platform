import {
  VOICE_PROVIDER_LABEL,
  VOICE_PROVIDER_LANGUAGES,
  type AgentLanguage,
  type Template,
  type VoiceProvider,
} from '@voiceops/shared';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { knowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';
import { templatesRepository } from './templates.repository.js';
import type { CreateTemplateInput, UpdateTemplateInput } from './templates.validation.js';

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;

/** Every {{placeholder}} used anywhere in the scripts. */
export const extractPlaceholders = (...texts: string[]): string[] => {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(PLACEHOLDER)) {
      if (match[1]) found.add(match[1].toLowerCase());
    }
  }
  return [...found];
};

/** Substitutes variables; anything unresolved is dropped rather than spoken literally. */
export const renderTemplateText = (text: string, variables: Record<string, string>): string =>
  text
    .replace(PLACEHOLDER, (_match, key: string) => variables[key.toLowerCase()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const assertPlaceholdersDeclared = (template: {
  openingScript: string;
  systemPrompt: string;
  closingScript: string;
  variableSchema: Array<{ key: string }>;
}): void => {
  const declared = new Set(template.variableSchema.map((variable) => variable.key));
  const used = extractPlaceholders(
    template.openingScript,
    template.systemPrompt,
    template.closingScript,
  );
  const undeclared = used.filter((key) => !declared.has(key));
  if (undeclared.length > 0) {
    throw badRequest(
      `These placeholders are used but not declared as variables: ${undeclared.join(', ')}`,
      { undeclared },
    );
  }
};

/**
 * Not every provider speaks every language - Deepgram's voices are English-only.
 *
 * This lives in the service rather than the zod schema because a PATCH may carry
 * only one of the two fields, and the rule is about the *merged* result. A schema
 * sees the request; only this layer sees the request applied to the stored row.
 */
const assertProviderSupportsLanguage = (
  language: AgentLanguage,
  voiceProvider: VoiceProvider,
): void => {
  if (VOICE_PROVIDER_LANGUAGES[voiceProvider].includes(language)) return;
  throw badRequest(
    `${VOICE_PROVIDER_LABEL[voiceProvider]} does not support this language. Choose OpenAI or Sarvam AI instead.`,
    { language, voiceProvider },
  );
};

export const templatesService = {
  list(): Promise<Template[]> {
    return templatesRepository.list();
  },

  async getById(id: string): Promise<Template> {
    const template = await templatesRepository.findById(id);
    if (!template) throw notFound('Template');
    return template;
  },

  async create(input: CreateTemplateInput): Promise<Template> {
    if (input.knowledgeBaseId) await knowledgeBaseService.getById(input.knowledgeBaseId);
    assertPlaceholdersDeclared(input);
    assertProviderSupportsLanguage(input.language, input.voiceProvider);

    try {
      return await templatesRepository.create({
        ...input,
        voiceName: input.voiceName ?? null,
        knowledgeBaseId: input.knowledgeBaseId ?? null,
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw conflict('A template with this name already exists');
      }
      throw error;
    }
  },

  async update(id: string, input: UpdateTemplateInput): Promise<Template> {
    const existing = await this.getById(id);
    if (input.knowledgeBaseId) await knowledgeBaseService.getById(input.knowledgeBaseId);

    assertPlaceholdersDeclared({
      openingScript: input.openingScript ?? existing.openingScript,
      systemPrompt: input.systemPrompt ?? existing.systemPrompt,
      closingScript: input.closingScript ?? existing.closingScript,
      variableSchema: input.variableSchema ?? existing.variableSchema,
    });

    assertProviderSupportsLanguage(
      input.language ?? existing.language,
      input.voiceProvider ?? existing.voiceProvider,
    );

    const updated = await templatesRepository.update(id, input);
    if (!updated) throw notFound('Template');
    return updated;
  },

  async remove(id: string): Promise<void> {
    const deleted = await templatesRepository.remove(id);
    if (!deleted) throw notFound('Template');
  },

  async duplicate(id: string): Promise<Template> {
    const source = await this.getById(id);
    return templatesRepository.create({
      ...source,
      name: `${source.name} (copy ${new Date().toISOString().slice(0, 10)})`,
    });
  },

  /** Fails loudly before a call is placed if a required variable has no value. */
  assertVariablesSatisfied(template: Template, variables: Record<string, string>): void {
    const missing = template.variableSchema
      .filter((variable) => variable.required && !variables[variable.key]?.trim())
      .map((variable) => variable.key);
    if (missing.length > 0) {
      throw badRequest(`Missing required template variables: ${missing.join(', ')}`, { missing });
    }
  },

  preview(template: Template, variables: Record<string, string>) {
    return {
      openingScript: renderTemplateText(template.openingScript, variables),
      systemPrompt: renderTemplateText(template.systemPrompt, variables),
      closingScript: renderTemplateText(template.closingScript, variables),
    };
  },
};
