// 管理指令 API
// 路由: /api/admin-commands, /api/admin-commands/pending, /api/admin-commands/ack

const ADMIN_COMMAND_PREFIX = 'admin_command:'
const AUTH_SESSION_PREFIX = 'wwyl:auth:session:'
const AUTH_PERMANENT_TOKENS_KEY = 'wwyl:auth:permanent:tokens'

const ROLE_PERMISSION_MAP = {
  super_admin: ['*'],
  ops_admin: ['compensation:write'],
}

function generateId() {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getKV(env) {
  if (typeof XBSKV !== 'undefined') return XBSKV
  if (env?.XBSKV) return env.XBSKV
  if (env?.wwyl) return env.wwyl
  if (env?.KV) return env.KV
  if (env?.WANWU_KV) return env.WANWU_KV
  return null
}

function buildPermissions(user) {
  if (!user) return []
  const rolePerms = ROLE_PERMISSION_MAP[user.role] || []
  return Array.from(new Set([...rolePerms, ...(Array.isArray(user.permissions) ? user.permissions : [])]))
}

function hasPermission(user, permission) {
  const perms = buildPermissions(user)
  if (perms.includes('*')) return true
  if (perms.includes(permission)) return true
  const [domain] = permission.split(':')
  return perms.includes(`${domain}:*`)
}

async function requirePermission(request, env, permission) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: '未提供认证信息', status: 401 }
  }

  const token = authHeader.slice(7)
  const kv = getKV(env)
  if (!kv) {
    return { valid: false, error: 'KV未绑定', status: 500 }
  }

  const permanentTokens = await kv.get(AUTH_PERMANENT_TOKENS_KEY, { type: 'json' }).catch(() => []) || []
  const permanentToken = Array.isArray(permanentTokens) ? permanentTokens.find((item) => item?.token === token) : null
  if (permanentToken) {
    const user = {
      id: permanentToken.id,
      qq: permanentToken.createdBy,
      role: permanentToken.role || 'super_admin',
      permissions: permanentToken.permissions,
    }
    if (hasPermission(user, permission)) return { valid: true, user }
    return { valid: false, error: `缺少权限: ${permission}`, status: 403 }
  }

  const session = await kv.get(`${AUTH_SESSION_PREFIX}${token}`, { type: 'json' }).catch(() => null)
  const user = session?.user
  if (!user) return { valid: false, error: '会话已过期', status: 401 }
  if (hasPermission(user, permission)) return { valid: true, user }
  return { valid: false, error: `缺少权限: ${permission}`, status: 403 }
}

function getOrigin(request) {
  return request.headers.get('Origin') || '*'
}

function corsHeaders(request) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function jsonResp(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(request),
  })
}

function normalizeStatus(status) {
  return status === 'success' ? 'completed' : (status || 'completed')
}

async function listCommands(kv, status, limit) {
  const commands = []
  if (!kv) return commands

  const list = await kv.list({ prefix: ADMIN_COMMAND_PREFIX, limit: 1000 })
  for (const key of list.keys || []) {
    const data = await kv.get(key.name, { type: 'json' })
    if (!data) continue
    if (status && status !== 'all' && data.status !== status) continue
    commands.push(data)
  }

  commands.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
  return commands.slice(0, limit)
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(request) })
  }

  const kv = getKV(env)
  const url = new URL(request.url)
  const path = url.pathname
    .replace('/api/admin-commands-ack', '/ack')
    .replace('/api/admin-commands', '')
    .replace(/^\/+/, '')
  const parts = path.split('/').filter(Boolean)

  if (request.method === 'GET' && parts.length === 0) {
    const auth = await requirePermission(request, env, 'compensation:write')
    if (!auth.valid) return jsonResp(request, { error: auth.error }, auth.status || 403)

    const status = url.searchParams.get('status')
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')))
    const commands = await listCommands(kv, status, limit)
    return jsonResp(request, { success: true, data: commands })
  }

  if (request.method === 'POST' && parts.length === 0) {
    const auth = await requirePermission(request, env, 'compensation:write')
    if (!auth.valid) return jsonResp(request, { error: auth.error }, auth.status || 403)

    const body = await request.json().catch(() => ({}))
    const { cmdType, payload } = body
    if (!cmdType) return jsonResp(request, { success: false, error: '指令类型不能为空' }, 400)
    if (!kv) return jsonResp(request, { success: false, error: 'KV未绑定' }, 500)

    const command = {
      id: generateId(),
      cmdType,
      payload: payload || {},
      operator: auth.user.qq || auth.user.id || 'webui-admin',
      status: 'pending',
      createdAt: Date.now(),
    }

    await kv.put(`${ADMIN_COMMAND_PREFIX}${command.id}`, JSON.stringify(command))
    return jsonResp(request, { success: true, data: command })
  }

  if (request.method === 'DELETE' && parts.length === 0) {
    const auth = await requirePermission(request, env, 'compensation:write')
    if (!auth.valid) return jsonResp(request, { error: auth.error }, auth.status || 403)

    const id = url.searchParams.get('id')
    if (!id) return jsonResp(request, { success: false, error: '指令ID不能为空' }, 400)
    if (!kv) return jsonResp(request, { success: false, error: 'KV未绑定' }, 500)

    const key = `${ADMIN_COMMAND_PREFIX}${id}`
    const existing = await kv.get(key, { type: 'json' })
    if (!existing) return jsonResp(request, { success: false, error: '指令不存在' }, 404)

    await kv.delete(key)
    return jsonResp(request, { success: true, message: '删除成功' })
  }

  if (request.method === 'GET' && parts.length === 1 && parts[0] === 'pending') {
    const auth = await requirePermission(request, env, 'compensation:write')
    if (!auth.valid) return jsonResp(request, { error: auth.error }, auth.status || 403)

    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')))
    const commands = await listCommands(kv, 'pending', limit)
    return jsonResp(request, { success: true, data: commands })
  }

  if (request.method === 'POST' && parts.length === 1 && parts[0] === 'ack') {
    const auth = await requirePermission(request, env, 'compensation:write')
    if (!auth.valid) return jsonResp(request, { error: auth.error }, auth.status || 403)

    const body = await request.json().catch(() => ({}))
    const { cmdId, result } = body
    const status = normalizeStatus(body.status)
    if (!cmdId) return jsonResp(request, { success: false, error: '指令ID不能为空' }, 400)
    if (!kv) return jsonResp(request, { success: false, error: 'KV未绑定' }, 500)

    const key = `${ADMIN_COMMAND_PREFIX}${cmdId}`
    const command = await kv.get(key, { type: 'json' })
    if (!command) return jsonResp(request, { success: false, error: '指令不存在' }, 404)

    command.status = status === 'failed' ? 'failed' : 'completed'
    command.result = result || body.error || ''
    command.completedAt = Date.now()
    await kv.put(key, JSON.stringify(command))

    return jsonResp(request, { success: true, message: '回执成功' })
  }

  return jsonResp(request, { error: 'Method not allowed' }, 405)
}

export async function onRequestGet(context) {
  return onRequest(context)
}

export async function onRequestPost(context) {
  return onRequest(context)
}

export async function onRequestDelete(context) {
  return onRequest(context)
}

export async function onRequestOptions(context) {
  return onRequest(context)
}
