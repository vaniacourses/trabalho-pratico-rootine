import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { HabitatService } from "./habitat.service";

class UserScopedDto {
  @IsString()
  userId!: string;
}

@UseGuards(JwtUserGuard)
@Controller("habitat")
export class HabitatController {
  constructor(private readonly habitat: HabitatService) {}

  @Get(":userId")
  getHabitat(@Param("userId") userId: string) {
    return this.habitat.getHabitat(userId);
  }

  @Post("leaves")
  generateLeaves(@Body() body: UserScopedDto) {
    return this.habitat.generateLeaves(body.userId);
  }
}
