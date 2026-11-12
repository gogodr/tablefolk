import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { config, requireSetting } from "./config.js";

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg({
      connectionString: requireSetting(config.databaseUrl, "DATABASE_URL"),
    });
    client = new PrismaClient({ adapter });
  }
  return client;
}
