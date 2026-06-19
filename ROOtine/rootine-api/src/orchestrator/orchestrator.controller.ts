import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { OrchestratorService } from "./orchestrator.service";

class IntentDto {
  @IsString()
  userId!: string;

  @IsString()
  @MinLength(1)
  input!: string;
}

class CadastroDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  nome?: string;
}

@UseGuards(JwtUserGuard)
@Controller("orchestrator")
export class OrchestratorController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Post("intent")
  intent(@Body() body: IntentDto) {
    return this.orchestrator.processarIntencaoUsuario(body.userId, body.input);
  }

  @Post("cadastro")
  cadastro(@Body() body: CadastroDto) {
    return this.orchestrator.criarCadastro(body.userId, body.nome);
  }
}
