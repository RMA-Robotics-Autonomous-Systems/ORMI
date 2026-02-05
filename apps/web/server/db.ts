import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { env } from "@/config/env.js";

const createPrismaClient = () => {
	const pool = new Pool({ connectionString: env.DATABASE_URL });
	const adapter = new PrismaPg(pool);

	return new PrismaClient({
		adapter,
		log:
			env.NODE_ENV === "development"
				? ["query", "error", "warn"]
				: ["error"],
	});
};

const globalForPrisma = globalThis as unknown as {
	prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
