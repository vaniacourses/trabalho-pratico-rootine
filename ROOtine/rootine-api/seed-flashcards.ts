import "reflect-metadata";
import { MikroORM } from "@mikro-orm/core";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Flashcard } from "./src/entities/flashcard.entity";
import { env } from "./src/config/env";

const flashcardsData = [
  { question: 'Separo resíduos recicláveis em casa com frequência.', category: 'waste', signalKey: 'recycling_habit', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Levo sacola reutilizável quando vou ao mercado.', category: 'consumption', signalKey: 'reusable_bags', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Evito deixar a torneira aberta enquanto escovo os dentes.', category: 'water', signalKey: 'water_conservation', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Desligo luzes ao sair de cômodos vazios.', category: 'energy', signalKey: 'lighting_habits', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Prefiro transporte público ou caminhada quando possível.', category: 'transport', signalKey: 'public_transport', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Planejo compras para reduzir desperdício de alimentos.', category: 'food', signalKey: 'food_planning', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Reaproveito potes e embalagens antes de descartar.', category: 'consumption', signalKey: 'reuse_packaging', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Evito copos e talheres descartáveis no dia a dia.', category: 'waste', signalKey: 'avoid_disposables', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Tomo banhos mais curtos para economizar água.', category: 'water', signalKey: 'short_showers', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Conserto objetos simples em vez de trocar imediatamente.', category: 'consumption', signalKey: 'repair_items', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Separo pilhas e eletrônicos pequenos para descarte correto.', category: 'waste', signalKey: 'proper_disposal', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Evito compras por impulso pensando no impacto ambiental.', category: 'consumption', signalKey: 'conscious_shopping', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Uso garrafa reutilizável em vez de garrafas descartáveis.', category: 'consumption', signalKey: 'reusable_bottle', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Compartilho ou doo itens que não uso mais.', category: 'consumption', signalKey: 'sharing_economy', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Prefiro produtos com menos embalagem quando compro.', category: 'consumption', signalKey: 'minimal_packaging', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Lavo roupas com carga completa na máquina.', category: 'energy', signalKey: 'full_laundry_loads', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Evito usar o carro para trajetos muito curtos.', category: 'transport', signalKey: 'avoid_short_drives', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Composto restos orgânicos quando tenho condições.', category: 'food', signalKey: 'composting', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Desligo aparelhos da tomada quando não estão em uso.', category: 'energy', signalKey: 'unplug_devices', signalType: 'behavior', weight: 1.0, difficulty: 1, active: true },
  { question: 'Leio rótulos para entender descarte e reciclagem.', category: 'waste', signalKey: 'reading_labels', signalType: 'knowledge', weight: 1.0, difficulty: 1, active: true },
];

async function seedFlashcards() {
  let orm: any;

  try {
    console.log("Database URL:", env.databaseUrl.slice(0, 50) + "...");
    console.log("DB SSL:", env.dbSsl);

    orm = await MikroORM.init({
      driver: PostgreSqlDriver,
      clientUrl: env.databaseUrl,
      entities: ["src/**/*.entity.ts"],
      entitiesTs: ["src/**/*.entity.ts"],
      debug: false,
      discovery: { warnWhenNoEntities: false },
      driverOptions: {
        connection: { ssl: env.dbSsl ? { rejectUnauthorized: false } : false },
      },
    } as any);

    const em = orm.em;
    const existingCount = await em.count(Flashcard);

    if (existingCount === 0) {
      console.log("Inserindo flashcards...");

      const flashcards = flashcardsData.map(data =>
        em.create(Flashcard, {
          ...data,
          trueEffect: { impact: "positive", value: 5 },
          falseEffect: {},
          skipEffect: {},
        })
      );

      await em.persistAndFlush(flashcards);
      console.log(`✓ ${flashcards.length} flashcards inseridos com sucesso`);
    } else {
      console.log(`✓ Database já contém ${existingCount} flashcards`);
    }
  } catch (error) {
    console.error("Erro ao fazer seed dos flashcards:", error);
    process.exit(1);
  } finally {
    if (orm) await orm.close();
  }
}

seedFlashcards();
