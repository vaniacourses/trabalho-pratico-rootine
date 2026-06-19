import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { GuildsService } from "./guilds.service";

class CreateGuildDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

class JoinGuildDto {
  @IsString()
  userId!: string;
}

@UseGuards(JwtUserGuard)
@Controller("guilds")
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Post()
  create(@Body() body: CreateGuildDto) {
    return this.guilds.create(body.name);
  }

  @Post(":id/members")
  addMember(@Param("id") id: string, @Body() body: JoinGuildDto) {
    return this.guilds.adicionarMembro(id, body.userId);
  }

  @Get(":id/ranking")
  ranking(@Param("id") id: string) {
    return this.guilds.calcularRankingInterno(id);
  }
}
