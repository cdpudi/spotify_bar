# PROJETO.md — Spotify Bar

> Documento vivo do projeto. **Atualize a cada mudança**: o que já foi feito, decisões tomadas e o que falta para entrar em produção.
> Última atualização: 21/10/2026 (gestão administrativa e cobrança).

## 1. O que é

Plataforma online, responsiva, para **bares** deixarem o público escolher a trilha sonora.

- No bar fica um **celular com Spotify Premium** tocando; o sistema controla a fila desse aparelho.
- O cliente abre a plataforma, **ativa o GPS**, vê os **bares disponíveis**, escolhe o bar e entra na sala.
- Na sala: vê **o que está tocando**, a **fila**, **escolhe músicas** (só as do catálogo/estilo definidos pelo bar) e **vota** nas músicas dos outros.
- **Ordem de execução:** super chat (pago via Pix) → mais votada → ordem de pedido.
- **Super chat:** o cliente paga via Pix e a música passa na frente de todas.
- O bar tem um **painel** (cadastro com latitude/longitude, estilos, catálogo, contas/dispositivos Spotify, Pix, QR Code, plano).
- **QR Code individual por bar:** quem entra pelo QR **não precisa de GPS**; sem QR, o GPS é obrigatório e o cliente precisa estar dentro do raio do bar.
- **Planos do bar:** Free (R$ 0), Mensal R$ 200, Semestral R$ 1.000, Anual R$ 1.800.

Roda no **Portainer** (stack Docker + Traefik), domínio provisório **`spotify-bar.umg.com.br`**. Banco **PostgreSQL local** (container).

## 2. Arquitetura

```
spotify_bar/
  api/      Node 22 + Fastify 5 + TypeScript + pg (SQL direto) — API, regras e worker do player
  web/      Vite + React 19 + TypeScript + Tailwind v4 — SPA responsiva (mobile-first)
  docker-compose.yml            dev: só o Postgres (porta 5436)
  docker-compose.portainer.yml  produção: db + api + web (Nginx) atrás do Traefik
  deploy/docker-compose.teste.yml  sobreposição p/ testar a stack de produção localmente
  PROJETO.md  README.md  .env.example
```

- **web** fala só com a **api** (`/api/*`). Em produção o Nginx do container `web` serve a SPA e faz proxy de `/api` para o container `api` (mesma origem → sem CORS e o `redirect_uri` do Spotify fica `https://spotify-bar.umg.com.br/api/spotify/callback`).
- **Tempo real:** SSE (`/api/public/bares/:slug/stream`) avisa "mudou" e o cliente rebusca o estado; há polling de segurança a cada 8 s.
- **Worker do player** (`api/src/worker.ts`): a cada ciclo (4 s), para cada bar com conta+dispositivo: lê o que toca no Spotify, sincroniza a fila (`enviada → tocando → tocada`) e, quando a faixa está acabando (≤ 20 s) ou o player está ocioso, escolhe a próxima (super chat > votos > antiguidade) e a envia para a **fila do Spotify**.
- **Provedores plugáveis** (`api/src/spotify/`, `api/src/payments/`): `real` e `mock`. O modo `mock` (padrão em dev) simula Spotify e Pix para desenvolver e testar sem credenciais.
- **Segredos** (tokens do Spotify e do Mercado Pago) ficam **cifrados** no banco (AES-256-GCM, chave `ENCRYPTION_KEY`).
- **Autenticação:** dono do bar = e-mail + senha (scrypt) → JWT 7 dias. Cliente = sessão **anônima** por aparelho (UUID) → JWT 12 h emitido por bar, só após QR válido ou GPS dentro do raio.

### Modelo de dados (`api/migrations/001_init.sql`)
`usuarios` (papel admin/dono) · `spotify_contas` (do usuário; um bar escolhe conta + dispositivo) · `bares` · `catalogo` · `fila` · `votos` · `player_estado` · `pagamentos` · `configuracoes` · `schema_migrations`.

