// ==UserScript==
// @name        猫点评
// @author      铭茗
// @version     1.1.0
// @description 猫掌柜AI点评跑团日志，支持OpenAI兼容API
// @timestamp   1742745600
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E7%8C%AB%E7%82%B9%E8%AF%84.js
// ==/UserScript==

let ext = seal.ext.find('猫点评');
if (!ext) {
  ext = seal.ext.new('猫点评', '铭茗', '1.1.0');
  seal.ext.register(ext);
}

// ========== 配置注册（WebUI支持）==========
ext.registerConfig(
  {
    key: 'baseUrl',
    type: 'string',
    defaultValue: 'https://api.openai.com/v1',
    description: 'OpenAI兼容API地址'
  },
  {
    key: 'token',
    type: 'string',
    defaultValue: '',
    description: 'API密钥(Token)'
  },
  {
    key: 'model',
    type: 'string',
    defaultValue: 'gpt-3.5-turbo',
    description: '模型名称'
  },
  {
    key: 'maxTokens',
    type: 'int',
    defaultValue: 1500,
    description: '最大输出Token数'
  },
  {
    key: 'temperature',
    type: 'float',
    defaultValue: 0.8,
    description: '生成温度(0-2，越高越随机)'
  }
);

// ========== 配置读取 ==========
function getConfig() {
  try {
    return {
      baseUrl: ext.getStringConfig('baseUrl').replace(/\/$/, ''),
      token: ext.getStringConfig('token'),
      model: ext.getStringConfig('model'),
      maxTokens: ext.getIntConfig('maxTokens'),
      temperature: ext.getFloatConfig('temperature')
    };
  } catch (e) {
    console.log('配置读取失败，使用默认值:', e);
    return {
      baseUrl: 'https://api.openai.com/v1',
      token: '',
      model: 'gpt-3.5-turbo',
      maxTokens: 1500,
      temperature: 0.8
    };
  }
}

// ========== 日志解析 ==========
function parseLogContent(html) {
  // 移除HTML标签
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, '\n');
  
  // 解码HTML实体
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n));
  
  // 清理多余空白
  text = text.replace(/\n\s*\n/g, '\n');
  text = text.trim();
  
  return text;
}

