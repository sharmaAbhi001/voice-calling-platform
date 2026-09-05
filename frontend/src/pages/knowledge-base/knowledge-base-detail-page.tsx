import { KB_CATEGORY, KB_CATEGORY_LABEL, type KbCategory } from '@voiceops/shared';
import { MoreHorizontal, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import {
  ApiErrorMessage,
  Alert,
  AlertDescription,
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  SimpleSelect,
  Spinner,
  StatusMessage,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  Textarea,
  toast,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatApiError } from '@/lib/api-error';
import { knowledgeApi } from '@/services/endpoints';

const EMPTY_DOCUMENT = {
  title: '',
  category: 'OTHER' as KbCategory,
  content: '',
  status: 'PUBLISHED' as const,
};

export const KnowledgeBaseDetailPage = () => {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState(EMPTY_DOCUMENT);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [probe, setProbe] = React.useState('');

  const base = useQuery({ queryKey: ['knowledge-bases', id], queryFn: () => knowledgeApi.get(id) });
  const documents = useQuery({
    queryKey: ['knowledge-bases', id, 'documents'],
    queryFn: () => knowledgeApi.documents(id),
  });
  const health = useQuery({
    queryKey: ['knowledge-bases', id, 'health'],
    queryFn: () => knowledgeApi.health(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['knowledge-bases', id] });
  };

  const saveDocument = useMutation({
    mutationFn: () =>
      editingId
        ? knowledgeApi.updateDocument(id, editingId, draft)
        : knowledgeApi.addDocument(id, draft),
    onSuccess: () => {
      setDraft(EMPTY_DOCUMENT);
      setEditingId(null);
      invalidate();
    },
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: string) => knowledgeApi.deleteDocument(id, documentId),
    onSuccess: () => {
      setConfirmDelete(null);
      toast.success('Document deleted.');
      invalidate();
    },
    onError: (error) =>
      toast.error(formatApiError(error, 'Could not delete the document.')),
  });

  const reindex = useMutation({
    mutationFn: () => knowledgeApi.reindex(id),
    onSuccess: () => {
      toast.success('Reindex started.');
      invalidate();
    },
    onError: (error) =>
      toast.error(formatApiError(error, 'Could not start the reindex.')),
  });

  // The retrieval preview runs the exact pipeline the agent's tool uses.
  const search = useMutation({ mutationFn: () => knowledgeApi.search(id, probe) });

  if (base.isLoading) return <Spinner label="Loading knowledge base" />;
  if (base.isError) return <ErrorState error={base.error} onRetry={() => void base.refetch()} />;

  return (
    <>
      <PageHeader
        title={base.data?.name ?? 'Knowledge base'}
        description={base.data?.description ?? 'Documents the agent may quote from.'}
        action={
          <Link to="/knowledge-bases" className="text-sm underline underline-offset-2">
            All knowledge bases
          </Link>
        }
      />

      {health.data && !health.data.embeddingsConfigured ? (
        <Alert variant="warning" className="mb-5">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            OPENAI_API_KEY is not configured, so retrieval is running on keyword search only. Set
            the key and reindex for semantic retrieval.
          </AlertDescription>
        </Alert>
      ) : null}
      {health.data && health.data.chunksMissingEmbeddings > 0 ? (
        <Alert variant="warning" className="mb-5">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{health.data.chunksMissingEmbeddings} chunks have no embedding.</span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              loading={reindex.isPending}
              onClick={() => reindex.mutate()}
            >
              Reindex now
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>{editingId ? 'Edit document' : 'Add a document'}</CardTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveDocument.mutate();
            }}
            noValidate
          >
            <Field label="Title" htmlFor="doc-title" required>
              <Input
                id="doc-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                required
              />
            </Field>
            <Field
              label="Category"
              htmlFor="doc-category"
              hint="The retrieval classifier uses categories to narrow the search."
            >
              <SimpleSelect
                id="doc-category"
                value={draft.category}
                onValueChange={(category) =>
                  setDraft({ ...draft, category: category as KbCategory })
                }
                options={KB_CATEGORY.map((category) => ({
                  value: category,
                  label: KB_CATEGORY_LABEL[category],
                }))}
              />
            </Field>
            <Field
              label="Content"
              htmlFor="doc-content"
              required
              hint="Write it the way you would answer on a call. Separate distinct facts with blank lines: each block becomes one retrievable chunk."
            >
              <Textarea
                id="doc-content"
                rows={10}
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                required
              />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" loading={saveDocument.isPending}>
                {editingId ? 'Save document' : 'Add document'}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setDraft(EMPTY_DOCUMENT);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            {saveDocument.isError ? (
              <StatusMessage tone="error">
                <ApiErrorMessage
                  error={saveDocument.error}
                  fallback="Could not save the document."
                />
              </StatusMessage>
            ) : null}
            {saveDocument.isSuccess ? (
              <StatusMessage tone="success">Document saved and indexed.</StatusMessage>
            ) : null}
          </form>
        </Card>

        <Card>
          <CardTitle>Test retrieval</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Ask a question the way a customer would. This runs the same classification, step-back
            rewrite and search the agent uses mid-call.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              search.mutate();
            }}
          >
            <Field label="Customer question" htmlFor="probe">
              <Input
                id="probe"
                value={probe}
                onChange={(event) => setProbe(event.target.value)}
                placeholder="so for 40 people would it come down a bit?"
              />
            </Field>
            <Button
              type="submit"
              loading={search.isPending}
              disabled={!probe.trim()}
              className="w-full sm:w-auto"
            >
              Run retrieval
            </Button>
          </form>

          {search.data ? (
            <div className="mt-4">
              <p className="mb-2 text-sm">
                <Badge tone={search.data.grounded ? 'success' : 'danger'}>
                  {search.data.grounded ? 'Grounded answer available' : 'No grounded content'}
                </Badge>
              </p>
              {!search.data.grounded ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  On a call the agent would say it does not have this information instead of
                  answering.
                </p>
              ) : null}
              {search.data.analysis ? (
                <dl className="mb-3 rounded-md bg-secondary p-3 text-sm">
                  <dt className="font-medium">Step-back question</dt>
                  <dd className="mb-2 text-muted-foreground">
                    {search.data.analysis.stepBackQuestion}
                  </dd>
                  <dt className="font-medium">Categories searched</dt>
                  <dd className="text-muted-foreground">
                    {search.data.analysis.categories.length
                      ? search.data.analysis.categories.join(', ')
                      : 'All categories'}
                  </dd>
                </dl>
              ) : null}
              <ol className="space-y-3">
                {search.data.passages.map((passage) => (
                  <li key={`${passage.documentId}-${passage.content.slice(0, 20)}`}>
                    <p className="text-sm font-medium">
                      {passage.documentTitle}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        {KB_CATEGORY_LABEL[passage.category]} · score{' '}
                        {passage.similarity.toFixed(2)}
                      </span>
                    </p>
                    <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                      {passage.content}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Documents</h2>
      {documents.isLoading ? <Spinner label="Loading documents" /> : null}
      {documents.isError ? (
        <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />
      ) : null}
      {documents.data && documents.data.data.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Until a document is added the agent cannot state any fact about your company or product."
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Delete this document?"
        description="The agent will no longer be able to quote anything in it. This cannot be undone."
        confirmLabel="Delete document"
        loading={deleteDocument.isPending}
        onConfirm={() => {
          if (confirmDelete) deleteDocument.mutate(confirmDelete);
        }}
      />

      {documents.data && documents.data.data.length > 0 ? (
        <Table>
          <TableCaption className="sr-only">Documents in this knowledge base</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.data.data.map((document) => (
              <TableRow key={document.id}>
                <TableCell label="Title" className="font-medium">
                  {document.title}
                </TableCell>
                <TableCell label="Category">{KB_CATEGORY_LABEL[document.category]}</TableCell>
                <TableCell label="Status">
                  <Badge tone={document.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {document.status === 'PUBLISHED' ? 'Published' : 'Not published'}
                  </Badge>
                </TableCell>
                <TableCell label="Chunks" className="tabular-nums">
                  {document.chunkCount ?? 0}
                </TableCell>
                <TableCell label="Version" className="tabular-nums">
                  v{document.version}
                </TableCell>
                <TableCell label="Actions" stack>
                  <div className="flex justify-end md:justify-start">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${document.title}`}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditingId(document.id);
                            setDraft({
                              title: document.title,
                              category: document.category,
                              content: document.content,
                              status: 'PUBLISHED',
                            });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setConfirmDelete(document.id)}
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
