import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import AdminLayout from './pages/admin/Layout';
import BaresCobranca from './pages/admin/BaresCobranca';
import EstatisticasPagina from './pages/admin/EstatisticasPagina';
import PagamentosPagina from './pages/admin/PagamentosPagina';
import UsuariosPagina from './pages/admin/UsuariosPagina';
import BarForm from './pages/admin/BarForm';
import Catalogo from './pages/admin/Catalogo';
import Entrada from './pages/admin/Entrada';
import Painel from './pages/admin/Painel';
import PixConfig from './pages/admin/PixConfig';
import PlanoPagina from './pages/admin/PlanoPagina';
import QrCodeBar from './pages/admin/QrCodeBar';
import SpotifyConfig from './pages/admin/SpotifyConfig';
import Home from './pages/Home';
import Sala from './pages/Sala';

/** Telas de configuração: somente administrador da plataforma. */
function SoAdmin({ children }: { children: React.ReactNode }) {
  const { ehAdmin, usuario } = useAuth();
  if (!usuario) return null;
  return ehAdmin ? <>{children}</> : <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/b/:slug" element={<Sala />} />
      <Route path="/admin/entrar" element={<Entrada />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Painel />} />
        <Route path="bar" element={<SoAdmin><BarForm /></SoAdmin>} />
        <Route path="bar/novo" element={<SoAdmin><BarForm novo /></SoAdmin>} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="spotify" element={<SoAdmin><SpotifyConfig /></SoAdmin>} />
        <Route path="pix" element={<SoAdmin><PixConfig /></SoAdmin>} />
        <Route path="qrcode" element={<QrCodeBar />} />
        <Route path="plano" element={<PlanoPagina />} />
        <Route path="estatisticas" element={<EstatisticasPagina />} />
        <Route path="pagamentos" element={<PagamentosPagina />} />
        <Route path="plataforma/bares" element={<SoAdmin><BaresCobranca /></SoAdmin>} />
        <Route path="plataforma/pagamentos" element={<SoAdmin><PagamentosPagina plataforma /></SoAdmin>} />
        <Route path="plataforma/estatisticas" element={<SoAdmin><EstatisticasPagina plataforma /></SoAdmin>} />
        <Route path="plataforma/usuarios" element={<SoAdmin><UsuariosPagina /></SoAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
