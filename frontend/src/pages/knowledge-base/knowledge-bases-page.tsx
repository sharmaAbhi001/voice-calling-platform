import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  StatusMessage,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { knowledgeApi } from '@/services/endpoints';

export const KnowledgeBasesPage = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({ name: '', description: '' });

  const bases = useQuery({ queryKey: ['knowledge-bases'], queryFn: knowledgeApi.list });

  const create = useMutation({
    mutationFn: () => knowledgeApi.create(form),
    onSuccess: () => {
      setForm({ name: '', description: '' });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="The only source of facts the agent is allowed to quote on a call."
      />

      <Card className="mb-6 max-w-xl">
        <CardTitle>Create a knowledge base</CardTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          noValidate
        >
          <Field label="Name" htmlFor="kb-name" required>
            <Input
              id="kb-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </Field>
          <Field label="Description" htmlFor="kb-description">
            <Input
              id="kb-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <Button type="submit" loading={create.isPending}>
            Create
          </Button>
          {create.isError ? (
            <StatusMessage tone="error">
              {create.error instanceof Error ? create.error.message : 'Could not create.'}
            </StatusMessage>
          ) : null}
        </form>
      </Card>

      {bases.isLoading ? <Spinner label="Loading knowledge bases" /> : null}
      {bases.isError ? <ErrorState error={bases.error} onRetry={() => void bases.refetch()} /> : null}
      {bases.data && bases.data.data.length === 0 ? (
        <EmptyState
          title="No knowledge bases yet"
          description="Create one above and add documents for company info, pricing, features and policies."
        />
      ) : null}

      {bases.data && bases.data.data.length > 0 ? (
        <Table>
          <caption className="sr-only">Knowledge bases</caption>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th>Published documents</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {bases.data.data.map((base) => (
              <tr key={base.id}>
                <Td>
                  <Link
                    className="font-medium underline underline-offset-2"
                    to={`/knowledge-bases/${base.id}`}
                  >
                    {base.name}
                  </Link>
                </Td>
                <Td className="text-muted-foreground">{base.description ?? '—'}</Td>
                <Td className="tabular-nums">{base.documentCount ?? 0}</Td>
                <Td>{formatDateTime(base.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </>
  );
};
