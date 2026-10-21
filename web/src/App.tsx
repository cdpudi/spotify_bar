import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './pages/admin/Layout';
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/b/:slug" element={<Sala />} />
      <Route path="/admin/entrar" element={<Entrada />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Painel />} />
        <Route path="bar" element={<BarForm />} />
        <Route path="bar/novo" element={<BarForm novo />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="spotify" element={<SpotifyConfig />} />
        <Route path="pix" element={<PixConfig />} />
        <Route path="qrcode" element={<QrCodeBar />} />
        <Route path="plano" element={<PlanoPagina />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
