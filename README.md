# Roblox Store

Plataforma de e-commerce para produtos digitais de Roblox — contas, gamepasses,
itens e Robux — com painel administrativo completo. O administrador controla
praticamente tudo pelo painel, sem abrir o editor de código.

---

## Sumário

1. [Stack](#stack)
2. [Estrutura do projeto](#estrutura-do-projeto)
3. [Como rodar](#como-rodar)
4. [Variáveis de ambiente](#variáveis-de-ambiente)
5. [Banco de dados](#banco-de-dados)
6. [Segurança (RLS e permissões)](#segurança-rls-e-permissões)
7. [Rotas](#rotas)
8. [Administradores](#administradores)
9. [Como usar o painel](#como-usar-o-painel)
10. [Deploy na Vercel](#deploy-na-vercel)
11. [Checklist de produção](#checklist-de-produção)
12. [Pagamento (Stripe / Pix)](#pagamento-stripe--pix)
13. [Diagnóstico de implantação](#diagnóstico-de-implantação)
14. [Melhorias futuras](#melhorias-futuras)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Linguagem | TypeScript |
| UI | React 19, Tailwind CSS v4, componentes no padrão shadcn/ui (Radix) |
| Ícones | lucide-react |
| Banco | PostgreSQL (Supabase) |
| Autenticação | Supabase Auth (magic link, Google, Discord) |
| Arquivos | Supabase Storage |
| Validação | Zod |
| Gráficos | Recharts |
| Deploy | Vercel |

---

## Estrutura do projeto

```
roblox-store/
├─ supabase/migrations/       13 migrations SQL, aplicadas em ordem
├─ scripts/                   utilitários (dump de migrations)
├─ public/placeholders/       imagens provisórias (troque pelo painel)
└─ src/
   ├─ app/
   │  ├─ (store)/             vitrine — layout, home, catálogo, checkout, conta
   │  ├─ admin/               painel administrativo
   │  ├─ auth/callback/       troca do código OAuth por sessão
   │  ├─ layout.tsx           layout raiz, injeta a cor da marca
   │  ├─ sitemap.ts           sitemap dinâmico
   │  └─ robots.ts
   ├─ actions/                Server Actions (uma por domínio)
   ├─ components/
   │  ├─ ui/                  design system (Button, Card, Dialog…)
   │  ├─ store/               componentes da vitrine
   │  ├─ cart/                carrinho (provider, drawer, botões)
   │  └─ admin/               componentes do painel
   ├─ lib/
   │  ├─ supabase/            três clients: browser, server, admin
   │  ├─ queries/             leitura de dados (server-only)
   │  ├─ types/               tipos do banco
   │  ├─ catalog-options.ts  constantes compartilhadas servidor/cliente
   │  ├─ auth.ts              sessão, papéis e guards de permissão
   │  ├─ sanitize.ts          sanitização do HTML do CMS
   │  ├─ seo.ts               metadata e JSON-LD
   │  └─ utils.ts             formatação (preço, data, slug)
   └─ proxy.ts                sessão + proteção de rotas + headers de segurança
```

**Separação de responsabilidades.** `lib/queries` só lê. `actions` só escreve, e
sempre atrás de um guard de permissão. `components/ui` não conhece o banco.
`lib/supabase/admin` é o único ponto com service_role, e é `server-only`.

---

## Como rodar

```bash
npm install
```

Copie o `.env.example` para `.env.local` e preencha (veja a seção abaixo). Depois:

```bash
npm run dev
```

A loja sobe em `http://localhost:3000` e o painel em `http://localhost:3000/admin`.

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run typecheck` | TypeScript sem emitir arquivos |
| `npm run lint` | ESLint |
| `npm run test:security` | **Smoke test de RLS** — conecta como visitante anônimo e tenta alcançar o que não deveria |
| `npm run test:sanitize` | **Teste de XSS** — 26 cenários provando que a sanitização barra script, onerror, javascript: e afins |
| `npm run test:webhook` | **Teste do webhook da Stripe** — assina eventos com o SDK e prova que o endpoint aceita os válidos e recusa forjados, adulterados e replays |
| `npm run verify` | typecheck + lint + build, em sequência |
| `npm run db:dump` | Materializa as migrations aplicadas a partir do banco |

**Rode `npm run test:security` depois de toda migration.** Uma policy nova ou
uma RPC `SECURITY DEFINER` esquecida abre buraco sem gerar erro em lugar nenhum:
o sistema continua funcionando e vazando em silêncio. O script cobre 21 cenários
— leitura pública que deve funcionar, dados sensíveis que não podem vazar,
escrita que deve ser barrada e RPCs privilegiadas que não podem ser chamadas.

Uma armadilha que o script já trata: **um `UPDATE` barrado por RLS não devolve
erro.** Ele afeta zero linhas e retorna sucesso. Testar `if (error)` daria falso
positivo — a única prova é reler o valor e comparar.

---

## Variáveis de ambiente

O `.env.local` **nunca** vai para o Git (já está no `.gitignore`).

### Públicas — chegam ao browser

| Variável | O que é |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave publishable. É segura de expor: tudo que passa por ela é filtrado pelo RLS |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site (usada em OAuth, sitemap e OpenGraph) |

### Servidor — nunca importar em Client Component

| Variável | O que é |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Ignora o RLS por completo.** Só é usada em `lib/supabase/admin.ts`, que tem `import 'server-only'` — se alguém tentar importar no cliente, o build quebra |
| `STRIPE_SECRET_KEY` | Chave secreta da Stripe (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Segredo de assinatura do webhook (`whsec_...`). Sem ele, qualquer POST na rota poderia marcar pedidos como pagos |

**Onde pegar a service_role:** Supabase Dashboard → Project Settings → API →
`service_role`. Essa chave dá acesso total ao banco: trate como senha.

---

## Banco de dados

### Tabelas

| Tabela | Papel |
|---|---|
| `profiles` | Espelho público de `auth.users` |
| `user_roles` | Quem é `admin`, `super_admin` ou `customer` |
| `role_permissions` | O que cada papel pode fazer (34 permissões granulares) |
| `admin_allowlist` | E-mails que viram admin automaticamente no primeiro login |
| `categories` | Taxonomia **hierárquica** (`parent_id`) |
| `products` | Catálogo. Preço em **centavos** (`integer`) |
| `product_images` | Galeria ordenável |
| `product_categories` | Categorias secundárias (N:N) |
| `collections` / `collection_products` | Curadoria transversal ("Mais Vendidos") |
| `banners` | Imagem desktop e mobile, com janela de agendamento |
| `homepage_sections` | A home montada por seções ordenáveis |
| `pages` | CMS de páginas institucionais |
| `settings` | Configurações chave/valor, com corte `is_public` |
| `orders` / `order_items` | Pedidos. Os itens guardam **snapshot** do produto |
| `payments` | Pagamentos, com `raw_payload` do gateway |
| `coupons` / `coupon_redemptions` | Cupons e histórico de uso |
| `digital_stock_items` | **Uma linha por unidade vendável** (código, credencial) |
| `digital_deliveries` | Trilha de entrega e visualização |
| `reviews` | Avaliações com moderação |
| `admin_logs` | Auditoria append-only |

### Decisões que valem explicar

**Dinheiro em centavos.** Todo valor monetário é `integer` de centavos, nunca
`float`. Erro de arredondamento em ponto flutuante é uma das formas mais comuns
de uma loja perder dinheiro em silêncio.

**Snapshot no item do pedido.** `order_items` copia nome, preço e imagem do
produto no momento da compra. Se você editar o preço amanhã ou excluir o
produto, o pedido antigo continua contando a história correta.

**Três políticas de estoque.**
- `unlimited` — Robux, gamepass sob demanda: nunca esgota.
- `manual` — você controla um número (`stock_quantity`).
- `digital_keys` — cada código é uma linha em `digital_stock_items`; o estoque é
  a contagem de linhas disponíveis.

**Slug e código curto.** O produto tem `slug` (bom para SEO) e `short_code`
(estável). Se você renomear o produto, o slug muda e o código continua valendo.

### Anti-overselling

`create_order()` é uma função transacional. Ela:

1. Recalcula o preço **do banco** — o cliente só manda `product_id` e quantidade.
2. Reserva o estoque na mesma transação.
3. Para `digital_keys`, usa `FOR UPDATE SKIP LOCKED`: dois compradores
   simultâneos pegam chaves diferentes, e o segundo falha se não houver saldo.
4. Se qualquer item falhar, **tudo reverte** — não fica reserva órfã.

`mark_order_paid()` é idempotente: webhook duplicado não entrega duas vezes.

`cancel_order()` devolve o estoque reservado ao pool.

Isso foi testado antes do deploy — pedido acima do estoque, estoque exato,
esgotado, webhook duplicado, cancelamento e acesso de terceiro à entrega.

### Migrations

As 13 migrations em `supabase/migrations/` reproduzem o banco do zero, em ordem.

Para aplicar em um projeto novo, use o SQL Editor do Supabase (cole uma por vez,
em ordem) ou o CLI:

```bash
npx supabase link --project-ref SEU_REF
npx supabase db push
```

---

## Segurança (RLS e permissões)

**RLS está ligado em todas as 23 tabelas.** Não existe a desculpa de "o backend
controla, então desliguei".

| Quem | Enxerga |
|---|---|
| Anônimo | Produto `active`, categoria/coleção ativa, banner dentro da janela, página publicada, avaliação aprovada, configuração `is_public` |
| Cliente logado | Tudo acima, mais **os próprios** pedidos, itens, pagamentos e avaliações |
| Admin | O que a permissão dele libera, via `authorize('permissao')` |

### Pontos que merecem atenção

**Conteúdo digital.** `digital_stock_items.content` (o código, a credencial) não
é legível por nenhum cliente. O comprador recebe pela RPC `get_my_delivery()`,
que revalida pagamento **e** propriedade antes de devolver qualquer coisa.

**`SECURITY DEFINER` desliga o RLS.** Toda função marcada assim repõe o filtro
de propriedade à mão. Em `get_my_delivery()` isso é explícito: sem essa
reposição, quem soubesse o UUID de um pedido leria a chave de outra pessoa.

**Corte por coluna.** RLS filtra linhas, não colunas. O `raw_payload` do gateway
em `payments` tem `REVOKE SELECT` por coluna — o cliente vê o próprio pagamento,
mas nunca o payload bruto.

**Cupons não são listáveis.** Nenhum cliente faz `SELECT` em `coupons` (isso
permitiria varrer códigos válidos). A validação passa só pela RPC.

**RPCs de escrita são revogadas** de `anon` e `authenticated`. Só o servidor
(service_role) chama `create_order`, `mark_order_paid` e `cancel_order`.

**`search_path` travado** em toda função, para impedir sequestro de resolução
de nomes.

**Logs são append-only.** Não existe policy de UPDATE nem DELETE em
`admin_logs`, de propósito.

### Outras camadas

- **Headers** (`proxy.ts`): CSP, HSTS, X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy.
- **Validação**: Zod em toda Server Action, antes de tocar no banco.
- **XSS**: todo HTML do CMS passa por `sanitizeHtml()` (allowlist de tags).
- **Upload**: tipo MIME e tamanho validados no cliente e limitados no bucket;
  o arquivo é renomeado com UUID (nunca o nome original).
- **Rate limit**: limitador em memória no checkout. Em produção com várias
  instâncias, migre para Upstash/Redis (marcado com comentário no código).

---

## Rotas

### Loja

| Rota | O que é |
|---|---|
| `/` | Home montada pelas seções do banco |
| `/produtos` | Catálogo com busca, filtros, ordenação e paginação |
| `/produto/[slug]` | Página do produto (aceita slug ou código curto) |
| `/categoria/[slug]` | Categoria, com subcategorias |
| `/colecao/[slug]` | Coleção |
| `/pagina/[slug]` | Página institucional do CMS |
| `/carrinho` | Carrinho |
| `/checkout` | Finalização |
| `/pedido/[id]` | Confirmação, pagamento e entrega digital |
| `/login` | Magic link, Google ou Discord |
| `/conta` | Perfil do cliente |
| `/conta/pedidos` | Pedidos do cliente |

### Painel

`/admin` (dashboard), e abaixo dele: `produtos`, `categorias`, `colecoes`,
`pedidos`, `clientes`, `avaliacoes`, `estoque`, `cupons`, `banners`, `homepage`,
`paginas`, `configuracoes`, `administracao`, `logs`.

`/admin/login` é a única rota do painel acessível sem sessão.

---

## Administradores

Dois administradores já vêm configurados:

| E-mail | Papel |
|---|---|
| `pedro07shopify@gmail.com` | `super_admin` |
| `armabritanica@gmail.com` | `admin` |

**Como funciona:** os e-mails estão em `admin_allowlist`. Quando essa pessoa faz
login pela primeira vez, um trigger no banco (`handle_new_user`) concede o papel
automaticamente. Não existe `if (email === "...")` em lugar nenhum do código.

`admin` faz tudo na operação da loja. `super_admin` faz tudo isso **e** gerencia
quem é admin. Um `super_admin` não consegue remover o próprio papel — isso
deixaria a loja sem dono.

### Criar um novo admin

Pelo painel: **Administração → Adicionar e-mail à allowlist**. Ele vira admin no
primeiro login.

Por SQL, se preferir:

```sql
insert into public.admin_allowlist (email, role)
values ('novo@exemplo.com', 'admin');
```

Para promover alguém que **já** tem conta:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where email = 'ja-existe@exemplo.com';
```

---

## Como usar o painel

**Criar produto** — Produtos → Novo produto. Preencha nome e preço (o slug é
gerado sozinho). Escolha a categoria, adicione imagens, defina a política de
estoque e mude o status para *Ativo*. Se for entrega automática por código,
cadastre as chaves em **Estoque**.

**Criar coleção** — Coleções → Nova coleção. Depois de salvar, adicione produtos
e arraste para ordenar. Marque *Mostrar na home* para ela virar um carrossel.

**Criar categoria** — Categorias → Nova categoria. *Categoria pai* cria a
hierarquia. *Em destaque* coloca no bloco "Categorias populares"; *Mostrar na
home* dá a ela um carrossel próprio.

**Criar banner** — Banners → Novo banner. Envie a imagem desktop e, se quiser,
uma versão mobile. Dá para agendar com data de início e fim.

**Editar a homepage** — Homepage. Cada bloco é uma seção: arraste para reordenar,
use o switch para ligar/desligar, clique para editar. *Adicionar seção* insere
hero, categorias, coleção, produtos, features, avaliações, FAQ, CTA ou texto.

**Gerenciar pedidos** — Pedidos. Clique em um para ver detalhes, marcar como
pago, cancelar ou entregar manualmente. Itens de entrega automática já saem
sozinhos quando o pagamento confirma.

**Trocar a identidade visual** — Configurações → Marca. Logo, favicon e cor
primária. A cor é aplicada em toda a loja na hora, sem tocar em código.

---

## Deploy na Vercel

1. Suba o repositório para o GitHub (confirme que `.env.local` **não** foi junto).
2. Na Vercel: **Add New → Project** → importe o repositório.
3. Framework: Next.js (detectado automaticamente). Build: `npm run build`.
4. Em **Environment Variables**, adicione as cinco variáveis do `.env.example`.
   Marque `SUPABASE_SERVICE_ROLE_KEY` para Production e Preview apenas.
5. `NEXT_PUBLIC_SITE_URL` deve ser o domínio final (ex.:
   `https://roblox-store.vercel.app`).
6. Deploy.

**Depois do deploy**, no Supabase → Authentication → URL Configuration:
- *Site URL*: o domínio da Vercel
- *Redirect URLs*: adicione `https://SEU-DOMINIO/auth/callback`

Sem isso, o login por magic link e OAuth redireciona para o lugar errado.

Para ativar Google e Discord: Supabase → Authentication → Providers, e configure
o OAuth de cada um com a callback do Supabase.

---

## Checklist de produção

- [ ] `SUPABASE_SERVICE_ROLE_KEY` preenchida e **só** no servidor
- [ ] `.env.local` fora do Git (`git log --all -- .env.local` deve vir vazio)
- [ ] `NEXT_PUBLIC_SITE_URL` apontando para o domínio real
- [ ] Redirect URLs configuradas no Supabase Auth
- [ ] Os dois e-mails de admin conseguem entrar em `/admin`
- [ ] Um e-mail comum **não** consegue entrar em `/admin`
- [ ] Produtos de demonstração removidos ou substituídos
- [ ] Logo, favicon e cor da marca trocados em Configurações
- [ ] Páginas de Termos e Privacidade revisadas (o texto atual é genérico)
- [ ] Redes sociais preenchidas em Configurações
- [ ] `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` preenchidas
- [ ] Pix habilitado no Dashboard da Stripe
- [ ] Webhook cadastrado apontando para o domínio de produção
- [ ] Um pedido de teste pago de ponta a ponta em modo test
- [ ] `npm run build` passando sem erro
- [ ] Rate limit migrado para Redis se houver mais de uma instância

---

## Pagamento (Stripe / Pix)

O gateway é a **Stripe**, com **Pix via PaymentIntent** — o QR aparece na
própria página do pedido, sem redirecionar para fora da loja.

### Por que PaymentIntent e não Stripe Checkout

Checkout (a página hospedada da Stripe) daria cartão de graça e menos código.
Perderia, em troca, o comprador no meio do fluxo: ele sai da loja, abre o app do
banco e volta para um domínio que não é o seu. Como a Stripe entrega o QR cru em
`next_action.pix_display_qr_code`, dá para mostrá-lo na loja com o mesmo esforço.

A contrapartida assumida: **cartão não está implementado**. Para adicionar,
o caminho é o Payment Element sobre o mesmo PaymentIntent — a tabela `payments`
e o webhook já servem os dois.

### O que você precisa fazer

1. **Conta Stripe brasileira.** Pix só existe para entidades no Brasil.
2. **Habilitar o Pix**: Dashboard → Settings → Payment methods → Pix.
3. **Chaves** em `.env.local` (Dashboard → Developers → API keys):
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. **Webhook**: Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://SEU-DOMINIO/api/webhooks/stripe`
   - Eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`,
     `payment_intent.canceled`
   - Copie o *Signing secret* para `STRIPE_WEBHOOK_SECRET`

Para testar localmente sem expor o servidor:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

O comando imprime um `whsec_...` temporário — use esse no `.env.local` enquanto
testa. Para simular um pagamento aprovado:

```bash
stripe trigger payment_intent.succeeded
```

Sem conta e sem internet, dá para exercitar o endpoint assim:

```bash
npm run test:webhook
```

Esse script assina eventos com o próprio SDK da Stripe e cobre 7 cenários —
sem assinatura, forjada, corpo adulterado depois de assinado, replay de evento
antigo, assinado com o segredo errado, assinatura válida e evento não tratado.
Ele exige que `STRIPE_WEBHOOK_SECRET` no `.env.local` seja o mesmo que o
servidor carregou (reinicie o dev server depois de mudar o `.env`).

**Por que o caso da assinatura válida importa tanto:** um webhook quebrado que
recusa *tudo* passa num teste que só verifica rejeição. Foi exatamente isso que
aconteceu aqui — `verifyWebhookSignature` dependia da `STRIPE_SECRET_KEY` sem
precisar dela, e recusava eventos legítimos quando a chave faltava. Verificar
assinatura é só um HMAC com o webhook secret; hoje usa `Stripe.webhooks`
estático, desacoplado da chave da API.

### Como o dinheiro vira entrega

1. O cliente envia o checkout. `create_order` recalcula o preço **do banco**,
   aplica o cupom e reserva o estoque, tudo numa transação.
2. `createPixCharge()` cria o PaymentIntent com o valor que a RPC devolveu —
   nada do que o cliente digitou sobre dinheiro chega à Stripe.
3. O QR e o código copia-e-cola são gravados em `payments` e mostrados na
   página do pedido, que se atualiza sozinha enquanto o pagamento não cai.
4. O cliente paga. A Stripe chama o webhook.
5. O webhook **valida a assinatura**, confere o valor recebido contra o pedido,
   e chama `mark_order_paid` — que baixa o estoque, entrega o conteúdo digital
   e conclui o pedido.

### Decisões de segurança que valem conhecer

**A página do cliente nunca marca um pedido como pago.** Só o webhook faz isso.
Fechar o navegador no meio do Pix não impede a entrega, e um POST forjado não a
provoca.

**Assinatura verificada antes de qualquer coisa.** O corpo é lido cru
(`request.text()`) porque o hash é calculado sobre os bytes exatos — qualquer
parse antes invalidaria a verificação.

**Valor conferido no webhook.** Se o valor recebido for menor que o do pedido,
a entrega não acontece e o caso é registrado.

**Idempotência em duas camadas.** A criação da cobrança usa
`idempotencyKey: pedido-<uuid>`, então duplo clique não gera duas cobranças; e
`mark_order_paid` é idempotente, então webhook reenviado não entrega duas vezes.

**Falha na cobrança cancela o pedido.** Se a Stripe recusar depois do estoque
já reservado, o pedido é cancelado na hora e as chaves voltam ao pool — senão
ficariam presas até alguém perceber.

**O webhook fica fora do proxy de sessão** (`api/webhooks` está excluído do
matcher): ele autentica por assinatura, não por cookie.

**Pix é assíncrono.** O pedido nasce `pending` e só muda quando o webhook chega.
Por isso o webhook não é opcional: sem ele configurado, nenhum pedido é entregue.

---

## Diagnóstico de implantação

`GET /api/health` responde com a presença de cada variável de ambiente (nunca o
valor) e testa a conexão com o banco:

```bash
curl https://SEU-DOMINIO/api/health
```

É um Route Handler de propósito: **não passa pelo layout raiz**, então continua
respondendo quando todas as páginas estão em 500 — que é justamente quando se
precisa dele.

### A armadilha que já custou caro aqui

No primeiro deploy, **toda página dava 500** enquanto `robots.txt` e as rotas de
API respondiam 200. Esse contraste é o que aponta o caminho: se as rotas que não
passam pelo layout funcionam e as que passam não, o problema está no layout —
não no banco, não nas variáveis.

A causa era `isomorphic-dompurify`, que carrega **jsdom** no servidor. O jsdom
quebra no runtime serverless da Vercel com `ERR_REQUIRE_ESM`. Como a sanitização
entra na cadeia `layout → metadata → seo.ts → sanitize.ts`, derrubava tudo.

Não aparecia em `npm run dev`, nem no `build`, nem no `npm start` local — fora do
bundle o Node resolve os módulos de outro jeito.

**Regra que ficou:** desconfie de qualquer dependência que arraste `jsdom`,
`canvas` ou binário nativo. Confira antes de publicar:

```bash
npm ls jsdom
```

Para achar a linha exata de um 500 opaco em produção, crie um Route Handler
temporário que rode cada passo do layout em `try/catch` separado e devolva qual
falhou. Foi o que identificou esta causa em uma única chamada.

---

## Melhorias futuras

- **Rate limit distribuído** com Upstash Redis (hoje é em memória, por instância)
- **E-mail transacional** de confirmação e entrega (Resend ou similar)
- **Webhook de pagamento** com fila de retry para falhas de entrega
- **Cache** das queries de catálogo com `unstable_cache` e revalidação por tag
- **Editor rich text** no admin (hoje a descrição aceita HTML direto)
- **Relatórios** — margem por produto (o campo `cost_cents` já existe), curva ABC
- **Testes automatizados** — as RPCs de checkout merecem um suite de regressão
- **Criptografia em repouso** do conteúdo digital, além do RLS
- **Multi-idioma**, se a loja for vender fora do Brasil
- **PWA** para instalar a loja no celular

---

## Aviso

Este projeto foi construído a partir do estudo público de um site de referência
para entender padrões de layout, navegação e fluxo de compra do segmento.
Nenhum código-fonte, imagem, texto ou dado proprietário foi copiado — banco,
componentes, estilos e conteúdo são próprios.
