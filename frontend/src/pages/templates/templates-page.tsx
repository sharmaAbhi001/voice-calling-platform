import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
  Table,
  Td,
  Th,
  linkButtonClass,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { knowledgeApi, templatesApi } from '@/services/endpoints';

export const TemplatesPage = () => {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const templates = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list });
  const bases = useQuery({ queryKey: ['knowledge-bases'], queryFn: knowledgeApi.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const duplicate = useMutation({
    mutationFn: (id: string) => templatesApi.duplicate(id),
    onSuccess: () => void invalidate(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => {
      setConfirmDelete(null);
      void invalidate();
    },
  });

  const baseName = (id: string | null) =>
    id ? (bases.data?.data.find((base) => base.id === id)?.name ?? 'Unknown') : 'None';

  return (
    <>
      <PageHeader
        title="Templates"
        description="A template defines the objective, the scripts and which knowledge base the agent may quote from."
        action={
          <Link to="/templates/new" className={linkButtonClass()}>
            New template
          </Link>
        }
      />

      {templates.isLoading ? <Spinner label="Loading templates" /> : null}
      {templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      ) : null}
      {templates.data && templates.data.data.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a template before placing a call: it carries the opening line, the objective and the knowledge base."
          action={
            <Link to="/templates/new" className={linkButtonClass()}>
              New template
            </Link>
          }
        />
      ) : null}

      {templates.data && templates.data.data.length > 0 ? (
        <Table>
          <caption className="sr-only">Call templates</caption>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Objective</Th>
              <Th>Knowledge base</Th>
              <Th>Updated</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {templates.data.data.map((template) => (
              <tr key={template.id}>
                <Td>
                  <Link
                    className="font-medium underline underline-offset-2"
                    to={`/templates/${template.id}`}
                  >
                    {template.name}
                  </Link>
                </Td>
                <Td className="max-w-md text-muted-foreground">{template.objective}</Td>
                <Td>{baseName(template.knowledgeBaseId)}</Td>
                <Td>{formatDateTime(template.updatedAt)}</Td>
                <Td>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => duplicate.mutate(template.id)}
                      loading={duplicate.isPending && duplicate.variables === template.id}
                    >
                      Duplicate
                    </Button>
                    {confirmDelete === template.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => remove.mutate(template.id)}
                          loading={remove.isPending}
                        >
                          Confirm delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(template.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </>
  );
};
