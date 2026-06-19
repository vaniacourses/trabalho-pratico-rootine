    # 🌱 Rootine

[![Open in Visual Studio Code](https://classroom.github.com/assets/open-in-vscode-2e0aaae1b6195c2367325f4f02e2d04e9abb55f0b24a779b69b11b9e10269abc.svg)](https://classroom.github.com/online_ide?assignment_repo_id=24013906&assignment_repo_type=AssignmentRepo)

## 📄 Entregas

- Documento entrega 1: [link para docs editável](https://docs.google.com/document/d/10x120NHypRnIW5Y3ZrsmBKEnss1yjeJmQPm18CBFU0E/edit?usp=sharing)
- Documento entrega 2: [link para docs editável](https://docs.google.com/document/d/1JkzBTUMDGWANjnApvreV2cIXuI78wKhP9aqwoCkCXgE/edit?usp=sharing)

Aplicativo mobile de sustentabilidade que transforma hábitos ambientais em uma jornada gamificada. O Rootine gera **missões hiperpersonalizadas** a partir de fatos reais do usuário (tempo, dinheiro, acesso, saúde, segurança, preferências e experiência), mede o **impacto ambiental** de cada ação concluída e faz um **Habitat** — uma árvore — crescer conforme o usuário evolui.

A premissa central do projeto: **o fluxo principal funciona sem IA paga.** A IA melhora texto, conversa e variações, mas nunca é fonte de verdade para o perfil, impacto, XP ou validação de missões. Toda a personalização canônica vem do banco, de `mission_patterns` e de validadores determinísticos.

## ✨ Funcionalidades

O app é organizado em cinco abas principais:

- **Habitat** — árvore que cresce por nível e progresso de XP, refletindo a evolução sustentável do usuário.
- **Trilha** — missões diárias e especializadas, personalizadas por fatos reais e geradas a partir de padrões validados (`mission_patterns`).
- **Aventura** — flashcards e quizzes determinísticos que coletam sinais e ensinam, alimentando o perfil sem depender de IA.
- **Perfil** — XP, nível, impacto estimado (semana/mês/total), estatísticas, conquistas, histórico e fatos aprendidos (com origem, confiança e correção). Inclui o **Cientista**, um assistente educativo.
- **Biosfera** — feed de notícias/eventos ambientais (RSS) e comunidade.

## 🧱 Stack

| Camada | Tecnologia |
| --- | --- |
| App | [Expo](https://expo.dev) (~54) + [React Native](https://reactnative.dev) (0.81) + [Expo Router](https://docs.expo.dev/router/introduction) (file-based routing) |
| Linguagem | TypeScript |
| Estado | [Zustand](https://github.com/pmndrs/zustand) |
| Backend | [Supabase](https://supabase.com) (Postgres + Auth + RLS + Edge Functions em Deno) |
| IA (opcional) | Groq (`llama-3.3-70b-versatile`) ou OpenAI, apenas nas Edge Functions |

## 🚀 Como rodar

### Pré-requisitos

- Node.js LTS
- Conta no [Supabase](https://supabase.com)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para Edge Functions e migrations)

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e preencha com as credenciais do seu projeto Supabase:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
```

> ⚠️ Nunca coloque chaves de IA ou service role em variáveis `EXPO_PUBLIC_*`. Elas vão parar no bundle do cliente.

### 3. Preparar o banco

Aplique o schema e os scripts executáveis no Supabase:

- `ddl.sql` — schema de tabelas (fonte de verdade do schema).
- `add.sql` — RLS, policies, funções, triggers, seeds e backfills.
- `supabase/migrations/` — migrations versionadas.

### 4. Iniciar o app

```bash
npm start
```

No output você encontra opções para abrir o app em:

- [Development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Emulador Android](https://docs.expo.dev/workflow/android-studio-emulator/) — `npm run android`
- [Simulador iOS](https://docs.expo.dev/workflow/ios-simulator/) — `npm run ios`
- [Expo Go](https://expo.dev/go)
- Web — `npm run web`

## 📜 Scripts

| Script | Descrição |
| --- | --- |
| `npm start` | Inicia o Expo dev server |
| `npm run android` | Abre no Android |
| `npm run ios` | Abre no iOS |
| `npm run web` | Abre na web |
| `npm run lint` | Roda o ESLint (validação mínima antes de cada entrega) |
| `npm run build:apk` | Build de APK Android via EAS (perfil `preview`) |
| `npm run build:apk:local` | Build de APK local via EAS |

## 🗂️ Estrutura do projeto

```
Rootine/
├── app/                  # Telas e rotas (Expo Router, file-based)
│   ├── (tabs)/           # Abas: index (Habitat), adventure (Trilha),
│   │                     #       flashcards (Aventura), profile, biosphere
│   ├── diagnostic/       # Onboarding
│   └── _layout.tsx       # Layout raiz + fluxo de auth
├── components/           # Componentes de UI (TreeDisplay, MissionCard, ...)
├── constants/            # Tema e dados estáticos
├── hooks/                # Hooks compartilhados
├── lib/
│   ├── domain/           # Domínio puro: categorias, XP, missões,
│   │                     # impacto, fatos e VALIDADORES
│   ├── rootineApi.ts     # Cliente da API
│   └── supabase.ts       # Cliente Supabase
├── store/                # Estado global (Zustand): useEcoStore, useFlashcardStore
├── supabase/
│   ├── functions/        # Edge Functions (Deno)
│   └── migrations/       # Migrations SQL
├── ddl.sql               # Schema de tabelas
├── add.sql               # RLS, policies, seeds, backfills
└── estrategia-rootine.md # Documento de estratégia / fonte de verdade
```

### Edge Functions

| Function | Papel |
| --- | --- |
| `generate-missions` | Gera missões a partir de `mission_patterns` + ranking determinístico (IA opcional só reescreve texto validado) |
| `edit-mission` | Edição segura de missões a partir de feedback classificado |
| `generate-batch` | Seleciona lotes balanceados de flashcards |
| `generate-quiz` | Seleciona quizzes determinísticos do catálogo |
| `sync-user-brain` | Agregador determinístico que atualiza fatos e caches do perfil |
| `habitat-leaves` | Mensagens narrativas da árvore (IA + cache) |
| `profile-scientist-chat` | Assistente "Cientista" (IA + fallback) |
| `biosphere-feed` | Busca RSS externo de notícias/eventos (sem dados pessoais) |
| `complete-onboarding` | Processa onboarding e deriva fatos iniciais |
| `answer-adventure-card`, `answer-adventure-quiz`, `complete-adventure-batch` | Respostas da Aventura |

## 🤖 Papel da IA

O fluxo principal **não depende de IA**. Para ativar IA nas Edge Functions, configure secrets no Supabase (não no `.env` local):

```bash
npx supabase secrets set GROQ_API_KEY=...
npx supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
```

Alternativa OpenAI:

```bash
npx supabase secrets set OPEN_AI_KEY=...
npx supabase secrets set OPENAI_MODEL=...
```

Com IA inativa, indisponível ou reprovada pelos validadores, o sistema usa fallback determinístico/contextual e registra `ai_used: false` com o motivo do fallback.

## 🔒 Princípios de segurança e dados

- Edge Functions que recebem `userId` validam JWT e comparam com o usuário autenticado.
- **RLS** garante que cada usuário só lê/escreve seus próprios dados; catálogos são lidos apenas quando `active = true`.
- Logs não expõem tokens, e-mails, JWT, prompts completos ou dados médicos detalhados — preferem IDs, contagens, categorias e motivos resumidos.
- Fatos e perfil são derivados de eventos imutáveis (`user_profile_events`); correções viram novos eventos, sem editar histórico bruto.

## 📖 Documentação

A fonte de verdade do produto e do roadmap de implementação está em [`estrategia-rootine.md`](./estrategia-rootine.md) — inclui curva de XP, modelo de impacto, regras de personalização e os critérios de aceite de cada etapa.
