# Arquitetura do ROOtine — Padrões e Estilos Arquiteturais

Documento que descreve os padrões/estilos verificados na implementação **atual** do projeto, a
justificativa de cada um e a comparação com a arquitetura **idealizada (antiga)**.

> A versão antiga era um *diagrama conceitual*. A versão nova reflete o código real:
> **frontend Expo/React Native** (`Rootine/`) + **backend NestJS modular** (`rootine-api/`) + **Supabase**.

---

## 1. Cliente/Servidor *(mantido — base do sistema)*

- **Onde:** App Expo (cliente) ↔ API NestJS (servidor), via HTTP/REST. O cliente nunca acessa o banco
  diretamente; toda regra e segurança ficam no servidor.
- **Justificativa:** centraliza autenticação, regras de negócio e dados; permite múltiplos clientes
  (web/mobile) consumindo a mesma API.

## 2. Arquitetura em Camadas (Layered) *(NOVO — explícito no código)*

- **Onde:** dois níveis de camadas.
  - **Macro:** Apresentação (telas) → Lógica de Negócio (API) → Dados (Supabase/Postgres).
  - **Dentro da API (NestJS):** `Controller` (entrada) → `Service` (regra) → `Entity/Repository` (dados).
- **Justificativa:** separação de responsabilidades (*separation of concerns*); facilita testes e
  manutenção, pois cada camada só conhece a imediatamente inferior.

## 3. MVC (Model-View-Controller) *(NOVO — emergiu da implementação)*

- **Onde:** **View** = telas React Native em `Rootine/app/(tabs)`; **Controller** = `*.controller.ts`
  do NestJS; **Model** = `*.service.ts` + `entities/` + stores (`useEcoStore`, `useFlashcardStore`).
- **Justificativa:** organiza a interação usuário→ação→dados→atualização da tela de forma previsível,
  desacoplando a apresentação da lógica.

## 4. Microsserviços / Módulos Independentes *(NOVO — modularização da API)*

- **Onde:** a API é dividida em módulos coesos e independentes: `users`, `missions`, `guilds`,
  `news`, `leaderboard`, `habitat`, `biosphere`, `content`, e os **agentes de IA**
  (`habitat`, `guardian`, `adventurer`, `scientist`, `orchestrator`).
- **Justificativa:** cada módulo tem uma única responsabilidade de negócio e pode evoluir/escalar de
  forma isolada. *(Hoje rodam como monólito modular — pronto para virar microsserviços plenos.)*

## 5. Publisher/Subscriber *(mantido — Social/Fórum e Notificações)*

- **Onde:** publicação de conteúdo (usuários/guildas) → broker → assinantes (membros/devs).
- **Justificativa:** comunicação assíncrona e desacoplada; novos consumidores de eventos sociais podem
  ser adicionados sem alterar quem publica.

## 6. Tubos e Filtros (Pipes & Filters) *(mantido — Pipeline de Notícias)*

- **Onde:** `news` — Fontes Web → Filtro 1 (Coleta Bruta) → Filtro 2 (Filtro Ambiental) → Cache.
- **Justificativa:** processamento de fluxo em estágios independentes e sem estado compartilhado;
  fácil inserir/remover filtros no encadeamento.

## 7. Arquitetura Orientada a Eventos (Event-Driven) *(mantido — Agentes de IA)*

- **Onde:** ações do usuário viram **eventos** → `orchestrator` lê/prioriza → **delega** aos agentes
  especialistas (`agent-runner`, `specialist`, `container`).
- **Justificativa:** os agentes reagem a mudanças de estado de forma assíncrona, sem acoplamento
  síncrono com o controlador principal — ideal para o comportamento reativo da IA.

---

## Comparação: Antigo × Novo

| Padrão | Antigo (idealizado) | Novo (implementado) |
|---|---|---|
| Cliente/Servidor | ✅ Núcleo | ✅ Mantido (Expo ↔ NestJS) |
| Publisher/Subscriber | ✅ Fórum | ✅ Mantido |
| Tubos e Filtros | ✅ Notícias | ✅ Mantido |
| Orientada a Eventos | ✅ Agentes IA | ✅ Mantido |
| **Camadas (Layered)** | ⚠️ Implícito | ✅ **Explícito** (macro + NestJS) |
| **MVC** | ❌ | ✅ **Adotado** (View/Controller/Model) |
| **Microsserviços/Módulos** | ❌ (servidor único) | ✅ **Adotado** (módulos coesos) |
| SOA | ❌ | ❌ (não se aplica — não há ESB/legado corporativo) |

**Resumo da evolução:** o projeto saiu de um *blueprint* de 4 estilos para uma implementação real que,
mantendo os 4, **acrescentou Camadas, MVC e Modularização (Microsserviços)** — consequência natural de
adotar o NestJS (modular) no backend e o Expo Router (telas/stores) no frontend. **SOA foi descartado**
por ser voltado a integração de sistemas legados corporativos via ESB, contexto inexistente aqui.
