// 管理指令 API
// 路由: /api/admin-commands

// 生成唯一ID
function generateId() {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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

// 获取所有指令
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  const kv = getKV(env);
  if (!kv) {
    return jsonResp({ success: false, error: 'KV未绑定' }, 500);
  }

  let commands = [];

  try {
    const list = await kv.list({ prefix: 'admin_command:', limit: 1000 });
    for (const key of list.keys || []) {
      const data = await kv.get(key.name, { type: 'json' });
      if (data) commands.push(data);
    }
  } catch (e) {
    console.error('KV读取失败:', e);
  }

  // 按状态过滤
  if (status && status !== 'all') {
    commands = commands.filter(cmd => cmd.status === status);
  }

  // 按创建时间倒序
  commands.sort((a, b) => b.createdAt - a.createdAt);

  return jsonResp({ success: true, data: commands });
}

// 创建新指令
export async function onRequestPost(context) {
  const { request, env } = context;
  
  const kv = getKV(env);
  if (!kv) {
    return jsonResp({ success: false, error: 'KV未绑定' }, 500);
  }

  try {
    const body = await request.json();
    const { cmdType, payload } = body;
    
    if (!cmdType) {
      return jsonResp({ success: false, error: '指令类型不能为空' }, 400);
    }
    
    const command = {
      id: generateId(),
      cmdType,
      payload: payload || {},
      operator: body.operator || 'webui-admin',
      status: 'pending',
      createdAt: Date.now()
    };
    
    await kv.put(`admin_command:${command.id}`, JSON.stringify(command));
    
    return jsonResp({ success: true, data: command });
    
  } catch (e) {
    return jsonResp({ success: false, error: '请求体解析失败' }, 400);
  }
}

// 删除指令
export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  const kv = getKV(env);
  if (!kv) {
    return jsonResp({ success: false, error: 'KV未绑定' }, 500);
  }

  if (!id) {
    return jsonResp({ success: false, error: '指令ID不能为空' }, 400);
  }

  try {
    const key = `admin_command:${id}`;
    const existing = await kv.get(key, { type: 'json' });
    
    if (!existing) {
      return jsonResp({ success: false, error: '指令不存在' }, 404);
    }
    
    await kv.delete(key);
    
    return jsonResp({ success: true, message: '删除成功' });
  } catch (e) {
    return jsonResp({ success: false, error: '删除失败: ' + e.message }, 500);
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