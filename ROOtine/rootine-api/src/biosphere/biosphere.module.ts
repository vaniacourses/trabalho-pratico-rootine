import { Module } from "@nestjs/common";
import { BiosphereService } from "./biosphere.service";
import { BiosphereController } from "./biosphere.controller";

@Module({
  providers: [BiosphereService],
  controllers: [BiosphereController],
  exports: [BiosphereService],
})
export class BiosphereModule {}
