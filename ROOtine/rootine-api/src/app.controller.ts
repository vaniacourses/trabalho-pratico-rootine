import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      name: "rootine-api",
      status: "ok",
      stack: ["NestJS", "MikroORM", "InversifyJS"],
    };
  }

  @Get("health")
  health() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
