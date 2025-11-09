import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import formbody from "@fastify/formbody";
import jwt from "@fastify/jwt";
import dotenv from "dotenv";
import { mkdirSync } from "fs";
import { mkdir } from "fs/promises";
import { resolve } from "path";

dotenv.config();

const app = Fastify({ logger: true, bodyLimit: (Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024 });

await app.register(cors, { origin: true, credentials: true });
await app.register(formbody);
await app.register(multipart, { limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024 } });

// JWT
await app.register(jwt, { secret: process.env.JWT_SECRET || "dev-secret" });
app.decorate("auth", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

// Prisma client plugin
import db from "./plugins/db.js";
await app.register(db);

// Ensure upload dir exists
const uploadDir = resolve(process.cwd(), process.env.UPLOAD_DIR || "./uploads");
mkdirSync(uploadDir, { recursive: true });
app.decorate("uploadDir", uploadDir);
if (!app.hasDecorator("mkdirp")) {
  app.decorate("mkdirp", async (p) => {
    await mkdir(p, { recursive: true });
  });
}

// Routes
import authRoutes from "./routes/auth.js";
import courseRoutes from "./routes/courses.js";
import assignmentRoutes from "./routes/assignments.js";
import submissionRoutes from "./routes/submissions.js";
import gradebookRoutes from "./routes/gradebook.js";
import enrollmentRoutes from "./routes/enrollments.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(courseRoutes, { prefix: "/api" });
await app.register(assignmentRoutes, { prefix: "/api" });
await app.register(submissionRoutes, { prefix: "/api" });
await app.register(gradebookRoutes, { prefix: "/api" });
await app.register(enrollmentRoutes, { prefix: "/api" });
await app.register(userRoutes, { prefix: "/api" });
await app.register(adminRoutes, { prefix: "/api" });

const port = process.env.PORT || 3001;
try {
  const address = await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`Server listening on ${address}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
