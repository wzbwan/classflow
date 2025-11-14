import React, { useEffect, useState } from 'react'
import { api, setToken } from './api.js'
import './styles.css'

export default function App() {
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('login')
  const [course, setCourse] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [courseVersion, setCourseVersion] = useState(0)

  useEffect(() => {
    api.me().then((res) => {
      setUser(res.user)
      setPage('dashboard')
    }).catch(() => {})
  }, [])

  const handleLogout = () => {
    setToken('')
    setUser(null)
    setCourse(null)
    setAssignment(null)
    setPage('login')
  }

  const handleBack = () => {
    if (page === 'assignment') {
      setAssignment(null)
      setPage('course')
    } else if (page === 'course') {
      setCourse(null)
      setPage('dashboard')
    }
  }

  if (!user) return <Login onLoggedIn={(u) => { setUser(u); setPage('dashboard') }} />

  const navTitle = page === 'dashboard'
    ? '仪表盘'
    : page === 'course'
      ? (course?.name || '课程详情')
      : (assignment?.title || '作业详情')
  const navSubtitle = page === 'course' ? (course?.code || '') : page === 'assignment' ? (course?.name || '') : '欢迎回来'
  const canGoBack = page !== 'dashboard'

  return (
    <div className="app-shell">
      <TopNav
        user={user}
        title={navTitle}
        subtitle={navSubtitle}
        canGoBack={canGoBack}
        onBack={handleBack}
        onLogout={handleLogout}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
      />
      <main className="main-content">
        {page === 'dashboard' && (
          <Dashboard
            user={user}
            onEnterCourse={(c) => {
              setCourse(c)
              setPage('course')
            }}
          />
        )}
        {page === 'course' && course && (
          <Course
            user={user}
            course={course}
            refreshKey={courseVersion}
            onAssignmentsChange={() => setCourseVersion((v) => v + 1)}
            onOpenAssignment={(a) => {
              setAssignment(a)
              setPage('assignment')
            }}
          />
        )}
        {page === 'assignment' && assignment && (
          <Assignment
            assignment={assignment}
            course={course}
            user={user}
            onAssignmentChanged={() => setCourseVersion((v) => v + 1)}
            onAssignmentDeleted={() => {
              setCourseVersion((v) => v + 1)
              setAssignment(null)
              setPage('course')
            }}
          />
        )}
      </main>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {adminOpen && user.role === 'ADMIN' && <AdminUsersModal onClose={() => setAdminOpen(false)} />}
    </div>
  )
}

function TopNav({ user, title, subtitle, canGoBack, onBack, onLogout, onOpenProfile, onOpenAdmin }) {
  return (
    <header className="topnav">
      <div className="brand">ClassFlow<span>lite</span></div>
      <div className="nav-title">
        {canGoBack && (
          <button className="icon-button" aria-label="返回" onClick={onBack}>
            ←
          </button>
        )}
        <div>
          <p className="eyebrow">{subtitle || 'Overview'}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="nav-actions">
        {user.role === 'ADMIN' && (
          <button className="btn-ghost" onClick={onOpenAdmin}>管理账号</button>
        )}
        <button className="btn-ghost" onClick={onOpenProfile}>{user.name}</button>
        <button className="btn-primary" onClick={onLogout}>退出</button>
      </div>
    </header>
  )
}

function Login({ onLoggedIn }) {
  const [id, setId] = useState('s001')
  const [password, setPassword] = useState('pass1234')
  const [error, setError] = useState('')

  return (
    <div className="login-screen">
      <div className="login-card card">
        <p className="eyebrow">课堂数据管理</p>
        <h1>欢迎回来</h1>
        <p className="muted">使用学号或邮箱快速登录</p>
        <label>学号 / 邮箱</label>
        <input value={id} onChange={(e) => setId(e.target.value)} />
        <br/>
        <label>密码</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="alert danger">{error}</div>}
        <button
          className="btn-primary wide"
          onClick={async () => {
            try {
              setError('')
              const res = await api.login(id, password)
              setToken(res.token)
              onLoggedIn(res.user)
            } catch (e) {
              setError(e.message)
            }
          }}
        >
          登录
        </button>
        {/* <p className="muted tiny">示例账号：s001 / pass1234 · t001 / pass1234 · admin / pass1234</p> */}
      </div>
    </div>
  )
}

