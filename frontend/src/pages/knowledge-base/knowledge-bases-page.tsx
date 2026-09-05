import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import {
  ApiErrorMessage,
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
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
          <Button type="submit" loading={create.isPending} className="w-full sm:w-auto">
            Create
          </Button>
          {create.isError ? (
            <StatusMessage tone="error">
              <ApiErrorMessage error={create.error} fallback="Could not create the knowledge base." />
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
          <TableCaption className="sr-only">Knowledge bases</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Published documents</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bases.data.data.map((base) => (
              <TableRow key={base.id}>
                <TableCell label="Name">
                  <Link
                    className="font-medium underline underline-offset-2"
                    to={`/knowledge-bases/${base.id}`}
                  >
                    {base.name}
                  </Link>
                </TableCell>
                <TableCell label="Description" className="text-muted-foreground">
                  {base.description ?? '—'}
                </TableCell>
                <TableCell label="Published documents" className="tabular-nums">
                  {base.documentCount ?? 0}
                </TableCell>
                <TableCell label="Updated">{formatDateTime(base.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </>
  );
};
