import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../config/env";
import { AuthValidationError } from "../errors/auth-validation.error";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

/**
 * Valida o JWT do Supabase Auth (porte de `requireUserIdFromJwt`). Logs com
 * prefixo `[RLS]`, nunca expondo o JWT/token.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger("RLS");
  private client: SupabaseClient | null = null;

  private getAnonClient(): SupabaseClient {
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      this.logger.warn("SUPABASE_URL ou SUPABASE_ANON_KEY ausente.");
      throw new AuthValidationError("auth_environment_missing", 500, "auth_environment_missing");
    }
    if (!this.client) {
      this.client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.client;
  }

  async getUserFromAuthHeader(authHeader: string): Promise<AuthenticatedUser> {
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      this.logger.warn("Authorization ausente ou invalido.");
      throw new AuthValidationError("authorization_required", 401, "authorization_required");
    }

    const token = authHeader.slice("bearer ".length).trim();
    const { data, error } = await this.getAnonClient().auth.getUser(token);
    const authenticatedUserId = data.user?.id;

    if (error || !authenticatedUserId) {
      this.logger.warn("JWT invalido ou expirado.");
      throw new AuthValidationError("invalid_authorization", 401, "invalid_authorization");
    }

    return { id: authenticatedUserId, email: data.user?.email ?? undefined };
  }
}