function Dashboard({ user, onEnterCourse }) {
  const [courses, setCourses] = useState([])
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '示例课程', term: '2025春', code: 'SE101' })

  const load = () => api.courses().then(setCourses).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  const canCreate = user.role === 'TEACHER' || user.role === 'ADMIN'

  return (
    <div className="page">
      <section className="card hero">
        <div>
          <p className="eyebrow">Hi {user.name}</p>
          <h1>今日课堂概览</h1>
          <p className="muted">快速查看你的课程、作业与学生动态。</p>
        </div>
        <div className="hero-metrics">
          <div>
            <span>课程数</span>
            <strong>{courses.length}</strong>
          </div>
          <div>
            <span>角色</span>
            <strong>{user.role}</strong>
          </div>
        </div>
      </section>

      {error && <div className="alert danger">{error}</div>}

      <section className="card">
        <div className="section-header">
          <div>
            <h3>我的课程</h3>
            <p className="muted">点击进入课程详情与作业</p>
          </div>
          <button className="btn-ghost" onClick={load}>刷新</button>
        </div>
        <div className="course-grid">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} onEnter={() => onEnterCourse(c)} />
          ))}
          {courses.length === 0 && <div className="muted">暂无课程，先创建或等待加入。</div>}
        </div>
      </section>

      {canCreate && (
        <section className="card">
          <div className="section-header">
            <div>
              <h3>创建新课程</h3>
              <p className="muted">填写基本信息即可开始</p>
            </div>
          </div>
          <div className="form-grid">
            <label>课程名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>学期<input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></label>
            <label>课程代码<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
            <button className="btn-primary" onClick={async () => {
              await api.createCourse(form)
              const next = await api.courses()
              setCourses(next)
            }}>创建课程</button>
          </div>
        </section>
      )}
    </div>
  )
}

