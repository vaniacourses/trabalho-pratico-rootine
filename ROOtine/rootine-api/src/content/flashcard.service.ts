import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Flashcard } from "../entities/flashcard.entity";
import { UserDailyFlashcards } from "../entities/user-daily-flashcards.entity";
import { UserFlashcardAnswer } from "../entities/user-flashcard-answer.entity";
import { Profile } from "../entities/profile.entity";
import { UserProfileEvent } from "../entities/user-profile-event.entity";
import { ProgressService } from "../progress/progress.service";

/**
 * Porte de `generate-batch` / `answer-adventure-card` / `complete-adventure-batch`.
 * 100% determinístico — flashcards nunca são gerados por IA (regra de produto).
 */
@Injectable()
export class FlashcardService {
  private readonly logger = new Logger("ADVENTURE");

  constructor(
    private readonly em: EntityManager,
    private readonly progress: ProgressService,
  ) {}

  async generateBatch(userId: string, amount = 7) {
    const available = await this.em.find(Flashcard, { active: true });
    const balanced = this.balancedSelection(available, amount);

    const batch = this.em.create(UserDailyFlashcards, {
      userId,
      amount: balanced.length,
      active: true,
      createdAt: new Date(),
    });
    await this.em.persistAndFlush(batch);

    this.logger.log(`[ADVENTURE] Lote gerado. user=${userId} batch=${batch.id} cards=${balanced.length}`);
    return {
      batchId: batch.id,
      cards: balanced.map((card) => ({
        id: card.id,
        question: card.question,
        category: card.category,
        difficulty: card.difficulty,
      })),
    };
  }

  async answerCard(input: { userId: string; flashcardId: string; dailyBatch: string; answer: boolean }) {
    const record = this.em.create(UserFlashcardAnswer, {
      userId: input.userId,
      flashcardId: input.flashcardId,
      dailyBatch: input.dailyBatch,
      answer: input.answer,
      answeredAt: new Date(),
    });
    await this.em.persistAndFlush(record);
    return { id: record.id, answeredAt: record.answeredAt };
  }

  async completeBatch(userId: string, batchId: string) {
    const batch = await this.em.findOne(UserDailyFlashcards, { id: batchId, userId });
    if (!batch) throw new NotFoundException("batch_not_found");

    if (!batch.completedAt) {
      batch.completedAt = new Date();
      batch.active = false;
      await this.em.persistAndFlush(batch);
      await this.em.nativeUpdate(Profile, { id: userId }, { dailyFlashcardsCompleted: true });
    }

    const xp = await this.progress.awardXpWithDailyCap({
      userId,
      sourceType: "adventure_batch",
      sourceId: batch.id,
      reason: "Lote de Aventura concluido",
      requestedXp: 10,
      idempotencyKey: `adventure_batch:${batch.id}`,
      dailyCap: 30,
    });

    await this.em.persistAndFlush(
      this.em.create(UserProfileEvent, {
        userId,
        eventType: "BATCH_COMPLETED",
        source: "adventure",
        sourceTable: "user_daily_flashcards",
        sourceId: batch.id,
        payload: { amount: batch.amount },
      }),
    );

    await this.progress.unlockEligibleAchievements(userId, "adventure_batch");
    return { batchId: batch.id, xp };
  }

