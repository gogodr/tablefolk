import Fastify from "fastify";
import app from "./api.js";

// Vercel detects Fastify from this entry point and adapts its listener.
void Fastify;

app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" }).catch((error: unknown) => {
  console.error("API startup failed", error);
  process.exitCode = 1;
});
