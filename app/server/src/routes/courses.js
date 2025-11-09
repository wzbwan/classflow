export default async function courseRoutes(fastify) {
  // 获取当前用户参与的课程
  fastify.get("/courses", { preHandler: [fastify.auth] }, async (req) => {
    const userId = req.user.uid;
    const enrolls = await fastify.prisma.enrollment.findMany({
      where: { userId },
      include: { course: true },
    });
    return enrolls.map((e) => ({
      id: e.course.id,
      name: e.course.name,
      term: e.course.term,
      code: e.course.code,
      roleInCourse: e.roleInCourse,
    }));
  });

  // 创建课程（教师/管理员）
  fastify.post("/courses", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { name, term, code } = req.body || {};
    if (!name || !term || !code) return reply.code(400).send({ error: "缺少字段" });
    const role = req.user.role;
    if (!(role === "TEACHER" || role === "ADMIN")) return reply.code(403).send({ error: "无权限" });

    const course = await fastify.prisma.course.create({
      data: {
        name, term, code, ownerId: req.user.uid,
        enrollments: { create: [{ userId: req.user.uid, roleInCourse: "TEACHER" }] },
      },
    });
    return course;
  });
}