  /**
   * Compat ex-`generate-batch`: cria (ou reaproveita) o lote do dia, pré-criando
   * as linhas em `user_flashcards_answers` (answer/answered_at nulos) para o app
   * consumir o lote completo, no mesmo shape da Edge Function.
   */
  async generateAdventureBatch(userId: string, amount = 7) {
    try {
      const activeBatch = await this.em.findOne(
        UserDailyFlashcards,
        { userId, active: true },
        { orderBy: { createdAt: "desc" } },
      );
      if (activeBatch) {
        const answers = await this.em.find(UserFlashcardAnswer, { dailyBatch: activeBatch.id });
        const pending = answers.filter((a) => !a.answeredAt);
        if (pending.length > 0) {
          return this.serializeBatch(activeBatch, answers, true);
        }
      }

      const available = await this.em.find(Flashcard, { active: true });
      this.logger.log(`[ADVENTURE] Flashcards disponíveis: ${available.length}`);

      if (available.length === 0) {
        this.logger.warn(`[ADVENTURE] Nenhum flashcard disponível para user=${userId}`);
        throw new Error("no_flashcards_available");
      }

      const balanced = this.balancedSelection(available, amount);
      this.logger.log(`[ADVENTURE] Flashcards balanceados: ${balanced.length}`);

      const batch = this.em.create(UserDailyFlashcards, {
        userId,
        amount: balanced.length,
        active: true,
        createdAt: new Date(),
      });
      await this.em.persistAndFlush(batch);

      const answerRows = balanced.map((card) =>
        this.em.create(UserFlashcardAnswer, {
          userId,
          flashcardId: card.id,
          dailyBatch: batch.id,
          answer: null,
          answeredAt: null,
        }),
      );

      if (answerRows.length > 0) {
        await this.em.persistAndFlush(answerRows);
      }

      this.logger.log(`[ADVENTURE] Lote (compat) gerado. user=${userId} batch=${batch.id} cards=${answerRows.length}`);
      return this.serializeBatch(batch, answerRows, false);
    } catch (error) {
      this.logger.error(`[ADVENTURE] Erro ao gerar batch: ${error?.message || error}`);
      throw error;
    }
  }

  /** Compat ex-`answer-adventure-card`: atualiza a resposta pela id da linha. */
  async answerByAnswerId(userId: string, answerId: string, answer: boolean | null) {
    const row = await this.em.findOne(UserFlashcardAnswer, { id: answerId, userId });
    if (!row) throw new NotFoundException("answer_not_found");
    row.answer = answer;
    row.answeredAt = new Date();
    await this.em.persistAndFlush(row);

    const card = await this.em.findOne(Flashcard, { id: row.flashcardId });
    await this.em.persistAndFlush(
      this.em.create(UserProfileEvent, {
        userId,
        eventType: "FLASHCARD_ANSWERED",
        source: "adventure",
        sourceTable: "user_flashcard_answers",
        sourceId: row.id,
        payload: {
          flashcard_id: row.flashcardId,
          answer,
          category: card?.category ?? null,
        },
      }),
    );

    return { id: row.id, answeredAt: row.answeredAt };
  }

  private async serializeBatch(
    batch: UserDailyFlashcards,
    answers: UserFlashcardAnswer[],
    reused: boolean,
  ) {
    const ids = answers.map((a) => a.flashcardId);
    const cards = ids.length ? await this.em.find(Flashcard, { id: { $in: ids } }) : [];
    const byId = new Map(cards.map((c) => [c.id, c]));
    return {
      batch: {
        id: batch.id,
        user_id: batch.userId,
        created_at: batch.createdAt ? batch.createdAt.toISOString() : null,
        completed_at: batch.completedAt ? batch.completedAt.toISOString() : null,
        active: batch.active ?? true,
        amount: batch.amount ?? answers.length,
      },
      flashcards: answers.map((a) => {
        const card = byId.get(a.flashcardId);
        return {
          id: a.id,
          flashcard_id: a.flashcardId,
          answer: a.answer ?? null,
          answered_at: a.answeredAt ? a.answeredAt.toISOString() : null,
          flashcards: {
            question: card?.question ?? null,
            category: card?.category ?? null,
            signal_type: card?.signalType ?? null,
            difficulty: card?.difficulty ?? null,
          },
        };
      }),
      reused,
    };
  }

  private balancedSelection(cards: Flashcard[], amount: number): Flashcard[] {
    const byCategory = new Map<string, Flashcard[]>();
    for (const card of cards) {
      const key = card.category ?? "uncategorized";
      const list = byCategory.get(key) ?? [];
      list.push(card);
      byCategory.set(key, list);
    }
    const buckets = [...byCategory.values()].map((list) => [...list].sort((a, b) => b.weight - a.weight));
    const selected: Flashcard[] = [];
    let index = 0;
    while (selected.length < amount && buckets.some((bucket) => bucket.length > 0)) {
      const bucket = buckets[index % buckets.length];
      const next = bucket.shift();
      if (next) selected.push(next);
      index += 1;
    }
    return selected;
  }
}
