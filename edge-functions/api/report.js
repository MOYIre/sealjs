// 数据上报 API
// 路由: /api/report

const REPORT_PREFIX = 'wwyl:report:'
const PLAYER_DATA_PREFIX = 'wwyl:player:'
const AUTH_SESSION_PREFIX = 'wwyl:auth:session:'
const AUTH_PERMANENT_TOKENS_KEY = 'wwyl:auth:permanent:tokens'

function getKV(env) {
  if (typeof XBSKV !== 'undefined') return XBSKV
  if (env?.XBSKV) return env.XBSKV
  if (env?.wwyl) return env.wwyl
  if (env?.KV) return env.KV
  if (env?.WANWU_KV) return env.WANWU_KV
  return null
}

async function requireAuth(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: '未提供认证信息', status: 401 }
  }

  const token = authHeader.slice(7)
  const kv = getKV(env)
  if (!kv) {
    return { valid: false, error: 'KV未绑定', status: 500 }
  }

  // 检查永久令牌
  const permanentTokens = await kv.get(AUTH_PERMANENT_TOKENS_KEY, { type: 'json' }).catch(() => []) || []
  const permanentToken = Array.isArray(permanentTokens) ? permanentTokens.find((item) => item?.token === token) : null
  if (permanentToken) {
    return {
      valid: true,
      user: {
        id: permanentToken.id,
        qq: permanentToken.createdBy,
        role: permanentToken.role || 'super_admin',
      }
    }
  }

  // 检查会话令牌
  const session = await kv.get(`${AUTH_SESSION_PREFIX}${token}`, { type: 'json' }).catch(() => null)
  if (!session?.user) {
    return { valid: false, error: '会话已过期', status: 401 }
  }

  return { valid: true, user: session.user }
}

function getOrigin(request) {
  return request.headers.get('Origin') || '*'
}

function corsHeaders(request) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function jsonResp(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(request),
  })
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(request) })
  }

  const kv = getKV(env)

  // POST /api/report - 接收数据上报
  if (request.method === 'POST') {
    const auth = await requireAuth(request, env)
    if (!auth.valid) return jsonResp(request, { error: auth.error }, auth.status || 403)

    const body = await request.json().catch(() => ({}))
    const { batch, source, version } = body

    if (!Array.isArray(batch) || batch.length === 0) {
      return jsonResp(request, { success: false, error: '上报数据不能为空' }, 400)
    }

    if (!kv) return jsonResp(request, { success: false, error: 'KV未绑定' }, 500)

    // 处理上报数据
    const results = []
    for (const item of batch) {
      try {
        const result = await processReport(kv, item)
        results.push({ id: item.uid || item.timestamp, type: item.type, success: true, result })
      } catch (e) {
        results.push({ id: item.uid || item.timestamp, type: item.type, success: false, error: e.message })
      }
    }

    return jsonResp(request, {
      success: true,
      message: `成功处理 ${results.filter(r => r.success).length}/${results.length} 条上报`,
      results
    })
  }

  return jsonResp(request, { error: 'Method not allowed' }, 405)
}

async function processReport(kv, item) {
  const { type, uid, timestamp, data } = item

  switch (type) {
    case 'player_data':
      // 存储玩家数据
      if (uid && data) {
        const key = `${PLAYER_DATA_PREFIX}${uid}`
        const existing = await kv.get(key, { type: 'json' }).catch(() => null)
        const playerData = {
          ...existing,
          ...data,
          uid,
          lastReportAt: timestamp || Date.now(),
          reportCount: (existing?.reportCount || 0) + 1,
        }
        await kv.put(key, JSON.stringify(playerData))
        return { stored: true, key }
      }
      break

    case 'battle_log':
      // 存储战斗日志
      if (data) {
        const key = `${REPORT_PREFIX}battle:${data.id || Date.now()}`
        await kv.put(key, JSON.stringify({
          ...data,
          reportedAt: timestamp || Date.now(),
        }), { expirationTtl: 86400 * 7 }) // 保留7天
        return { stored: true, key }
      }
      break

    default:
      // 存储通用数据
      const key = `${REPORT_PREFIX}${type}:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await kv.put(key, JSON.stringify({
        type,
        uid,
        timestamp: timestamp || Date.now(),
        data,
      }), { expirationTtl: 86400 }) // 保留1天
      return { stored: true, key }
  }

  return { stored: false, reason: 'invalid_data' }
}

export async function onRequestPost(context) {
  return onRequest(context)
}

export async function onRequestOptions(context) {
  return onRequest(context)
}
