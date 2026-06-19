import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { buildMikroOrmConfig } from "./config/mikro-orm.config";
import { AppController } from "./app.controller";
import { CommonModule } from "./common/common.module";
import { AgentsModule } from "./agents/agents.module";
import { UsersModule } from "./users/users.module";
import { ProgressModule } from "./progress/progress.module";
import { MissionsModule } from "./missions/missions.module";
import { ContentModule } from "./content/content.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { HabitatModule } from "./habitat/habitat.module";
import { ProfileModule } from "./profile/profile.module";
import { BiosphereModule } from "./biosphere/biosphere.module";
import { GuildsModule } from "./guilds/guilds.module";
import { LeaderboardModule } from "./leaderboard/leaderboard.module";
import { OrchestratorModule } from "./orchestrator/orchestrator.module";
import { CompatModule } from "./compat/compat.module";
import { NewsModule } from "./news/news.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot(buildMikroOrmConfig()),
    CommonModule,
    AgentsModule,
    UsersModule,
    ProgressModule,
    MissionsModule,
    ContentModule,
    OnboardingModule,
    HabitatModule,
    ProfileModule,
    BiosphereModule,
    GuildsModule,
    LeaderboardModule,
    OrchestratorModule,
    CompatModule,
    NewsModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