### Regras de negócio implementadas
| Regra | Onde |
|---|---|
| Só entra no catálogo música classificada num **estilo permitido** pelo bar; o público só pede do catálogo | `routes/catalogo.ts`, `routes/publico.ts` |
| Entrada por **QR** (token do bar) sem GPS; senão GPS dentro do `raio_metros` (+ tolerância de até 100 m da precisão do GPS) | `routes/publico.ts` (`/entrar`) |
| Pedir música já na fila vira **voto**; quem pede conta como 1º voto; voto único por pessoa | `routes/publico.ts` |
| Limite de pedidos simultâneos por pessoa e **cooldown** de repetição (configuráveis por bar) | `routes/publico.ts` |
| Ordem: `enviada` > super chat (por hora de pagamento) > mais votos > mais antiga | `lib/estado.ts` (`ORDEM_FILA`) |
| Super chat: só planos pagos; o Pix só vira prioridade **depois de pago**; Pix expira (15 min) | `payments/index.ts` |
| Plano vencido volta a Free; renovar antes do vencimento soma o período | `lib/planos.ts`, `payments/index.ts` |
| Limites do Free: 30 músicas, 1 conta Spotify, sem super chat (**definição nossa — ver §6**)
| Dono só altera catálogo; demais dados só admin | `routes/bares.ts`, `routes/spotify.ts`, `lib/bares.ts` |
| Bar bloqueado some do público e para o player | `routes/publico.ts`, `worker.ts`, `routes/admin.ts` | | `lib/planos.ts` |
| Um dispositivo Spotify só atende um bar | `routes/bares.ts` |
| Multi-tenant: dono só acessa os próprios bares | `lib/bares.ts` |

### Recebimento Pix
- **Super chat → dinheiro vai direto para o bar.** Cada bar escolhe: **chave Pix estática** (BR Code; o bar confere o extrato e clica "Recebi" no painel) ou **Mercado Pago** (cobrança automática + webhook/consulta).
- **Assinaturas → plataforma**: provedor definido por env (`PLATFORM_PIX_PROVIDER`).
- `PIX_MODE=mock` simula tudo (botão "Simular pagamento"); **nunca usar em produção**.

### Perfis e permissões (decisão de 21/10/2026)
- **Administrador da plataforma** (`usuarios.papel='admin'`): único que cria bares e responsáveis e altera dados do bar, Spotify (contas/dispositivos), Pix, QR Code (regenerar), plano/cobrança, bloqueio. Criado na subida por `ADMIN_EMAIL`/`ADMIN_SENHA`. **Não existe cadastro público.**
- **Responsável pelo bar** (`papel='dono'`): **altera apenas o catálogo**. Também acompanha o painel ao vivo, **controla o player/fila** (pausar, pular, remover — operação do dia a dia), confirma "Recebi" de super chat, **vê os pagamentos que o bar fez à plataforma (mensalidades), a lista de super chats do público (recebido ou não), as estatísticas do próprio bar** (somente leitura), o QR Code e o plano/vencimento. **Não paga nem troca de plano:** a tela de plano só mostra os cards e destaca o atual; para mudar, entra em contato com o administrador.
- Premissa: moderação da fila e confirmação de super chat ficam com o responsável por serem operação, não "informação" do bar. Se quiser restringir, é trocar `auth`→`admin` em `routes/bares.ts`/`pagamentos.ts`.

### Cobrança, vencimento e bloqueio
- `bares.plano` + `plano_expira_em` = plano e **próximo vencimento**. Situação calculada (`lib/cobranca.ts`): **Free · Em dia · Vence em breve (≤ 7 dias) · Vencido · Bloqueado**.
- **Tela "Bares e cobrança"** (admin): lista com plano, vencimento ("em N dias"/"há N dias"), último pagamento (data, forma, valor), pedidos; filtros por situação; ações **Registrar pagamento**, **Bloquear** (com motivo) e **Desbloquear**.
- **Registrar pagamento** (`POST /api/admin/bares/:id/mensalidades`): plano, **forma de recebimento (Pix, dinheiro, outro)**, valor, data e **próximo vencimento** (vazio = soma o período do plano ao vencimento vigente). Gera o lançamento em `pagamentos` (`provider='manual'`) e **desbloqueia** o bar. Pix online da assinatura também cai aqui com `forma='pix'`.
- **Bloqueio é decisão do administrador** (não automático): o bar some da busca por GPS, ninguém entra na sala (403), o player para de receber músicas e o responsável vê o aviso e o motivo. Plano vencido já derruba o bar para Free (sem super chat) mesmo sem bloqueio.
- **Pagamentos** — duas visões distintas: (a) `/api/bares/:id/pagamentos` = **mensalidades que o bar pagou à plataforma** (o que o responsável vê, com a forma: Pix/dinheiro); (b) `/api/bares/:id/superchats` = **pedidos de super chat do público** e se foram **recebidos, aguardando ou não recebidos** (com "Recebi" Pix/dinheiro para os pendentes). O administrador vê tudo da plataforma em `/api/admin/pagamentos` (super chats e mensalidades de todos os bares): filtros (bar, tipo, forma, situação, período) e **totais por forma e por tipo**. Super chat confirmado manualmente informa a forma (Pix/dinheiro/outro).
- **Estatísticas** (`/api/admin/estatisticas`, `/api/bares/:id/estatisticas`): músicas pedidas, tocadas, super chats, votos, participantes, **mais pedidas**, pedidos por dia e por bar, com filtro de período.

