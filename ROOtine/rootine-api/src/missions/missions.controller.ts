import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { MissionsService } from "./missions.service";
import { CompleteMissionDto, EditMissionDto, GenerateMissionDto } from "./dto";

@UseGuards(JwtUserGuard)
@Controller("missions")
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  /** ex-`generate-missions`. */
  @Post("generate")
  generate(@Body() body: GenerateMissionDto) {
    return this.missions.generate(body.userId, body.missionType ?? "daily", body.generationRequestId);
  }

  @Get()
  list(@Query("userId") userId: string, @Query("status") status?: string) {
    return this.missions.list(userId, status);
  }

  /** ex-`edit-mission`. */
  @Patch(":id")
  edit(@Param("id") id: string, @Body() body: EditMissionDto) {
    return this.missions.edit(body.userId, id, body.feedback);
  }

  @Post(":id/complete")
  complete(@Param("id") id: string, @Body() body: CompleteMissionDto) {
    return this.missions.complete(body.userId, id);
  }

  @Post(":id/refuse")
  refuse(@Param("id") id: string, @Body() body: CompleteMissionDto) {
    return this.missions.refuse(body.userId, id);
  }
}
