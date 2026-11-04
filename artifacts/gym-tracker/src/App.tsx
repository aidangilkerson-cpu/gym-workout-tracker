import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { clearSessionRecovery } from '@/lib/session-recovery';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import UserPortalPage from '@/pages/user-portal';
import { SignInPage, SignUpPage } from '@/pages/auth';
import SessionsPage from '@/pages/sessions';
import NewSessionPage from '@/pages/session-new';
import SessionDetailPage from '@/pages/session-detail';
import EditSessionPage from '@/pages/session-edit';
import WorkoutsPage from '@/pages/workouts';
import WorkoutDetailPage from '@/pages/workout-detail';
import { NewWorkoutPage, EditWorkoutPage } from '@/pages/workout-edit';
import { PageFrame, SkeletonBlock } from '@/components/session-shell';

const DashboardPage = lazy(() => import('@/pages/dashboard'));

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const lime = 'hsl(75 90% 57%)';
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: lime,
    colorForeground: 'hsl(80 20% 95%)',
    colorMutedForeground: 'hsl(90 6% 70%)',
    colorDanger: 'hsl(4 80% 62%)',
    colorBackground: 'hsl(100 6% 11%)',
    colorInput: 'hsl(100 6% 14%)',
    colorInputForeground: 'hsl(80 20% 95%)',
    colorNeutral: 'hsl(80 20% 95%)',
    fontFamily: "'Archivo', sans-serif",
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full max-w-full min-w-0 flex justify-center',
    cardBox: 'bg-[hsl(100_6%_11%)] border border-[hsl(100_5%_19%)] rounded-3xl w-full sm:w-[440px] max-w-full min-w-0 overflow-hidden shadow-[0_30px_80px_-30px_hsl(75_90%_57%/0.18)]',
    card: '!w-full !max-w-full !min-w-0 !px-5 sm:!px-8 !shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[hsl(80_20%_95%)] !text-2xl !font-black uppercase tracking-tight',
    headerSubtitle: 'text-[hsl(90_6%_70%)] !text-base',
    socialButtonsBlockButtonText: 'text-[hsl(80_20%_95%)] font-semibold',
    formFieldLabel: 'text-[hsl(80_20%_95%)] !text-sm font-semibold',
    footerActionLink: 'text-[hsl(75_90%_57%)] font-bold',
    footerActionText: 'text-[hsl(90_6%_70%)]',
    dividerText: 'text-[hsl(90_6%_70%)]',
    identityPreviewEditButton: 'text-[hsl(75_90%_57%)]',
    formFieldSuccessText: 'text-[hsl(75_90%_65%)]',
    alertText: 'text-[hsl(80_20%_95%)]',
    logoBox: 'h-12 justify-start',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'h-12 border-[hsl(100_5%_24%)] bg-[hsl(100_6%_14%)]',
    formButtonPrimary: '!h-14 !text-base !font-bold bg-[hsl(75_90%_57%)] text-[hsl(100_30%_8%)] transition-transform',
    formFieldInput: '!h-14 !text-base border-[hsl(100_5%_26%)] bg-[hsl(100_6%_14%)] text-[hsl(80_20%_95%)] transition-shadow',
    footerAction: 'justify-center',
    dividerLine: 'bg-[hsl(100_5%_22%)]',
    alert: 'border-[hsl(4_80%_62%/0.4)] bg-[hsl(4_60%_20%/0.35)]',
    otpCodeFieldInput: '!h-14 border-[hsl(100_5%_26%)] text-[hsl(80_20%_95%)]',
    formFieldRow: 'gap-3',
    main: 'gap-6',
  },
};

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/user-portal" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function UserPortal() {
  return (
    <>
      <Show when="signed-in">
        <UserPortalPage />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

const SessionsRoute = () => <Protected><SessionsPage /></Protected>;
const NewSessionRoute = () => <Protected><NewSessionPage /></Protected>;
const SessionDetailRoute = () => <Protected><SessionDetailPage /></Protected>;
const DashboardRoute = () => (
  <Protected>
    <Suspense fallback={<PageFrame><SkeletonBlock testid="status-dashboard-loading" rows={4} /></PageFrame>}>
      <DashboardPage />
    </Suspense>
  </Protected>
);
const EditSessionRoute = () => <Protected><EditSessionPage /></Protected>;
const WorkoutsRoute = () => <Protected><WorkoutsPage /></Protected>;
const NewWorkoutRoute = () => <Protected><NewWorkoutPage /></Protected>;
const EditWorkoutRoute = () => <Protected><EditWorkoutPage /></Protected>;
const WorkoutDetailRoute = () => <Protected><WorkoutDetailPage /></Protected>;

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        clearSessionRecovery();
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your training journal' } },
        signUp: { start: { title: 'Claim your spot', subtitle: 'One account. Every session, on record.' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/user-portal" component={UserPortal} />
              <Route path="/dashboard" component={DashboardRoute} />
              <Route path="/sessions" component={SessionsRoute} />
              <Route path="/sessions/new" component={NewSessionRoute} />
              <Route path="/sessions/:id/edit" component={EditSessionRoute} />
              <Route path="/sessions/:id" component={SessionDetailRoute} />
              <Route path="/workouts" component={WorkoutsRoute} />
              <Route path="/workouts/new" component={NewWorkoutRoute} />
              <Route path="/workouts/:id/edit" component={EditWorkoutRoute} />
              <Route path="/workouts/:id" component={WorkoutDetailRoute} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
