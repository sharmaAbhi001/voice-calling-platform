import { CALL_OUTCOME, CALL_OUTCOME_LABEL, CALL_STATUS, CALL_STATUS_LABEL } from '@voiceops/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import { CallOutcomeBadge, CallStatusBadge } from '@/components/shared/status-badges';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  linkButtonClass,
} from '@/components/ui';
import { formatDateTime, formatDuration, maskPhone } from '@/lib/utils';
import { callsApi } from '@/services/endpoints';

const PAGE_SIZE = 20;

export const CallsPage = () => {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [outcome, setOutcome] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [page, setPage] = React.useState(1);

  const query = useQuery({
    queryKey: ['calls', { search, status, outcome, from, page }],
    queryFn: () =>
      callsApi.list({
        search: search || undefined,
        status: status || undefined,
        outcome: outcome || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    // Live calls change state on their own; keep the list honest without a refresh.
    refetchInterval: 10_000,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Calls"
        description="Every outbound call, its technical status and its business outcome."
        action={
          <Link to="/calls/new" className={linkButtonClass()}>
            Place a call
          </Link>
        }
      />

      <form
        className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
        role="search"
        aria-label="Filter calls"
      >
        <Field label="Search by phone or name" htmlFor="search">
          <Input
            id="search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. Rahul or 98765"
          />
        </Field>

        <Field label="Call status" htmlFor="status">
          <Select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {CALL_STATUS.map((value) => (
              <option key={value} value={value}>
                {CALL_STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Business outcome" htmlFor="outcome">
          <Select id="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            <option value="">All outcomes</option>
            {CALL_OUTCOME.map((value) => (
              <option key={value} value={value}>
                {CALL_OUTCOME_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="From date" htmlFor="from">
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
      </form>

      {query.isLoading ? <Spinner label="Loading calls" /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}

      {query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No calls match these filters"
          description="Try clearing the filters, or place a new call to see it here."
        />
      ) : null}

      {query.data && query.data.data.length > 0 ? (
        <>
          <Table>
            <caption className="sr-only">Outbound calls, newest first</caption>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Phone</Th>
                <Th>Template</Th>
                <Th>Status</Th>
                <Th>Outcome</Th>
                <Th>Duration</Th>
                <Th>Started</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((call) => (
                <tr key={call.id}>
                  <Td>
                    <Link
                      className="font-medium underline underline-offset-2"
                      to={`/calls/${call.id}`}
                    >
                      {call.contactName ?? 'Unknown contact'}
                    </Link>
                  </Td>
                  <Td className="tabular-nums">{maskPhone(call.phone)}</Td>
                  <Td>{call.templateName ?? '—'}</Td>
                  <Td>
                    <CallStatusBadge status={call.status} />
                  </Td>
                  <Td>
                    <CallOutcomeBadge outcome={call.outcome} />
                  </Td>
                  <Td className="tabular-nums">{formatDuration(call.durationSeconds)}</Td>
                  <Td>{formatDateTime(call.startedAt ?? call.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <nav
            className="mt-4 flex items-center justify-between"
            aria-label="Call list pagination"
          >
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} · {query.data.total} calls
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
};
