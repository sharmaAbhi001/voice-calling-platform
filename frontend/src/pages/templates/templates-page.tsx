import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  TableSkeleton,
  toast,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
    onSuccess: (created) => {
      toast.success(`Duplicated as "${created.name}".`);
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not duplicate the template.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => {
      setConfirmDelete(null);
      toast.success('Template deleted.');
      void invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not delete the template.'),
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

      {templates.isLoading ? <TableSkeleton columns={5} /> : null}
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

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Delete this template?"
        description="Calls already placed with it keep their transcripts, but no new call can use it. This cannot be undone."
        confirmLabel="Delete template"
        loading={remove.isPending}
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete);
        }}
      />

      {templates.data && templates.data.data.length > 0 ? (
        <Table>
          <TableCaption className="sr-only">Call templates</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Objective</TableHead>
              <TableHead>Knowledge base</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.data.data.map((template) => (
              <TableRow key={template.id}>
                <TableCell label="Name">
                  <Link
                    className="font-medium underline underline-offset-2"
                    to={`/templates/${template.id}`}
                  >
                    {template.name}
                  </Link>
                </TableCell>
                <TableCell label="Objective" className="max-w-md text-muted-foreground">
                  {template.objective}
                </TableCell>
                <TableCell label="Knowledge base">{baseName(template.knowledgeBaseId)}</TableCell>
                <TableCell label="Updated">{formatDateTime(template.updatedAt)}</TableCell>
                <TableCell label="Actions" stack>
                  {/* Row actions collapse into one menu: three buttons per row is a
                      lot of tap targets on a phone, and only one is used often. */}
                  <div className="flex justify-end md:justify-start">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${template.name}`}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/templates/${template.id}`}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => duplicate.mutate(template.id)}>
                          <Copy aria-hidden="true" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setConfirmDelete(template.id)}
                        >
                          <Trash2 aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </>
  );
};
