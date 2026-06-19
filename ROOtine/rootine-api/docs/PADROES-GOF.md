# Padrões GOF no `rootine-api`

Análise dos padrões de projeto (Gang of Four) presentes no backend
**NestJS + MikroORM + InversifyJS** do Rootine. O foco está na camada de
**agentes de IA** (`src/agents/`) e na **geração de missões** (`src/missions/`),
que concentram as decisões de design mais interessantes.

> **Nota de método.** O enunciado pede para refatorar *caso* os padrões não
> estejam bem aplicados — e para **não forçar** padrões onde eles são
> desnecessários. Após ler a base, a conclusão honesta é que os padrões abaixo
> **já estão bem implementados** (o próprio código documenta OCP/DIP/LSP nos
> comentários). Portanto, em vez de reescrever código que já está correto, cada
> seção compara o **desenho atual** com a **alternativa ingênua** que ele evita —
> que é a forma mais útil de justificar a escolha. Na última seção listo os
> padrões que **deliberadamente não foram aplicados**, para mostrar onde forçá-los
> seria overengineering.

---

## Visão geral

| # | Padrão | Categoria | Onde está |
|---|--------|-----------|-----------|
| 1 | **Strategy** | Comportamental | `LlmProvider` + `OpenAiProvider` / `GroqProvider` |
| 2 | **Template Method** | Comportamental | `OpenAiCompatibleProvider` |
| 3 | **Chain of Responsibility** | Comportamental | `AgentRunner.runAgentText` (cascata de provedores) |
| 4 | **Facade** | Estrutural | `OrchestratorService` / `OrchestratorAgent` |

Um detalhe elegante da arquitetura: os três primeiros padrões operam sobre a
**mesma abstração** (`LlmProvider`), mas resolvem problemas diferentes —
*qual* implementação usar (Strategy), *como* compartilhar o transporte comum
(Template Method) e *em que ordem* tentar quando uma falha (Chain of
Responsibility).

---

## 1. Strategy — provedores de LLM intercambiáveis

**Arquivos:** [src/agents/llm/llm-provider.ts](src/agents/llm/llm-provider.ts),
[src/agents/llm/openai.provider.ts](src/agents/llm/openai.provider.ts),
[src/agents/llm/groq.provider.ts](src/agents/llm/groq.provider.ts)

### O padrão

> Strategy define uma família de algoritmos, encapsula cada um e os torna
> intercambiáveis, permitindo que o algoritmo varie independentemente do cliente
> que o utiliza. 

Aqui a "família de algoritmos" são os **backends de IA**. Cada provedor (OpenAI,
Groq, e amanhã Anthropic/Gemini) é uma estratégia concreta por trás de um único
contrato:

```ts
// src/agents/llm/llm-provider.ts
export interface LlmProvider {
  readonly name: string;                       // "openai", "groq"
  isConfigured(): boolean;                      // há credenciais para tentar?
  complete(request: LlmCompletionRequest): Promise<string>;
}
```

```ts
// src/agents/llm/openai.provider.ts
@injectable()
export class OpenAiProvider extends OpenAiCompatibleProvider {
  readonly name = "openai";
  protected get apiKey()  { return env.openAiKey; }
  protected get model()   { return env.openAiModel; }
  protected get baseUrl() { return "https://api.openai.com/v1/chat/completions"; }
}
```

O cliente (`AgentRunner`) recebe as estratégias por injeção e nunca menciona uma
classe concreta:

```ts
// src/agents/agent-runner.service.ts
@injectable()
export class AgentRunner {
  constructor(
    @multiInject(TYPES.LlmProvider) private readonly providers: LlmProvider[],
  ) {}
  // ...usa provider.isConfigured() / provider.complete(...)
}
```

### Problema que resolve

Sem Strategy, o `AgentRunner` precisaria conhecer cada SDK e ramificar por
provedor — acoplamento direto e violação do Open/Closed Principle:

```ts
// ❌ Alternativa ingênua (NÃO está no código — é o que o padrão evita)
async runAgentText(role, input) {
  if (env.openAiKey) {
    return callOpenAi(env.openAiModel, input);     // detalhes do SDK OpenAI
  } else if (env.groqKey) {
    return callGroq(env.groqModel, input);         // detalhes do SDK Groq
  }
  // adicionar Anthropic => editar este método, re-testar tudo...
}
```

Com o desenho atual, **adicionar um provedor = criar uma classe e registrá-la no
contêiner**, sem tocar no `AgentRunner`. O comentário no próprio
`llm-provider.ts` já documenta isso como DIP + OCP + LSP.

### Avaliação

✅ **Bem aplicado.** A abstração é mínima (3 membros), há ≥2 estratégias reais e o
cliente é genuinamente independente delas. Não há refatoração a fazer.

---

## 2. Template Method — esqueleto do transporte HTTP compartilhado

**Arquivo:** [src/agents/llm/openai-compatible.provider.ts](src/agents/llm/openai-compatible.provider.ts)

### O padrão

> Template Method define o esqueleto de um algoritmo na superclasse e deixa as
> subclasses sobrescreverem etapas específicas sem alterar a estrutura geral.

