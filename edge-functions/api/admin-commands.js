// 管理指令 API
// 路由: /api/admin-commands

// 模拟数据库存储
const adminCommands = new Map();

// 生成唯一ID
function generateId() {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 获取所有指令
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  
  let commands = Array.from(adminCommands.values());
  
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
  const { request } = context;
  
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
    
    adminCommands.set(command.id, command);
    
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
  const { request } = context;
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
  
  if (!adminCommands.has(id)) {
    return new Response(JSON.stringify({
      success: false,
      error: '指令不存在'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  adminCommands.delete(id);
  
  return new Response(JSON.stringify({
    success: true,
    message: '删除成功'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}