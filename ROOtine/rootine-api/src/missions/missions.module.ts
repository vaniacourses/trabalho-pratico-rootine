import { Module } from "@nestjs/common";
import { MissionsService } from "./missions.service";
import { MissionComposer } from "./mission-composer";
import { MissionsController } from "./missions.controller";
import { ProgressModule } from "../progress/progress.module";

@Module({
  imports: [ProgressModule],
  providers: [MissionsService, MissionComposer],
  controllers: [MissionsController],
  exports: [MissionsService],
})
export class MissionsModule {}
