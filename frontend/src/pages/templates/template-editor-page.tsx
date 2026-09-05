import {
  AGENT_LANGUAGE,
  AGENT_LANGUAGE_LABEL,
  BACKGROUND_AUDIO,
  BACKGROUND_AUDIO_LABEL,
  LLM_PROVIDER,
  LLM_PROVIDER_LABEL,
  VOICES_BY_PROVIDER,
  VOICE_PROVIDER,
  VOICE_PROVIDER_LABEL,
  type AgentLanguage,
  type BackgroundAudio,
  type LlmProvider,
  type TemplateVariable,
  type VoiceProvider,
} from '@voiceops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import {
  ApiErrorMessage,
  Button,
  Card,
  CardTitle,
  ErrorState,
  Field,
  Input,
  Checkbox,
  SimpleSelect,
  Spinner,
  StatusMessage,
  Textarea,
} from '@/components/ui';
import { knowledgeApi, templatesApi } from '@/services/endpoints';

interface FormState {
  name: string;
  objective: string;
  openingScript: string;
  systemPrompt: string;
  closingScript: string;
  tone: string;
  language: AgentLanguage;
  voiceProvider: VoiceProvider;
  llmProvider: LlmProvider;
  voiceName: string;
  backgroundAudio: BackgroundAudio;
  qualificationQuestions: string;
  variableSchema: TemplateVariable[];
  knowledgeBaseId: string;
}

const EMPTY: FormState = {
  name: '',
  objective: '',
  openingScript: 'Hello {{first_name}}, this is {{agent_name}} calling from {{company}}.',
  systemPrompt: '',
  closingScript: 'Thank you for your time, {{first_name}}. Have a good day.',
  tone: 'Professional and friendly',
  language: 'EN',
  voiceProvider: 'OPENAI',
  llmProvider: 'OPENAI',
  voiceName: '',
  backgroundAudio: 'NONE',
  qualificationQuestions: '',
  variableSchema: [
    { key: 'first_name', label: 'Customer first name', required: true },
    { key: 'company', label: 'Your company name', required: true },
    { key: 'agent_name', label: 'Agent name', required: true },
  ],
  knowledgeBaseId: '',
};

