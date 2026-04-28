// 管理指令待执行列表 API
// 路由: /api/admin-commands/pending

const ADMIN_COMMAND_PREFIX = 'admin_command:'

// 获取KV实例
function getKV(env) {
  if (typeof XBSKV !== 'undefined') return XBSKV
  if (env?.XBSKV) return env.XBSKV
  if (env?.wwyl) return env.wwyl
  if (env?.KV) return env.KV
  if (env?.WANWU_KV) return env.WANWU_KV
  return null
}

// JSON响应
function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

// 获取待执行的指令列表
export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '20'))
  
  const kv = getKV(env)
  if (!kv) {
    return jsonResp({ success: false, error: 'KV未绑定' }, 500)
  }
  
  let commands = []
  
  try {
    const list = await kv.list({ prefix: ADMIN_COMMAND_PREFIX, limit: 1000 })
    for (const key of list.keys || []) {
      const data = await kv.get(key.name, { type: 'json' })
      if (data && data.status === 'pending') {
        commands.push(data)
      }
    }
  } catch (e) {
    console.error('KV读取失败:', e)
  }
  
  // 按创建时间倒序
  commands.sort((a, b) => b.createdAt - a.createdAt)
  
  // 限制返回数量
  commands = commands.slice(0, limit)
  
  return jsonResp({ success: true, data: commands })
}

// 处理 OPTIONS 预检请求
export async function onRequestOptions(context) {
  return new Response(null, { headers: corsHeaders })
}