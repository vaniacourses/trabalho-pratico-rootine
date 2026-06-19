import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { FlashcardService } from "./flashcard.service";
import { QuizService } from "./quiz.service";
import {
  AnswerFlashcardDto,
  AnswerQuizDto,
  GenerateBatchDto,
  GenerateQuizDto,
  UserScopedDto,
} from "./dto";

@UseGuards(JwtUserGuard)
@Controller("content")
export class ContentController {
  constructor(
    private readonly flashcards: FlashcardService,
    private readonly quizzes: QuizService,
  ) {}

  @Post("flashcards/batch")
  generateBatch(@Body() body: GenerateBatchDto) {
    return this.flashcards.generateBatch(body.userId, body.amount ?? 7);
  }

  @Post("flashcards/answer")
  answerFlashcard(@Body() body: AnswerFlashcardDto) {
    return this.flashcards.answerCard(body);
  }

  @Post("flashcards/batch/:id/complete")
  completeBatch(@Param("id") id: string, @Body() body: UserScopedDto) {
    return this.flashcards.completeBatch(body.userId, id);
  }

  @Post("quizzes/generate")
  generateQuiz(@Body() body: GenerateQuizDto) {
    return this.quizzes.generate(body.userId, body.amount ?? 3);
  }

  @Post("quizzes/answer")
  answerQuiz(@Body() body: AnswerQuizDto) {
    return this.quizzes.answer(body);
  }
}
