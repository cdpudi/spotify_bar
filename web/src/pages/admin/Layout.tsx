import { CreditCard, Disc3, LayoutDashboard, ListMusic, LogOut, Plus, QrCode, Store, Wallet } from 'lucide-react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Carregando, Logo, Select } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { BarProvider, useBar } from './contexto';

const MENU = [
  { to: '/admin', fim: true, rotulo: 'Painel', Icone: LayoutDashboard },
  { to: '/admin/bar', rotulo: 'Dados do bar', Icone: Store },
  { to: '/admin/catalogo', rotulo: 'Catálogo', Icone: ListMusic },
  { to: '/admin/spotify', rotulo: 'Spotify', Icone: Disc3 },
  { to: '/admin/pix', rotulo: 'Recebimento Pix', Icone: Wallet },
  { to: '/admin/qrcode', rotulo: 'QR Code', Icone: QrCode },
  { to: '/admin/plano', rotulo: 'Plano', Icone: CreditCard },
];

function Casca() {
  const { usuario, sair } = useAuth();
  const { bares, bar, selecionar } = useBar();
  const nav = useNavigate();

  if (!bares) return <Carregando />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden flex-col gap-1 border-r border-line bg-surface/60 p-4 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Logo className="mb-5 px-2 text-lg" />
        {bares.length > 0 && (
          <div className="mb-3 space-y-1.5">
            <Select value={bar?.id} onChange={(e) => selecionar(e.target.value)} aria-label="Bar ativo">
              {bares.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </Select>
            <button onClick={() => nav('/admin/bar/novo')} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:text-white">
              <Plus className="size-4" /> Cadastrar outro bar
            </button>
          </div>
        )}
        <nav className="flex flex-1 flex-col gap-0.5">
          {bar && MENU.map(({ to, fim, rotulo, Icone }) => (
            <NavLink key={to} to={to} end={fim} className={({ isActive }) => `flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${isActive ? 'bg-elevated text-white' : 'text-muted hover:text-white hover:bg-hover/60'}`}>
              <Icone className="size-[18px]" /> {rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line pt-3">
          <p className="truncate px-2 text-xs text-muted">{usuario?.email}</p>
          <button onClick={sair} className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted hover:text-white"><LogOut className="size-4" /> Sair</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Logo className="text-base" />
          <div className="ml-auto flex items-center gap-2">
            {bares.length > 1 && bar && (
              <Select value={bar.id} onChange={(e) => selecionar(e.target.value)} className="!h-9 max-w-40" aria-label="Bar ativo">
                {bares.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </Select>
            )}
            <button onClick={sair} className="grid size-9 place-items-center rounded-full text-muted hover:bg-hover" aria-label="Sair"><LogOut className="size-5" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-8">
          <Outlet />
        </main>
        {bar && (
          <nav className="safe-b fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Menu">
            {MENU.map(({ to, fim, rotulo, Icone }) => (
              <NavLink key={to} to={to} end={fim} className={({ isActive }) => `flex min-w-[4.6rem] flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[0.65rem] font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}>
                <Icone className="size-5" /> {rotulo.replace('Dados do bar', 'Bar').replace('Recebimento Pix', 'Pix')}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { token, carregando } = useAuth();
  if (carregando) return <Carregando />;
  if (!token) return <Navigate to="/admin/entrar" replace />;
  return (
    <BarProvider>
      <Casca />
    </BarProvider>
  );
}