## 3. UX/UI

- Linguagem escura inspirada no Spotify, identidade própria: fundo `#0b0b0c`, verde `#1ed760`, dourado `#ffc247` para super chat; Inter; botões pill; capas geradas por gradiente quando não há imagem.
- **Cliente (mobile-first):** home com um único CTA (GPS) → lista de bares por distância (indica "Você está aqui"/fora do alcance) → sala com *Tocando agora* (progresso em tempo real), abas **Fila** | **Escolher música**, voto em 1 toque, ⚡ super chat em bottom sheet com QR Pix + copia e cola + status ao vivo. No desktop o player fica fixo ao lado.
- **Dono:** sidebar no desktop / barra inferior no celular; painel ao vivo, pendências guiadas (conectar Spotify, catálogo vazio, chave Pix).
- Acessibilidade: foco visível, `aria-*` em abas/votos/modais, `prefers-reduced-motion`, alvos de toque ≥ 40 px.

## 4. Status — o que já foi feito ✅

**Infra / repositório**
- [x] Projeto, monorepo `api/` + `web/`, `.gitignore`, `.env.example`
- [x] Postgres local em Docker (dev) e migrations versionadas
- [x] Dockerfiles (api, web/Nginx) + `docker-compose.portainer.yml` (Traefik, `spotify-bar.umg.com.br`)
- [x] **Stack de produção testada localmente** (build das imagens, Nginx → API, SSE atravessando o proxy, e2e completo contra ela)

**API**
- [x] Cadastro/login de donos (scrypt + JWT), rate limit em login/registro/entrada/superchat
- [x] CRUD de bares (dados completos, latitude/longitude, raio, estilos, regras, ativo)
- [x] Estilos musicais por bar + catálogo restrito aos estilos; limites por plano
- [x] OAuth Spotify (várias contas por dono), listagem de dispositivos, seleção conta+dispositivo, exclusividade de dispositivo
- [x] Busca no Spotify, controles do player (pausar/retomar/pular), remover da fila
- [x] Worker do player (próxima = super > votos > antiguidade; reverte "enviada" travada)
- [x] Entrada por GPS (haversine + raio) ou QR; bares próximos por GPS com distância
- [x] Pedido/voto/desvoto, cooldown, limite por pessoa
- [x] Super chat + Pix (BR Code estático, Mercado Pago, mock), expiração, confirmação manual, webhook
- [x] Planos Free/Mensal/Semestral/Anual com assinatura por Pix e ativação/renovação
- [x] SSE em tempo real
- [x] **Perfis admin/responsável**, sem cadastro público; criação de responsáveis e bares pelo admin
- [x] **Cobrança**: vencimento, situação, registro manual de pagamento (pix/dinheiro/outro), bloqueio/desbloqueio
- [x] **Gestão de pagamentos** e **estatísticas** (por bar e da plataforma)
- [x] Testes: unitários (`npm test`: CRC16/BR Code, haversine, planos, cifra) e **e2e** (`npm run e2e`: 13 cenários — auth, GPS/QR, ordem da fila, limites, super chat, player, cooldown, multi-tenant, plano Free→Semestral)

**Front**
- [x] Home com GPS e lista de bares · Sala (tocando agora, fila, catálogo, voto, super chat, apelido) · QR/GPS gate
- [x] Painel do dono: dashboard, dados do bar (CEP via ViaCEP, coordenadas por GPS do aparelho ou pelo endereço), catálogo, Spotify (contas/dispositivos), Pix, QR Code (imprimir/baixar), planos
- [x] Verificado no navegador (mobile e desktop): entrada por QR, pedido, player em tempo real, super chat Pix + confirmação, painel, planos, Spotify

## 5. O que falta para entrar em produção ⏳

### Bloqueantes (sem isso não sobe)
- [ ] **Criar o app no Spotify Developer Dashboard** e cadastrar o Redirect URI `https://spotify-bar.umg.com.br/api/spotify/callback`; preencher `SPOTIFY_CLIENT_ID/SECRET`. **Testar o modo `real` de ponta a ponta com um Premium real** (OAuth, dispositivos, fila, play) — o modo real foi implementado seguindo a API oficial, mas **ainda não foi exercitado** (não há credenciais neste ambiente).
- [ ] **Definir e configurar o recebimento Pix das assinaturas** (`PLATFORM_PIX_PROVIDER` + chave ou token Mercado Pago) e **testar um Pix real** (estático e/ou Mercado Pago, incluindo webhook `…/api/webhooks/mercadopago?secret=…` cadastrado no painel MP). Hoje só o modo `mock` foi exercitado.
- [ ] **Apontar o DNS** `spotify-bar.umg.com.br` para a VPS e **subir a stack no Portainer** (variáveis do `.env.example`; gerar `JWT_SECRET`/`ENCRYPTION_KEY` fortes e **guardar a `ENCRYPTION_KEY`**).
- [ ] **Backup do Postgres** (volume `spotify-bar-db`) — definir rotina.
- [ ] **Validar o GPS no celular real**, em HTTPS (geolocalização do navegador só funciona em HTTPS/localhost) e dentro do bar (precisão, raio ideal).

