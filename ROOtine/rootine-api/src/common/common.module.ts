import { Global, Module } from "@nestjs/common";
import { SupabaseAuthService } from "./auth/supabase-auth.service";
import { JwtUserGuard } from "./guards/jwt-user.guard";
import { AgentInteractionLogger } from "./logging/agent-interaction.service";

@Global()
@Module({
  providers: [SupabaseAuthService, JwtUserGuard, AgentInteractionLogger],
  exports: [SupabaseAuthService, JwtUserGuard, AgentInteractionLogger],
})
export class CommonModule {}
