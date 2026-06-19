import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Flashcard } from "../../entities/flashcard.entity";

@Injectable()
export class FlashcardSeeder {
  private readonly logger = new Logger("SEEDER");

  private readonly flashcardsData = [
    { question: 'Separo resíduos recicláveis em casa com frequência.', category: 'waste', signalKey: 'recycling_habit', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Levo sacola reutilizável quando vou ao mercado.', category: 'consumption', signalKey: 'reusable_bags', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Evito deixar a torneira aberta enquanto escovo os dentes.', category: 'water', signalKey: 'water_conservation', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Desligo luzes ao sair de cômodos vazios.', category: 'energy', signalKey: 'lighting_habits', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Prefiro transporte público ou caminhada quando possível.', category: 'transport', signalKey: 'public_transport', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Planejo compras para reduzir desperdício de alimentos.', category: 'food', signalKey: 'food_planning', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Reaproveito potes e embalagens antes de descartar.', category: 'consumption', signalKey: 'reuse_packaging', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Evito copos e talheres descartáveis no dia a dia.', category: 'waste', signalKey: 'avoid_disposables', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Tomo banhos mais curtos para economizar água.', category: 'water', signalKey: 'short_showers', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Conserto objetos simples em vez de trocar imediatamente.', category: 'consumption', signalKey: 'repair_items', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Separo pilhas e eletrônicos pequenos para descarte correto.', category: 'waste', signalKey: 'proper_disposal', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Evito compras por impulso pensando no impacto ambiental.', category: 'consumption', signalKey: 'conscious_shopping', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Uso garrafa reutilizável em vez de garrafas descartáveis.', category: 'consumption', signalKey: 'reusable_bottle', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Compartilho ou doo itens que não uso mais.', category: 'consumption', signalKey: 'sharing_economy', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Prefiro produtos com menos embalagem quando compro.', category: 'consumption', signalKey: 'minimal_packaging', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Lavo roupas com carga completa na máquina.', category: 'energy', signalKey: 'full_laundry_loads', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Evito usar o carro para trajetos muito curtos.', category: 'transport', signalKey: 'avoid_short_drives', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Composto restos orgânicos quando tenho condições.', category: 'food', signalKey: 'composting', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Desligo aparelhos da tomada quando não estão em uso.', category: 'energy', signalKey: 'unplug_devices', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    { question: 'Leio rótulos para entender descarte e reciclagem.', category: 'waste', signalKey: 'reading_labels', signalType: 'knowledge', weight: 1.0, difficulty: 1 },
  ];

  constructor(private readonly em: EntityManager) {}

  async seed(): Promise<void> {
    const existingCount = await this.em.count(Flashcard);

    if (existingCount === 0) {
      this.logger.log("Inserindo flashcards iniciais...");

      const flashcards = this.flashcardsData.map((data) =>
        this.em.create(Flashcard, {
          ...data,
          trueEffect: { impact: "positive", value: 5 },
          falseEffect: {},
          skipEffect: {},
          active: true,
        })
      );

      await this.em.persistAndFlush(flashcards);
      this.logger.log(`✓ ${flashcards.length} flashcards inseridos com sucesso`);
    }
  }
}
