import { createReadStream, createWriteStream } from "fs";
import { basename, join, resolve } from "path";

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
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
    const files = JSON.parse(sub.filesJson || '[]');
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
    const files = JSON.parse(sub.filesJson || '[]');
    const f = files[idx];
    if (!f) return reply.code(404).send({ error: "文件不存在" });
    const filePath = resolve(f.path);
    const root = resolve(fastify.uploadDir);
    if (!filePath.startsWith(root)) return reply.code(403).send({ error: "非法路径" });
    reply.header('Content-Disposition', `attachment; filename="${basename(f.filename)}"`);
    return reply.send(createReadStream(filePath));
  });
}
