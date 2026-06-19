import { Module } from "@nestjs/common";
import { OrchestratorService } from "./orchestrator.service";
import { OrchestratorController } from "./orchestrator.controller";
import { UsersModule } from "../users/users.module";
import { MissionsModule } from "../missions/missions.module";
import { GuildsModule } from "../guilds/guilds.module";

@Module({
  imports: [UsersModule, MissionsModule, GuildsModule],
  providers: [OrchestratorService],
  controllers: [OrchestratorController],
})
export class OrchestratorModule {}
