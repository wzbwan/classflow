export default async function authRoutes(fastify) {
  // 登录：支持 email 或 studentId
  fastify.post("/login", async (req, reply) => {
    const { id, email, studentId, password } = req.body || {};
    const identifier = email || studentId || id;
    if (!identifier || !password) {
      return reply.code(400).send({ error: "缺少凭证" });
    }
    const user = await fastify.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { studentId: identifier }],
      },
    });
    if (!user) return reply.code(401).send({ error: "用户不存在" });
    const ok = await import("bcryptjs").then(({ default: bcrypt }) => bcrypt.compare(password, user.passwordHash));
    if (!ok) return reply.code(401).send({ error: "密码错误" });

    const token = fastify.jwt.sign({ uid: user.id, role: user.role, name: user.name });
    return { token, user: { id: user.id, name: user.name, role: user.role } };
  });

  // 验证 token 用于前端保持会话
  fastify.get("/me", { preHandler: [fastify.auth] }, async (req) => {
    const user = await fastify.prisma.user.findUnique({ where: { id: req.user.uid } });
    return { user: { id: user.id, name: user.name, role: user.role } };
  });
}

