import { Controller, Get, Query } from "@nestjs/common";
import { BiosphereService } from "./biosphere.service";

/** Público enquanto não ler dados pessoais (sem `JwtUserGuard`). */
@Controller("biosphere")
export class BiosphereController {
  constructor(private readonly biosphere: BiosphereService) {}

  @Get("feed")
  feed(@Query("limit") limit?: string) {
    return this.biosphere.feed(limit ? Number(limit) : 30);
  }
}