export const TemplateEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id;

  const [form, setForm] = React.useState<FormState>(EMPTY);

  const bases = useQuery({ queryKey: ['knowledge-bases'], queryFn: knowledgeApi.list });
  const template = useQuery({
    queryKey: ['templates', id],
    queryFn: () => templatesApi.get(id as string),
    enabled: !isNew,
  });

  React.useEffect(() => {
    if (!template.data) return;
    setForm({
      name: template.data.name,
      objective: template.data.objective,
      openingScript: template.data.openingScript,
      systemPrompt: template.data.systemPrompt,
      closingScript: template.data.closingScript,
      tone: template.data.tone,
      language: template.data.language,
      voiceProvider: template.data.voiceProvider,
      llmProvider: template.data.llmProvider,
      voiceName: template.data.voiceName ?? '',
      backgroundAudio: template.data.backgroundAudio,
      qualificationQuestions: template.data.qualificationQuestions.join('\n'),
      variableSchema: template.data.variableSchema,
      knowledgeBaseId: template.data.knowledgeBaseId ?? '',
    });
  }, [template.data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        objective: form.objective,
        openingScript: form.openingScript,
        systemPrompt: form.systemPrompt,
        closingScript: form.closingScript,
        tone: form.tone,
        language: form.language,
        voiceProvider: form.voiceProvider,
        llmProvider: form.llmProvider,
        voiceName: form.voiceName || null,
        backgroundAudio: form.backgroundAudio,
        qualificationQuestions: form.qualificationQuestions
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        variableSchema: form.variableSchema,
        knowledgeBaseId: form.knowledgeBaseId || null,
      };
      return isNew ? templatesApi.create(payload) : templatesApi.update(id as string, payload);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (isNew) navigate(`/templates/${saved.id}`);
    },
  });

  if (!isNew && template.isLoading) return <Spinner label="Loading template" />;
  if (!isNew && template.isError) {
    return <ErrorState error={template.error} onRetry={() => void template.refetch()} />;
  }

  const updateVariable = (index: number, patch: Partial<TemplateVariable>) =>
    setForm((current) => ({
      ...current,
      variableSchema: current.variableSchema.map((variable, position) =>
        position === index ? { ...variable, ...patch } : variable,
      ),
    }));

  return (
    <>
      <PageHeader
        title={isNew ? 'New template' : form.name || 'Edit template'}
        description="Placeholders like {{first_name}} are filled in per call. Never put a customer's details in the script itself."
      />

      <form
        className="grid max-w-4xl gap-4 sm:gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
        noValidate
      >
        <Card>
          <CardTitle>Basics</CardTitle>
          <Field label="Template name" htmlFor="name" required>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </Field>
          <Field
            label="Objective"
            htmlFor="objective"
            required
            hint="What this call is meant to achieve. The agent is told this directly."
          >
            <Textarea
              id="objective"
              value={form.objective}
              onChange={(event) => setForm({ ...form, objective: event.target.value })}
              required
            />
          </Field>
          <Field label="Tone" htmlFor="tone">
            <Input
              id="tone"
              value={form.tone}
              onChange={(event) => setForm({ ...form, tone: event.target.value })}
            />
          </Field>
          <Field
            label="Language"
            htmlFor="language"
            hint="Sets how the agent speaks and how speech is transcribed. Write the scripts below in the same language."
          >
            <SimpleSelect
              id="language"
              value={form.language}
              onValueChange={(language) =>
                setForm({ ...form, language: language as AgentLanguage })
              }
              options={AGENT_LANGUAGE.map((code) => ({
                value: code,
                label: AGENT_LANGUAGE_LABEL[code],
              }))}
            />
          </Field>
          <Field
            label="Knowledge base"
            htmlFor="knowledgeBaseId"
            hint="Without a knowledge base the agent may not state any company or product fact."
          >
            <SimpleSelect
              id="knowledgeBaseId"
              value={form.knowledgeBaseId}
              onValueChange={(knowledgeBaseId) => setForm({ ...form, knowledgeBaseId })}
              placeholder="No knowledge base"
              options={[
                { value: '', label: 'No knowledge base' },
                ...(bases.data?.data ?? []).map((base) => ({ value: base.id, label: base.name })),
              ]}
            />
          </Field>
        </Card>

        <Card>
          <CardTitle>Voice &amp; model</CardTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            Which providers run this campaign. Speech, conversation and voice are chosen
            separately, so you can pair an Indian-language voice with whichever model
            answers best.
          </p>

          <div className="grid gap-x-5 sm:grid-cols-2">
            <Field
              label="Speech provider"
              htmlFor="voiceProvider"
              hint="Handles listening and speaking. Sarvam is built for Indian languages and Hindi/English mixing."
            >
              <SimpleSelect
                id="voiceProvider"
                value={form.voiceProvider}
                onValueChange={(voiceProvider) =>
                  // Voices are provider-specific, so a provider change resets the voice
                  // rather than sending a name the new provider will reject.
                  setForm({
                    ...form,
                    voiceProvider: voiceProvider as VoiceProvider,
                    voiceName: '',
                  })
                }
                options={VOICE_PROVIDER.map((code) => ({
                  value: code,
                  label: VOICE_PROVIDER_LABEL[code],
                }))}
              />
            </Field>

            <Field
              label="Voice"
              htmlFor="voiceName"
              hint="Leave on the default unless you have a preference."
            >
              <SimpleSelect
                id="voiceName"
                value={form.voiceName}
                onValueChange={(voiceName) => setForm({ ...form, voiceName })}
                placeholder="Provider default"
                options={[
                  { value: '', label: 'Provider default' },
                  ...VOICES_BY_PROVIDER[form.voiceProvider].map((voice) => ({
                    value: voice.id,
                    label: voice.label,
                  })),
                ]}
              />
            </Field>

            <Field
              label="Conversation model"
              htmlFor="llmProvider"
              hint="Decides what the agent says. Both options support the knowledge-base lookup the guard rails depend on."
            >
              <SimpleSelect
                id="llmProvider"
                value={form.llmProvider}
                onValueChange={(llmProvider) =>
                  setForm({ ...form, llmProvider: llmProvider as LlmProvider })
                }
                options={LLM_PROVIDER.map((code) => ({
                  value: code,
                  label: LLM_PROVIDER_LABEL[code],
                }))}
              />
            </Field>

            <Field
              label="Background sound"
              htmlFor="backgroundAudio"
              hint="Quiet office noise makes the call sound like a person phoning from a workplace rather than a silent line."
            >
              <SimpleSelect
                id="backgroundAudio"
                value={form.backgroundAudio}
                onValueChange={(backgroundAudio) =>
                  setForm({ ...form, backgroundAudio: backgroundAudio as BackgroundAudio })
                }
                options={BACKGROUND_AUDIO.map((code) => ({
                  value: code,
                  label: BACKGROUND_AUDIO_LABEL[code],
                }))}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Scripts</CardTitle>
          <Field
            label="Opening script"
            htmlFor="openingScript"
            required
            hint="Spoken word for word as the first line of the call."
          >
            <Textarea
              id="openingScript"
              value={form.openingScript}
              onChange={(event) => setForm({ ...form, openingScript: event.target.value })}
              required
            />
          </Field>
          <Field
            label="System prompt"
            htmlFor="systemPrompt"
            required
            hint="Guidance for this call. The platform's anti-hallucination rules are always applied on top and cannot be overridden here."
          >
            <Textarea
              id="systemPrompt"
              rows={6}
              value={form.systemPrompt}
              onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
              required
            />
          </Field>
          <Field label="Closing script" htmlFor="closingScript" required>
            <Textarea
              id="closingScript"
              value={form.closingScript}
              onChange={(event) => setForm({ ...form, closingScript: event.target.value })}
              required
            />
          </Field>
          <Field
            label="Qualification questions"
            htmlFor="qualificationQuestions"
            hint="One per line. The agent works them in naturally rather than reading them out."
          >
            <Textarea
              id="qualificationQuestions"
              rows={4}
              value={form.qualificationQuestions}
              onChange={(event) =>
                setForm({ ...form, qualificationQuestions: event.target.value })
              }
            />
          </Field>
        </Card>

        <Card>
          <CardTitle>Variables</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Every placeholder used in a script must be declared here.
          </p>
          {form.variableSchema.map((variable, index) => (
            <div key={index} className="mb-3 grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Key" htmlFor={`key-${index}`}>
                <Input
                  id={`key-${index}`}
                  value={variable.key}
                  onChange={(event) => updateVariable(index, { key: event.target.value })}
                />
              </Field>
              <Field label="Label" htmlFor={`label-${index}`}>
                <Input
                  id={`label-${index}`}
                  value={variable.label}
                  onChange={(event) => updateVariable(index, { label: event.target.value })}
                />
              </Field>
              <div className="mb-4 flex items-center gap-3 sm:mb-0 sm:items-end sm:pb-4">
                <label
                  htmlFor={`required-${index}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    id={`required-${index}`}
                    checked={variable.required}
                    onCheckedChange={(checked) =>
                      updateVariable(index, { required: checked === true })
                    }
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      variableSchema: current.variableSchema.filter(
                        (_item, position) => position !== index,
                      ),
                    }))
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() =>
              setForm((current) => ({
                ...current,
                variableSchema: [
                  ...current.variableSchema,
                  { key: '', label: '', required: false },
                ],
              }))
            }
          >
            Add variable
          </Button>
        </Card>

        <div>
          <Button type="submit" loading={save.isPending} className="w-full sm:w-auto">
            {isNew ? 'Create template' : 'Save changes'}
          </Button>
          {save.isError ? (
            <StatusMessage tone="error">
              <ApiErrorMessage error={save.error} fallback="The template could not be saved." />
            </StatusMessage>
          ) : null}
          {save.isSuccess ? <StatusMessage tone="success">Template saved.</StatusMessage> : null}
        </div>
      </form>
    </>
  );
};
