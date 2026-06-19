import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function createSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export class AuthValidationError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AuthValidationError";
    this.status = status;
    this.code = code;
  }
}

export function getErrorStatus(error: unknown, fallback = 400) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return fallback;
}

export async function requireUserIdFromJwt(req: Request, requestedUserId: string) {
  if (!requestedUserId) {
    console.warn("[RLS] Requisicao sem requestedUserId.");
    throw new AuthValidationError("requested_user_id_required", 400, "requested_user_id_required");
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    console.warn("[RLS] Authorization ausente ou invalido.");
    throw new AuthValidationError("authorization_required", 401, "authorization_required");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[RLS] SUPABASE_URL ou SUPABASE_ANON_KEY ausente.");
    throw new AuthValidationError("auth_environment_missing", 500, "auth_environment_missing");
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  const authenticatedUserId = data.user?.id;

  if (error || !authenticatedUserId) {
    console.warn("[RLS] JWT invalido ou expirado.", { requestedUserId });
    throw new AuthValidationError("invalid_authorization", 401, "invalid_authorization");
  }

  if (authenticatedUserId !== requestedUserId) {
    console.warn("[RLS] userId divergente.", {
      requestedUserId,
      authenticatedUserId,
    });
    throw new AuthValidationError("user_id_mismatch", 403, "user_id_mismatch");
  }

  console.log("[RLS] JWT validado para userId:", requestedUserId);
  return data.user;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
