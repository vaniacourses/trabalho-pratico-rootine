import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { ProfileService } from "./profile.service";

class ScientistChatDto {
  @IsString()
  userId!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}

class SyncDto {
  @IsString()
  userId!: string;
}

@UseGuards(JwtUserGuard)
@Controller("profile")
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Post("scientist/chat")
  scientistChat(@Body() body: ScientistChatDto) {
    return this.profile.scientistChat(body.userId, body.message);
  }

  @Post("sync")
  sync(@Body() body: SyncDto) {
    return this.profile.syncBrain(body.userId);
  }
}
