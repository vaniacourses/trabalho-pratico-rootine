# 🌱 Rootine

[![Open in Visual Studio Code](https://classroom.github.com/assets/open-in-vscode-2e0aaae1b6195c2367325f4f02e2d04e9abb55f0b24a779b69b11b9e10269abc.svg)](https://classroom.github.com/online_ide?assignment_repo_id=24013906&assignment_repo_type=AssignmentRepo)

## 📄 Entregas

- Documento entrega 1: [link para docs editável](https://docs.google.com/document/d/10x120NHypRnIW5Y3ZrsmBKEnss1yjeJmQPm18CBFU0E/edit?usp=sharing)
- Documento entrega 2: [link para docs editável](https://docs.google.com/document/d/1JkzBTUMDGWANjnApvreV2cIXuI78wKhP9aqwoCkCXgE/edit?usp=sharing)
- Relatório de uso de IA: [link para docs editável](https://docs.google.com/document/d/1WXMW7Fts2_f49Q9ebnQUhsL-pQ3Q5dQVZ9lmQBiZpnY/edit?usp=sharing)

---

Aplicativo mobile de sustentabilidade que transforma hábitos ambientais em uma jornada gamificada. O Rootine gera **missões hiperpersonalizadas** a partir de fatos reais do usuário (tempo, dinheiro, acesso, saúde, segurança, preferências e experiência), mede o **impacto ambiental** de cada ação concluída e faz um **Habitat** — uma árvore — crescer conforme o usuário evolui.

A premissa central do projeto: **o fluxo principal funciona sem IA paga.** A IA melhora texto, conversa e variações, mas nunca é fonte de verdade para o perfil, impacto, XP ou validação de missões. Toda a personalização canônica vem do banco, de `mission_patterns` e de validadores determinísticos.

Este repositório é um **monorepo** com duas partes:

| Pasta | O que é | Stack |
| --- | --- | --- |
| [`Rootine/`](./Rootine) | App mobile (frontend) | Expo / React Native + Expo Router |
| [`rootine-api/`](./rootine-api) | Backend HTTP (API) | NestJS + MikroORM + InversifyJS |

## 🏗️ Arquitetura

```
┌────────────────────┐        HTTP /fn/{name}        ┌─────────────────────┐
│   Rootine (app)    │  ───────────────────────────► │   rootine-api       │
│  Expo / RN         │   Authorization: Bearer JWT   │  NestJS + MikroORM  │
│  Zustand + Router  │ ◄───────────────────────────  │  InversifyJS        │
└─────────┬──────────┘        { data, error }        └──────────┬──────────┘
          │                                                      │
          │ Supabase Auth (login / sessão / JWT)                 │ conexão direta
          ▼                                                      ▼
                     ┌──────────────────────────────┐
                     │  Supabase (Postgres + Auth)   │
                     └──────────────────────────────┘
```

- O **app** autentica via Supabase Auth e chama a API enviando o JWT da sessão.
- A **API** valida o JWT (`JwtUserGuard`) e fala **direto com o Postgres** via MikroORM — substituindo o modelo de `service_role` + RLS das antigas Edge Functions Deno.
- O cliente [`lib/rootineApi.ts`](./Rootine/lib/rootineApi.ts) mantém a mesma assinatura de `supabase.functions.invoke(name, { body })`, então cada antiga Edge Function virou `POST {API_URL}/fn/{name}` sem reescrever os call sites.
- A URL da API vem de `EXPO_PUBLIC_API_URL` (padrão `http://localhost:3333`).

## ✨ Funcionalidades

O app é organizado em cinco abas principais:

- **Habitat** — árvore que cresce por nível e progresso de XP, refletindo a evolução sustentável do usuário.
- **Trilha** — missões diárias e especializadas, personalizadas por fatos reais e geradas a partir de padrões validados (`mission_patterns`).
- **Aventura** — flashcards e quizzes determinísticos que coletam sinais e ensinam, alimentando o perfil sem depender de IA.
- **Perfil** — XP, nível, impacto estimado (semana/mês/total), estatísticas, conquistas, histórico e fatos aprendidos (com origem, confiança e correção). Inclui o **Cientista**, um assistente educativo.
- **Biosfera** — feed de notícias/eventos ambientais reais (Niterói/RJ), comunidade, guildas e ranking.

## 🧱 Stack

| Camada | Tecnologia |
| --- | --- |
| App | [Expo](https://expo.dev) (~54) + [React Native](https://reactnative.dev) (0.81) + [Expo Router](https://docs.expo.dev/router/introduction) (file-based routing) |
| Estado | [Zustand](https://github.com/pmndrs/zustand) |
| API | [NestJS](https://nestjs.com) 11 + [MikroORM](https://mikro-orm.io) (PostgreSQL) + [InversifyJS](https://inversify.io) (agentes) |
| Linguagem | TypeScript (em ambos) |
| Banco / Auth | [Supabase](https://supabase.com) (Postgres gerenciado + Supabase Auth) |
| IA (opcional) | Groq (`llama-3.3-70b-versatile`) ou OpenAI, apenas no backend |

## 🚀 Como rodar

### Pré-requisitos

- Node.js LTS
- Projeto no [Supabase](https://supabase.com) (Postgres + Auth)

Suba o **backend primeiro**, depois o **app**.

### 1. Backend (`rootine-api`)

```bash
cd rootine-api
npm install
```

Crie um arquivo `.env` (veja [Variáveis de ambiente](#-variáveis-de-ambiente)) e inicie:

```bash
npm run start:dev      # NestJS em watch mode → http://localhost:3333
```

A API expõe `GET /health` para verificação rápida. Endpoints administrativos úteis no primeiro setup:

```bash
POST /admin/fix-schema   # ajusta/concilia o schema
POST /admin/seed-all     # popula catálogos (flashcards, quizzes, patterns, conquistas)
```

### 2. App (`Rootine`)

```bash
cd Rootine
npm install
```

Crie `.env` a partir do exemplo e aponte para a API:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
EXPO_PUBLIC_API_URL=http://localhost:3333
```

> ⚠️ Nunca coloque chaves de IA ou `service_role` em variáveis `EXPO_PUBLIC_*` — elas vão parar no bundle do cliente. Segredos sensíveis ficam só no `.env` do backend.

Inicie o app:

```bash
npm start
```

No output você encontra opções para abrir em [Development build](https://docs.expo.dev/develop/development-builds/introduction/), [Android](https://docs.expo.dev/workflow/android-studio-emulator/) (`npm run android`), [iOS](https://docs.expo.dev/workflow/ios-simulator/) (`npm run ios`), [Expo Go](https://expo.dev/go) ou web (`npm run web`).

## 🔑 Variáveis de ambiente

### `Rootine/.env`

| Variável | Descrição |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (para Auth) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima pública do Supabase |
| `EXPO_PUBLIC_API_URL` | Base do `rootine-api` (ex.: `http://localhost:3333`) |

### `rootine-api/.env`

| Variável | Descrição |
| --- | --- |
| `PORT` | Porta HTTP (padrão `3333`) |
| `DATABASE_URL` | Connection string do Postgres do Supabase |
| `DB_SSL` | `true` para Supabase (TLS) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Validação de JWT no `JwtUserGuard` |
| `SUPABASE_SERVICE_ROLE_KEY` | Operações administrativas (manter secreto) |
| `AUTH_DEV_BYPASS` | `true` só em DEV — aceita header `x-user-id` em vez de JWT real |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | IA opcional (padrão `gpt-4.1-mini`) |
| `GROQ_API_KEY` / `GROQ_MODEL` | IA opcional (padrão `llama-3.3-70b-versatile`) |

> 🔒 O `.env` do backend contém segredos reais (senha do banco, service role, chaves de IA). Garanta que ele esteja no `.gitignore` e **nunca** seja commitado. Se já foi exposto, rotacione as chaves.

## 📜 Scripts

### App (`Rootine`)

| Script | Descrição |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run android` / `ios` / `web` | Abre na plataforma |
| `npm run lint` | ESLint |
| `npm run build:apk` | Build de APK Android via EAS (perfil `preview`) |
| `npm run build:apk:local` | Build de APK local via EAS |

### API (`rootine-api`)

| Script | Descrição |
| --- | --- |
| `npm run start:dev` | NestJS em watch mode |
| `npm run start:prod` | Roda o build (`dist/`) |
| `npm run build` | Compila com `nest build` |
| `npm run lint` | ESLint com `--fix` |
| `npm run schema:diff` | Dump do diff de schema do MikroORM |
| `npm test` | Testes (`node --test`) |

## 🗺️ Principais endpoints da API

Rotas REST por domínio (todas protegidas por JWT, exceto health):

| Módulo | Rotas |
| --- | --- |
| App | `GET /`, `GET /health` |
| Onboarding | `GET /onboarding/questions`, `POST /onboarding/complete` |
| Missões (Trilha) | `POST /missions/generate`, `GET /missions`, `PATCH /missions/:id`, `POST /missions/:id/complete`, `POST /missions/:id/refuse` |
| Conteúdo (Aventura) | `POST /content/flashcards/batch`, `/content/flashcards/answer`, `/content/flashcards/batch/:id/complete`, `/content/quizzes/generate`, `/content/quizzes/answer` |
| Habitat | `GET /habitat/:userId`, `POST /habitat/leaves` |
| Perfil | `POST /profile/scientist/chat`, `POST /profile/sync` |
| Progresso | `GET /progress/:userId` |
| Biosfera / Comunidade | `GET /biosphere/feed`, `POST /guilds`, `POST /guilds/:id/members`, `GET /guilds/:id/ranking`, `GET /leaderboard`, `GET /leaderboard/impact` |
| Notícias | `GET /news/environment`, `/news/niteroi`, `/news/events` |
| Orquestrador | `POST /orchestrator/intent`, `POST /orchestrator/cadastro` |
| Admin | `POST /admin/fix-schema`, `POST /admin/seed-all` |
| Compat (Edge Functions) | `POST /fn/{name}` — espelha as antigas functions: `generate-missions`, `edit-mission`, `sync-user-brain`, `generate-batch`, `generate-quiz`, `habitat-leaves`, `profile-scientist-chat`, `biosphere-feed`, `complete-onboarding`, `answer-adventure-card`, `answer-adventure-quiz`, `complete-adventure-batch` |

## 🗂️ Estrutura do monorepo

```
ROOtine/
├── Rootine/                 # App Expo / React Native
│   ├── app/                 # Telas e rotas (Expo Router)
│   │   ├── (tabs)/          # Abas: Habitat, Trilha, Aventura, Perfil, Biosfera
│   │   └── diagnostic/      # Onboarding
│   ├── components/          # UI (TreeDisplay, MissionCard, ...)
│   ├── lib/
│   │   ├── domain/          # Domínio puro + validadores
│   │   ├── rootineApi.ts    # Adapter HTTP para a rootine-api
│   │   └── supabase.ts      # Cliente Supabase (Auth)
│   ├── store/               # Estado global (Zustand)
│   └── estrategia-rootine.md# Fonte de verdade do produto/roadmap
│
└── rootine-api/             # Backend NestJS
    └── src/
        ├── agents/          # Agentes de IA (orchestrator, scientist, guardian,
        │                    #   habitat, adventurer) + providers Groq/OpenAI
        ├── domain/          # Domínio compartilhado: xp, missões, impacto,
        │                    #   facts, validação (espelha lib/domain do app)
        ├── entities/        # Entidades MikroORM (Postgres)
        ├── missions/ content/ onboarding/ habitat/ profile/ progress/
        ├── biosphere/ guilds/ leaderboard/ news/ orchestrator/
        ├── compat/          # Controller /fn/* (compat com Edge Functions)
        ├── common/          # Auth (JWT guard), seeds, logging, filtros
        └── main.ts          # Bootstrap (CORS, ValidationPipe, porta 3333)
```

## 🤖 Papel da IA

O fluxo principal **não depende de IA**. Para ativá-la, configure `OPENAI_API_KEY` ou `GROQ_API_KEY` no `.env` do **backend** (`rootine-api`). Os agentes em [`rootine-api/src/agents`](./rootine-api/src/agents) usam esses providers para:

- **AI Mission Composer** — propor candidatas de missão a partir de blueprints (`mission_patterns`), sempre validadas por código antes de salvar.
- **Cientista** — responder dúvidas educativas sobre sustentabilidade e progresso.
- **Habitat** — gerar mensagens narrativas da árvore.

Com IA inativa, indisponível ou reprovada pelos validadores, o sistema usa fallback determinístico/contextual e registra `ai_used: false` com o motivo do fallback. A IA **nunca** define fatos do usuário, hard blocks, categoria canônica, impacto, XP, custo ou dificuldade.

## 🔒 Princípios de segurança e dados

- A API valida JWT do Supabase no `JwtUserGuard` e compara o `userId` requisitado com o usuário autenticado.
- Logs não expõem tokens, e-mails, JWT, prompts completos ou dados médicos detalhados — preferem IDs, contagens, categorias e motivos resumidos.
- Fatos e perfil são derivados de eventos imutáveis (`user_profile_events`); correções viram novos eventos, sem editar histórico bruto.
- Segredos (service role, chaves de IA, senha do banco) ficam só no backend, nunca em variáveis `EXPO_PUBLIC_*`.

## 📖 Documentação

A fonte de verdade do produto e do roadmap de implementação está em [`Rootine/estrategia-rootine.md`](./Rootine/estrategia-rootine.md) — inclui curva de XP, modelo de impacto, regras de personalização e os critérios de aceite de cada etapa.
