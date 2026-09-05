import { TERMINAL_CALL_STATUSES } from '@voiceops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import { CallOutcomeBadge, CallStatusBadge } from '@/components/shared/status-badges';
import {
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Spinner,
  StatusMessage,
  toast,
} from '@/components/ui';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { callsApi } from '@/services/endpoints';

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-0">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium">{value}</dd>
  </div>
);

export const CallDetailPage = () => {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [recordingUrl, setRecordingUrl] = React.useState<string | null>(null);
  const [confirmingEnd, setConfirmingEnd] = React.useState(false);

  const call = useQuery({
    queryKey: ['calls', id],
    queryFn: () => callsApi.get(id),
    // Poll while the call is live, then stop.
    refetchInterval: (query) =>
      query.state.data && TERMINAL_CALL_STATUSES.includes(query.state.data.status) ? false : 5000,
  });

  const endCall = useMutation({
    mutationFn: () => callsApi.end(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['calls', id], updated);
      setConfirmingEnd(false);
      toast.success('The call was ended.');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Could not end the call.'),
  });

  const loadRecording = useMutation({
    mutationFn: () => callsApi.recording(id),
    onSuccess: (result) => setRecordingUrl(result.url),
  });

  if (call.isLoading) return <Spinner label="Loading call" />;
  if (call.isError) return <ErrorState error={call.error} onRetry={() => void call.refetch()} />;
  if (!call.data) return null;

  const data = call.data;
  const isLive = !TERMINAL_CALL_STATUSES.includes(data.status);

  return (
    <>
      <PageHeader
        title={data.contactName ?? 'Call detail'}
        description={`${data.phone} · ${data.templateName ?? 'No template'}`}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Link
              to="/calls"
              className="order-last text-sm underline underline-offset-2 sm:order-first"
            >
              Back to calls
            </Link>
            {isLive ? (
              <Button variant="destructive" onClick={() => setConfirmingEnd(true)}>
                End call
              </Button>
            ) : null}
          </div>
        }
      />

      <ConfirmDialog
        open={confirmingEnd}
        onOpenChange={setConfirmingEnd}
        title="End this call now?"
        description="Ending the call hangs up on the customer immediately. This cannot be undone."
        confirmLabel="Yes, end the call"
        loading={endCall.isPending}
        onConfirm={() => endCall.mutate()}
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card>
          <CardTitle>Call</CardTitle>
          <dl>
            <DetailRow label="Status" value={<CallStatusBadge status={data.status} />} />
            <DetailRow label="Outcome" value={<CallOutcomeBadge outcome={data.outcome} />} />
            <DetailRow label="Duration" value={formatDuration(data.durationSeconds)} />
            <DetailRow label="Started" value={formatDateTime(data.startedAt)} />
            <DetailRow label="Answered" value={formatDateTime(data.answeredAt)} />
            <DetailRow label="Ended" value={formatDateTime(data.endedAt)} />
          </dl>
          {data.failureReason ? (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {data.failureReason}
            </p>
          ) : null}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Recording</CardTitle>
          {data.recordingUrl ? (
            <>
              <Button
                variant="outline"
                loading={loadRecording.isPending}
                onClick={() => loadRecording.mutate()}
              >
                Load recording
              </Button>
              {recordingUrl ? (
                <audio controls src={recordingUrl} className="mt-3 w-full">
                  <track kind="captions" />
                  Your browser cannot play this recording.
                </audio>
              ) : null}
              {loadRecording.isSuccess && !recordingUrl ? (
                <StatusMessage tone="error">
                  The recording is not available yet. It is uploaded a few moments after the call
                  ends.
                </StatusMessage>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Playback links are signed and expire after 15 minutes.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No recording for this call. Recording requires object storage to be configured.
            </p>
          )}

          <CardTitle className="mt-6">Summary</CardTitle>
          {data.summary ? (
            <p className="whitespace-pre-line text-sm">{data.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isLive
                ? 'The summary is written once the call ends.'
                : 'No summary was generated for this call.'}
            </p>
          )}

          <CardTitle className="mt-6">Requirement</CardTitle>
          {data.extractedRequirement ? (
            <p className="text-sm">{data.extractedRequirement}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The customer did not state a specific requirement.
            </p>
          )}
        </Card>
      </div>

      <Card className="mt-4 sm:mt-5">
        <CardTitle>Transcript</CardTitle>
        {data.transcript && data.transcript.length > 0 ? (
          <ol className="space-y-3">
            {data.transcript.map((turn, index) => (
              <li key={`${turn.at}-${index}`} className="text-sm">
                <span className="mb-0.5 block font-semibold sm:mb-0 sm:inline">
                  {turn.speaker === 'AGENT' ? 'Agent' : 'Customer'}:
                </span>{' '}
                <span>{turn.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title={isLive ? 'The call is in progress' : 'No transcript'}
            description={
              isLive
                ? 'The transcript is saved when the call ends.'
                : 'Nothing was transcribed for this call.'
            }
          />
        )}
      </Card>
    </>
  );
};
