import Fastify from "fastify";
import cors from "@fastify/cors";
import { clerkPlugin } from "@clerk/fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import { catalogRoutes } from "./routes/catalog.js";
import { collectionRoutes } from "./routes/collection.js";
import { coverRoutes } from "./routes/covers.js";
import { groupRoutes } from "./routes/groups.js";
import { invitationRoutes } from "./routes/invitations.js";
import { inviteLinkRoutes } from "./routes/invite-links.js";
import { shareRoutes } from "./routes/shares.js";
import { pickRoutes } from "./routes/picks.js";
import { eventRoutes } from "./routes/events.js";
import { interestRoutes } from "./routes/interest.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: "info",
      serializers: {
        req(request) {
          const path = (request.url.split("?", 1)[0] ?? "")
            .replace(/\/v1\/(invitations|invite-links)\/[^/]+/, "/v1/$1/[token]");
          return { method: request.method, path };
        },
        res(reply) {
          return { statusCode: reply.statusCode };
        },
      },
    },
  });
  app.register(cors, {
    origin: config.webOrigin,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
  app.register(clerkPlugin);
  app.get("/health", async () => ({ ok: true }));
  app.register(catalogRoutes);
  app.register(collectionRoutes);
  app.register(coverRoutes);
  app.register(groupRoutes);
  app.register(invitationRoutes);
  app.register(inviteLinkRoutes);
  app.register(shareRoutes);
  app.register(pickRoutes);
  app.register(eventRoutes);
  app.register(interestRoutes);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "VALIDATION", message: error.issues[0]?.message ?? "Invalid input" } });
    }
    if (error instanceof AppError) {
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    }
    request.log.error({ err: error }, "Unhandled API error");
    return reply.code(500).send({ error: { code: "INTERNAL", message: "An unexpected error occurred." } });
  });
  return app;
}
