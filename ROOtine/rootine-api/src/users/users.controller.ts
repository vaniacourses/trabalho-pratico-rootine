import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { UsersService } from "./users.service";

@UseGuards(JwtUserGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(":userId/profile")
  getProfile(@Param("userId") userId: string) {
    return this.users.getProfile(userId);
  }
}
