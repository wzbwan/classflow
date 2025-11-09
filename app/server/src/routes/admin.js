import fp from 'fastify-plugin'
import * as XLSX from 'xlsx'
import bcrypt from 'bcryptjs'

export default async function adminRoutes(fastify){
  // 管理员鉴权
  const adminOnly = async (req, reply) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      return reply.code(403).send({ error: '仅限管理员' })
    }
  }

  // 列表查询
  fastify.get('/admin/users', { preHandler: [fastify.auth, adminOnly] }, async (req) => {
    const role = req.query?.role
    const q = (req.query?.q || '').trim()
    const where = {}
    if (role && ['ADMIN','TEACHER','TA','STUDENT'].includes(role)) where.role = role
    if (q) where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { studentId: { contains: q } }
    ]
    const list = await fastify.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 })
    return list.map(u => ({ id: u.id, name: u.name, email: u.email, studentId: u.studentId, role: u.role, createdAt: u.createdAt }))
  })

  // 新建用户
  fastify.post('/admin/users', { preHandler: [fastify.auth, adminOnly] }, async (req, reply) => {
    const { name, email=null, studentId=null, role='STUDENT', password='pass1234' } = req.body || {}
    if (!name || (!email && !studentId)) return reply.code(400).send({ error: 'name 与 (email 或 studentId) 必填' })
    const passwordHash = await bcrypt.hash(String(password), 10)
    const u = await fastify.prisma.user.create({ data: { name, email, studentId, role, passwordHash } })
    return { id: u.id, name: u.name, email: u.email, studentId: u.studentId, role: u.role }
  })

  // 更新用户（含改密）
  fastify.put('/admin/users/:id', { preHandler: [fastify.auth, adminOnly] }, async (req, reply) => {
    const id = Number(req.params.id)
    const { name, email, studentId, role, password } = req.body || {}
    const data = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) data.email = email
    if (studentId !== undefined) data.studentId = studentId
    if (role && ['ADMIN','TEACHER','TA','STUDENT'].includes(role)) data.role = role
    if (password) data.passwordHash = await bcrypt.hash(String(password), 10)
    const u = await fastify.prisma.user.update({ where: { id }, data })
    return { id: u.id, name: u.name, email: u.email, studentId: u.studentId, role: u.role }
  })

  // 模板下载（xlsx/csv）
  fastify.get('/admin/users/template', { preHandler: [fastify.auth, adminOnly] }, async (req, reply) => {
    const format = (req.query?.format || 'xlsx').toLowerCase()
    const rows = [
      { studentId: 's001', name: '张三', email: 's001@example.com', role: 'STUDENT', password: 'pass1234' },
      { studentId: 't001', name: '李四', email: 't001@example.com', role: 'TEACHER', password: 'pass1234' }
    ]
    const header = ['studentId','name','email','role','password']
    const ws = XLSX.utils.json_to_sheet(rows, { header })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'users')
    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', 'attachment; filename=users_template.csv')
      return csv
    }
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', 'attachment; filename=users_template.xlsx')
    return buf
  })

  // 批量导入（xlsx/csv）
  fastify.post('/admin/users:import', { preHandler: [fastify.auth, adminOnly] }, async (req, reply) => {
    const file = await req.file()
    if (!file) return reply.code(400).send({ error: '请上传Excel或CSV文件' })
    const buf = await file.toBuffer()
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheetName = wb.SheetNames[0]
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    let created = 0, updated = 0, skipped = 0
    const results = []
    for (const r of rows) {
      const name = String(r.name || r.姓名 || '').trim()
      const email = String(r.email || r.邮箱 || '').trim() || null
      const studentId = String(r.studentId || r.学号 || '').trim() || null
      let role = String(r.role || r.角色 || 'STUDENT').trim().toUpperCase()
      if (!['ADMIN','TEACHER','TA','STUDENT'].includes(role)) role = 'STUDENT'
      const password = String(r.password || r.密码 || 'pass1234')
      if (!name || (!email && !studentId)) { skipped++; continue }

      const passwordHash = await bcrypt.hash(password, 10)
      const existing = await fastify.prisma.user.findFirst({ where: { OR: [ email ? { email } : undefined, studentId ? { studentId } : undefined ].filter(Boolean) } })
      if (existing) {
        const u = await fastify.prisma.user.update({ where: { id: existing.id }, data: { name, email, studentId, role } })
        updated++
        results.push({ action: 'updated', id: u.id, studentId: u.studentId, email: u.email })
      } else {
        const u = await fastify.prisma.user.create({ data: { name, email, studentId, role, passwordHash } })
        created++
        results.push({ action: 'created', id: u.id, studentId: u.studentId, email: u.email })
      }
    }
    return { created, updated, skipped, total: rows.length, results }
  })
}

