# Análise e Refatoração SOLID / GRASP — `rootine-api`

> Varredura das classes que aparecem no diagrama de classes (AgenteOrquestrador,
> AgenteCientista, AgenteHabitat, AgenteAventureiro, AgenteGuardião, User, Guilda,
> Missão, Quiz, Flashcard, Habitat, Leaderboard) e dos serviços que as
> implementam no backend NestJS + MikroORM + InversifyJS.

## Sumário executivo

Foram mapeados **4 gargalos arquiteturais** que concentram a maior parte da
dívida em relação a SOLID/GRASP. Todos foram **refatorados** e o projeto
**compila** (`npm run build` ✔).

| # | Gargalo | Princípios violados | Arquivo principal |
|---|---------|---------------------|-------------------|
| 1 | Seleção de provider de LLM por cascata `if/else` com HTTP concreto | **DIP**, **OCP**, Protected Variations | `agents/agent-runner.service.ts` |
| 2 | Roteamento de especialistas por `switch` + união de classes concretas | **OCP**, **LSP**, Polymorphism, Protected Variations | `agents/orchestrator/orchestrator.agent.ts` |
| 3 | `MissionsService` como *god class* (algoritmo + IA + dados + log) | **SRP**, High Cohesion | `missions/missions.service.ts` |
| 4 | Pontuação de `MissionPattern` calculada fora da entidade | **Information Expert**, Low Coupling | `missions/missions.service.ts` ↔ `entities/mission-pattern.entity.ts` |

Há ainda uma observação menor (Controller/GRASP) descrita no fim do documento,
mantida apenas como recomendação.

---

## Princípios aplicados (referência rápida)

- **SRP** — uma classe, um motivo para mudar. Não misturar orquestração de LLM
  com regra de negócio, acesso a dados ou formatação.
- **OCP** — aberto para extensão, fechado para modificação. Acrescentar um
  provider/especialista não deve exigir editar código existente.
- **LSP** — subtipos substituíveis pela base sem o cliente precisar saber o tipo
  concreto.
- **DIP** — módulos de alto nível dependem de abstrações; detalhes (OpenAI,
  Groq, fetch) ficam atrás de interfaces.
- **Information Expert** — o método mora onde moram os dados que ele usa.
- **Polymorphism / Protected Variations** — variações de ferramentas externas
  ficam atrás de uma interface estável.
- **High Cohesion / Low Coupling** — cada classe sabe pouco sobre o "como" das
  outras.

---

## Gargalo 1 — Provider de LLM: cascata `if/else` + HTTP concreto

### Diagnóstico
`AgentRunner` (módulo de alto nível usado por **todos** os agentes do diagrama)
escolhia o provedor com `if (openAiKey) … if (groqKey) …`, montava a URL, o corpo
da requisição e tratava a particularidade de JSON mode do Groq **dentro da
própria classe**. Resultado:

- **DIP** quebrado: a classe de alto nível depende de detalhes concretos
  (URLs da OpenAI/Groq, `fetch`, formato de payload).
- **OCP** quebrado: adicionar Anthropic/Gemini obriga a **editar** `AgentRunner`
  e acrescentar mais um `if`.
- **Protected Variations**: nenhuma fronteira protegendo o sistema das variações
  de cada ferramenta externa.

### ANTES — `agents/agent-runner.service.ts`
```ts
async runAgentText(role: AgentRole, input: string): Promise<string> {
  const openAiKey = env.openAiKey;
  const groqKey = env.groqKey;
  let lastError: unknown = null;

  if (openAiKey) {
    try { return await this.runAgentHttp(role, input, openAiKey, "openai"); }
    catch (error) { lastError = error; }
  }
  if (groqKey) {
    try { return await this.runAgentHttp(role, input, groqKey, "groq"); }
    catch (error) { lastError = error; }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Configure OPENAI_API_KEY ou GROQ_API_KEY ...");
}

private async runAgentHttp(role, input, apiKey, provider: "openai" | "groq", useJsonMode = true) {
  const model = provider === "groq" ? env.groqModel : env.openAiModel;
  const url = provider === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  // ... monta body, trata erro 400 específico do Groq, etc. (tudo aqui dentro)
}
```

