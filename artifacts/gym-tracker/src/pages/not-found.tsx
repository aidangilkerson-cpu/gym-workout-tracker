import { Link } from 'wouter';
import { BrandMark } from '@/components/brand';

export default function NotFound() {
  return (
    <div className="grain plates flex min-h-[100dvh] flex-col bg-background px-5 py-6 text-foreground md:px-10">
      <BrandMark />
      <div className="flex flex-1 flex-col items-start justify-center md:mx-auto md:max-w-3xl md:w-full">
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-primary">Error 404</p>
        <h1 className="mt-4 text-6xl font-black uppercase leading-[0.9] md:text-8xl">Missed<br />the rep.</h1>
        <p className="mt-6 max-w-md text-lg text-muted-foreground">This page does not exist. Reset your grip and head back.</p>
        <Link href="/" className="mt-8 inline-flex h-14 items-center rounded-2xl bg-primary px-7 font-bold text-primary-foreground active:scale-[0.98]" data-testid="link-back-home">
          Back to start
        </Link>
      </div>
    </div>
  );
}
