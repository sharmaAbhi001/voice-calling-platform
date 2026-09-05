import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import { CallOutcomeBadge, CallStatusBadge } from '@/components/shared/status-badges';
import {
  Card,
  EmptyState,
  ErrorState,
  Spinner,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  linkButtonClass,
} from '@/components/ui';
import { formatDateTime, formatDuration, maskPhone } from '@/lib/utils';
import { callsApi } from '@/services/endpoints';

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <Card className="p-3 sm:p-4">
    <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
  </Card>
);

export const DashboardPage = () => {
  const stats = useQuery({ queryKey: ['calls', 'stats'], queryFn: callsApi.stats, refetchInterval: 15_000 });
  const recent = useQuery({
    queryKey: ['calls', { page: 1, pageSize: 8 }],
    queryFn: () => callsApi.list({ page: 1, pageSize: 8 }),
    refetchInterval: 15_000,
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today's outbound calling activity."
        action={
          <Link to="/calls/new" className={linkButtonClass()}>
            Place a call
          </Link>
        }
      />

      {stats.isLoading ? <Spinner label="Loading statistics" /> : null}
      {stats.isError ? <ErrorState error={stats.error} onRetry={() => void stats.refetch()} /> : null}
      {stats.data ? (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
          <StatCard label="Calls today" value={stats.data.callsToday} />
          <StatCard label="Live now" value={stats.data.liveCalls} />
          <StatCard label="Connected" value={stats.data.connected} />
          <StatCard label="Interested" value={stats.data.interested} />
          <StatCard label="Converted" value={stats.data.converted} />
          <StatCard label="Avg duration" value={formatDuration(stats.data.averageDurationSeconds)} />
        </div>
      ) : null}

      <h2 className="mb-3 text-base font-semibold">Recent calls</h2>

      {recent.isLoading ? <Spinner label="Loading calls" /> : null}
      {recent.isError ? (
        <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
      ) : null}
      {recent.data && recent.data.data.length === 0 ? (
        <EmptyState
          title="No calls yet"
          description="Once you place your first call it will appear here with its status, transcript and outcome."
          action={
            <Link to="/calls/new" className={linkButtonClass()}>
              Place a call
            </Link>
          }
        />
      ) : null}

      {recent.data && recent.data.data.length > 0 ? (
        <Table>
          <TableCaption className="sr-only">The eight most recent outbound calls</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.data.data.map((call) => (
              <TableRow key={call.id}>
                <TableCell label="Customer">
                  <Link className="font-medium underline underline-offset-2" to={`/calls/${call.id}`}>
                    {call.contactName ?? 'Unknown contact'}
                  </Link>
                </TableCell>
                <TableCell label="Phone" className="tabular-nums">
                  {maskPhone(call.phone)}
                </TableCell>
                <TableCell label="Status">
                  <CallStatusBadge status={call.status} />
                </TableCell>
                <TableCell label="Outcome">
                  <CallOutcomeBadge outcome={call.outcome} />
                </TableCell>
                <TableCell label="Duration" className="tabular-nums">
                  {formatDuration(call.durationSeconds)}
                </TableCell>
                <TableCell label="Started">{formatDateTime(call.startedAt ?? call.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </>
  );
};
