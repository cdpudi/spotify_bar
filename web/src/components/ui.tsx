import { X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { gradiente } from '../lib/format';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'ouro';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-brand text-black hover:bg-brand-hover active:scale-[0.98] font-bold',
  secundario: 'bg-transparent text-white border border-line hover:border-white font-semibold',
  fantasma: 'bg-transparent text-muted hover:text-white hover:bg-hover font-semibold',
  perigo: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10 font-semibold',
  ouro: 'bg-gold text-black hover:brightness-110 active:scale-[0.98] font-bold',
};

export function Botao({
  variante = 'primario',
  tamanho = 'md',
  carregando,
  className = '',
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: 'sm' | 'md' | 'lg'; carregando?: boolean }) {
  const t = { sm: 'h-8 px-3 text-xs', md: 'h-11 px-5 text-sm', lg: 'h-12 px-7 text-base' }[tamanho];
  return (
    <button
      {...p}
      disabled={p.disabled || carregando}
      className={`inline-flex items-center justify-center gap-2 rounded-full transition disabled:opacity-50 ${t} ${VARIANTES[variante]} ${className}`}
    >
      {carregando && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

const campo =
  'w-full rounded-lg bg-elevated border border-transparent px-3 text-sm text-white placeholder:text-faint hover:border-line focus:border-white focus:outline-none transition';

export function Campo({
  rotulo,
  dica,
  erro,
  children,
}: {
  rotulo: string;
  dica?: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted">{rotulo}</span>
      {children}
      {dica && !erro && <span className="block text-xs text-faint">{dica}</span>}
      {erro && <span className="block text-xs text-danger">{erro}</span>}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${campo} h-11 ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${campo} h-11 ${p.className ?? ''}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${campo} py-2.5 ${p.className ?? ''}`} />;

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] bg-surface p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function Chip({
  ativo,
  onClick,
  children,
  tom = 'neutro',
}: {
  ativo?: boolean;
  onClick?: () => void;
  children: ReactNode;
  tom?: 'neutro' | 'ouro' | 'ok' | 'erro';
}) {
  const base = 'inline-flex items-center gap-1 rounded-full px-3 h-8 text-xs font-semibold whitespace-nowrap transition';
  const cor = onClick
    ? ativo
      ? 'bg-white text-black'
      : 'bg-elevated text-white hover:bg-hover'
    : { neutro: 'bg-elevated text-muted', ouro: 'bg-gold/15 text-gold', ok: 'bg-brand/15 text-brand', erro: 'bg-danger/15 text-danger' }[tom];
  return onClick ? (
    <button onClick={onClick} className={`${base} ${cor}`} aria-pressed={ativo}>
      {children}
    </button>
  ) : (
    <span className={`${base} ${cor}`}>{children}</span>
  );
}

export function Capa({ url, titulo, className = 'size-12' }: { url?: string | null; titulo: string; className?: string }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className={`${className} shrink-0 rounded object-cover bg-elevated`} />
  ) : (
    <div
      aria-hidden
      className={`${className} shrink-0 rounded grid place-items-center text-white/80 font-bold text-[0.7em]`}
      style={{ background: gradiente(titulo) }}
    >
      ♪
    </div>
  );
}

export function Equalizador({ pausado }: { pausado?: boolean }) {
  return (
    <span className={`eq ${pausado ? 'pausado' : ''}`} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/** Modal no desktop, bottom sheet no celular. */
export function Folha({ aberta, onFechar, titulo, children }: { aberta: boolean; onFechar: () => void; titulo: string; children: ReactNode }) {
  useEffect(() => {
    if (!aberta) return;
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', fn);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', fn);
      document.body.style.overflow = antes;
    };
  }, [aberta, onFechar]);
  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center animate-aparecer" role="dialog" aria-modal="true" aria-label={titulo}>
      <button aria-label="Fechar" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface border border-line p-5 safe-b animate-subir">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button onClick={onFechar} className="grid size-9 place-items-center rounded-full text-muted hover:bg-hover hover:text-white" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'erro' | 'ok' | 'ouro'; children: ReactNode }) {
  const cor = { info: 'border-info/40 bg-info/10 text-info', erro: 'border-danger/40 bg-danger/10 text-danger', ok: 'border-brand/40 bg-brand/10 text-brand', ouro: 'border-gold/40 bg-gold/10 text-gold' }[tipo];
  return <div className={`rounded-lg border px-3 py-2.5 text-sm ${cor}`} role={tipo === 'erro' ? 'alert' : undefined}>{children}</div>;
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {texto}
    </div>
  );
}

export function Vazio({ icone, titulo, children }: { icone?: ReactNode; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
      {icone && <div className="text-faint">{icone}</div>}
      <p className="font-semibold text-white">{titulo}</p>
      {children && <p className="max-w-xs text-sm">{children}</p>}
    </div>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1ed760" />
        <path d="M9 20.5V11l11-2v9.5" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8" cy="21" r="2.6" fill="#000" />
        <circle cx="19" cy="19" r="2.6" fill="#000" />
      </svg>
      Spotify Bar
    </span>
  );
}
