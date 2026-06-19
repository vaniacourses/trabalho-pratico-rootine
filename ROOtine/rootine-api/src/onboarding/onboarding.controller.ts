import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsObject, IsOptional, IsString } from "class-validator";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { OnboardingService } from "./onboarding.service";
import { ONBOARDING_QUESTIONS } from "../domain";

class CompleteOnboardingDto {
  @IsString()
  userId!: string;

  @IsObject()
  answers!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  nome?: string;
}

@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Catálogo público de perguntas (não exige auth — sem dados pessoais). */
  @Get("questions")
  questions() {
    return ONBOARDING_QUESTIONS;
  }

  @UseGuards(JwtUserGuard)
  @Post("complete")
  complete(@Body() body: CompleteOnboardingDto) {
    return this.onboarding.complete(body.userId, body.answers, body.nome);
  }
}
