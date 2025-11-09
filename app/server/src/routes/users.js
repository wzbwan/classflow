import bcrypt from "bcryptjs";

export default async function userRoutes(fastify) {
  // 获取我的资料
  fastify.get('/users/me', { preHandler: [fastify.auth] }, async (req) => {
    const u = await fastify.prisma.user.findUnique({ where: { id: req.user.uid } });
    return { id: u.id, name: u.name, email: u.email, studentId: u.studentId, role: u.role };
  });

  // 更新我的资料（可修改 name/email；可选改密）
  fastify.put('/users/me', { preHandler: [fastify.auth] }, async (req, reply) => {
    const { name, email, oldPassword, newPassword } = req.body || {};
    const u = await fastify.prisma.user.findUnique({ where: { id: req.user.uid } });
    const data = {};
    if (name !== undefined) data.name = String(name);
    if (email !== undefined) data.email = email || null;
    if (newPassword) {
      if (!oldPassword) return reply.code(400).send({ error: '缺少旧密码' });
      const ok = await bcrypt.compare(oldPassword, u.passwordHash);
      if (!ok) return reply.code(400).send({ error: '旧密码错误' });
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }
    const updated = await fastify.prisma.user.update({ where: { id: u.id }, data });
    return { id: updated.id, name: updated.name, email: updated.email, studentId: updated.studentId, role: updated.role };
  });
}

