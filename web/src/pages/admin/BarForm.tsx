import { Crosshair, ExternalLink, MapPinned, Save, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Aviso, Botao, Campo, Cartao, Chip, Input, Select } from '../../components/ui';
import { api, mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { posicaoAtual } from '../../lib/publico';
import { useBar } from './contexto';

const vazio = {
  nome: '', cnpj: '', telefone: '', email: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  latitude: '', longitude: '', raio_metros: 150, estilos: [] as string[], max_pedidos_por_sessao: 3, cooldown_repeticao_min: 30,
  superchat_valor_centavos: 1000, ativo: true, usuario_id: '',
};
type Form = typeof vazio;

const maskCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
const maskCnpj = (v: string) =>
  v.replace(/\D/g, '').slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');

export default function BarForm({ novo }: { novo?: boolean }) {
  const { req } = useAuth();
  const { bar, recarregar, selecionar } = useBar();
  const nav = useNavigate();
  useParams();
  const [f, setF] = useState<Form>(vazio);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [estiloNovo, setEstiloNovo] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCoord, setBuscandoCoord] = useState(false);
  const [donos, setDonos] = useState<{ id: string; nome: string; email: string; papel: string; ativo: boolean }[]>([]);

  useEffect(() => {
    api<string[]>('GET', '/api/estilos').then(setSugestoes, () => undefined);
    req('GET', '/api/admin/usuarios').then(setDonos, () => undefined);
  }, []);

  useEffect(() => {
    if (novo || !bar) return setF(vazio);
    setF({
      nome: bar.nome, cnpj: bar.cnpj ?? '', telefone: bar.telefone ?? '', email: bar.email ?? '', cep: bar.cep ?? '', logradouro: bar.logradouro ?? '',
      numero: bar.numero ?? '', complemento: bar.complemento ?? '', bairro: bar.bairro ?? '', cidade: bar.cidade ?? '', uf: bar.uf ?? '',
      latitude: bar.latitude?.toString() ?? '', longitude: bar.longitude?.toString() ?? '', raio_metros: bar.raio_metros, estilos: bar.estilos,
      max_pedidos_por_sessao: bar.max_pedidos_por_sessao, cooldown_repeticao_min: bar.cooldown_repeticao_min,
      superchat_valor_centavos: bar.superchat_valor_centavos, ativo: bar.ativo, usuario_id: bar.usuario_id,
    });
  }, [bar?.id, novo]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const alternarEstilo = (e: string) => set('estilos', f.estilos.includes(e) ? f.estilos.filter((x) => x !== e) : [...f.estilos, e]);

  async function buscarCep(valor: string) {
    set('cep', maskCep(valor));
    const d = valor.replace(/\D/g, '');
    if (d.length !== 8) return;
    try {
      const r = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
      if (r.erro) return setMsg({ tipo: 'erro', texto: 'CEP não encontrado.' });
      setF((x) => ({ ...x, logradouro: r.logradouro || x.logradouro, bairro: r.bairro || x.bairro, cidade: r.localidade || x.cidade, uf: r.uf || x.uf }));
      setMsg(null);
    } catch {
      /* preenchimento manual */
    }
  }

  async function usarMinhaLocalizacao() {
    try {
      setMsg({ tipo: 'info', texto: 'Obtendo sua localização… (fique no bar para maior precisão)' });
      const p = await posicaoAtual();
      setF((x) => ({ ...x, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
      setMsg({ tipo: 'ok', texto: `Localização capturada (precisão ~${Math.round(p.coords.accuracy)} m).` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  async function coordenadasDoEndereco() {
    setBuscandoCoord(true);
    try {
      const consulta = [f.logradouro, f.numero, f.bairro, f.cidade, f.uf, 'Brasil'].filter(Boolean).join(', ');
      const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(consulta)}`)).json();
      if (!r[0]) return setMsg({ tipo: 'erro', texto: 'Endereço não localizado. Use sua localização atual ou digite as coordenadas.' });
      setF((x) => ({ ...x, latitude: Number(r[0].lat).toFixed(6), longitude: Number(r[0].lon).toFixed(6) }));
      setMsg({ tipo: 'ok', texto: 'Coordenadas encontradas pelo endereço. Confira no mapa antes de salvar.' });
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não foi possível consultar o serviço de mapas agora.' });
    } finally {
      setBuscandoCoord(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const lat = Number(f.latitude.replace(',', '.'));
    const lng = Number(f.longitude.replace(',', '.'));
    if (!f.latitude || !f.longitude || Number.isNaN(lat) || Number.isNaN(lng)) return setMsg({ tipo: 'erro', texto: 'Informe latitude e longitude do bar — é por elas que os clientes encontram você.' });
    if (!f.usuario_id) return setMsg({ tipo: 'erro', texto: 'Escolha o responsável pelo bar (cadastre em Responsáveis, se ainda não existir).' });
    if (!f.estilos.length) return setMsg({ tipo: 'erro', texto: 'Escolha ao menos um estilo musical.' });
    setSalvando(true);
    try {
      const corpo = { ...f, latitude: lat, longitude: lng, raio_metros: Number(f.raio_metros), max_pedidos_por_sessao: Number(f.max_pedidos_por_sessao), cooldown_repeticao_min: Number(f.cooldown_repeticao_min), superchat_valor_centavos: Number(f.superchat_valor_centavos) };
      if (novo) {
        const criado = await req('POST', '/api/bares', corpo);
        await recarregar();
        selecionar(criado.id);
        nav('/admin');
      } else if (bar) {
        await req('PUT', `/api/bares/${bar.id}`, corpo);
        await recarregar();
        setMsg({ tipo: 'ok', texto: 'Dados salvos.' });
      }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  const temCoord = f.latitude && f.longitude;

  return (
    <form onSubmit={salvar} className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">{novo ? 'Cadastrar bar' : 'Dados do bar'}</h1>
        <p className="text-sm text-muted">Estas informações aparecem para os clientes e definem quem pode participar.</p>
      </div>

      <Cartao className="space-y-4">
        <h2 className="font-bold">Identificação</h2>
        <Campo rotulo="Responsável pelo bar *" dica="Acessa o painel e altera apenas o catálogo">
          <Select value={f.usuario_id} onChange={(e) => set('usuario_id', e.target.value)} required>
            <option value="">Selecione…</option>
            {donos.filter((d) => d.ativo).map((d) => <option key={d.id} value={d.id}>{d.nome} — {d.email}</option>)}
          </Select>
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Campo rotulo="Nome do bar *"><Input value={f.nome} onChange={(e) => set('nome', e.target.value)} required minLength={2} /></Campo></div>
          <Campo rotulo="CNPJ"><Input value={f.cnpj} onChange={(e) => set('cnpj', maskCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" /></Campo>
          <Campo rotulo="Telefone / WhatsApp"><Input value={f.telefone} onChange={(e) => set('telefone', e.target.value)} type="tel" /></Campo>
          <div className="sm:col-span-2"><Campo rotulo="E-mail de contato"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Campo></div>
        </div>
      </Cartao>

      <Cartao className="space-y-4">
        <h2 className="font-bold">Endereço e localização</h2>
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2"><Campo rotulo="CEP"><Input value={f.cep} onChange={(e) => void buscarCep(e.target.value)} inputMode="numeric" placeholder="00000-000" /></Campo></div>
          <div className="sm:col-span-4"><Campo rotulo="Logradouro"><Input value={f.logradouro} onChange={(e) => set('logradouro', e.target.value)} /></Campo></div>
          <div className="sm:col-span-2"><Campo rotulo="Número"><Input value={f.numero} onChange={(e) => set('numero', e.target.value)} /></Campo></div>
          <div className="sm:col-span-4"><Campo rotulo="Complemento"><Input value={f.complemento} onChange={(e) => set('complemento', e.target.value)} /></Campo></div>
          <div className="sm:col-span-2"><Campo rotulo="Bairro"><Input value={f.bairro} onChange={(e) => set('bairro', e.target.value)} /></Campo></div>
          <div className="sm:col-span-3"><Campo rotulo="Cidade *"><Input value={f.cidade} onChange={(e) => set('cidade', e.target.value)} required /></Campo></div>
          <div className="sm:col-span-1"><Campo rotulo="UF *"><Input value={f.uf} onChange={(e) => set('uf', e.target.value.toUpperCase().slice(0, 2))} required minLength={2} maxLength={2} /></Campo></div>
        </div>

        <div className="rounded-lg bg-elevated p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold"><MapPinned className="size-4 text-brand" /> Coordenadas (GPS) *</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Latitude"><Input value={f.latitude} onChange={(e) => set('latitude', e.target.value)} inputMode="decimal" placeholder="-23.561400" required /></Campo>
            <Campo rotulo="Longitude"><Input value={f.longitude} onChange={(e) => set('longitude', e.target.value)} inputMode="decimal" placeholder="-46.682300" required /></Campo>
            <Campo rotulo="Raio de participação (m)" dica="Distância máxima do bar para votar via GPS"><Input type="number" min={30} max={5000} value={f.raio_metros} onChange={(e) => set('raio_metros', Number(e.target.value))} /></Campo>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao type="button" tamanho="sm" variante="secundario" onClick={usarMinhaLocalizacao}><Crosshair className="size-4" /> Usar minha localização atual</Botao>
            <Botao type="button" tamanho="sm" variante="secundario" onClick={coordenadasDoEndereco} carregando={buscandoCoord}><Search className="size-4" /> Buscar pelo endereço</Botao>
            {temCoord && (
              <a className="inline-flex h-8 items-center gap-1 px-2 text-xs font-semibold text-info hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${f.latitude}&mlon=${f.longitude}#map=18/${f.latitude}/${f.longitude}`}>
                Conferir no mapa <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </Cartao>

      <Cartao className="space-y-4">
        <div>
          <h2 className="font-bold">Estilo musical *</h2>
          <p className="text-sm text-muted">Só músicas desses estilos podem entrar no catálogo — e, portanto, só elas podem ser escolhidas pelo público.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...sugestoes, ...f.estilos])].map((e) => <Chip key={e} ativo={f.estilos.includes(e)} onClick={() => alternarEstilo(e)}>{e}</Chip>)}
        </div>
        <div className="flex max-w-sm gap-2">
          <Input value={estiloNovo} onChange={(e) => setEstiloNovo(e.target.value)} placeholder="Outro estilo…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = estiloNovo.trim(); if (v.length >= 2 && !f.estilos.includes(v)) { set('estilos', [...f.estilos, v]); setEstiloNovo(''); } } }} />
          <Botao type="button" variante="secundario" onClick={() => { const v = estiloNovo.trim(); if (v.length >= 2 && !f.estilos.includes(v)) { set('estilos', [...f.estilos, v]); setEstiloNovo(''); } }}>Adicionar</Botao>
        </div>
      </Cartao>

      <Cartao className="space-y-4">
        <h2 className="font-bold">Regras da sala</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Pedidos simultâneos por pessoa" dica="Músicas na fila ao mesmo tempo"><Input type="number" min={1} max={20} value={f.max_pedidos_por_sessao} onChange={(e) => set('max_pedidos_por_sessao', Number(e.target.value))} /></Campo>
          <Campo rotulo="Não repetir música por (min)" dica="0 libera repetição imediata"><Input type="number" min={0} max={720} value={f.cooldown_repeticao_min} onChange={(e) => set('cooldown_repeticao_min', Number(e.target.value))} /></Campo>
          <Campo rotulo="Valor do super chat (R$)" dica="Mínimo R$ 1,00"><Input type="number" min={1} step="0.5" value={(f.superchat_valor_centavos / 100).toString()} onChange={(e) => set('superchat_valor_centavos', Math.round(Number(e.target.value) * 100))} /></Campo>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} className="size-5 accent-[var(--color-brand)]" />
          Bar aberto (visível para os clientes)
        </label>
      </Cartao>

      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <div className="sticky bottom-20 flex justify-end lg:static">
        <Botao tamanho="lg" carregando={salvando}><Save className="size-5" /> {novo ? 'Cadastrar bar' : 'Salvar alterações'}</Botao>
      </div>
    </form>
  );
}
