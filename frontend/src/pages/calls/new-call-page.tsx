import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/app-shell';
import {
  ApiErrorMessage,
  Button,
  Card,
  Combobox,
  Field,
  Input,
  SimpleSelect,
  Spinner,
  StatusMessage,
} from '@/components/ui';
import { contactsApi, templatesApi, callsApi } from '@/services/endpoints';

const schema = z
  .object({
    mode: z.enum(['contact', 'phone']),
    contactId: z.string().optional(),
    phone: z.string().optional(),
    templateId: z.string().uuid('Select a template'),
  })
  .refine((value) => (value.mode === 'contact' ? Boolean(value.contactId) : Boolean(value.phone)), {
    message: 'Choose a contact or enter a phone number',
    path: ['phone'],
  });

type FormValues = z.infer<typeof schema>;

export const NewCallPage = () => {
  const navigate = useNavigate();
  // "Call again" on a finished call links back here with the same contact and
  // template, so the operator confirms the variables rather than redialling blind.
  const [searchParams] = useSearchParams();
  const presetContactId = searchParams.get('contactId') ?? '';
  const presetPhone = searchParams.get('phone') ?? '';
  const presetTemplateId = searchParams.get('templateId') ?? '';

  const [variables, setVariables] = React.useState<Record<string, string>>({});

  const templates = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list });
  const contacts = useQuery({
    queryKey: ['contacts', { eligibilityStatus: 'ELIGIBLE' }],
    queryFn: () => contactsApi.list({ eligibilityStatus: 'ELIGIBLE', pageSize: 100 }),
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // A call placed to a raw number has no contact to go back to, so it reopens
      // in "phone" mode with that number filled in.
      mode: presetPhone && !presetContactId ? 'phone' : 'contact',
      contactId: presetContactId,
      phone: presetPhone,
      templateId: presetTemplateId,
    },
  });

  const mode = watch('mode');
  const templateId = watch('templateId');
  const contactId = watch('contactId');
  const selectedTemplate = templates.data?.data.find((template) => template.id === templateId);
  const selectedContact = contacts.data?.data.find((contact) => contact.id === contactId);

  /**
   * The backend already fills first_name and full_name from the contact when they
   * are left blank (calls.service.ts). Mirroring that here means the operator sees
   * the name that will actually be spoken, instead of a required-looking field they
   * think they must retype. Picking a different contact replaces these two values;
   * every other variable is left exactly as typed.
   */
  const contactName = selectedContact?.name;
  React.useEffect(() => {
    if (!contactName) return;
    setVariables((current) => ({
      ...current,
      first_name: contactName.split(' ')[0] ?? contactName,
      full_name: contactName,
    }));
  }, [contactName]);

  const createCall = useMutation({
    mutationFn: (values: FormValues) =>
      callsApi.create({
        templateId: values.templateId,
        ...(values.mode === 'contact'
          ? { contactId: values.contactId }
          : { phone: values.phone as string }),
        variables,
      }),
    onSuccess: (call) => navigate(`/calls/${call.id}`),
  });

  const onSubmit = handleSubmit((values) => createCall.mutate(values));

  if (templates.isLoading || contacts.isLoading) return <Spinner label="Loading call setup" />;

  return (
    <>
      <PageHeader
        title="Place a call"
        description="The agent will dial the number, follow the template and record the outcome."
      />

      <Card className="max-w-2xl">
        <form onSubmit={onSubmit} noValidate>
          <Field label="Who are we calling?" htmlFor="mode">
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <SimpleSelect
                  id="mode"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: 'contact', label: 'A saved contact (consent already recorded)' },
                    { value: 'phone', label: 'A phone number I will type in' },
                  ]}
                />
              )}
            />
          </Field>

          {mode === 'contact' ? (
            <Field
              label="Contact"
              htmlFor="contactId"
              required
              hint="Only contacts marked Eligible to call are listed."
              error={errors.contactId?.message}
            >
              <Controller
                control={control}
                name="contactId"
                render={({ field }) => (
                  // A combobox rather than a dropdown: this list runs to hundreds of
                  // names, and an operator knows the name, not its position.
                  <Combobox
                    id="contactId"
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    placeholder="Select a contact"
                    searchPlaceholder="Search by name or number"
                    emptyMessage="No eligible contact matches."
                    options={(contacts.data?.data ?? []).map((contact) => ({
                      value: contact.id,
                      label: `${contact.name} — ${contact.phone}`,
                    }))}
                  />
                )}
              />
            </Field>
          ) : (
            <Field
              label="Phone number"
              htmlFor="phone"
              required
              hint="Indian numbers can be entered as 9876543210 or +919876543210."
              error={errors.phone?.message}
            >
              <Input id="phone" type="tel" inputMode="tel" {...register('phone')} />
            </Field>
          )}

          <Field label="Call template" htmlFor="templateId" required error={errors.templateId?.message}>
            <Controller
              control={control}
              name="templateId"
              render={({ field }) => (
                <SimpleSelect
                  id="templateId"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  placeholder="Select a template"
                  options={(templates.data?.data ?? []).map((template) => ({
                    value: template.id,
                    label: template.name,
                  }))}
                />
              )}
            />
          </Field>

          {selectedTemplate ? (
            <fieldset className="mb-4 min-w-0 rounded-md border border-border p-3 sm:p-4">
              <legend className="px-1 text-sm font-medium">Template variables</legend>
              <p className="mb-3 text-xs text-muted-foreground">
                {selectedTemplate.objective}
              </p>
              {selectedTemplate.variableSchema.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This template has no variables.
                </p>
              ) : (
                selectedTemplate.variableSchema.map((variable) => (
                  <Field
                    key={variable.key}
                    label={variable.label}
                    htmlFor={`var-${variable.key}`}
                    required={variable.required}
                    hint={variable.example ? `Example: ${variable.example}` : undefined}
                  >
                    <Input
                      id={`var-${variable.key}`}
                      value={variables[variable.key] ?? ''}
                      placeholder={variable.example}
                      onChange={(event) =>
                        setVariables((current) => ({
                          ...current,
                          [variable.key]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                ))
              )}
            </fieldset>
          ) : null}

          <Button type="submit" loading={createCall.isPending} className="w-full sm:w-auto">
            {createCall.isPending ? 'Dialling' : 'Start call'}
          </Button>

          {createCall.isError ? (
            <StatusMessage tone="error">
              <ApiErrorMessage error={createCall.error} fallback="The call could not be placed." />
            </StatusMessage>
          ) : null}
        </form>
      </Card>
    </>
  );
};
