import { Module } from "@nestjs/common";
import { HabitatService } from "./habitat.service";
import { HabitatController } from "./habitat.controller";

@Module({
  providers: [HabitatService],
  controllers: [HabitatController],
  exports: [HabitatService],
})
export class HabitatModule {}
