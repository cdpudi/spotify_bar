# Spotify Bar

Plataforma onde o público do bar escolhe e vota nas músicas (Spotify Premium), com **super chat via Pix**, planos para o bar e QR Code por estabelecimento.

> Estado do projeto, decisões e o que falta para produção: **[PROJETO.md](PROJETO.md)**.

## Rodar localmente (modo demonstração — sem credenciais)

Pré-requisitos: Node 22+, Docker.

```bash
# 1) Postgres local (porta 5436)
docker compose up -d

# 2) API  → http://localhost:3002
cd api
npm install
npm run seed        # cria dono/bar/catálogo de demonstração
npm run dev

# 3) Front → http://localhost:5175   (em outro terminal)
cd web
npm install
npm run dev
```

- Dono demo: **demo@spotifybar.dev / demo12345** → `http://localhost:5175/admin`
- Sala do bar demo (como se tivesse lido o QR): `http://localhost:5175/b/bar-do-ze-demo?q=demo-qr-token`
- Em dev, `SPOTIFY_MODE=mock` e `PIX_MODE=mock` (padrões): o Spotify é simulado e o Pix tem o botão **"Simular pagamento"**.
- GPS no navegador só funciona em HTTPS ou `localhost`.

### Testes
```bash
cd api
npm test            # unitários (BR Code/CRC16, haversine, planos, cifra)
npm run e2e         # ponta a ponta contra a API rodando (dê um PLAYER_POLL_MS=1000 PLAYER_LEAD_MS=8000 na API p/ acelerar)
cd ../web && npm run build   # typecheck + build
```

## Usar o Spotify real

1. Em <https://developer.spotify.com/dashboard> crie um app e cadastre o **Redirect URI**:
   - dev: `http://127.0.0.1:3002/api/spotify/callback` (use `127.0.0.1`, não `localhost`)
   - produção: `https://spotify-bar.umg.com.br/api/spotify/callback`
2. Em `api/.env`: `SPOTIFY_MODE=real`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `API_URL=http://127.0.0.1:3002`.
3. No painel → **Spotify** → *Conectar conta* (precisa ser **Premium**) → abra o app Spotify no celular do bar → *Atualizar* → *Usar neste bar*.

## Deploy no Portainer

1. DNS: `spotify-bar.umg.com.br` → VPS (a rede externa `traefik` e o resolvedor `letsencrypt` já usados pelos outros projetos).
2. Portainer → **Stacks → Add stack → Repository** (este repositório privado, com credenciais) → *Compose path*: `docker-compose.portainer.yml`.
3. Em **Environment variables** preencha o que está em `.env.example` (obrigatórias: `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`; defina `SPOTIFY_MODE=real` e `PIX_MODE=real`).
   - Gerar segredos: `openssl rand -hex 32`. **Guarde a `ENCRYPTION_KEY`** — sem ela os tokens salvos ficam ilegíveis.
4. *Deploy the stack*. A API aplica as migrations sozinha na subida.

Testar a stack de produção na sua máquina (sem Traefik):
```bash
export DB_PASSWORD=x JWT_SECRET=x ENCRYPTION_KEY=x SPOTIFY_MODE=mock PIX_MODE=mock PUBLIC_URL=http://localhost:8085
docker compose -p sbteste -f docker-compose.portainer.yml -f deploy/docker-compose.teste.yml up -d --build   # http://localhost:8085
```

## Estrutura

```
api/src/
  app.ts server.ts worker.ts config.ts db.ts realtime.ts
  routes/     auth · bares · spotify · catalogo · pagamentos · publico
  spotify/    real.ts (API oficial) · mock.ts (simulado) · index.ts (tokens)
  payments/   Pix: BR Code estático, Mercado Pago, mock; confirmação/expiração
  lib/        estado (ordem da fila) · planos · pix · geo · segurança (scrypt, AES-GCM)
  scripts/    seed.ts · e2e.ts
api/migrations/  SQL versionado
web/src/
  pages/      Home · Sala · admin/*   components/  ui · PixFolha   lib/  api · auth · publico
```
