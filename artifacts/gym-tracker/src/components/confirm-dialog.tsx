import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  testid: string;
};

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, pending, error, onConfirm, onCancel, testid }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !pending) onCancel(); }}>
      <AlertDialogContent className="rounded-3xl border-border bg-card" data-testid={`dialog-${testid}`}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid={`text-${testid}-error`}>
            {error}
          </p>
        )}
        <AlertDialogFooter className="gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-12 rounded-xl border border-border px-5 font-semibold hover:bg-secondary disabled:opacity-60"
            data-testid={`button-cancel-${testid}`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="h-12 rounded-xl bg-destructive px-5 font-bold text-destructive-foreground disabled:opacity-60"
            data-testid={`button-confirm-${testid}`}
          >
            {pending ? 'Working' : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
