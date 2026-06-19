import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { env } from "../../config/env";
import { AuthValidationError } from "../errors/auth-validation.error";
import { SupabaseAuthService, type AuthenticatedUser } from "../auth/supabase-auth.service";

/**
 * Porte de `requireUserIdFromJwt` para um Guard global do NestJS:
 * 1. valida o Bearer token;
 * 2. anexa o usuário autenticado em `req.authUser`;
 * 3. quando há `userId` no body/query/params, exige que coincida (403 em divergência).
 *
 * `AUTH_DEV_BYPASS=true` permite rodar localmente sem Supabase, usando o header
 * `x-user-id` (ou o `userId` da requisição) como identidade autenticada.
 */
@Injectable()
export class JwtUserGuard implements CanActivate {
  private readonly logger = new Logger("RLS");

  constructor(private readonly auth: SupabaseAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { authUser?: AuthenticatedUser }>();
    const requestedUserId = this.extractRequestedUserId(request);

    let authUser: AuthenticatedUser;

    if (env.authDevBypass) {
      const devId = (request.headers["x-user-id"] as string | undefined) ?? requestedUserId;
      if (!devId) {
        throw new AuthValidationError("requested_user_id_required", 400, "requested_user_id_required");
      }
      authUser = { id: devId };
      this.logger.warn(`AUTH_DEV_BYPASS ativo — autenticando como ${devId}`);
    } else {
      const authHeader = request.headers.authorization ?? "";
      authUser = await this.auth.getUserFromAuthHeader(authHeader);
    }

    if (requestedUserId && requestedUserId !== authUser.id) {
      this.logger.warn("userId divergente.");
      throw new AuthValidationError("user_id_mismatch", 403, "user_id_mismatch");
    }

    request.authUser = authUser;
    this.logger.log(`JWT validado para userId: ${authUser.id}`);
    return true;
  }

  private extractRequestedUserId(request: Request): string | undefined {
    const fromBody = (request.body as Record<string, unknown> | undefined)?.["userId"];
    const fromQuery = request.query?.["userId"];
    const fromParams = (request.params as Record<string, unknown> | undefined)?.["userId"];
    const candidate = fromBody ?? fromQuery ?? fromParams;
    return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : undefined;
  }
}
