import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { BrandMark } from '@/components/brand';

const principles = [
  { n: '01', t: 'One place for the work', d: 'Your training lives in one private journal, tied to one account that is yours.' },
  { n: '02', t: 'Built for the gym floor', d: 'Large targets, high contrast, readable between sets with chalk on your hands.' },
  { n: '03', t: 'Nothing to perform for', d: 'No feed, no followers. Just you, the bar, and an honest record.' },
];

export default function Home() {
  return (
    <div className="grain plates relative min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-primary/10 blur-3xl" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-6 md:px-10">
        <BrandMark />
        <Link href="/sign-in" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground/90 transition-colors hover:text-primary" data-testid="link-sign-in-header">
          Sign in
        </Link>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 md:px-10 md:pt-20">
        <p className="rise font-mono text-xs uppercase tracking-[0.3em] text-primary">Training journal / est. today</p>
        <h1 className="rise mt-6 text-[clamp(3rem,11vw,8.5rem)] font-black uppercase leading-[0.86] tracking-tight" style={{ animationDelay: '80ms' }}>
          Show up.<br />
          <span className="text-primary">Write it</span> down.
        </h1>
        <div className="rise mt-6 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted" style={{ animationDelay: '160ms' }}>
          <div className="barfill h-full w-[72%] rounded-full bg-primary" style={{ animationDelay: '500ms' }} />
        </div>
        <p className="rise mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl" style={{ animationDelay: '220ms' }}>
          Setline is a quiet, private place to keep your training honest. Three or four sessions a week adds up — start by claiming your account.
        </p>
        <div className="rise mt-10 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: '300ms' }}>
          <Link href="/sign-up" className="group inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-primary px-7 text-base font-bold text-primary-foreground transition-transform active:scale-[0.98]" data-testid="link-sign-up">
            Create your account
            <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link href="/sign-in" className="inline-flex h-14 items-center justify-center rounded-2xl border border-border bg-card px-7 text-base font-semibold transition-colors hover:border-primary/60" data-testid="link-sign-in">
            I already have one
          </Link>
        </div>

        <section className="mt-24 grid gap-4 md:mt-32 md:grid-cols-[1.3fr_1fr_1fr]">
          {principles.map((p, i) => (
            <article key={p.n} className={`rise rounded-3xl border border-border bg-card p-7 transition-colors hover:border-primary/40 ${i === 0 ? 'md:row-span-2 md:p-10' : ''}`} style={{ animationDelay: `${400 + i * 90}ms` }} data-testid={`card-principle-${p.n}`}>
              <span className="font-mono text-sm text-primary">{p.n}</span>
              <h2 className={`mt-4 font-extrabold leading-tight ${i === 0 ? 'text-3xl md:text-4xl' : 'text-xl'}`}>{p.t}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{p.d}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="relative mx-auto max-w-6xl border-t border-border px-5 py-8 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground md:px-10">
        Setline — rep by rep
      </footer>
    </div>
  );
}
