import { Link } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} data-testid="link-home">
      <img src={`${basePath}/logo.svg`} alt="" className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-6" />
      <span className="text-lg font-black uppercase tracking-[0.18em]">Setline</span>
    </Link>
  );
}
