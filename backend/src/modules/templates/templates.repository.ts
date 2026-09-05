import type {
  AgentLanguage,
  BackgroundAudio,
  LlmProvider,
  Template,
  TemplateVariable,
  VoiceProvider,
} from '@voiceops/shared';
import { Prisma, type Template as TemplateRow } from '@prisma/client';
import { prisma } from '../../database/client.js';

const toTemplate = (row: TemplateRow): Template => ({
  id: row.id,
  name: row.name,
  objective: row.objective,
  openingScript: row.openingScript,
  systemPrompt: row.systemPrompt,
  closingScript: row.closingScript,
  tone: row.tone,
  language: row.language as AgentLanguage,
  voiceProvider: row.voiceProvider as VoiceProvider,
  llmProvider: row.llmProvider as LlmProvider,
  voiceName: row.voiceName,
  backgroundAudio: row.backgroundAudio as BackgroundAudio,
  qualificationQuestions: row.qualificationQuestions,
  variableSchema: row.variableSchema as unknown as TemplateVariable[],
  knowledgeBaseId: row.knowledgeBaseId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export interface TemplateWrite {
  name: string;
  objective: string;
  openingScript: string;
  systemPrompt: string;
  closingScript: string;
  tone: string;
  language: AgentLanguage;
  voiceProvider: VoiceProvider;
  llmProvider: LlmProvider;
  voiceName: string | null;
  backgroundAudio: BackgroundAudio;
  qualificationQuestions: string[];
  variableSchema: TemplateVariable[];
  knowledgeBaseId: string | null;
}

export const templatesRepository = {
  async list(): Promise<Template[]> {
    const rows = await prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toTemplate);
  },

  async findById(id: string): Promise<Template | null> {
    const row = await prisma.template.findUnique({ where: { id } });
    return row ? toTemplate(row) : null;
  },

  async create(input: TemplateWrite): Promise<Template> {
    const row = await prisma.template.create({
      data: {
        ...input,
        variableSchema: input.variableSchema as unknown as Prisma.InputJsonValue,
      },
    });
    return toTemplate(row);
  },

  async update(id: string, input: Partial<TemplateWrite>): Promise<Template | null> {
    // Unchecked so knowledge_base_id can be written as a plain nullable column
    // instead of a connect/disconnect, which updateMany cannot express.
    const data: Prisma.TemplateUncheckedUpdateManyInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.objective !== undefined) data.objective = input.objective;
    if (input.openingScript !== undefined) data.openingScript = input.openingScript;
    if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
    if (input.closingScript !== undefined) data.closingScript = input.closingScript;
    if (input.tone !== undefined) data.tone = input.tone;
    if (input.language !== undefined) data.language = input.language;
    if (input.voiceProvider !== undefined) data.voiceProvider = input.voiceProvider;
    if (input.llmProvider !== undefined) data.llmProvider = input.llmProvider;
    // voiceName and knowledgeBaseId are nullable: an explicit null clears them,
    // undefined leaves them alone. `in input` is what tells the two apart.
    if (input.voiceName !== undefined) data.voiceName = input.voiceName;
    if (input.backgroundAudio !== undefined) data.backgroundAudio = input.backgroundAudio;
    if (input.qualificationQuestions !== undefined) {
      data.qualificationQuestions = input.qualificationQuestions;
    }
    if (input.variableSchema !== undefined) {
      data.variableSchema = input.variableSchema as unknown as Prisma.InputJsonValue;
    }
    if (input.knowledgeBaseId !== undefined) data.knowledgeBaseId = input.knowledgeBaseId;

    // updateMany rather than update so a missing row is null, not a thrown P2025.
    const { count } = await prisma.template.updateMany({ where: { id }, data });
    return count > 0 ? this.findById(id) : null;
  },

  async remove(id: string): Promise<boolean> {
    const { count } = await prisma.template.deleteMany({ where: { id } });
    return count > 0;
  },
};
