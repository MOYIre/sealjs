// 管理指令 API (使用KV存储)
// 路由: /api/admin-commands

// 生成唯一ID
function generateId() {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 获取所有指令
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  
  let commands = [];
  
  try {
    // 从KV获取所有指令
    const list = await env.XBSKV.list({ prefix: 'admin_command:' });
    
    for (const key of list.keys) {
      const data = await env.XBSKV.get(key.name, 'json');
      if (data) commands.push(data);
    }
  } catch (e) {
    console.error('KV读取失败:', e);
    // 回退到内存
    commands = [];
  }
  
  // 按状态过滤
  if (status && status !== 'all') {
    commands = commands.filter(cmd => cmd.status === status);
  }
  
  // 按创建时间倒序
  commands.sort((a, b) => b.createdAt - a.createdAt);
  
  return new Response(JSON.stringify({
    success: true,
    data: commands
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 创建新指令
export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const { cmdType, payload } = body;
    
    if (!cmdType) {
      return new Response(JSON.stringify({
        success: false,
        error: '指令类型不能为空'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const command = {
      id: generateId(),
      cmdType,
      payload: payload || {},
      operator: body.operator || 'webui-admin',
      status: 'pending',
      createdAt: Date.now()
    };
    
    // 存储到KV
    try {
      await env.XBSKV.put(`admin_command:${command.id}`, JSON.stringify(command));
    } catch (e) {
      console.error('KV存储失败:', e);
    }
    
    return new Response(JSON.stringify({
      success: true,
      data: command
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: '请求体解析失败'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 删除指令
export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  
  if (!id) {
    return new Response(JSON.stringify({
      success: false,
      error: '指令ID不能为空'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const key = `admin_command:${id}`;
    const existing = await env.XBSKV.get(key, 'json');

    if (!existing) {
      return new Response(JSON.stringify({
        success: false,
        error: '指令不存在'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.XBSKV.delete(key);
    
    return new Response(JSON.stringify({
      success: true,
      message: '删除成功'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: '删除失败: ' + e.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}