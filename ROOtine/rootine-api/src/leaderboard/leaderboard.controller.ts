import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { LeaderboardService } from "./leaderboard.service";

@UseGuards(JwtUserGuard)
@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  rank() {
    return this.leaderboard.rankearGuildas();
  }

  @Get("impact")
  impact() {
    return this.leaderboard.compararImpactoAmbiental();
  }
}
