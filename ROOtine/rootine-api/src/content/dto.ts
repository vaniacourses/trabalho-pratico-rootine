import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UserScopedDto {
  @IsString()
  userId!: string;
}

export class GenerateBatchDto extends UserScopedDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  amount?: number;
}

export class AnswerFlashcardDto extends UserScopedDto {
  @IsString()
  flashcardId!: string;

  @IsString()
  dailyBatch!: string;

  @IsBoolean()
  answer!: boolean;
}

export class GenerateQuizDto extends UserScopedDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  amount?: number;
}

export class AnswerQuizDto extends UserScopedDto {
  @IsString()
  quizQuestionId!: string;

  @IsString()
  selectedOption!: string;
}
