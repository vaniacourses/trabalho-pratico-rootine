import { supabase } from "@/lib/supabase";

/**
 * Adapter para o backend NestJS (`rootine-api`). Mantém a MESMA assinatura de
 * `supabase.functions.invoke(name, { body })` — retorna `{ data, error }` — para
 * que a migração das antigas Edge Functions seja uma troca direta nos call sites.
 *
 * Cada função antiga vira `POST {API_URL}/fn/{name}` com `Authorization: Bearer`
 * do token da sessão Supabase. Alguns nomes ainda não têm backend e são
 * resolvidos localmente via stubs (ex.: `biosphere-feed`).
 */
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333").replace(/\/+$/, "");

export interface InvokeResult<T = any> {
  data: T | null;
  error: Error | null;
}

interface InvokeOptions {
  body?: Record<string, unknown>;
}

// `biosphere-feed` agora é servido pelo backend NestJS em POST /fn/biosphere-feed
// (notícias e eventos ambientais reais de Niterói/RJ via Google Notícias).
const LOCAL_STUBS: Record<string, (body: Record<string, unknown>) => unknown> = {};

export async function invokeFunction<T = any>(
  name: string,
  options?: InvokeOptions,
): Promise<InvokeResult<T>> {
  const body = options?.body ?? {};

  const stub = LOCAL_STUBS[name];
  if (stub) {
    return { data: stub(body) as T, error: null };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch(`${API_BASE_URL}/fn/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    const parsed = raw ? safeJsonParse(raw) : null;

    if (!response.ok) {
      const detail =
        (parsed && (parsed.message ?? parsed.error)) ?? `HTTP ${response.status}`;
      return {
        data: null,
        error: new Error(typeof detail === "string" ? detail : JSON.stringify(detail)),
      };
    }

    return { data: parsed as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