OpenAI e Groq falam o **mesmo protocolo** (`chat/completions`). A classe base
implementa todo o algoritmo de requisição **uma vez** e expõe pontos de variação:

```ts
// src/agents/llm/openai-compatible.provider.ts (resumido)
@injectable()
export abstract class OpenAiCompatibleProvider implements LlmProvider {
  abstract readonly name: string;
  protected abstract get apiKey(): string | undefined;  // passo variável
  protected abstract get model(): string;               // passo variável
  protected abstract get baseUrl(): string;             // passo variável

  private async request(apiKey, systemPrompt, userPrompt, useJsonMode) {
    const body = { model: this.model, messages: [/* system + user */] };
    if (useJsonMode) body.response_format = { type: "json_object" };

    const response = await fetch(this.baseUrl, { /* headers + body */ });

    if (!response.ok) {
      // hook de variação protegida:
      if (useJsonMode && this.shouldRetryWithoutJsonMode(response.status, errorText)) {
        return this.request(apiKey, systemPrompt, userPrompt, false);
      }
      throw new Error(`Erro ${this.name}: ${response.status} - ${errorText}`);
    }
    return String(data.choices?.[0]?.message?.content ?? "");
  }

  /** Hook: por padrão NÃO degrada o JSON mode; subclasses podem sobrescrever. */
  protected shouldRetryWithoutJsonMode(_status: number, _errorText: string): boolean {
    return false;
  }
}
```

A subclasse Groq sobrescreve **apenas o passo que difere** — o modelo dela às
vezes rejeita `response_format`, então ela degrada para texto livre:

```ts
// src/agents/llm/groq.provider.ts
export class GroqProvider extends OpenAiCompatibleProvider {
  readonly name = "groq";
  // ...getters de apiKey/model/baseUrl...

  protected override shouldRetryWithoutJsonMode(status: number, errorText: string): boolean {
    const lower = errorText.toLowerCase();
    return status === 400 && (lower.includes("response_format") || lower.includes("json_object"));
  }
}
```

### Problema que resolve

Sem Template Method, `OpenAiProvider` e `GroqProvider` duplicariam todo o
`fetch`, montagem do body, tratamento de erro e parsing — **dezenas de linhas
idênticas** em cada classe. Qualquer correção (novo header, timeout, retry)
precisaria ser replicada em N lugares. O `OpenAiProvider` é a prova do valor: ele
tem **zero** lógica de transporte — só os 3 getters que variam.

### Avaliação

✅ **Bem aplicado.** O esqueleto está na base, os passos variáveis são abstratos e
há um *hook* (`shouldRetryWithoutJsonMode`) com default seguro sobrescrito por
exatamente uma subclasse. É o caso de uso canônico do padrão.

---

## 3. Chain of Responsibility — cascata de provedores com fallback

