import { Injectable, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Profile } from "../entities/profile.entity";
import { getLevelFromXp } from "../domain";

/** `User` (diagrama) = `profiles`. `evoluirNivel` é derivado da curva de XP. */
@Injectable()
export class UsersService {
  constructor(private readonly em: EntityManager) {}

  async getProfile(userId: string) {
    const profile = await this.em.findOne(Profile, { id: userId });
    if (!profile) throw new NotFoundException("profile_not_found");
    return this.withLevel(profile);
  }

  async ensureProfile(userId: string, nome?: string): Promise<Profile> {
    let profile = await this.em.findOne(Profile, { id: userId });
    if (!profile) {
      profile = this.em.create(Profile, {
        id: userId,
        nome: nome ?? null,
        name: nome ?? null,
        xp: 1,
        impactTotals: { co2_kg: 0, water_l: 0, waste_g: 0 },
        onboardingCompleted: false,
        dailyFlashcardsCompleted: false,
      });
      await this.em.persistAndFlush(profile);
    }
    return profile;
  }

  private withLevel(profile: Profile) {
    const level = getLevelFromXp(profile.xp);
    return {
      id: profile.id,
      nome: profile.nome ?? profile.name ?? null,
      xp: profile.xp,
      level,
      affinities: profile.affinities ?? {},
      impactTotals: profile.impactTotals,
      onboardingCompleted: profile.onboardingCompleted ?? false,
      dailyFlashcardsCompleted: profile.dailyFlashcardsCompleted ?? false,
      avatarUrl: profile.avatarUrl ?? null,
    };
  }
}
