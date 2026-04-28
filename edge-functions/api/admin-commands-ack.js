// 管理指令回执 API (使用KV存储)
// 路由: /api/admin-commands/ack

// 回执指令结果
export async function onRequestPost(context) {
  const { request, env } = context;
  
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
    
    const key = `admin_command:${cmdId}`;
    let command;
    
    try {
      command = await env.WWYL_KV.get(key, 'json');
    } catch (e) {
      console.error('KV读取失败:', e);
      return new Response(JSON.stringify({
        success: false,
        error: '读取指令失败'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
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
    
    try {
      await env.WWYL_KV.put(key, JSON.stringify(command));
    } catch (e) {
      console.error('KV更新失败:', e);
    }
    
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