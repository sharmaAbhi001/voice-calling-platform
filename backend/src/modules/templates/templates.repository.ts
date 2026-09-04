import type {
  AgentLanguage,
  BackgroundAudio,
  LlmProvider,
  Template,
  TemplateVariable,
  VoiceProvider,
} from '@voiceops/shared';
import { query } from '../../database/client.js';

interface TemplateRow {
  id: string;
  name: string;
  objective: string;
  opening_script: string;
  system_prompt: string;
  closing_script: string;
  tone: string;
  language: AgentLanguage;
  voice_provider: VoiceProvider;
  llm_provider: LlmProvider;
  voice_name: string | null;
  background_audio: BackgroundAudio;
  qualification_questions: string[];
  variable_schema: TemplateVariable[];
  knowledge_base_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `id, name, objective, opening_script, system_prompt, closing_script, tone, language, voice_provider, llm_provider, voice_name, background_audio,
  qualification_questions, variable_schema, knowledge_base_id, created_at, updated_at`;

const toTemplate = (row: TemplateRow): Template => ({
  id: row.id,
  name: row.name,
  objective: row.objective,
  openingScript: row.opening_script,
  systemPrompt: row.system_prompt,
  closingScript: row.closing_script,
  tone: row.tone,
  language: row.language,
  voiceProvider: row.voice_provider,
  llmProvider: row.llm_provider,
  voiceName: row.voice_name,
  backgroundAudio: row.background_audio,
  qualificationQuestions: row.qualification_questions,
  variableSchema: row.variable_schema,
  knowledgeBaseId: row.knowledge_base_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
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
    const { rows } = await query<TemplateRow>(
      `SELECT ${COLUMNS} FROM templates ORDER BY created_at DESC`,
    );
    return rows.map(toTemplate);
  },

  async findById(id: string): Promise<Template | null> {
    const { rows } = await query<TemplateRow>(`SELECT ${COLUMNS} FROM templates WHERE id = $1`, [
      id,
    ]);
    return rows[0] ? toTemplate(rows[0]) : null;
  },

  async create(input: TemplateWrite): Promise<Template> {
    const { rows } = await query<TemplateRow>(
      `INSERT INTO templates
         (name, objective, opening_script, system_prompt, closing_script, tone, language, voice_provider,
          llm_provider, voice_name, background_audio,
          qualification_questions, variable_schema, knowledge_base_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
       RETURNING ${COLUMNS}`,
      [
        input.name,
        input.objective,
        input.openingScript,
        input.systemPrompt,
        input.closingScript,
        input.tone,
        input.language,
        input.voiceProvider,
        input.llmProvider,
        input.voiceName,
        input.backgroundAudio,
        input.qualificationQuestions,
        JSON.stringify(input.variableSchema),
        input.knowledgeBaseId,
      ],
    );
    return toTemplate(rows[0] as TemplateRow);
  },

  async update(id: string, input: Partial<TemplateWrite>): Promise<Template | null> {
    const { rows } = await query<TemplateRow>(
      `UPDATE templates SET
         name = COALESCE($2, name),
         objective = COALESCE($3, objective),
         opening_script = COALESCE($4, opening_script),
         system_prompt = COALESCE($5, system_prompt),
         closing_script = COALESCE($6, closing_script),
         tone = COALESCE($7, tone),
         language = COALESCE($8, language),
         voice_provider = COALESCE($9, voice_provider),
         llm_provider = COALESCE($10, llm_provider),
         voice_name = CASE WHEN $11::boolean THEN $12 ELSE voice_name END,
         background_audio = COALESCE($13, background_audio),
         qualification_questions = COALESCE($14, qualification_questions),
         variable_schema = COALESCE($15::jsonb, variable_schema),
         knowledge_base_id = CASE WHEN $16::boolean THEN $17::uuid ELSE knowledge_base_id END
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        input.name ?? null,
        input.objective ?? null,
        input.openingScript ?? null,
        input.systemPrompt ?? null,
        input.closingScript ?? null,
        input.tone ?? null,
        input.language ?? null,
        input.voiceProvider ?? null,
        input.llmProvider ?? null,
        // voiceName is nullable, so "clear it" and "leave it alone" need a flag.
        input.voiceName !== undefined,
        input.voiceName ?? null,
        input.backgroundAudio ?? null,
        input.qualificationQuestions ?? null,
        input.variableSchema ? JSON.stringify(input.variableSchema) : null,
        // knowledgeBaseId is nullable, so "clear it" and "leave it alone" need a flag.
        input.knowledgeBaseId !== undefined,
        input.knowledgeBaseId ?? null,
      ],
    );
    return rows[0] ? toTemplate(rows[0]) : null;
  },

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await query('DELETE FROM templates WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