function Course({ course, user, refreshKey, onAssignmentsChange, onOpenAssignment }) {
  const [assignments, setAssignments] = useState([])
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '新作业', description: '描述', dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16) })

  const isStaff = ['TEACHER', 'TA', 'OWNER'].includes(course.roleInCourse) || user.role === 'ADMIN'

  const loadAssignments = () => api.listAssignments(course.id).then(setAssignments).catch((e) => setError(e.message))

  useEffect(() => {
    loadAssignments()
  }, [course.id, refreshKey])

  return (
    <div className="page">
      <section className="card">
        <div className="section-header">
          <div>
            <p className="eyebrow">{course.term}</p>
            <h2>{course.name}</h2>
            <p className="muted">课程代码：{course.code} · 我的身份：{course.roleInCourse}</p>
          </div>
          <div className="action-row">
            {isStaff && (
              <label className="btn-secondary">
                导入名册 CSV
                <input type="file" accept=".csv" onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    await api.rosterImport(course.id, file)
                    alert('导入成功')
                  } catch (err) {
                    alert(err.message)
                  } finally {
                    e.target.value = ''
                  }
                }} />
              </label>
            )}
            {isStaff && (
              <button className="btn-ghost" onClick={async () => {
                const csv = await api.gradebookCsv(course.id)
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `gradebook-course-${course.id}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}>导出成绩簿</button>
            )}
            <button className="btn-ghost" onClick={loadAssignments}>刷新</button>
          </div>
        </div>
      </section>

      {isStaff && (
        <section className="card">
          <div className="section-header">
            <div>
              <h3>布置新作业</h3>
              <p className="muted">可在发布后上传资料</p>
            </div>
          </div>
          <div className="form-grid">
            <label>标题<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>截止时间<input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
            <label>描述<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <button className="btn-primary" onClick={async () => {
              await api.createAssignment(course.id, { ...form, allowLate: true, maxPoints: 100 })
              await loadAssignments()
              onAssignmentsChange?.()
            }}>创建作业</button>
          </div>
        </section>
      )}

      <section className="card table-card">
        <div className="section-header">
          <div>
            <h3>作业列表</h3>
            <p className="muted">点击查看详情、上传资料或提交</p>
          </div>
        </div>
        {error && <div className="alert danger">{error}</div>}
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>作业</th>
                <th>截止时间</th>
                <th>状态 / 资料</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <AssignmentRow key={a.id} a={a} user={user} course={course} onOpenAssignment={onOpenAssignment} />
              ))}
              {assignments.length === 0 && (
                <tr><td colSpan={4}>暂无作业</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Assignment({ assignment, course, user, onAssignmentChanged, onAssignmentDeleted }) {
  const [detail, setDetail] = useState(assignment)
  const [history, setHistory] = useState([])
  const [materials, setMaterials] = useState(assignment?.materials || [])
  const [msg, setMsg] = useState('')
  const [checkingPlagiarism, setCheckingPlagiarism] = useState(false)
  const [plagiarismResult, setPlagiarismResult] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [editForm, setEditForm] = useState({
    title: assignment.title,
    description: assignment.description,
    dueAt: toLocalInput(assignment.dueAt),
    allowLate: assignment.allowLate,
    maxPoints: assignment.maxPoints,
  })
  const [submitState, setSubmitState] = useState({ hasFile: false, externalLink: '' })

  const isStudent = user.role === 'STUDENT'
  const isStaff = ['TEACHER', 'TA', 'OWNER'].includes(course?.roleInCourse) || user.role === 'ADMIN'

  const fetchDetail = async () => {
    const res = await api.assignment(assignment.id)
    setDetail(res)
    setMaterials(res.materials || [])
    setEditForm({
      title: res.title,
      description: res.description,
      dueAt: toLocalInput(res.dueAt),
      allowLate: res.allowLate,
      maxPoints: res.maxPoints,
    })
  }

  useEffect(() => {
    fetchDetail()
    if (isStudent) {
      api.mySubmissions(assignment.id).then(setHistory).catch(() => {})
    }
  }, [assignment.id, isStudent])

  const handleSubmit = async (ev) => {
    ev.preventDefault()
    const fd = new FormData(ev.target)
    try {
      const res = await api.submit(assignment.id, fd)
      setMsg(`提交成功：版本 ${res.version}`)
      const list = await api.mySubmissions(assignment.id)
      setHistory(list)
      ev.target.reset()
      setSubmitState({ hasFile: false, externalLink: '' })
    } catch (err) {
      setMsg(err.message)
    }
  }

  const uploadMaterials = async (ev) => {
    const files = Array.from(ev.target.files || [])
    if (!files.length) return
    try {
      const res = await api.uploadMaterials(assignment.id, files)
      setMaterials(res.materials || [])
      ev.target.value = ''
      onAssignmentChanged?.()
    } catch (err) {
      alert(err.message)
    }
  }

  const deleteMaterial = async (idx) => {
    if (!window.confirm('确定删除该资料吗？')) return
    try {
      const res = await api.deleteMaterial(assignment.id, idx)
      setMaterials(res.materials || [])
      onAssignmentChanged?.()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleMaterialDownload = async (idx, { watermark = false } = {}) => {
    const { blob, filename } = await api.downloadMaterial(assignment.id, idx, { watermark })
    downloadBlob(blob, filename)
  }

  const handleUpdateAssignment = async () => {
    await api.updateAssignment(assignment.id, {
      title: editForm.title,
      description: editForm.description,
      dueAt: editForm.dueAt ? new Date(editForm.dueAt).toISOString() : undefined,
      allowLate: editForm.allowLate,
      maxPoints: Number(editForm.maxPoints) || 0,
    })
    await fetchDetail()
    onAssignmentChanged?.()
    alert('作业已更新')
  }

  const handleDeleteAssignment = async () => {
    if (!window.confirm('确定删除该作业？该操作不可恢复。')) return
    await api.deleteAssignment(assignment.id)
    onAssignmentDeleted?.()
    alert('作业已删除')
  }

  const handleExportZip = async () => {
    setExporting(true)
    try {
      const { blob, filename } = await api.exportAssignmentZip(assignment.id)
      downloadBlob(blob, filename)
    } catch (err) {
      alert(err.message)
    } finally {
      setExporting(false)
    }
  }

  const runPlagiarism = async () => {
    setCheckingPlagiarism(true)
    try {
      const result = await api.plagiarismCheck(assignment.id)
      setPlagiarismResult(result)
    } catch (err) {
      alert(err.message)
    } finally {
      setCheckingPlagiarism(false)
    }
  }

  return (
    <div className="page">
      <section className="card assignment-hero">
        <div>
          <p className="eyebrow">截止 {new Date(detail.dueAt).toLocaleString()}</p>
          <h1>{detail.title}</h1>
          <p className="muted">满分 {detail.maxPoints} 分 · {detail.allowLate ? '允许迟交' : '不允许迟交'}</p>
        </div>
      </section>

      <div className="split-columns">
        <section className="card">
          <h3>作业说明</h3>
          <p>{detail.description}</p>
        </section>
        <section className="card">
          <div className="section-header">
            <div>
              <h3>课程资料</h3>
              <p className="muted">教师上传的附件</p>
            </div>
            {isStaff && (
              <label className="btn-secondary">
                上传资料
                <input type="file" multiple onChange={uploadMaterials} />
              </label>
            )}
          </div>
          {materials.length === 0 && <div className="muted">暂无资料</div>}
          <ul className="material-list">
            {materials.map((m) => (
              <li key={m.idx}>
                <div>
                  <strong>{m.filename}</strong>
                  <span className="muted">{m.size ? formatSize(m.size) : ''}</span>
                </div>
                <div className="material-actions">
                  <button className="btn-ghost" onClick={() => handleMaterialDownload(m.idx)}>下载</button>
                  {isStudent && /\.xlsx$/i.test(m.filename) && (
                    <button className="btn-link" onClick={() => handleMaterialDownload(m.idx, { watermark: true })}>加水印下载</button>
                  )}
                  {isStaff && (
                    <button className="btn-link danger" onClick={() => deleteMaterial(m.idx)}>删除</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {isStaff && (
        <section className="card">
          <div className="section-header">
            <div>
              <h3>批量导出 & 查重</h3>
              <p className="muted">一键导出全部作业，或运行重复提交检测</p>
            </div>
            <div className="action-row">
              <button className="btn-secondary" onClick={handleExportZip} disabled={exporting}>{exporting ? '导出中...' : '打包导出'}</button>
              <button className="btn-ghost" onClick={runPlagiarism} disabled={checkingPlagiarism}>{checkingPlagiarism ? '查重中...' : '查重'}</button>
            </div>
          </div>
          {plagiarismResult && (
            <div>
              <p className="muted">检测到 {plagiarismResult.matches.length} 组疑似重复（共分析 {plagiarismResult.totalFiles} 份文件）</p>
              {plagiarismResult.matches.length === 0 ? (
                <div className="alert success">未发现重复文件</div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>文件哈希</th><th>涉及学生</th></tr></thead>
                    <tbody>
                      {plagiarismResult.matches.map((group, idx) => (
                        <tr key={idx}>
                          <td className="tiny">{group[0].hash.slice(0, 12)}...</td>
                          <td>{group.map((g) => `${g.student.studentId || g.student.id} ${g.student.name || ''}`).join(' vs ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {isStaff && (
        <section className="card">
          <div className="section-header">
            <div>
              <h3>编辑作业</h3>
              <p className="muted">更新标题、描述、截止时间等</p>
            </div>
            <button className="btn-danger" onClick={handleDeleteAssignment}>删除作业</button>
          </div>
          <div className="form-grid">
            <label>作业名称
              <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </label>
            <label>截止时间
              <input type="datetime-local" value={editForm.dueAt} onChange={(e) => setEditForm({ ...editForm, dueAt: e.target.value })} />
            </label>
            <label>允许迟交
              <select value={editForm.allowLate ? 'true' : 'false'} onChange={(e) => setEditForm({ ...editForm, allowLate: e.target.value === 'true' })}>
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            </label>
            <label>满分
              <input type="number" value={editForm.maxPoints} onChange={(e) => setEditForm({ ...editForm, maxPoints: e.target.value })} />
            </label>
            <label>作业说明
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </label>
            <button className="btn-primary" type="button" onClick={handleUpdateAssignment}>保存修改</button>
          </div>
        </section>
      )}

      {isStudent && (
        <section className="card">
          <div className="section-header">
            <div>
              <h3>提交作业</h3>
              <p className="muted">多次提交将保留最新版本</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>上传文件
              <input
                type="file"
                name="files"
                multiple
                onChange={(e) => {
                  const hasFile = e.target.files && e.target.files.length > 0
                  setSubmitState((prev) => ({ ...prev, hasFile }))
                }}
              />
            </label>
            <label>外链
              <input
                name="external_link"
                placeholder="https://..."
                onChange={(e) => {
                  const value = e.target.value
                  setSubmitState((prev) => ({ ...prev, externalLink: value }))
                }}
              />
            </label>
            <button
              className="btn-primary"
              type="submit"
              disabled={!submitState.hasFile && !submitState.externalLink.trim()}
            >
              提交
            </button>
          </form>
          {msg && <div className="alert success">{msg}</div>}
          <h4>提交历史</h4>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>版本</th><th>时间</th><th>附件</th><th>成绩</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>v{h.version}</td>
                    <td>{new Date(h.submittedAt).toLocaleString()}</td>
                    <td>
                      {(h.files || []).length > 0 ? h.files.map((f, i) => (
                        <button key={i} className="btn-link" onClick={async () => {
                          const { blob, filename } = await api.downloadSubmissionFile(h.id, i)
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = filename
                          a.click()
                          URL.revokeObjectURL(url)
                        }}>{f.filename}</button>
                      )) : (h.externalLink ? <a className="btn-link" href={h.externalLink} target="_blank">外链</a> : '—')}
                    </td>
                    <td>{h.grade ? h.grade.score : '—'}</td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={4}>暂无提交</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function AssignmentRow({ a, user, course, onOpenAssignment }) {
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (user.role === 'STUDENT') {
      api.mySubmissions(a.id).then((h) => {
        setStatus(h && h.length > 0 ? `已提交 v${h[0].version}` : '未提交')
      }).catch(() => {})
    }
  }, [a.id, user.role])

  const materialCount = a.materials ? a.materials.length : 0
  const isStaff = ['TEACHER', 'TA', 'OWNER'].includes(course.roleInCourse) || user.role === 'ADMIN'

  return (
    <tr>
      <td>
        <div className="table-title">{a.title}</div>
        <div className="muted tiny">{a.description?.slice(0, 60)}</div>
      </td>
      <td>{new Date(a.dueAt).toLocaleString()}</td>
      <td>
        {user.role === 'STUDENT' ? status : '—'}
        {materialCount > 0 && <span className="tag">资料 {materialCount}</span>}
      </td>
      <td>
        <button className="btn-link" onClick={() => onOpenAssignment(a)}>详情</button>
        {isStaff && <TeacherSubmissionButton assignmentId={a.id} />}
      </td>
    </tr>
  )
}

function TeacherSubmissionButton({ assignmentId }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn-link" onClick={() => setOpen(true)}>查看提交</button>
      {open && <SubmissionPanel assignmentId={assignmentId} onClose={() => setOpen(false)} />}
    </>
  )
}

function SubmissionPanel({ assignmentId, onClose }) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    api.listAssignmentSubmissions(assignmentId).then(setRows).catch((e) => setErr(e.message))
  }, [assignmentId])

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog large">
        <div className="modal-header">
          <div>
            <h3>提交列表</h3>
            <p className="muted">显示最新版本，支持直接评分</p>
          </div>
          <button className="icon-button" onClick={onClose}>✕</button>
        </div>
        {err && <div className="alert danger">{err}</div>}
        <div className="modal-scroll">
          <table className="table">
            <thead>
              <tr><th>学号</th><th>姓名</th><th>版本</th><th>时间</th><th>附件</th><th>得分</th><th>操作</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SubmissionRow key={row.student.id} row={row} />
              ))}
              {rows.length === 0 && <tr><td colSpan={7}>暂无提交</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SubmissionRow({ row }) {
  const [score, setScore] = useState(row.grade?.score || '')
  const sub = row.submission

  return (
    <tr>
      <td>{row.student.studentId || row.student.id}</td>
      <td>{row.student.name}</td>
      <td>{sub ? 'v' + sub.version : '—'}</td>
      <td>{sub ? new Date(sub.submittedAt).toLocaleString() : '—'}</td>
      <td>
        {sub && sub.files && sub.files.length > 0 ? sub.files.map((f, i) => (
          <button
            key={i}
            className="btn-link"
            onClick={async () => {
              const { blob, filename } = await api.downloadSubmissionFile(sub.id, i)
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = filename
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            {f.filename}
          </button>
        )) : (sub?.externalLink ? <a className="btn-link" href={sub.externalLink} target="_blank">外链</a> : '—')}
      </td>
      <td>
        <input className="score-input" value={score} onChange={(e) => setScore(e.target.value)} />
      </td>
      <td>
        {sub ? (
          <button className="btn-ghost" onClick={async () => {
            await api.grade(sub.id, { score: Number(score) || 0 })
            alert('已保存')
          }}>保存</button>
        ) : '—'}
      </td>
    </tr>
  )
}

function ProfileModal({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '' })
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '' })

  useEffect(() => {
    api.myProfile().then((p) => {
      setForm({ name: p.name || '', email: p.email || '' })
      setLoading(false)
    })
  }, [])

  if (loading) return null

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog">
        <div className="modal-header">
          <div>
            <h3>我的资料</h3>
            <p className="muted">更新个人信息与密码</p>
          </div>
          <button className="icon-button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-scroll">
          <div className="form-grid single">
            <label>姓名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>邮箱<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <button className="btn-primary" onClick={async () => {
              await api.updateProfile(form)
              alert('已保存')
            }}>保存基本信息</button>
          </div>
          <hr />
          <div className="form-grid single">
            <label>旧密码<input type="password" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} /></label>
            <label>新密码<input type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} /></label>
            <button className="btn-secondary" onClick={async () => {
              await api.updateProfile(pwd)
              setPwd({ oldPassword: '', newPassword: '' })
              alert('密码已修改')
            }}>修改密码</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminUsersModal({ onClose }) {
  const [list, setList] = useState([])
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ name: '', email: '', studentId: '', role: 'STUDENT', password: 'pass1234' })

  const refresh = () => api.adminListUsers({ role, q }).then(setList)
  useEffect(() => { refresh() }, [])

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog large">
        <div className="modal-header">
          <div>
            <h3>账号管理</h3>
            <p className="muted">批量导入或手动创建教师、学生</p>
          </div>
          <button className="icon-button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-scroll">
          <div className="toolbar">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">全部角色</option>
              <option>ADMIN</option>
              <option>TEACHER</option>
              <option>TA</option>
              <option>STUDENT</option>
            </select>
            <input placeholder="搜索 学号/姓名/邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-ghost" onClick={refresh}>查询</button>
            <div className="spacer" />
            <button className="btn-ghost" onClick={async () => {
              const blob = await api.adminTemplate('xlsx')
              downloadBlob(blob, 'users_template.xlsx')
            }}>Excel 模板</button>
            <button className="btn-ghost" onClick={async () => {
              const blob = await api.adminTemplate('csv')
              downloadBlob(blob, 'users_template.csv')
            }}>CSV 模板</button>
            <label className="btn-primary">
              批量导入
              <input type="file" accept=".xlsx,.csv" onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const res = await api.adminImportUsers(file)
                  alert(`导入完成：新增${res.created}，更新${res.updated}，跳过${res.skipped}`)
                  refresh()
                } catch (err) {
                  alert(err.message)
                } finally {
                  e.target.value = ''
                }
              }} />
            </label>
          </div>

          <div className="form-grid single">
            <label>姓名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>邮箱<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>学号/工号<input value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} /></label>
            <label>角色<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>STUDENT</option>
              <option>TA</option>
              <option>TEACHER</option>
              <option>ADMIN</option>
            </select></label>
            <label>初始密码<input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <button className="btn-primary" onClick={async () => {
              if (!form.name || (!form.email && !form.studentId)) return alert('姓名与(邮箱/学号)必填')
              await api.adminCreateUser(form)
              setForm({ name: '', email: '', studentId: '', role: 'STUDENT', password: 'pass1234' })
              refresh()
            }}>创建账号</button>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>学号/工号</th><th>姓名</th><th>邮箱</th><th>角色</th><th>创建时间</th></tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.studentId || '—'}</td>
                    <td>{u.name}</td>
                    <td>{u.email || '—'}</td>
                    <td>{u.role}</td>
                    <td>{new Date(u.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={6}>暂无数据</td></tr>}
              </tbody>
            </table>
          </div>

          <p className="muted tiny">模板字段：studentId, name, email, role, password · 角色可选 ADMIN/TEACHER/TA/STUDENT · 默认密码 pass1234。</p>
        </div>
      </div>
    </div>
  )
}

function CourseCard({ course, onEnter }) {
  return (
    <div className="course-card" onClick={onEnter}>
      <div className="course-card__head">
        <span className="tag">{course.roleInCourse}</span>
        <p className="muted tiny">{course.term}</p>
      </div>
      <h4>{course.name}</h4>
      <p className="muted">{course.code}</p>
    </div>
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatSize(size) {
  if (!size && size !== 0) return ''
  if (size > 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB'
  if (size > 1024) return (size / 1024).toFixed(1) + ' KB'
  return size + ' B'
}

function toLocalInput(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}
