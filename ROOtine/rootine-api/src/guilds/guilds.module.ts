import { Module } from "@nestjs/common";
import { GuildsService } from "./guilds.service";
import { GuildsController } from "./guilds.controller";

@Module({
  providers: [GuildsService],
  controllers: [GuildsController],
  exports: [GuildsService],
})
export class GuildsModule {}
