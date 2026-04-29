// 玩家列表 API (与 /api/users 相同)
// 路由: /api/players
// 注意: 此端点作为 /api/users 的别名，方便 WebUI 调用

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  const url = new URL(request.url)

  // GET /api/players - 获取玩家列表
  if (request.method === 'GET') {
    const auth = await requireAuth(request, env)
    if (!auth.valid) return jsonResp(request, { error: auth.error }, auth.status || 403)

    if (!kv) return jsonResp(request, { success: false, error: 'KV未绑定' }, 500)

    // 获取分页参数
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20')))
    const search = (url.searchParams.get('search') || '').trim().toLowerCase()

    // 从 KV 获取所有玩家数据
    const players = []
    try {
      const list = await kv.list({ prefix: PLAYER_DATA_PREFIX, limit: 1000 })
      for (const key of list.keys || []) {
        try {
          const data = await kv.get(key.name, { type: 'json' })
          if (!data) continue

          // 搜索过滤
          if (search) {
            const name = (data.name || '').toLowerCase()
            const uid = (data.uid || '').toLowerCase()
            if (!name.includes(search) && !uid.includes(search)) continue
          }

          players.push({
            uid: data.uid || key.name.replace(PLAYER_DATA_PREFIX, ''),
            name: data.name || '未知用户',
            level: Number(data.level || data.player?.level || 1),
            money: Number(data.money || 0),
            petCount: data.petCount || (data.pets?.length || 0) + (data.storage?.length || 0),
            guildId: data.guildId || data.guild || '',
            lastReportAt: data.lastReportAt || data.updatedAt || 0,
            topPet: data.topPet || null,
          })
        } catch (e) {
          console.error('解析玩家数据失败:', e)
        }
      }
    } catch (e) {
      console.error('获取玩家列表失败:', e)
      return jsonResp(request, { success: false, error: '获取玩家列表失败: ' + e.message }, 500)
    }

    // 按最后上报时间排序
    players.sort((a, b) => Number(b.lastReportAt || 0) - Number(a.lastReportAt || 0))

    // 分页
    const total = players.length
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const list = players.slice(start, end)

    return jsonResp(request, {
      success: true,
      data: {
        list,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        }
      }
    })
  }

  return jsonResp(request, { error: 'Method not allowed' }, 405)
}

export async function onRequestGet(context) {
  return onRequest(context)
}

export async function onRequestOptions(context) {
  return onRequest(context)
}
