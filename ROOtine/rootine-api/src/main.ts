import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AuthValidationExceptionFilter } from "./common/filters/auth-validation-exception.filter";
import { env } from "./config/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.enableCors({ origin: "*" });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AuthValidationExceptionFilter());

  await app.listen(env.port, "0.0.0.0");
  new Logger("Bootstrap").log(`rootine-api ouvindo em http://localhost:${env.port}`);
}

bootstrap();
