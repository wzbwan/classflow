import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { basename, join, resolve } from "path";

function sanitizeFilename(name) {
  if (!name) return "file";
  return name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 255) || "file";
}

const safeJsonArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch (_) { return []; }
  }
  return [];
};

async function removeFileSilently(path) {
  if (!path) return;
  try {
    await unlink(path);
  } catch (err) {
    // ignore missing files
  }
}

export default async function assignmentRoutes(fastify) {
  // 创建作业（课程内，教师/TA）
  fastify.post("/courses/:courseId/assignments", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { courseId } = req.params;
    const { title, description, dueAt, allowLate = true, maxPoints = 100 } = req.body || {};
    if (!title || !description || !dueAt) return reply.code(400).send({ error: "缺少字段" });

    // 检查是否为该课程教师/TA
    const isStaff = await fastify.prisma.enrollment.findFirst({
      where: { courseId: Number(courseId), userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } },
    });
    if (!isStaff) return reply.code(403).send({ error: "无权限" });

    const assignment = await fastify.prisma.assignment.create({
      data: {
        courseId: Number(courseId), title, description, dueAt: new Date(dueAt), allowLate, maxPoints,
      },
    });
    return assignment;
  });

  // 获取作业详情
  fastify.get("/assignments/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: Number(id) } });
    if (!assignment) return reply.code(404).send({ error: "未找到" });
    const materials = Array.isArray(assignment.materialsJson) ? assignment.materialsJson : [];
    return {
      ...assignment,
      materials: materials.map((m, idx) => ({ idx, filename: m.filename, size: m.size, uploadedAt: m.uploadedAt })),
    };
  });

  // 课程下作业列表
  fastify.get("/courses/:courseId/assignments", { preHandler: [fastify.auth] }, async (req) => {
    const { courseId } = req.params;
    const list = await fastify.prisma.assignment.findMany({ where: { courseId: Number(courseId) }, orderBy: { dueAt: "asc" } });
    return list.map((a) => ({
      ...a,
      materials: Array.isArray(a.materialsJson)
        ? a.materialsJson.map((m, idx) => ({ idx, filename: m.filename, size: m.size, uploadedAt: m.uploadedAt }))
        : [],
    }));
  });

  // 上传教师材料
  fastify.post("/assignments/:id/materials", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!staff && req.user.role !== "ADMIN") return reply.code(403).send({ error: "无权限" });

    const parts = req.parts();
    const materials = Array.isArray(assignment.materialsJson) ? [...assignment.materialsJson] : [];
    const destDir = join(fastify.uploadDir, "materials", String(assignment.courseId), String(assignmentId));
    await fastify.mkdirp(destDir);

    for await (const part of parts) {
      if (part.type !== "file") continue;
      const safe = sanitizeFilename(part.filename || "material");
      const filePath = join(destDir, Date.now() + "-" + safe);
      let size = 0;
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(filePath);
        part.file.on("data", (chunk) => { size += chunk.length; });
        part.file.pipe(ws);
        ws.on("finish", resolve);
        ws.on("error", reject);
      });
      materials.push({ filename: safe, path: filePath, size, uploadedAt: new Date().toISOString() });
    }

    await fastify.prisma.assignment.update({ where: { id: assignmentId }, data: { materialsJson: materials } });
    return { materials: materials.map((m, idx) => ({ idx, filename: m.filename, size: m.size, uploadedAt: m.uploadedAt })) };
  });

  fastify.get("/assignments/:id/materials", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const member = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid } });
    if (!member && req.user.role !== "ADMIN") return reply.code(403).send({ error: "未选该课" });
    const materials = Array.isArray(assignment.materialsJson) ? assignment.materialsJson : [];
    return materials.map((m, idx) => ({ idx, filename: m.filename, size: m.size, uploadedAt: m.uploadedAt }));
  });

  fastify.get("/assignments/:id/materials/:idx/download", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const idx = Number(req.params.idx);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const member = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid } });
    if (!member && req.user.role !== "ADMIN") return reply.code(403).send({ error: "未选该课" });
    const materials = Array.isArray(assignment.materialsJson) ? assignment.materialsJson : [];
    const m = materials[idx];
    if (!m) return reply.code(404).send({ error: "文件不存在" });
    const filePath = resolve(m.path);
    const root = resolve(fastify.uploadDir);
    if (!filePath.startsWith(root)) return reply.code(403).send({ error: "非法路径" });
    reply.header("Content-Disposition", `attachment; filename="${basename(m.filename)}"`);
    return reply.send(createReadStream(filePath));
  });

  fastify.delete("/assignments/:id/materials/:idx", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const idx = Number(req.params.idx);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!staff && req.user.role !== "ADMIN") return reply.code(403).send({ error: "无权限" });
    const materials = Array.isArray(assignment.materialsJson) ? [...assignment.materialsJson] : [];
    const removed = materials.splice(idx, 1)[0];
    if (!removed) return reply.code(404).send({ error: "文件不存在" });
    await removeFileSilently(removed.path);
    await fastify.prisma.assignment.update({ where: { id: assignmentId }, data: { materialsJson: materials } });
    return { materials: materials.map((m, i) => ({ idx: i, filename: m.filename, size: m.size, uploadedAt: m.uploadedAt })) };
  });

  fastify.put("/assignments/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!staff && req.user.role !== "ADMIN") return reply.code(403).send({ error: "无权限" });

    const { title, description, dueAt, allowLate, maxPoints } = req.body || {};
    const data = {};
    if (title !== undefined) data.title = String(title);
    if (description !== undefined) data.description = String(description);
    if (dueAt !== undefined) data.dueAt = new Date(dueAt);
    if (allowLate !== undefined) data.allowLate = Boolean(allowLate);
    if (maxPoints !== undefined) data.maxPoints = Number(maxPoints);
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: "无更新内容" });

    const updated = await fastify.prisma.assignment.update({ where: { id: assignmentId }, data });
    return {
      ...updated,
      materials: Array.isArray(updated.materialsJson) ? updated.materialsJson.map((m, idx) => ({ idx, filename: m.filename, size: m.size, uploadedAt: m.uploadedAt })) : [],
    };
  });

  fastify.delete("/assignments/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!staff && req.user.role !== "ADMIN") return reply.code(403).send({ error: "无权限" });

    const submissions = await fastify.prisma.submission.findMany({ where: { assignmentId }, select: { filesJson: true } });
    for (const sub of submissions) {
      const files = safeJsonArray(sub.filesJson);
      for (const file of files) {
        await removeFileSilently(file.path);
      }
    }

    const materials = Array.isArray(assignment.materialsJson) ? assignment.materialsJson : [];
    for (const mat of materials) {
      await removeFileSilently(mat.path);
    }

    await fastify.prisma.grade.deleteMany({ where: { submission: { assignmentId } } });
    await fastify.prisma.submission.deleteMany({ where: { assignmentId } });
    await fastify.prisma.assignment.delete({ where: { id: assignmentId } });

    return { success: true };
  });
}
