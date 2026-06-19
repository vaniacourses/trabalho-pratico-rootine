import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class GenerateMissionDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsIn(["daily", "specialized"])
  missionType?: "daily" | "specialized";

  @IsOptional()
  @IsString()
  generationRequestId?: string;
}

export class CompleteMissionDto {
  @IsString()
  userId!: string;
}

export class EditMissionDto {
  @IsString()
  userId!: string;

  @IsString()
  @MinLength(3)
  feedback!: string;
}
