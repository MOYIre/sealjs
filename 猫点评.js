// ==UserScript==
// @name        猫点评
// @author      铭茗
// @version     1.7.0
// @description 猫掌柜AI点评跑团日志，生成图片输出
// @timestamp   1742754600
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/猫点评.js
// ==/UserScript==

let ext = seal.ext.find('猫点评');
if (!ext) {
  ext = seal.ext.new('猫点评', '铭茗', '1.7.0');
  seal.ext.register(ext);
}

// ========== 配置注册 ==========
seal.ext.registerStringConfig(ext, 'baseUrl', 'https://api.openai.com/v1', 'OpenAI兼容API地址');
seal.ext.registerStringConfig(ext, 'token', '', 'API密钥(Token)');
seal.ext.registerStringConfig(ext, 'model', 'gpt-3.5-turbo', '模型名称');

// ========== 日志解析 ==========
function extractLogInfo(text) {
  const lines = text.split('\n');
  const info = { kp: null, players: [], diceResults: [] };
  const diceNames = ['骰娘', '海豹', '骰子', 'Dice', 'dice', 'SealDice'];
  let speakerCount = {};
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('(') || line.startsWith('（')) continue;
    
    const match = line.match(/^([^:：\[\]【】]{1,20})\s*[:：]\s*(.+)$/);
    if (match) {
      const speaker = match[1].trim();
      speakerCount[speaker] = (speakerCount[speaker] || 0) + 1;
      
      const isDice = diceNames.some(name => speaker.toLowerCase().includes(name.toLowerCase()));
      if (isDice) {
        const successMatch = match[2].match(/(大成功|极难成功|困难成功|成功|大失败|失败)/);
        if (successMatch) info.diceResults.push(successMatch[0]);
      } else if (!info.players.includes(speaker)) {
        info.players.push(speaker);
      }
    }
  }
  
  // KP通常是发言最多的人（排除骰子）
  const sorted = Object.entries(speakerCount)
    .filter(([name]) => !diceNames.some(d => name.toLowerCase().includes(d.toLowerCase())))
    .sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) info.kp = sorted[0][0];
  
  return info;
}

// ========== OpenAI API调用 ==========
async function callOpenAI(config, prompt) {
  const url = config.baseUrl + '/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + config.token
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.8
    })
  });
  
  if (!response.ok) throw new Error('API错误: ' + response.status);
  const data = await response.json();
  return data.choices[0].message.content;
}

// ========== 生成图片URL ==========
function createImageUrl(text, kp, players) {
  const fullText = '🐱 猫掌柜点评\n\nKP: ' + (kp || '未知') + '\n玩家: ' + (players.slice(0,3).join(', ') || '未知') + '\n\n' + text + '\n\n—— by 猫掌柜';
  return 'https://quickchart.io/chart?c=' + encodeURIComponent(JSON.stringify({type:'text',data:{text:fullText},options:{backgroundColor:'#667eea',color:'#ffffff'}}));
}

// ========== 命令定义 ==========
const cmdReview = seal.ext.newCmdItemInfo();
cmdReview.name = '猫点评';
cmdReview.help = '.猫点评 <日志文本>  直接输入日志文本进行点评\n.猫点评 测试  测试API连接\n\n提示: 复制日志文本后发送 ".猫点评 " + 粘贴内容';

cmdReview.solve = (ctx, msg, cmdArgs) => {
  const rawArgs = cmdArgs.rawArgs || '';
  
  const config = {
    baseUrl: seal.ext.getStringConfig(ext, 'baseUrl').replace(/\/$/, ''),
    token: seal.ext.getStringConfig(ext, 'token'),
    model: seal.ext.getStringConfig(ext, 'model')
  };
  
  if (!config.token) {
    seal.replyToSender(ctx, msg, '❌ 请先配置API密钥');
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (rawArgs === '测试' || rawArgs === 'test') {
    seal.replyToSender(ctx, msg, '⏳ 测试中...');
    (async () => {
      try {
        await callOpenAI(config, '回复OK');
        seal.replyToSender(ctx, msg, '✅ API正常');
      } catch (e) {
        seal.replyToSender(ctx, msg, '❌ ' + e.message);
      }
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  const logText = rawArgs.trim();
  if (!logText) {
    seal.replyToSender(ctx, msg, '用法: .猫点评 <日志文本>\n\n请复制跑团日志内容后发送:\n.猫点评 [粘贴日志内容]');
    return seal.ext.newCmdExecuteResult(true);
  }
  
  seal.replyToSender(ctx, msg, '🐱 猫掌柜思考中...');
  
  (async () => {
    try {
      const info = extractLogInfo(logText);
      
      const prompt = '你是猫娘占卜师猫掌柜，用2-3句话点评这个跑团日志，语气可爱带"喵"。\n\n日志摘要:\n- KP: ' + (info.kp || '未知') + '\n- 玩家: ' + info.players.slice(0,5).join(',') + '\n- 骰点: ' + (info.diceResults.slice(-5).join(', ') || '无') + '\n\n只输出点评内容。';

      const review = await callOpenAI(config, prompt);
      const imageUrl = createImageUrl(review, info.kp, info.players);
      
      seal.replyToSender(ctx, msg, '[CQ:image,file=' + imageUrl + ']');
      
    } catch (e) {
      seal.replyToSender(ctx, msg, '❌ 失败: ' + e.message);
    }
  })();
  
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['猫点评'] = cmdReview;
ext.cmdMap['review'] = cmdReview;
