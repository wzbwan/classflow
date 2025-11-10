const API_BASE = '' // proxied to 3001 by Vite

let token = localStorage.getItem('token') || ''

export function setToken(t) {
  token = t
  if (t) localStorage.setItem('token', t)
  else localStorage.removeItem('token')
}

async function req(path, opts = {}) {
  const headers = opts.headers || {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const res = await fetch(API_BASE + path, { ...opts, headers, body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  const ct = res.headers.get('Content-Type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

function extractFilename(res) {
  const cd = res.headers.get('Content-Disposition') || ''
  let match = cd.match(/filename\*=UTF-8''([^;]+)/i)
  if (match) return decodeURIComponent(match[1])
  match = cd.match(/filename="?([^";]+)"?/i)
  if (match) return match[1]
  return 'download'
}

export const api = {
  login: (identifier, password) => req('/api/auth/login', { method: 'POST', body: { id: identifier, password } }),
  me: () => req('/api/auth/me'),
  myProfile: () => req('/api/users/me'),
  updateProfile: (data) => req('/api/users/me', { method: 'PUT', body: data }),
  courses: () => req('/api/courses'),
  createCourse: (data) => req('/api/courses', { method: 'POST', body: data }),
  listAssignments: (courseId) => req(`/api/courses/${courseId}/assignments`),
  createAssignment: (courseId, data) => req(`/api/courses/${courseId}/assignments`, { method: 'POST', body: data }),
  assignment: (id) => req(`/api/assignments/${id}`),
  updateAssignment: (id, data) => req(`/api/assignments/${id}`, { method: 'PUT', body: data }),
  deleteAssignment: (id) => req(`/api/assignments/${id}`, { method: 'DELETE' }),
  listMaterials: (assignmentId) => req(`/api/assignments/${assignmentId}/materials`),
  uploadMaterials: (assignmentId, files) => {
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    return req(`/api/assignments/${assignmentId}/materials`, { method: 'POST', body: fd })
  },
  deleteMaterial: (assignmentId, idx) => req(`/api/assignments/${assignmentId}/materials/${idx}`, { method: 'DELETE' }),
  downloadMaterial: async (assignmentId, idx, options = {}) => {
    const params = new URLSearchParams()
    if (options.watermark) params.set('watermark', '1')
    const query = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`/api/assignments/${assignmentId}/materials/${idx}/download${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error('下载失败')
    const blob = await res.blob()
    return { blob, filename: extractFilename(res) }
  },
  submit: (assignmentId, formData) => req(`/api/assignments/${assignmentId}/submissions`, { method: 'POST', body: formData }),
  grade: (submissionId, data) => req(`/api/submissions/${submissionId}/grade`, { method: 'POST', body: data }),
  gradebookCsv: (courseId) => fetch(`/api/courses/${courseId}/gradebook?format=csv`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.text()),
  mySubmissions: (assignmentId) => req(`/api/assignments/${assignmentId}/my-submissions`),
  listAssignmentSubmissions: (assignmentId) => req(`/api/assignments/${assignmentId}/submissions`),
  rosterImport: (courseId, file) => {
    const fd = new FormData(); fd.append('file', file);
    return req(`/api/courses/${courseId}/enrollments:import`, { method: 'POST', body: fd })
  },
  listSubmissionFiles: (submissionId) => req(`/api/submissions/${submissionId}/files`),
  downloadSubmissionFile: async (submissionId, idx) => {
    const res = await fetch(`/api/submissions/${submissionId}/files/${idx}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error('下载失败')
    const blob = await res.blob()
    return { blob, filename: extractFilename(res) }
  },
  exportAssignmentZip: async (assignmentId) => {
    const res = await fetch(`/api/assignments/${assignmentId}/submissions/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error('导出失败')
    const blob = await res.blob()
    return { blob, filename: extractFilename(res) }
  },
  plagiarismCheck: (assignmentId) => req(`/api/assignments/${assignmentId}/plagiarism-check`, { method: 'POST' }),
  // Admin
  adminListUsers: (params={}) => {
    const qs = new URLSearchParams(params).toString()
    return req('/api/admin/users' + (qs?`?${qs}`:''))
  },
  adminCreateUser: (data) => req('/api/admin/users', { method: 'POST', body: data }),
  adminUpdateUser: (id, data) => req(`/api/admin/users/${id}`, { method: 'PUT', body: data }),
  adminImportUsers: (file) => { const fd = new FormData(); fd.append('file', file); return req('/api/admin/users:import', { method: 'POST', body: fd }) },
  adminTemplate: (format='xlsx') => fetch(`/api/admin/users/template?format=${format}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(res => res.blob())
}
