import 'dotenv/config';

const env = process.env;
const producao = env.NODE_ENV === 'production';

function obrigatorioEmProducao(nome: string, padrao: string): string {
  const v = env[nome];
  if (v) return v;
  if (producao) throw new Error(`Variável de ambiente ${nome} é obrigatória em produção`);
  return padrao;
}

export const config = {
  producao,
  porta: Number(env.PORT ?? 3002),
  // saltos de proxy confiáveis (Traefik + Nginx = 2). Em dev, sem proxy = 0.
  proxyHops: Number(env.TRUST_PROXY_HOPS ?? (producao ? 2 : 0)),
  // administrador da plataforma (criado na subida se não existir). Em dev há um padrão; em produção defina no ambiente.
  adminEmail: env.ADMIN_EMAIL ?? (producao ? '' : 'admin@spotifybar.dev'),
  adminSenha: env.ADMIN_SENHA ?? (producao ? '' : 'admin12345'),
  databaseUrl: env.DATABASE_URL ?? 'postgres://spotifybar:spotifybar@localhost:5436/spotifybar',
  jwtSecret: obrigatorioEmProducao('JWT_SECRET', 'dev-secret-troque-em-producao'),
  encryptionKey: obrigatorioEmProducao('ENCRYPTION_KEY', 'dev-encryption-key-troque'),
  // URL pública do front (QR codes, redirecionamento pós-OAuth)
  urlPublica: (env.PUBLIC_URL ?? 'http://localhost:5175').replace(/\/$/, ''),
  // URL pública da API (redirect_uri do Spotify). Em produção = mesma origem do front.
  urlApi: (env.API_URL ?? env.PUBLIC_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, ''),

  spotify: {
    modo: (env.SPOTIFY_MODE ?? 'mock') as 'mock' | 'real',
    clientId: env.SPOTIFY_CLIENT_ID ?? '',
    clientSecret: env.SPOTIFY_CLIENT_SECRET ?? '',
    pollMs: Number(env.PLAYER_POLL_MS ?? 4000),
    // quanto falta para acabar a faixa atual para já enfileirar a próxima
    antecedenciaMs: Number(env.PLAYER_LEAD_MS ?? 20000),
  },

  pix: {
    // mock: todos os pagamentos são simulados (apenas desenvolvimento)
    modo: (env.PIX_MODE ?? 'mock') as 'mock' | 'real',
    // recebimento das assinaturas da plataforma
    plataformaProvider: (env.PLATFORM_PIX_PROVIDER ?? 'estatico') as 'estatico' | 'mercadopago',
    plataformaChave: env.PLATFORM_PIX_KEY ?? '',
    plataformaTitular: env.PLATFORM_PIX_NAME ?? 'SPOTIFY BAR',
    plataformaCidade: env.PLATFORM_PIX_CITY ?? 'SAO PAULO',
    plataformaMpToken: env.PLATFORM_MP_ACCESS_TOKEN ?? '',
    webhookSecret: env.MP_WEBHOOK_SECRET ?? '',
    expiraMin: Number(env.PIX_EXPIRA_MIN ?? 15),
  },
};
