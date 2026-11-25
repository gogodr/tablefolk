import type { FastifyInstance } from "fastify";
import { eventCrudRoutes } from "./events/crud.js";
import { eventPlanningRoutes } from "./events/planning.js";
import { eventCloseRoutes } from "./events/close.js";

export async function eventRoutes(app: FastifyInstance) {
  await eventCrudRoutes(app);
  await eventPlanningRoutes(app);
  await eventCloseRoutes(app);
}
