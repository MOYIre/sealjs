// 管理指令回执 API
// 路由: /api/admin-commands/ack

// 模拟数据库存储 (与 admin-commands.js 共享)
const adminCommands = new Map();

// 回执指令结果
export async function onRequestPost(context) {
  const { request } = context;
  
  try {
    const body = await request.json();
    const { cmdId, status, result } = body;
    
    if (!cmdId) {
      return new Response(JSON.stringify({
        success: false,
        error: '指令ID不能为空'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const command = adminCommands.get(cmdId);
    if (!command) {
      return new Response(JSON.stringify({
        success: false,
        error: '指令不存在'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 更新指令状态
    command.status = status || 'completed';
    command.result = result || '';
    command.completedAt = Date.now();
    
    adminCommands.set(cmdId, command);
    
    return new Response(JSON.stringify({
      success: true,
      message: '回执成功'
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