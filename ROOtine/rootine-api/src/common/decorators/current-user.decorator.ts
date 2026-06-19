import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/supabase-auth.service";

/** Injeta o usuário autenticado anexado pelo `JwtUserGuard`. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ authUser?: AuthenticatedUser }>();
    const user = request.authUser;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