### DEPOIS — abstração `LlmProvider` + cascata polimórfica
Nova interface (`agents/llm/llm-provider.ts`):
```ts
export interface LlmProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(request: LlmCompletionRequest): Promise<string>;
}
```

Base compartilhada e implementações concretas (`agents/llm/*.provider.ts`) — só
declaram **o que varia**:
```ts
@injectable()
export class OpenAiProvider extends OpenAiCompatibleProvider {
  readonly name = "openai";
  protected get apiKey() { return env.openAiKey; }
  protected get model() { return env.openAiModel; }
  protected get baseUrl() { return "https://api.openai.com/v1/chat/completions"; }
}

@injectable()
export class GroqProvider extends OpenAiCompatibleProvider {
  readonly name = "groq";
  protected get apiKey() { return env.groqKey; }
  protected get model() { return env.groqModel; }
  protected get baseUrl() { return "https://api.groq.com/openai/v1/chat/completions"; }
  // única particularidade: degradar JSON mode em erro 400
  protected override shouldRetryWithoutJsonMode(status: number, errorText: string) {
    const lower = errorText.toLowerCase();
    return status === 400 && (lower.includes("response_format") || lower.includes("json_object"));
  }
}
```

`AgentRunner` agora depende **só da abstração** e itera a cascata:
```ts
@injectable()
export class AgentRunner {
  constructor(@multiInject(TYPES.LlmProvider) private readonly providers: LlmProvider[]) {}

  async runAgentText(role: AgentRole, input: string): Promise<string> {
    const config = AGENTS[role];
    let lastError: unknown = null;
    for (const provider of this.providers.filter((p) => p.isConfigured())) {
      try {
        return await provider.complete({ role, systemPrompt: config.instructions, userPrompt: input, jsonMode: true });
      } catch (error) { lastError = error; }
    }
    if (lastError instanceof Error) throw lastError;
    throw new Error("Configure OPENAI_API_KEY ou GROQ_API_KEY no ambiente da API.");
  }
}
```

Registro da ordem de prioridade no contêiner (`agents/container.ts`):
```ts
container.bind(TYPES.LlmProvider).to(OpenAiProvider).inSingletonScope();
container.bind(TYPES.LlmProvider).to(GroqProvider).inSingletonScope();
```

### Como resolve
- **DIP**: `AgentRunner` conhece apenas `LlmProvider`; `fetch`, URLs e payloads
  ficam nas implementações.
- **OCP**: adicionar **Anthropic** = criar `AnthropicProvider` + um `container.bind`.
  Nenhuma linha de `AgentRunner` muda.
- **Protected Variations**: cada esquisitice de ferramenta (ex.: JSON mode do
  Groq) fica isolada atrás do hook `shouldRetryWithoutJsonMode`.

---

## Gargalo 2 — Orquestrador: `switch` + união de classes concretas

### Diagnóstico
`OrchestratorAgent.delegarParaEspecialista` (o `AgenteOrquestrador` do diagrama)
roteava com um `switch` e devolvia uma **união de classes concretas**
(`GuardianAgent | AdventurerAgent | ScientistAgent | HabitatAgent`). Os
especialistas não compartilhavam nenhum contrato.

- **OCP**: um novo especialista exige editar o `switch`, a união do tipo de
  retorno e o `SpecialistKey`.
- **Polymorphism / LSP**: sem uma base comum, o chamador precisa saber o tipo
  concreto para usar — não há substituibilidade real.

### ANTES — `agents/orchestrator/orchestrator.agent.ts`
```ts
delegarParaEspecialista(specialist: SpecialistKey):
    GuardianAgent | AdventurerAgent | ScientistAgent | HabitatAgent {
  switch (specialist) {
    case "guardian":   return this.guardian;
    case "adventurer": return this.adventurer;
    case "habitat":    return this.habitat;
    case "scientist":
    default:           return this.scientist;
  }
}
```

