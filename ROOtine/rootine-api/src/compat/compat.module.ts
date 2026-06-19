import { Module } from "@nestjs/common";
import { CompatController } from "./compat.controller";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { MissionsModule } from "../missions/missions.module";
import { ContentModule } from "../content/content.module";
import { HabitatModule } from "../habitat/habitat.module";
import { ProfileModule } from "../profile/profile.module";
import { NewsModule } from "../news/news.module";

/**
 * Agrupa os controllers de compatibilidade com as antigas Edge Functions.
 * Reaproveita os services já existentes exportados por cada módulo de domínio.
 */
@Module({
  imports: [OnboardingModule, MissionsModule, ContentModule, HabitatModule, ProfileModule, NewsModule],
  controllers: [CompatController],
})
export class CompatModule {}
