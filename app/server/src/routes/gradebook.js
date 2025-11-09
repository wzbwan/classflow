import { stringify } from "node:querystring";

export default async function gradebookRoutes(fastify) {
  fastify.get("/courses/:courseId/gradebook", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { courseId } = req.params;
    const format = (req.query?.format || "json").toLowerCase();

    // 权限：课程内任意角色可查看自己的分数；教师/TA 可导出全部
    const membership = await fastify.prisma.enrollment.findFirst({ where: { courseId: Number(courseId), userId: req.user.uid } });
    if (!membership) return reply.code(403).send({ error: "未选该课" });
    const isStaff = ["TEACHER", "TA", "OWNER"].includes(membership.roleInCourse);

    const students = await fastify.prisma.enrollment.findMany({
      where: { courseId: Number(courseId), roleInCourse: "STUDENT" },
      include: { user: true },
    });
    const assignments = await fastify.prisma.assignment.findMany({ where: { courseId: Number(courseId) }, orderBy: { id: "asc" } });

    // 构建成绩矩阵
    const rows = [];
    for (const s of students) {
      const row = { studentId: s.user.studentId || s.user.email || s.user.id, name: s.user.name };
      for (const a of assignments) {
        const sub = await fastify.prisma.submission.findFirst({
          where: { assignmentId: a.id, studentId: s.userId },
          orderBy: { version: "desc" },
          include: { grade: true },
        });
        row["A#" + a.id] = sub?.grade?.score ?? "";
      }
      rows.push(row);
    }

    if (format === "csv") {
      // CSV 导出
      const headers = ["studentId", "name", ...assignments.map((a) => `A#${a.id}`)];
      const lines = [headers.join(",")];
      for (const r of rows) {
        lines.push(headers.map((h) => (r[h] !== undefined ? r[h] : "")).join(","));
      }
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename=gradebook-course-${courseId}.csv`);
      return lines.join("\n");
    }
    return { assignments: assignments.map((a) => ({ id: a.id, title: a.title, maxPoints: a.maxPoints })), rows };
  });
}

