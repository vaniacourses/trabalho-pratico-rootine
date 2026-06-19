/** Porte de `AuthValidationError` das Edge Functions (`_shared/supabase-admin.ts`). */
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
