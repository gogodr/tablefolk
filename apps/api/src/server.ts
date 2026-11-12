import app from "./api.js";

app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" }).catch((error: unknown) => {
  process.stderr.write(`API could not start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