### DEPOIS — contrato `SpecialistAgent` + registro
Contrato comum (`agents/specialist.ts`):
```ts
export type SpecialistKey = "guardian" | "adventurer" | "scientist" | "habitat";

export interface SpecialistAgent {
  readonly key: SpecialistKey;
}
```

Cada agente passa a declarar sua identidade:
```ts
export class GuardianAgent implements SpecialistAgent {
  readonly key = "guardian" as const;
  // ...
}
```

Orquestrador monta um mapa e elimina o `switch`:
```ts
private readonly specialists: ReadonlyMap<SpecialistKey, SpecialistAgent>;

constructor(/* ...inject dos 4 agentes... */) {
  const roster: SpecialistAgent[] = [this.guardian, this.adventurer, this.scientist, this.habitat];
  this.specialists = new Map(roster.map((agent) => [agent.key, agent]));
}

delegarParaEspecialista(specialist: SpecialistKey): SpecialistAgent {
  return this.specialists.get(specialist) ?? this.scientist;
}
```

### Como resolve
- **OCP**: registrar um especialista novo = adicioná-lo ao `roster`. O método de
  roteamento nunca mais muda.
- **Polymorphism / Protected Variations**: o roteamento fala com `SpecialistAgent`,
  não com classes concretas; a tabela de despacho substitui o condicional.
- **LSP**: todo especialista honra o mesmo contrato (`key`), tornando-os
  intercambiáveis no ponto de delegação.

---

## Gargalo 3 — `MissionsService` como *god class* (SRP)

### Diagnóstico
`MissionsService.generate` (o `AgenteGuardião`/Missão do diagrama) acumulava
**vários motivos para mudar** em ~350 linhas:

1. Algoritmo determinístico (ranquear patterns, montar candidato, cold start);
2. Orquestração de IA (chamar o Guardião e reconciliar);
3. Acesso a dados (MikroORM `find`/`persist`);
4. Logging de auditoria e de geração.

Mudar a **fórmula de ranking** obrigava a mexer na mesma classe que faz I/O e IA
→ baixa coesão e alto risco de regressão.

### ANTES — `missions/missions.service.ts` (trecho)
```ts
const patterns = await this.em.find(MissionPattern, { active: true });
const selectedPattern = this.rankPattern(patterns, facts, recentPatternKeys, profile);
const deterministicCandidate = selectedPattern
  ? this.patternToCandidate(selectedPattern, facts, missionType)
  : this.coldStartCandidate(missionType);
// ... + IA + validação + persistência + logs ...

private rankPattern(...) { /* algoritmo */ }
private patternToCandidate(...) { /* construção do candidato */ }
private coldStartCandidate(...) { /* fallback */ }
```

### DEPOIS — algoritmo extraído para `MissionComposer`
Novo serviço de responsabilidade única (`missions/mission-composer.ts`):
```ts
@Injectable()
export class MissionComposer {
  rankPattern(patterns, facts, recentPatternKeys, profile): MissionPattern | null { /* ... */ }
  patternToCandidate(pattern, facts, missionType): MissionCandidate { /* ... */ }
  coldStartCandidate(missionType): MissionCandidate { /* ... */ }

  buildDeterministicCandidate(patterns, facts, recentPatternKeys, profile, missionType) {
    const selectedPattern = this.rankPattern(patterns, facts, recentPatternKeys, profile);
    const candidate = selectedPattern
      ? this.patternToCandidate(selectedPattern, facts, missionType)
      : this.coldStartCandidate(missionType);
    return { candidate, selectedPattern };
  }
}
```

`MissionsService` vira **coordenador**:
```ts
constructor(
  private readonly em: EntityManager,
  private readonly progress: ProgressService,
  private readonly agentLogger: AgentInteractionLogger,
  private readonly composer: MissionComposer,
  @Inject(AGENT_PROVIDERS.Guardian) private readonly guardian: GuardianAgent,
) {}

// dentro de generate():
const patterns = await this.em.find(MissionPattern, { active: true });
const { candidate: deterministicCandidate, selectedPattern } =
  this.composer.buildDeterministicCandidate(patterns, facts, recentPatternKeys, profile, missionType);
```

