import { createReadStream, createWriteStream } from "fs";
import { basename, join, resolve, extname } from "path";
import archiver from "archiver";
import { createHash } from "crypto";

function sanitizeFilename(name) {
  if (!name) return "file";
  return name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 255) || "file";
}

function toAsciiFallback(name) {
  if (!name) return "file";
  // 1. Normalize and strip directory parts / CRLF
  const base = basename(String(name))
    .normalize("NFKC")
    .replace(/[\r\n]/g, "_")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 255) || "file";
  // 2. Ensure ASCII only for HTTP header
  return base.replace(/[^\x20-\x7E]/g, "_");
}

function setDownloadHeaders(reply, filename) {
  const original = filename || "file";
  const fallback = toAsciiFallback(original);
  const encoded = encodeURIComponent(original.normalize("NFKC"));
  reply.header(
    "Content-Disposition",
    `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
  );
}

function safeJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch (_) { return []; }
  }
  return [];
}

function hashFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export default async function submissionRoutes(fastify) {
  // 提交作业（学生） multipart: files[] + external_link
  fastify.post("/assignments/:id/submissions", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;
    const assignmentId = Number(id);

    // 检查是否选课学生
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const enroll = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid } });
    if (!enroll) return reply.code(403).send({ error: "未选该课" });

    const parts = req.parts();
    const savedFiles = [];
    let externalLink = null;

    for await (const part of parts) {
      if (part.type === "file") {
        const safe = sanitizeFilename(part.filename || "file");
        const destDir = join(fastify.uploadDir, String(assignment.courseId), String(assignmentId), String(req.user.uid));
        await fastify.mkdirp(destDir);
        const filePath = join(destDir, Date.now() + "-" + safe);
        await new Promise((resolve, reject) => {
          const ws = createWriteStream(filePath);
          part.file.pipe(ws);
          ws.on("finish", resolve);
          ws.on("error", reject);
        });
        savedFiles.push({ filename: safe, path: filePath });
      } else if (part.type === "field" && part.fieldname === "external_link") {
        externalLink = part.value;
      }
    }

    // 最新版本号 +1
    const last = await fastify.prisma.submission.findFirst({
      where: { assignmentId, studentId: req.user.uid },
      orderBy: { version: "desc" },
    });
    const version = (last?.version || 0) + 1;

    const submission = await fastify.prisma.submission.create({
      data: {
        assignmentId,
        studentId: req.user.uid,
        filesJson: savedFiles.length ? JSON.stringify(savedFiles) : null,
        externalLink,
        version,
        status: "submitted",
      },
    });
    return submission;
  });

  // 评分（教师/TA）
  fastify.post("/submissions/:id/grade", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;
    const { score = 0, feedbackText = "", rubricScoresJson = null } = req.body || {};
    const sub = await fastify.prisma.submission.findUnique({ where: { id: Number(id) }, include: { assignment: true } });
    if (!sub) return reply.code(404).send({ error: "提交不存在" });
    // 权限：课程教师/TA
    const can = await fastify.prisma.enrollment.findFirst({
      where: { courseId: sub.assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } },
    });
    if (!can) return reply.code(403).send({ error: "无权限" });
    const grade = await fastify.prisma.grade.upsert({
      where: { submissionId: sub.id },
      update: { score: Number(score), feedbackText, rubricScoresJson },
      create: { submissionId: sub.id, graderId: req.user.uid, score: Number(score), feedbackText, rubricScoresJson },
    });
    return grade;
  });

  // 获取当前用户的提交历史（学生自查）
  fastify.get("/assignments/:id/my-submissions", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const list = await fastify.prisma.submission.findMany({
      where: { assignmentId, studentId: req.user.uid },
      orderBy: { version: "desc" },
      include: { grade: true },
    });
    return list.map(s => ({ id: s.id, version: s.version, submittedAt: s.submittedAt, grade: s.grade, files: JSON.parse(s.filesJson || '[]'), externalLink: s.externalLink }));
  });

  // 教师/TA 查看某作业的提交（取最新版本）
  fastify.get("/assignments/:id/submissions", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const can = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!can) return reply.code(403).send({ error: "无权限" });

    const students = await fastify.prisma.enrollment.findMany({ where: { courseId: assignment.courseId, roleInCourse: "STUDENT" }, include: { user: true } });
    const rows = [];
    for (const s of students) {
      const sub = await fastify.prisma.submission.findFirst({ where: { assignmentId, studentId: s.userId }, orderBy: { version: "desc" }, include: { grade: true } });
      rows.push({
        student: { id: s.userId, studentId: s.user.studentId, name: s.user.name, email: s.user.email },
        submission: sub ? { id: sub.id, version: sub.version, submittedAt: sub.submittedAt, files: JSON.parse(sub.filesJson || '[]'), externalLink: sub.externalLink } : null,
        grade: sub?.grade || null,
      });
    }
    return rows;
  });

  // 获取某次提交的文件列表（学生/负责人可见）
  fastify.get("/submissions/:id/files", { preHandler: [fastify.auth] }, async (req, reply) => {
    const id = Number(req.params.id);
    const sub = await fastify.prisma.submission.findUnique({ where: { id }, include: { assignment: true } });
    if (!sub) return reply.code(404).send({ error: "提交不存在" });
    const isOwner = sub.studentId === req.user.uid;
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: sub.assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!isOwner && !staff) return reply.code(403).send({ error: "无权限" });
    const files = safeJsonArray(sub.filesJson);
    return files.map((f, idx) => ({ idx, filename: f.filename }));
  });

  // 下载提交文件（按下标）
  fastify.get("/submissions/:id/files/:idx/download", { preHandler: [fastify.auth] }, async (req, reply) => {
    const id = Number(req.params.id);
    const idx = Number(req.params.idx);
    const sub = await fastify.prisma.submission.findUnique({ where: { id }, include: { assignment: true } });
    if (!sub) return reply.code(404).send({ error: "提交不存在" });
    const isOwner = sub.studentId === req.user.uid;
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: sub.assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!isOwner && !staff) return reply.code(403).send({ error: "无权限" });
    const files = safeJsonArray(sub.filesJson);
    const f = files[idx];
    if (!f) return reply.code(404).send({ error: "文件不存在" });
    const filePath = resolve(f.path);
    const root = resolve(fastify.uploadDir);
    if (!filePath.startsWith(root)) return reply.code(403).send({ error: "非法路径" });
    setDownloadHeaders(reply, f.filename);
    return reply.send(createReadStream(filePath));
  });

  // 批量导出提交（ZIP）
  fastify.get("/assignments/:id/submissions/export", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId }, include: { course: true } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!staff && req.user.role !== "ADMIN") return reply.code(403).send({ error: "无权限" });

    const archive = archiver("zip", { zlib: { level: 9 } });
    const filename = sanitizeFilename(`${assignment.course.code || assignment.courseId}-${assignment.title}-submissions.zip`);
    reply.type("application/zip");
    setDownloadHeaders(reply, filename);
    reply.send(archive);

    const students = await fastify.prisma.enrollment.findMany({
      where: { courseId: assignment.courseId, roleInCourse: "STUDENT" },
      include: { user: true },
    });

    const usedNames = new Map();
    for (const s of students) {
      const sub = await fastify.prisma.submission.findFirst({
        where: { assignmentId, studentId: s.userId },
        orderBy: { version: "desc" },
      });
      if (!sub) continue;
      const files = safeJsonArray(sub.filesJson);
      if (!files.length) continue;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = extname(file.filename || "");
        const baseRaw = `${s.user.studentId || "ID" + s.user.id}${s.user.name || ""}`;
        const base = sanitizeFilename(baseRaw) || `student_${s.user.id}`;
        let target = `${base}${ext}`;
        if (usedNames.has(target)) {
          const count = usedNames.get(target) + 1;
          usedNames.set(target, count);
          target = `${base}_${count}${ext}`;
        } else {
          usedNames.set(target, 1);
        }
        archive.file(file.path, { name: target });
      }
    }

    await archive.finalize();
  });

  // 查重接口
  fastify.post("/assignments/:id/plagiarism-check", { preHandler: [fastify.auth] }, async (req, reply) => {
    const assignmentId = Number(req.params.id);
    const assignment = await fastify.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return reply.code(404).send({ error: "作业不存在" });
    const staff = await fastify.prisma.enrollment.findFirst({ where: { courseId: assignment.courseId, userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } } });
    if (!staff && req.user.role !== "ADMIN") return reply.code(403).send({ error: "无权限" });

    const students = await fastify.prisma.enrollment.findMany({
      where: { courseId: assignment.courseId, roleInCourse: "STUDENT" },
      include: { user: true },
    });

    const hashMap = new Map();
    let totalFiles = 0;
    for (const s of students) {
      const sub = await fastify.prisma.submission.findFirst({
        where: { assignmentId, studentId: s.userId },
        orderBy: { version: "desc" },
      });
      if (!sub) continue;
      const files = safeJsonArray(sub.filesJson);
      for (const file of files) {
        totalFiles += 1;
        try {
          const hash = await hashFile(file.path);
          if (!hashMap.has(hash)) hashMap.set(hash, []);
          hashMap.get(hash).push({ hash, submissionId: sub.id, student: { id: s.user.id, name: s.user.name, studentId: s.user.studentId } });
        } catch (err) {
          fastify.log.error(err);
        }
      }
    }

    const matches = Array.from(hashMap.values()).filter((list) => list.length > 1);
    return { matches, totalFiles };
  });
}
