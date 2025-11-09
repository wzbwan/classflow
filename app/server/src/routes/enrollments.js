import Papa from "papaparse";

export default async function enrollmentRoutes(fastify) {
  // CSV 导入名册：列示例 studentId,name,email,roleInCourse
  fastify.post("/courses/:courseId/enrollments:import", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { courseId } = req.params;
    const isStaff = await fastify.prisma.enrollment.findFirst({
      where: { courseId: Number(courseId), userId: req.user.uid, roleInCourse: { in: ["TEACHER", "TA", "OWNER"] } },
    });
    if (!isStaff) return reply.code(403).send({ error: "无权限" });

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "请上传 CSV 文件" });
    const buf = await data.toBuffer();
    const parsed = Papa.parse(buf.toString("utf-8"), { header: true, skipEmptyLines: true });
    const rows = parsed.data || [];

    const results = [];
    for (const r of rows) {
      const studentId = (r.studentId || r.sid || "").trim();
      const name = (r.name || "").trim();
      const email = (r.email || "").trim();
      const roleInCourse = (r.roleInCourse || "STUDENT").trim();
      if (!studentId || !name) continue;

      let user = await fastify.prisma.user.findFirst({ where: { OR: [{ studentId }, { email }] } });
      if (!user) {
        user = await fastify.prisma.user.create({
          data: { name, email: email || null, studentId, role: roleInCourse === "STUDENT" ? "STUDENT" : "TA", passwordHash: await import("bcryptjs").then(({ default: b }) => b.hash("pass1234", 10)) },
        });
      }
      await fastify.prisma.enrollment.upsert({
        where: { courseId_userId: { courseId: Number(courseId), userId: user.id } },
        update: { roleInCourse: roleInCourse === "TEACHER" ? "TEACHER" : roleInCourse === "TA" ? "TA" : "STUDENT" },
        create: { courseId: Number(courseId), userId: user.id, roleInCourse: roleInCourse === "TEACHER" ? "TEACHER" : roleInCourse === "TA" ? "TA" : "STUDENT" },
      });
      results.push({ studentId, name, email, roleInCourse });
    }
    return { imported: results.length, entries: results };
  });
}

