// 管理指令回执 API
// 路由: /api/admin-commands/ack

// 获取KV实例
function getKV(env) {
  if (typeof XBSKV !== 'undefined') return XBSKV;
  if (env?.XBSKV) return env.XBSKV;
  if (env?.wwyl) return env.wwyl;
  if (env?.KV) return env.KV;
  if (env?.WANWU_KV) return env.WANWU_KV;
  return null;
}

// JSON响应
function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// 回执指令结果
export async function onRequestPost(context) {
  const { request, env } = context;
  
  const kv = getKV(env);
  if (!kv) {
    return jsonResp({ success: false, error: 'KV未绑定' }, 500);
  }
  
  try {
    const body = await request.json();
    const { cmdId, status, result } = body;
    
    if (!cmdId) {
      return jsonResp({ success: false, error: '指令ID不能为空' }, 400);
    }
    
    const key = `admin_command:${cmdId}`;
    const command = await kv.get(key, { type: 'json' });
    
    if (!command) {
      return jsonResp({ success: false, error: '指令不存在' }, 404);
    }
    
    // 更新指令状态
    command.status = status || 'completed';
    command.result = result || '';
    command.completedAt = Date.now();
    
    await kv.put(key, JSON.stringify(command));
    
    return jsonResp({ success: true, message: '回执成功' });
    
  } catch (e) {
    return jsonResp({ success: false, error: '请求体解析失败' }, 400);
  }
}

// 处理 OPTIONS 预检请求
export async function onRequestOptions(context) {
  return new Response(null, { 
    headers: { 
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    } 
  });
}