### Como resolve
- **SRP**: o algoritmo determinístico passa a ter **um único** motivo para mudar,
  separado de IA/persistência/log.
- **High Cohesion**: `MissionComposer` é puro (sem `EntityManager`/IA/HTTP) —
  fácil de testar isoladamente.

---

## Gargalo 4 — Pontuação do pattern fora da entidade (Information Expert)

### Diagnóstico
A lógica de pontuação usava **apenas dados de `MissionPattern`**
(`category`, `requiredOrHelpfulFactTypes`, `disqualifyingFactKeys`), mas vivia
em `MissionsService.rankPattern`. A entidade era um saco de getters/setters
(modelo anêmico) e o serviço conhecia detalhes internos dela → **Information
Expert** violado e acoplamento desnecessário.

### ANTES — lógica no serviço, lendo campos da entidade
```ts
const scored = pool
  .filter((p) => !p.disqualifyingFactKeys.some((key) => disqualifyingKeys.has(key)))
  .map((pattern) => {
    let score = Number(affinities[pattern.category] ?? 0);
    if (pattern.requiredOrHelpfulFactTypes.some((type) => factTypes.has(type))) {
      score += 0.5;
    }
    return { pattern, score };
  })
  .sort((a, b) => b.score - a.score);
```

### DEPOIS — comportamento na própria `MissionPattern`
`entities/mission-pattern.entity.ts`:
```ts
isDisqualifiedBy(factKeys: ReadonlySet<string>): boolean {
  return this.disqualifyingFactKeys.some((key) => factKeys.has(key));
}

affinityScore(affinities: Record<string, number>, factTypes: ReadonlySet<string>): number {
  let score = Number(affinities[this.category] ?? 0);
  if (this.requiredOrHelpfulFactTypes.some((type) => factTypes.has(type))) {
    score += 0.5;
  }
  return score;
}
```

`MissionComposer.rankPattern` passa a **pedir** à entidade:
```ts
const scored = pool
  .filter((pattern) => !pattern.isDisqualifiedBy(disqualifyingKeys))
  .map((pattern) => ({ pattern, score: pattern.affinityScore(affinities, factTypes) }))
  .sort((a, b) => b.score - a.score);
```

### Como resolve
- **Information Expert**: a regra mora onde estão os dados que ela usa.
- **Low Coupling**: o ranqueador não conhece mais a estrutura interna do pattern
  (quais campos desqualificam, como a afinidade é somada) — só o contrato de dois
  métodos.

---

## Observação adicional (recomendação, não refatorada)

**Controller (GRASP) — roteamento de casos de uso parcialmente disperso.**
`OrchestratorService` expõe as fachadas `concluirMissao` e `gerirGuilda`
(presentes no diagrama), mas o `OrchestratorController` só publica `intent` e
`cadastro`; concluir missão / criar guilda só são alcançáveis pelos controllers
de `missions`/`guilds`. Não é um bug, mas, se o `AgenteOrquestrador` é o
*Controller* pretendido para esses casos de uso, vale expor as rotas
correspondentes nele (ou remover os métodos-fachada redundantes) para ter um
ponto de entrada único e coerente.

---

## Verificação

```
npm run build   # nest build — OK, sem erros de compilação
```

### Arquivos criados
- `src/agents/llm/llm-provider.ts`
- `src/agents/llm/openai-compatible.provider.ts`
- `src/agents/llm/openai.provider.ts`
- `src/agents/llm/groq.provider.ts`
- `src/agents/specialist.ts`
- `src/missions/mission-composer.ts`

### Arquivos modificados
- `src/agents/types.ts` (token `LlmProvider`)
- `src/agents/agent-runner.service.ts` (cascata polimórfica)
- `src/agents/container.ts` (bind dos providers)
- `src/agents/orchestrator/orchestrator.agent.ts` (registro de especialistas)
- `src/agents/{guardian,adventurer,scientist,habitat}/*.agent.ts` (`implements SpecialistAgent`)
- `src/entities/mission-pattern.entity.ts` (comportamento de pontuação)
- `src/missions/missions.service.ts` (vira coordenador)
- `src/missions/missions.module.ts` (provider `MissionComposer`)
