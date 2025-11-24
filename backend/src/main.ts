import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser()); // parse httpOnly cookies for refresh token
  app.enableCors({ origin: "http://localhost:3001", credentials: true });
  await app.listen(3000);
}
bootstrap();
