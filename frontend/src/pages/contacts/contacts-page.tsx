import { ELIGIBILITY_LABEL, ELIGIBILITY_STATUS, type EligibilityStatus } from '@voiceops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { EligibilityBadge } from '@/components/shared/status-badges';
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  StatusMessage,
  Table,
  Td,
  Textarea,
  Th,
} from '@/components/ui';
import { contactsApi } from '@/services/endpoints';

const CSV_PLACEHOLDER = `name,phone,company,email,tags,eligibilityStatus
Rahul Sharma,9876543210,Acme Pvt Ltd,rahul@acme.example,warm|demo,ELIGIBLE`;

export const ContactsPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [eligibility, setEligibility] = React.useState('');
  const [csv, setCsv] = React.useState('');
  const [form, setForm] = React.useState({ name: '', phone: '', company: '' });

  const contacts = useQuery({
    queryKey: ['contacts', { search, eligibility }],
    queryFn: () =>
      contactsApi.list({
        search: search || undefined,
        eligibilityStatus: eligibility || undefined,
        pageSize: 50,
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contacts'] });

  const createContact = useMutation({
    mutationFn: () => contactsApi.create({ ...form, tags: [] }),
    onSuccess: () => {
      setForm({ name: '', phone: '', company: '' });
      void invalidate();
    },
  });

  const importCsv = useMutation({
    mutationFn: () => contactsApi.importCsv(csv),
    onSuccess: () => void invalidate(),
  });

  const setEligibilityStatus = useMutation({
    mutationFn: (input: { id: string; status: EligibilityStatus }) =>
      contactsApi.update(input.id, { eligibilityStatus: input.status }),
    onSuccess: () => void invalidate(),
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        description="A contact must be marked Eligible to call before the agent will dial it."
      />

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Add a contact</CardTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createContact.mutate();
            }}
            noValidate
          >
            <Field label="Name" htmlFor="name" required>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </Field>
            <Field label="Phone" htmlFor="phone" required hint="Indian numbers default to +91.">
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                required
              />
            </Field>
            <Field label="Company" htmlFor="company">
              <Input
                id="company"
                value={form.company}
                onChange={(event) => setForm({ ...form, company: event.target.value })}
              />
            </Field>
            <Button type="submit" loading={createContact.isPending}>
              Add contact
            </Button>
            {createContact.isError ? (
              <StatusMessage tone="error">
                {createContact.error instanceof Error
                  ? createContact.error.message
                  : 'Could not add the contact.'}
              </StatusMessage>
            ) : null}
            {createContact.isSuccess ? (
              <StatusMessage tone="success">
                Contact added with consent pending. Mark it eligible once consent is recorded.
              </StatusMessage>
            ) : null}
          </form>
        </Card>

        <Card>
          <CardTitle>Import from CSV</CardTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              importCsv.mutate();
            }}
          >
            <Field
              label="CSV content"
              htmlFor="csv"
              hint="Header row required. name and phone are mandatory; tags are separated by |."
            >
              <Textarea
                id="csv"
                rows={6}
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                placeholder={CSV_PLACEHOLDER}
                className="font-mono text-xs"
              />
            </Field>
            <Button type="submit" loading={importCsv.isPending} disabled={!csv.trim()}>
              Import contacts
            </Button>
            {importCsv.data ? (
              <StatusMessage tone={importCsv.data.failed.length ? 'error' : 'success'}>
                Imported {importCsv.data.imported} contacts.
                {importCsv.data.failed.length
                  ? ` ${importCsv.data.failed.length} rows failed: ${importCsv.data.failed
                      .slice(0, 3)
                      .map((failure) => `row ${failure.row} (${failure.reason})`)
                      .join(', ')}`
                  : ''}
              </StatusMessage>
            ) : null}
          </form>
        </Card>
      </div>

      <form className="mb-4 grid gap-4 md:grid-cols-2" role="search" aria-label="Filter contacts">
        <Field label="Search" htmlFor="contact-search">
          <Input
            id="contact-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or phone"
          />
        </Field>
        <Field label="Eligibility" htmlFor="eligibility">
          <Select
            id="eligibility"
            value={eligibility}
            onChange={(event) => setEligibility(event.target.value)}
          >
            <option value="">All contacts</option>
            {ELIGIBILITY_STATUS.map((value) => (
              <option key={value} value={value}>
                {ELIGIBILITY_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>
      </form>

      {contacts.isLoading ? <Spinner label="Loading contacts" /> : null}
      {contacts.isError ? (
        <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
      ) : null}
      {contacts.data && contacts.data.data.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Add one above, or import a CSV exported from your existing system."
        />
      ) : null}

      {contacts.data && contacts.data.data.length > 0 ? (
        <Table>
          <caption className="sr-only">Contacts</caption>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Company</Th>
              <Th>Consent</Th>
              <Th>Change consent</Th>
            </tr>
          </thead>
          <tbody>
            {contacts.data.data.map((contact) => (
              <tr key={contact.id}>
                <Td className="font-medium">{contact.name}</Td>
                <Td className="tabular-nums">{contact.phone}</Td>
                <Td>{contact.company ?? '—'}</Td>
                <Td>
                  <EligibilityBadge status={contact.eligibilityStatus} />
                </Td>
                <Td>
                  <Select
                    aria-label={`Consent status for ${contact.name}`}
                    value={contact.eligibilityStatus}
                    onChange={(event) =>
                      setEligibilityStatus.mutate({
                        id: contact.id,
                        status: event.target.value as EligibilityStatus,
                      })
                    }
                  >
                    {ELIGIBILITY_STATUS.map((value) => (
                      <option key={value} value={value}>
                        {ELIGIBILITY_LABEL[value]}
                      </option>
                    ))}
                  </Select>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </>
  );
};
