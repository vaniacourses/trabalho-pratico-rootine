import { ArgumentsHost, Catch, ExceptionFilter, Logger } from "@nestjs/common";
import type { Response } from "express";
import { AuthValidationError } from "../errors/auth-validation.error";

/** Converte `AuthValidationError` (porte das Edge Functions) em resposta HTTP. */
@Catch(AuthValidationError)
export class AuthValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("RLS");

  catch(exception: AuthValidationError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    this.logger.warn(`Falha de autorizacao: ${exception.code}`);
    response.status(exception.status).json({
      error: exception.code,
      message: exception.message,
    });
  }
}
