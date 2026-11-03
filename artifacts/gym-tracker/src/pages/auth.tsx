import { SignIn, SignUp } from '@clerk/react';
import { BrandMark } from '@/components/brand';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function AuthShell({ eyebrow, line, children }: { eyebrow: string; line: string; children: React.ReactNode }) {
  return (
    <div className="grain plates relative min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 gap-10 px-4 py-6 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-10">
        <div className="flex min-w-0 flex-col gap-10 md:gap-16">
          <BrandMark />
          <div className="hidden md:block">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
            <h1 className="mt-5 text-6xl font-black uppercase leading-[0.9] lg:text-7xl">{line}</h1>
          </div>
        </div>
        <div className="rise flex w-full min-w-0 justify-center pb-10 md:w-[440px] md:pb-0">{children}</div>
      </div>
    </div>
  );
}

export function SignInPage() {
  return (
    <AuthShell eyebrow="Session start" line="Back under the bar.">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthShell>
  );
}

export function SignUpPage() {
  return (
    <AuthShell eyebrow="Day one" line="First set starts here.">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthShell>
  );
}
