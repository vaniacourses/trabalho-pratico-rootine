import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { ProgressService } from "./progress.service";

@UseGuards(JwtUserGuard)
@Controller("progress")
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** Resumo de XP/nível/impacto (cache derivado do ledger). */
  @Get(":userId")
  getSummary(@Param("userId") userId: string) {
    return this.progress.getProgressSummary(userId);
  }
}
