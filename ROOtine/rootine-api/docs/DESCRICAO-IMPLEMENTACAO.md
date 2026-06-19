# Descrição da Implementação — ROOtine

## 1. O que foi implementado

O **ROOtine** é um aplicativo de **gamificação de sustentabilidade**: o usuário recebe
**missões ambientais personalizadas**, evolui uma **árvore de Habitat** conforme acumula XP,
aprende por **flashcards e quizzes**, acompanha seu **impacto auditável** e participa de uma
camada social (**Biosfera**, guildas e ranking).

O projeto está dividido em duas aplicações:

- **`Rootine/`** — Aplicativo mobile/web (cliente).
- **`rootine-api/`** — Backend (servidor), que centraliza autenticação, regras de negócio e
  acesso a dados. Esta camada é a refatoração das antigas *Edge Functions* (Deno) para uma
  arquitetura modular em NestJS.

### 1.1 Funcionalidades entregues

| Módulo | Responsabilidade |
|---|---|
| **Onboarding / Users / Profile** | Cadastro, perfil do usuário e os "fatos" reais (tempo, dinheiro, acesso, saúde, preferências) que personalizam as missões. |
| **Missions** | Geração e edição de missões diárias/especializadas, com ranking **determinístico** a partir de `mission_patterns`; a IA apenas reescreve o texto final já validado (nunca é fonte de verdade). |
| **Content (Flashcards / Quiz)** | Seleção balanceada de flashcards e quizzes por metadados e histórico do usuário. |
| **Habitat** | Crescimento progressivo da árvore conforme o XP e mensagens contextuais (folhas). |
| **Progress / XP / Impact** | Contabilização de XP e de impacto ambiental em *ledgers* auditáveis e versionados. |
| **Biosphere / Guilds / Leaderboard** | Camada social: feed/fórum, guildas e ranking. |
| **News** | Pipeline de notícias ambientais (coleta → filtro → cache) a partir de fontes externas. |
| **Agents / Orchestrator** | Agentes de IA especialistas (Habitat, Guardian, Adventurer, Scientist) coordenados por um orquestrador. |
| **Common** | Autenticação (JWT Supabase), guards, filtros de exceção, decorators e *seeders*. |
| **Compat / Admin** | Compatibilidade com contratos antigos das Edge Functions e rotas administrativas. |

### 1.2 Princípio de projeto central

O fluxo principal **funciona sem IA paga**: a IA melhora texto, conversa e variações, mas o
perfil do usuário e a validade das missões são determinados por **lógica determinística e
validadores compartilhados**. Quando a IA está indisponível ou bloqueada por validação, o
sistema usa um *fallback* determinístico/contextual.

---

## 2. Tecnologias, frameworks e ferramentas

### 2.1 Backend — `rootine-api`

| Categoria | Tecnologia |
|---|---|
| Linguagem | **TypeScript** |
| Framework de aplicação | **NestJS 11** (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) |
| Servidor HTTP | **Express** (via `@nestjs/platform-express`) |
| ORM / Banco | **MikroORM 6** + **PostgreSQL** (`@mikro-orm/postgresql`, `@mikro-orm/nestjs`, `@mikro-orm/migrations`) |
| IoC adicional (camada de IA) | **InversifyJS** |
| Validação | **class-validator** + **class-transformer** (via `ValidationPipe` global) |
| Autenticação | **Supabase Auth** (validação de JWT em `@supabase/supabase-js`) |
| Configuração | **@nestjs/config** + variáveis de ambiente |
| Provedores de LLM | **OpenAI** e **Groq** (cascata por prioridade, atrás de uma interface `LlmProvider`) |
| Reatividade / utilidades | **RxJS**, **reflect-metadata** |
| Ferramentas | **@nestjs/cli**, **ESLint**, **ts-node**, **MikroORM CLI** |

### 2.2 Frontend — `Rootine`

| Categoria | Tecnologia |
|---|---|
| Linguagem | **TypeScript** |
| Framework | **React Native 0.81** + **React 19** |
| Plataforma / build | **Expo 54** + **Expo Router** (roteamento por arquivos) + **EAS Build** |
| Estado | **Zustand** (`useEcoStore`, `useFlashcardStore`) |
| Backend-as-a-Service | **Supabase** (`@supabase/supabase-js`) |
| UI / utilidades | React Navigation, `react-native-reanimated`, `react-native-svg`, `expo-haptics`, `dayjs` |
| Ferramentas | **ESLint** (`eslint-config-expo`), **Supabase CLI** |

### 2.3 Infraestrutura compartilhada

- **Supabase / PostgreSQL** — banco de dados, autenticação e (no histórico) Edge Functions.
- O cliente **nunca** acessa o banco diretamente: toda regra e segurança ficam no servidor.

---

## 3. Observação — NestJS como framework orientado a objetos

> **Por que o NestJS é considerado um framework orientado a objetos?**
>
> O **NestJS** é um framework **orientado a objetos** para Node.js: a aplicação é construída a
> partir de **classes** (`@Controller`, `@Injectable`, `@Module`, `@Entity`), e não de funções
> soltas como nas Edge Functions originais em Deno. Cada conceito do framework é uma classe
> decorada, o que torna o paradigma OO explícito no código:
>
> - **Encapsulamento** — cada *Service* (ex.: `MissionsService`) encapsula a regra de negócio
>   de um domínio; o *Controller* só expõe a entrada HTTP e delega para o serviço.
> - **Abstração e Inversão de Dependência (DIP)** — o NestJS possui um contêiner de **Injeção
>   de Dependência (DI)** nativo: as classes declaram suas dependências no construtor e o
>   framework as resolve. No ROOtine isso é reforçado por uma abstração `LlmProvider`, da qual
>   o `AgentRunner` depende em vez dos provedores concretos (OpenAI/Groq).
> - **Polimorfismo e extensibilidade (OCP/LSP)** — adicionar um novo provedor de LLM é apenas
>   registrar uma nova classe que implementa a interface; nenhuma classe de alto nível precisa
>   mudar.
> - **Modularização** — a aplicação é organizada em **módulos** coesos (`UsersModule`,
>   `MissionsModule`, `AgentsModule`, etc.), cada um agrupando seus controllers, services e
>   entities. Isso espelha a ideia de objetos colaborando por responsabilidade única.
>
> Em resumo, enquanto a versão anterior (Deno/Edge Functions) era **funcional e procedural**,
> a migração para **NestJS** trouxe um desenho **orientado a objetos** com classes, herança de
> comportamento via interfaces, DI e separação em camadas (`Controller → Service → Entity`).
>
> *Detalhe da implementação:* além do DI nativo do NestJS, a **camada de agentes de IA** usa um
> contêiner **InversifyJS** próprio (`buildAgentsContainer`), conectado ao Nest por *factories*
> — outra aplicação direta de IoC orientado a objetos.

---


