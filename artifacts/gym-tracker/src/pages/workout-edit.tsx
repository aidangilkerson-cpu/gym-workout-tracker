import { useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import {
  useCreateWorkout, useUpdateWorkout, useGetWorkout, getGetWorkoutQueryKey, getListWorkoutsQueryKey, getListExercisesQueryKey,
  getGetDashboardQueryKey, getGetCurrentUserQueryKey, type AppUser, type WorkoutDetail, type WorkoutInput,
} from '@workspace/api-client-react';
import { WorkoutForm } from '@/components/workout-form';
import { ErrorPanel, PageFrame, SkeletonBlock, errorMessage, errorStatus } from '@/components/session-shell';
import { AccountGateFrame } from '@/pages/session-new';

export const currentUserId = (qc: QueryClient) => qc.getQueryData<AppUser>(getGetCurrentUserQueryKey())?.id ?? null;

export async function syncWorkout(qc: QueryClient, saved: WorkoutDetail) {
  qc.setQueryData(getGetWorkoutQueryKey(saved.id), saved);
  await Promise.all([
    qc.invalidateQueries({ queryKey: getListWorkoutsQueryKey() }),
    qc.invalidateQueries({ queryKey: getListExercisesQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
  ]);
}

export function WorkoutNotFound() {
  return (
    <div className="rounded-3xl border border-border bg-card p-8" data-testid="status-workout-not-found">
      <h2 className="text-2xl font-black uppercase">Workout not found.</h2>
      <p className="mt-2 text-muted-foreground">It is not in your ledger.</p>
      <Link href="/workouts" className="mt-5 inline-flex h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="link-notfound-workouts">Back to workouts</Link>
    </div>
  );
}

function NewWorkout() {
  const qc = useQueryClient();
  const create = useCreateWorkout();
  const submit = async (data: WorkoutInput) => {
    const owner = currentUserId(qc);
    if (!owner) throw new Error('Your account could not be confirmed. Your draft is unchanged.');
    const saved = await create.mutateAsync({ data });
    if (currentUserId(qc) !== owner) return null;
    await syncWorkout(qc, saved);
    return saved;
  };
  return <WorkoutForm mode="create" seed={{ name: '', exercises: [] }} eyebrow="New reusable workout" heading="Build a workout." cancelTo="/workouts" onSubmit={submit} />;
}

function EditWorkout({ id }: { id: number }) {
  const qc = useQueryClient();
  const update = useUpdateWorkout();
  const [gen, setGen] = useState(0);
  const q = useGetWorkout(id, { query: { queryKey: getGetWorkoutQueryKey(id), refetchOnMount: 'always', refetchOnWindowFocus: false, retry: false } });
  const [pinned, setPinned] = useState<{ gen: number; data: WorkoutDetail } | null>(null);

  // Pin the record the draft was seeded from; background refetches must not reseed it.
  if (q.data && q.isFetchedAfterMount && !q.isFetching && !q.isError && (!pinned || pinned.gen !== gen)) setPinned({ gen, data: q.data });

  if (!pinned || pinned.gen !== gen) {
    if (q.isError) {
      return <PageFrame>{errorStatus(q.error) === 404 ? <WorkoutNotFound /> : <ErrorPanel title="This workout did not load." message={errorMessage(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} testid="status-workout-error" />}</PageFrame>;
    }
    return <PageFrame><SkeletonBlock testid="status-workout-loading" rows={2} /></PageFrame>;
  }
  const w = pinned.data;
  const latest = w.versions[0];
  if (w.archived || !latest) {
    return (
      <PageFrame>
        <div className="rounded-3xl border border-border bg-card p-8" data-testid="status-workout-archived">
          <h2 className="text-2xl font-black uppercase">{w.archived ? 'Archived workouts are read-only.' : 'No version to edit.'}</h2>
          <p className="mt-2 text-muted-foreground">Restore it from its page to edit again. History stays available.</p>
          <Link href={`/workouts/${id}`} className="mt-5 inline-flex h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="link-back-workout">Back to workout</Link>
        </div>
      </PageFrame>
    );
  }

  const submit = async (data: WorkoutInput) => {
    const owner = currentUserId(qc);
    if (!owner) throw new Error('Your account could not be confirmed. Your draft is unchanged.');
    const saved = await update.mutateAsync({ id, data: { ...data, expectedVersionId: latest.id } });
    if (currentUserId(qc) !== owner) return null;
    await syncWorkout(qc, saved);
    return saved;
  };
  return (
    <WorkoutForm
      key={`${id}-${gen}`}
      mode="edit"
      seed={{ name: latest.workoutName, exercises: latest.exercises.map((x) => ({ exerciseId: x.exerciseId, exerciseName: x.exerciseName })) }}
      eyebrow={`Editing from version ${latest.versionNumber}`}
      heading={latest.workoutName}
      cancelTo={`/workouts/${id}`}
      onSubmit={submit}
      reloading={q.isFetching}
      onReloadLatest={() => { void q.refetch().then(() => setGen((g) => g + 1)); }}
    />
  );
}

export function NewWorkoutPage() {
  return <AccountGateFrame><NewWorkout /></AccountGateFrame>;
}

export function EditWorkoutPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return <PageFrame><WorkoutNotFound /></PageFrame>;
  return <AccountGateFrame><EditWorkout key={id} id={id} /></AccountGateFrame>;
}