**Arquivo:** [src/agents/agent-runner.service.ts](src/agents/agent-runner.service.ts#L123-L149)

### O padrão

> Chain of Responsibility passa uma solicitação por uma cadeia de receptores;
> cada um decide se a processa ou a repassa adiante.

A solicitação é "completar este prompt". A cadeia é a lista **ordenada** de
provedores configurados (OpenAI → Groq). Cada elo tenta atender; se falhar,
o próximo assume:

```ts
// src/agents/agent-runner.service.ts
async runAgentText(role: AgentRole, input: string): Promise<string> {
  const config = AGENTS[role];
  const configured = this.providers.filter((p) => p.isConfigured());

  let lastError: unknown = null;
  for (const provider of configured) {
    try {
      return await provider.complete({ role, systemPrompt: config.instructions, userPrompt: input, jsonMode: true });
    } catch (error) {
      console.warn(`[AGENTS] ${provider.name} failed:`, error);
      lastError = error;   // repassa para o próximo elo da cadeia
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Configure OPENAI_API_KEY ou GROQ_API_KEY no ambiente da API.");
}
```

A ordem da cadeia é definida no contêiner (a ordem dos `bind` vira a ordem do
`@multiInject`):

```ts
// src/agents/container.ts
container.bind(TYPES.LlmProvider).to(OpenAiProvider).inSingletonScope(); // 1º
container.bind(TYPES.LlmProvider).to(GroqProvider).inSingletonScope();   // 2º (fallback)
```

### Problema que resolve

APIs de LLM caem, estouram cota (HTTP 429) ou ficam sem chave. A cadeia dá
**resiliência sem `if`s aninhados**: o sistema tenta o provedor preferencial e
cai para o seguinte de forma transparente. Adicionar um terceiro fallback é só
mais um `bind` — a lógica do laço não muda (OCP de novo).

### Avaliação

✅ **Bem aplicado**, embora seja uma variante "todos têm a chance até um suceder"
(em vez de "exatamente um processa"). É o uso correto para *fallback*/resiliência.

> ⚠️ **Onde eu NÃO aplicaria o padrão.** No mesmo arquivo, `buildFallbackResult`
> classifica o erro com uma cadeia de `if` sobre strings (`insufficient_quota`,
> `OPENAI_API_KEY`, …). É tentador transformar isso em outra Chain of
> Responsibility ou num Strategy de classificação, mas são **3 casos fixos** e
> raramente mudam — um `if/else` linear é mais legível aqui. Formalizar seria
> **overengineering**. Deixei como está de propósito.

---

## 4. Facade — fachada de negócio do orquestrador

**Arquivos:** [src/orchestrator/orchestrator.service.ts](src/orchestrator/orchestrator.service.ts),
[src/agents/orchestrator/orchestrator.agent.ts](src/agents/orchestrator/orchestrator.agent.ts)

### O padrão

> Facade fornece uma interface unificada e simplificada para um conjunto de
> interfaces de um subsistema complexo.

O `OrchestratorService` é o "botão único" que esconde três subsistemas distintos
(usuários, missões, guildas) e o agente classificador de IA atrás de uma API de
intenção de negócio:

```ts
// src/orchestrator/orchestrator.service.ts
@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(AGENT_PROVIDERS.Orchestrator) private readonly orchestrator: OrchestratorAgent,
    private readonly users: UsersService,
    private readonly missions: MissionsService,
    private readonly guilds: GuildsService,
  ) {}

  async processarIntencaoUsuario(userId: string, input: string) {
    const decision = await this.orchestrator.processarIntencaoUsuario(input, { userId });
    return { userId, ...decision };
  }
  criarCadastro(userId, nome)        { return this.users.ensureProfile(userId, nome); }
  concluirMissao(userId, missionId)  { return this.missions.complete(userId, missionId); }
  gerirGuilda(name)                  { return this.guilds.create(name); }
}
```

### Bônus — registro substituindo `switch` (no `OrchestratorAgent`)

Dentro da camada de IA, o `OrchestratorAgent` roteia para o especialista certo.
Em vez de um `switch` sobre classes concretas, ele usa um **registro chave →
especialista** (polimorfismo / Protected Variations):

```ts
// src/agents/orchestrator/orchestrator.agent.ts
private readonly specialists: ReadonlyMap<SpecialistKey, SpecialistAgent>;

constructor(/* ...injeção dos 4 especialistas... */) {
  const roster = [this.guardian, this.adventurer, this.scientist, this.habitat];
  this.specialists = new Map(roster.map((agent) => [agent.key, agent]));
}

delegarParaEspecialista(specialist: SpecialistKey): SpecialistAgent {
  return this.specialists.get(specialist) ?? this.scientist;  // default seguro
}
```

**Antes (alternativa que o código evita):**

```ts
// ❌ switch acoplado às classes concretas — cresce a cada especialista
switch (specialist) {
  case "guardian":   return this.guardian;
  case "adventurer": return this.adventurer;
  case "scientist":  return this.scientist;
  case "habitat":    return this.habitat;
  default:           return this.scientist;
}
```

**Depois (atual):** registrar um novo especialista é adicioná-lo ao `roster`; o
roteamento não muda. O contrato comum `SpecialistAgent` (com `readonly key`)
é o que torna isso possível.

### Problema que resolve

A **Facade** evita que os controllers HTTP conheçam a coreografia entre IA +
domínio; eles chamam um método de intenção e pronto. O **registro** elimina o
`switch` que, classicamente, é o ponto que mais cresce e mais quebra quando o
sistema ganha novos tipos.

### Avaliação

✅ **Bem aplicado.** A fachada tem responsabilidade clara (coordenar, não conter
regra de negócio) e o registro é uma simplificação real sobre o condicional.

---

## Padrões deliberadamente NÃO aplicados (evitando overengineering)

Tão importante quanto usar um padrão é **não usá-lo** quando ele não paga o custo:

- **Singleton "clássico".** Os agentes são singletons, mas via
  `inSingletonScope()` do contêiner Inversify — não há `getInstance()` com estado
  global mutável. Implementar um Singleton manual seria reinventar o que o
  contêiner já garante.
- **Abstract Factory.** Existe um único "tipo" de provedor (compatível com
  OpenAI). Uma fábrica de *famílias* de objetos só se justificaria se houvesse
  variações ortogonais (ex.: provedor + tokenizer + cache por vendor). Hoje seria
  estrutura sem ganho.
- **Decorator / Proxy** sobre `LlmProvider.** Tentador para logging/retry/cache,
  mas o logging já vive no `AgentRunner` e o retry de JSON mode já está no
  Template Method. Envolver cada provedor num decorator agora adicionaria camadas
  sem demanda real.
- **Strategy em `buildFallbackResult`.** Como detalhado na seção 3, são poucos
  casos estáveis; um `if/else` é mais legível que uma hierarquia de estratégias.

### Conclusão

A camada de IA do `rootine-api` é um bom exemplo de padrões GOF **aplicados na
medida**: Strategy + Template Method + Chain of Responsibility cooperando sobre a
abstração `LlmProvider`, e Facade isolando a complexidade do orquestrador. Os
padrões resolvem problemas concretos (trocar de LLM, não duplicar transporte,
tolerar falhas, simplificar o ponto de entrada) e o código **resiste à tentação**
de aplicá-los onde um condicional simples basta. Por isso, **nenhuma refatoração
foi necessária** — forçá-la contrariaria o princípio de não fazer overengineering.