// 提取日志中的关键信息
function extractLogInfo(text) {
  const lines = text.split('\n');
  const info = {
    kp: null,
    players: [],
    diceResults: [],
    roleplays: [],
    rawLines: []
  };
  
  // 用于识别骰娘的常见名称
  const diceNames = ['骰娘', '海豹', '骰子', 'Dice', 'dice', 'SealDice', 'sealdice'];
  // 用于识别KP的常见标识
  const kpKeywords = ['KP', 'kp', '守密人', 'GM', 'gm', 'DM', 'dm', 'ST', 'st'];
  
  let potentialKP = null;
  let speakerCount = {};
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    // 跳过括号开头的行（OOC信息）
    if (line.startsWith('(') || line.startsWith('（')) continue;
    
    // 尝试解析发言人格式: "名字: 内容" 或 "名字说：" 等
    const match = line.match(/^([^:：\[\]【】]{1,20})\s*[:：]\s*(.+)$/);
    
    if (match) {
      const speaker = match[1].trim();
      const content = match[2].trim();
      
      // 统计发言者
      speakerCount[speaker] = (speakerCount[speaker] || 0) + 1;
      
      // 检查是否是骰娘
      const isDice = diceNames.some(name => 
        speaker.toLowerCase().includes(name.toLowerCase())
      );
      
      // 检查是否是KP
      const isKP = kpKeywords.some(kw => 
        speaker.includes(kw) || speaker.toLowerCase().includes(kw.toLowerCase())
      );
      
      if (isDice) {
        // 骰娘发言：只提取成功/失败
        const successMatch = content.match(/(大成功|极难成功|困难成功|成功|大失败|失败)/);
        const rollMatch = content.match(/(\d+)\s*(?:出目|D100|d100)/i);
        if (successMatch) {
          info.diceResults.push({
            speaker,
            result: successMatch[0],
            value: rollMatch ? rollMatch[1] : ''
          });
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
  
  // 如果没有通过名称识别到KP，找发言最多的玩家作为KP（启发式）
  if (!potentialKP && Object.keys(speakerCount).length > 0) {
    const sortedSpeakers = Object.entries(speakerCount).sort((a, b) => b[1] - a[1]);
    if (sortedSpeakers.length > 1) {
      potentialKP = sortedSpeakers[0][0];
    }
  }
  
  info.kp = potentialKP;
  
  return info;
}

// 格式化日志内容供AI分析
function formatLogForAI(info, maxLength = 8000) {
  let formatted = '【跑团日志分析】\n\n';
  
  if (info.kp) {
    formatted += `守密人(KP): ${info.kp}\n`;
  }
  
  if (info.players.length > 0) {
    formatted += `玩家: ${info.players.join(', ')}\n`;
  }
  
  formatted += '\n【骰点记录】\n';
  if (info.diceResults.length > 0) {
    const recentRolls = info.diceResults.slice(-30);
    for (const roll of recentRolls) {
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
  formatted += content;
  
  return formatted;
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

  try {
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
        max_tokens: config.maxTokens,
        temperature: config.temperature
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    throw new Error(`调用AI失败: ${e.message}`);
  }
}

// ========== 图片生成 ==========
async function generateImage(config, comment) {
  const imagePrompt = `创建一张精美的点评卡片图片，内容如下：

${comment.slice(0, 500)}

风格要求：可爱的猫咪主题，柔和的渐变背景，清晰的文字排版`;

  try {
    const imageUrl = `${config.baseUrl}/images/generations`;
    
    const response = await fetch(imageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: imagePrompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1
      })
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.data[0].url;
  } catch (e) {
    console.log('图像生成失败:', e.message);
    return null;
  }
}

// ========== 命令定义 ==========

// 主命令：猫点评
const cmdReview = seal.ext.newCmdItemInfo();
cmdReview.name = '猫点评';
cmdReview.help = `
猫点评 - 猫掌柜AI点评跑团日志

.猫点评 <日志链接>  // 点评跑团日志
.猫点评 图片 <日志链接>  // 生成点评图片
.猫点评 测试  // 测试API连接

配置请前往WebUI → 扩展设置 → 猫点评

示例:
.猫点评 https://log.xiaocui.icu/?key=N1AG#330891
.猫点评 图片 https://log.xiaocui.icu/?key=N1AG#330891
`;
cmdReview.solve = (ctx, msg, cmdArgs) => {
  const args = cmdArgs.args || [];
  
  // 检查是否是测试模式
  if (args[0] === '测试' || args[0] === 'test') {
    const config = getConfig();
    if (!config.token) {
      seal.replyToSender(ctx, msg, '❌ 请先在WebUI中设置API密钥');
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
  
  // 检查是否是图片模式
  let generateImg = false;
  let urlArg = args[0];
  
  if (args[0] === '图片' || args[0] === 'image' || args[0] === 'img') {
    generateImg = true;
    urlArg = args[1];
  }
  
  if (!urlArg || !urlArg.startsWith('http')) {
    seal.replyToSender(ctx, msg, '请提供有效的日志链接\n用法: .猫点评 <日志链接>');
    return seal.ext.newCmdExecuteResult(true);
  }
  
  // 检查配置
  const config = getConfig();
  if (!config.token) {
    seal.replyToSender(ctx, msg, '❌ 请先在WebUI中设置API密钥');
    return seal.ext.newCmdExecuteResult(true);
  }
  
  // 异步处理
  seal.replyToSender(ctx, msg, '🔍 猫掌柜正在研究你的日志喵~ 请稍等...');
  
  (async () => {
    try {
      // 获取日志内容
      console.log('正在获取日志:', urlArg);
      const response = await fetch(urlArg);
      
      if (!response.ok) {
        throw new Error(`获取日志失败: ${response.status}`);
      }
      
      const html = await response.text();
      console.log('日志长度:', html.length);
      
      // 解析日志
      const rawText = parseLogContent(html);
      const logInfo = extractLogInfo(rawText);
      const formattedLog = formatLogForAI(logInfo);
      
      console.log('格式化日志长度:', formattedLog.length);
      
      // 调用AI点评
      const comment = await callOpenAI(config, formattedLog);
      
      // 发送点评
      let reply = `🐱【猫掌柜点评】\n\n${comment}`;
      
      if (generateImg) {
        seal.replyToSender(ctx, msg, reply + '\n\n📸 正在生成图片...');
        
        const imgUrl = await generateImage(config, comment);
        if (imgUrl) {
          seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl}]`);
        } else {
          seal.replyToSender(ctx, msg, '⚠️ 图片生成暂时不可用，以上是文字版点评喵~');
        }
      } else {
        seal.replyToSender(ctx, msg, reply);
      }
      
    } catch (e) {
      console.log('点评失败:', e);
      seal.replyToSender(ctx, msg, `❌ 点评失败: ${e.message}\n请检查日志链接或WebUI中的API配置`);
    }
  })();
  
  return seal.ext.newCmdExecuteResult(true);
};

// 注册命令
ext.cmdMap['猫点评'] = cmdReview;
ext.cmdMap['review'] = cmdReview;
