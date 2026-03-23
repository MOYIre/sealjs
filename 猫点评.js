// ==UserScript==
// @name        猫点评
// @author      铭茗
// @version     1.4.0
// @description 猫掌柜AI点评跑团日志，支持OpenAI兼容API
// @timestamp   1742749200
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E7%8C%AB%E7%82%B9%E8%AF%84.js
// ==/UserScript==

let ext = seal.ext.find('猫点评');
if (!ext) {
  ext = seal.ext.new('猫点评', '铭茗', '1.4.0');
  seal.ext.register(ext);
}

// ========== 配置注册 ==========
seal.ext.registerStringConfig(ext, 'baseUrl', 'https://api.openai.com/v1', 'OpenAI兼容API地址');
seal.ext.registerStringConfig(ext, 'token', '', 'API密钥(Token)');
seal.ext.registerStringConfig(ext, 'model', 'gpt-3.5-turbo', '模型名称');

// ========== 日志解析 ==========
function parseLogContent(html) {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, '\n');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n));
  text = text.replace(/\n\s*\n/g, '\n');
  return text.trim();
}

function extractLogInfo(text) {
  const lines = text.split('\n');
  const info = { kp: null, players: [], diceResults: [], roleplays: [], rawLines: [] };
  const diceNames = ['骰娘', '海豹', '骰子', 'Dice', 'dice', 'SealDice', 'sealdice'];
  const kpKeywords = ['KP', 'kp', '守密人', 'GM', 'gm', 'DM', 'dm', 'ST', 'st'];
  
  let potentialKP = null;
  let speakerCount = {};
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('(') || line.startsWith('（')) continue;
    
    const match = line.match(/^([^:：\[\]【】]{1,20})\s*[:：]\s*(.+)$/);
    if (match) {
      const speaker = match[1].trim();
      const content = match[2].trim();
      speakerCount[speaker] = (speakerCount[speaker] || 0) + 1;
      
      const isDice = diceNames.some(name => speaker.toLowerCase().includes(name.toLowerCase()));
      const isKP = kpKeywords.some(kw => speaker.includes(kw) || speaker.toLowerCase().includes(kw.toLowerCase()));
      
      if (isDice) {
        const successMatch = content.match(/(大成功|极难成功|困难成功|成功|大失败|失败)/);
        const rollMatch = content.match(/(\d+)\s*(?:出目|D100|d100)/i);
        if (successMatch) {
          info.diceResults.push({ speaker, result: successMatch[0], value: rollMatch ? rollMatch[1] : '' });
        }
      } else if (isKP && !potentialKP) {
        potentialKP = speaker;
        info.roleplays.push({ speaker, content, type: 'kp' });
      } else {
        info.roleplays.push({ speaker, content, type: 'player' });
        if (!info.players.includes(speaker) && speaker !== potentialKP) {
          info.players.push(speaker);
        }
      }
      info.rawLines.push({ speaker, content, isDice, isKP });
    } else {
      info.rawLines.push({ speaker: '系统', content: line, isDice: false, isKP: false });
    }
  }
  
  if (!potentialKP && Object.keys(speakerCount).length > 0) {
    const sortedSpeakers = Object.entries(speakerCount).sort((a, b) => b[1] - a[1]);
    if (sortedSpeakers.length > 1) potentialKP = sortedSpeakers[0][0];
  }
  info.kp = potentialKP;
  return info;
}

function formatLogForAI(info, maxLength = 8000) {
  let formatted = '【跑团日志分析】\n\n';
  if (info.kp) formatted += `守密人(KP): ${info.kp}\n`;
  if (info.players.length > 0) formatted += `玩家: ${info.players.join(', ')}\n`;
  formatted += '\n【骰点记录】\n';
  if (info.diceResults.length > 0) {
    for (const roll of info.diceResults.slice(-30)) {
      formatted += `- ${roll.result}${roll.value ? '(' + roll.value + ')' : ''}\n`;
    }
  } else {
    formatted += '(无骰点记录)\n';
  }
  formatted += '\n【对话摘要】\n';
  let content = '';
  for (const line of info.rawLines) {
    if (line.isDice) continue;
    const lineText = `${line.speaker}: ${line.content}\n`;
    if (content.length + lineText.length > maxLength) break;
    content += lineText;
  }
  return formatted + content;
}

// ========== OpenAI API调用 ==========
async function callOpenAI(config, prompt) {
  const url = `${config.baseUrl}/chat/completions`;
  const systemPrompt = `你是猫掌柜，一个神秘又可爱的猫娘占卜师，说话时会带"喵"。你的工作是点评跑团日志，用轻松幽默的方式分析团里的有趣事件、精彩骰点、角色扮演等。

点评要点：
1. 总结团的氛围和主题
2. 点评精彩的骰点时刻（大成功、大失败等）
3. 评价玩家的角色扮演
4. 给出有趣的建议或吐槽
5. 保持轻松幽默的语调，带"喵"

格式要求：
- 开头用猫掌柜的口吻打招呼
- 分点列出精彩瞬间
- 结尾给出总评（用星级或分数）
- 全程保持"喵"的语气`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.8
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API请求失败: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

// ========== 命令定义 ==========
const cmdReview = seal.ext.newCmdItemInfo();
cmdReview.name = '猫点评';
cmdReview.help = `猫点评 - 猫掌柜AI点评跑团日志

.猫点评 <日志链接>  // 点评跑团日志
.猫点评 测试  // 测试API连接

配置请在WebUI插件设置中修改`;

cmdReview.solve = (ctx, msg, cmdArgs) => {
  const args = cmdArgs.args || [];
  
  // 获取配置
  const config = {
    baseUrl: seal.ext.getStringConfig(ext, 'baseUrl').replace(/\/$/, ''),
    token: seal.ext.getStringConfig(ext, 'token'),
    model: seal.ext.getStringConfig(ext, 'model')
  };
  
  if (args[0] === '测试' || args[0] === 'test') {
    if (!config.token) {
      seal.replyToSender(ctx, msg, '❌ 请先在WebUI插件设置中配置API密钥');
      return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg, '⏳ 正在测试连接...');
    (async () => {
      try {
        const result = await callOpenAI(config, '请回复"连接成功"四个字');
        seal.replyToSender(ctx, msg, `✅ API连接成功！\n模型: ${config.model}\n响应: ${result}`);
      } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 连接失败: ${e.message}`);
      }
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  const urlArg = args[0];
  if (!urlArg || !urlArg.startsWith('http')) {
    seal.replyToSender(ctx, msg, '请提供有效的日志链接\n用法: .猫点评 <日志链接>');
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (!config.token) {
    seal.replyToSender(ctx, msg, '❌ 请先在WebUI插件设置中配置API密钥');
    return seal.ext.newCmdExecuteResult(true);
  }
  
  seal.replyToSender(ctx, msg, '🔍 猫掌柜正在研究你的日志喵~ 请稍等...');
  
  (async () => {
    try {
      const response = await fetch(urlArg);
      if (!response.ok) throw new Error(`获取日志失败: ${response.status}`);
      
      const html = await response.text();
      const rawText = parseLogContent(html);
      const logInfo = extractLogInfo(rawText);
      const formattedLog = formatLogForAI(logInfo);
      
      const comment = await callOpenAI(config, formattedLog);
      seal.replyToSender(ctx, msg, `🐱【猫掌柜点评】\n\n${comment}`);
    } catch (e) {
      seal.replyToSender(ctx, msg, `❌ 点评失败: ${e.message}`);
    }
  })();
  
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['猫点评'] = cmdReview;
ext.cmdMap['review'] = cmdReview;