### Importantes (logo após o MVP subir)
- [ ] **Conformidade Spotify:** revisar a política de desenvolvedor/termos do Spotify para uso comercial em estabelecimento (execução pública de música normalmente exige licença própria — ECAD/Spotify for Business) e o **modo de desenvolvimento do app Spotify** (limite de usuários cadastrados; pedir "extended quota" para operar com muitos bares). **Risco de negócio a validar antes de vender.**
- [ ] **Marca:** o nome "Spotify Bar" e a estética usam a marca Spotify — avaliar renomear/ajustar para evitar conflito de marca.
- [ ] **Recuperação de senha** e verificação de e-mail dos donos (precisa de SMTP).
- [ ] **Anti-fraude de votos:** hoje a identidade é anônima por aparelho (rate limit por IP). Reforçar (ex.: token de sessão amarrado a nonce do QR, captcha leve, limites por bar).
- [ ] Painel da plataforma: **ajustar planos/preços sem deploy** (o restante — bares, assinaturas, pagamentos, bloqueio — já existe).
- [ ] **Bloqueio automático** ao vencer (hoje é manual por decisão do admin) e **aviso por e-mail/WhatsApp** de vencimento.
- [ ] Cobrança recorrente automática (hoje o plano é pré-pago por período; o admin registra/renova).
- [ ] **Repasse/relatório de super chats** para o bar (extrato, exportação CSV) e taxa da plataforma sobre super chat (**decisão de negócio em aberto**).
- [ ] **Observabilidade:** logs estruturados já ligados em produção; falta alerta (player offline, falhas de token Spotify, Pix pendente demais).
- [ ] **Testes automatizados no CI** (GitHub Actions: build + `npm test` + e2e com Postgres de serviço).
- [ ] **PWA** (instalar na tela inicial) e tela offline.
- [ ] Testes de carga (≥ 100 clientes simultâneos na sala; polling do worker × quantidade de bares — Spotify tem rate limit por app).

### Melhorias futuras
- [ ] Importar playlist do Spotify para o catálogo; sugestão automática de estilo pelos gêneros do artista (a API do Spotify tem restringido campos como `genres`).
- [ ] Moderação (bloquear músicas/explícitas, banir sessão), horário de funcionamento do bar, modo "festa" (sem votos).
- [ ] Mapa na tela inicial; histórico/estatísticas (músicas mais pedidas, faturamento de super chat).
- [ ] Vários operadores por bar; multi-idioma.

## 6. Decisões e premissas (confirmar com o responsável)

1. **Limites do plano Free** (não informados no pedido; definimos): até 30 músicas no catálogo, 1 conta Spotify, **sem super chat**. Planos pagos: catálogo ilimitado (5.000), até 10 contas, super chat.
2. **Quem recebe o super chat:** o **bar** (direto, sem intermediar o dinheiro). Taxa da plataforma: **não implementada**.
3. **Raio de participação** padrão 150 m (configurável 30 m–5 km por bar) e tolerância de até 100 m da precisão do GPS.
4. **Valor do super chat** padrão R$ 10,00 (configurável por bar, mín. R$ 1,00).
5. **Cooldown** de repetição padrão 30 min; **3 pedidos simultâneos** por pessoa.
6. **Estilos:** o dono classifica cada música do catálogo num dos estilos do bar (não dependemos de metadados de gênero do Spotify).
7. **Vigência:** mensal 30 dias, semestral 182, anual 365; vencido → Free (os dados permanecem).
8. Pasta do projeto: `spotify_bar` (o pedido dizia `spotiy_bar`, assumido erro de digitação).

## 7. Como operar

Veja o [README.md](README.md) (rodar local, testes, deploy no Portainer, variáveis).

## 8. Histórico

| Data | Mudança |
|---|---|
| 21/10/2026 | Ajuste: pagamentos do responsável = mensalidades à plataforma; nova tela Super chat (recebido ou não); plano só consulta (troca via administrador; `/assinar` passou a ser só admin). |
| 21/10/2026 | Perfis admin/responsável, cobrança com vencimento e bloqueio, pagamentos por forma, estatísticas de pedidos (e2e: 17 cenários). |
| 21/10/2026 | Projeto criado: API, front, Docker/Portainer, testes unitários e e2e, documentação. Repositório privado no GitHub. |
