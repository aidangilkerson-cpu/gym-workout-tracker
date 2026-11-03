import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateSession, getListSessionsQueryKey, getGetSessionQueryKey, getGetDashboardQueryKey, type SessionInput } from '@workspace/api-client-react';
import { SessionForm } from '@/components/session-form';
import { AccountGate, PageFrame } from '@/components/session-shell';

function NewSessionForm() {
  const qc = useQueryClient();
  const create = useCreateSession();
  const submit = async (data: SessionInput) => {
    const saved = await create.mutateAsync({ data });
    qc.setQueryData(getGetSessionQueryKey(saved.id), saved);
    await qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    return saved;
  };
  return <SessionForm mode="create" cancelTo="/sessions" onSubmit={submit} />;
}

export default function NewSessionPage() {
  return (
    <AccountGateFrame>
      <NewSessionForm />
    </AccountGateFrame>
  );
}

/** Shows the account gate inside page chrome until the account is confirmed. */
export function AccountGateFrame({ children }: { children: ReactNode }) {
  return (
    <AccountGate fallbackWrap={(node) => <PageFrame>{node}</PageFrame>}>
      {children}
    </AccountGate>
  );
}
