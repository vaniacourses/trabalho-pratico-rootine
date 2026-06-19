import { Module } from "@nestjs/common";
import { FlashcardService } from "./flashcard.service";
import { QuizService } from "./quiz.service";
import { ContentController } from "./content.controller";
import { ProgressModule } from "../progress/progress.module";

@Module({
  imports: [ProgressModule],
  providers: [FlashcardService, QuizService],
  controllers: [ContentController],
  exports: [FlashcardService, QuizService],
})
export class ContentModule {}
