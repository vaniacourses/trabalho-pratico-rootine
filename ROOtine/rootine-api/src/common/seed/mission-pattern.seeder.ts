import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { MissionPattern } from "../../entities/mission-pattern.entity";

@Injectable()
export class MissionPatternSeeder {
  private readonly logger = new Logger("SEEDER");

  private readonly patternsData = [
    {
      key: "waste_sorting",
      category: "waste",
      environmentalGoal: "Reduzir resíduos através da separação adequada",
      difficultyMin: 1,
      difficultyMax: 2,
      costLevel: "free",
      effortMinutesMin: 5,
      effortMinutesMax: 15,
      impactModelKey: "waste_reduction",
      fallbackTitlePt: "Organize a coleta seletiva",
      fallbackDescriptionPt: "Separe e organize resíduos recicláveis em casa ou no trabalho",
      fallbackReasonPt: "Redução de resíduos em aterros",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
    {
      key: "water_conservation",
      category: "water",
      environmentalGoal: "Economizar água no dia a dia",
      difficultyMin: 1,
      difficultyMax: 2,
      costLevel: "free",
      effortMinutesMin: 5,
      effortMinutesMax: 10,
      impactModelKey: "water_conservation",
      fallbackTitlePt: "Economize água em casa",
      fallbackDescriptionPt: "Reduzir consumo de água em atividades cotidianas",
      fallbackReasonPt: "Preservação de recursos hídricos",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
    {
      key: "sustainable_transport",
      category: "transport",
      environmentalGoal: "Reduzir emissões de carbono com transporte sustentável",
      difficultyMin: 2,
      difficultyMax: 3,
      costLevel: "free",
      effortMinutesMin: 10,
      effortMinutesMax: 30,
      impactModelKey: "carbon_reduction",
      fallbackTitlePt: "Use transporte sustentável",
      fallbackDescriptionPt: "Caminhe, pedale ou use transporte público ao invés de carro",
      fallbackReasonPt: "Redução de emissões de CO2",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
    {
      key: "energy_efficiency",
      category: "energy",
      environmentalGoal: "Reduzir consumo de energia",
      difficultyMin: 1,
      difficultyMax: 2,
      costLevel: "free",
      effortMinutesMin: 5,
      effortMinutesMax: 15,
      impactModelKey: "energy_reduction",
      fallbackTitlePt: "Economize energia em casa",
      fallbackDescriptionPt: "Desligue luzes, equipamentos e aparelhos que não está usando",
      fallbackReasonPt: "Redução do consumo de energia",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
    {
      key: "sustainable_consumption",
      category: "consumption",
      environmentalGoal: "Promover consumo consciente e redução de resíduos",
      difficultyMin: 2,
      difficultyMax: 3,
      costLevel: "free",
      effortMinutesMin: 10,
      effortMinutesMax: 30,
      impactModelKey: "waste_reduction",
      fallbackTitlePt: "Consuma de forma sustentável",
      fallbackDescriptionPt: "Compre produtos com menos embalagem ou reutilizáveis",
      fallbackReasonPt: "Redução do desperdício e consumismo",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
    {
      key: "food_sustainability",
      category: "food",
      environmentalGoal: "Reduzir desperdício de alimentos e impacto ambiental da alimentação",
      difficultyMin: 2,
      difficultyMax: 3,
      costLevel: "free",
      effortMinutesMin: 15,
      effortMinutesMax: 45,
      impactModelKey: "food_waste_reduction",
      fallbackTitlePt: "Consuma alimentos de forma sustentável",
      fallbackDescriptionPt: "Planeje refeições, reduza desperdício e prefira alimentos locais",
      fallbackReasonPt: "Redução do desperdício de alimentos e da pegada de carbono",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
    {
      key: "nature_conservation",
      category: "consumption",
      environmentalGoal: "Contribuir para a conservação da natureza",
      difficultyMin: 2,
      difficultyMax: 3,
      costLevel: "low",
      effortMinutesMin: 20,
      effortMinutesMax: 60,
      impactModelKey: "biodiversity_protection",
      fallbackTitlePt: "Apoie a conservação da natureza",
      fallbackDescriptionPt: "Participe de plantios, limpezas ambientais ou apoie organizações",
      fallbackReasonPt: "Proteção da biodiversidade e ecossistemas",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
    {
      key: "environmental_education",
      category: "waste",
      environmentalGoal: "Ampliar conhecimento e conscientização ambiental",
      difficultyMin: 1,
      difficultyMax: 2,
      costLevel: "free",
      effortMinutesMin: 15,
      effortMinutesMax: 30,
      impactModelKey: "awareness",
      fallbackTitlePt: "Aprenda sobre sustentabilidade",
      fallbackDescriptionPt: "Assista vídeos, leia artigos ou participe de workshops ambientais",
      fallbackReasonPt: "Aumento da consciência ambiental",
      requiredOrHelpfulFactTypes: [],
      disqualifyingFactKeys: [],
      personalizationSlots: [],
      recurrenceAllowed: false,
    },
  ];

  constructor(private readonly em: EntityManager) {}

  async seed(): Promise<void> {
    const existingCount = await this.em.count(MissionPattern);

    if (existingCount === 0) {
      this.logger.log("Inserindo padrões de missão iniciais...");

      const patterns = this.patternsData.map((data) =>
        this.em.create(MissionPattern, {
          ...data,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      await this.em.persistAndFlush(patterns);
      this.logger.log(`✓ ${patterns.length} padrões de missão inseridos com sucesso`);
    }
  }
}
