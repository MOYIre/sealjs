// ==UserScript==
// @name        猫点评
// @author      铭茗
// @version     1.0.0
// @description 猫掌柜AI点评跑团日志，支持OpenAI兼容API
// @timestamp   1742745600
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E7%8C%AB%E7%82%B9%E8%AF%84.js
// ==/UserScript==

let ext = seal.ext.find('猫点评');
if (!ext) {
  ext = seal.ext.new('猫点评', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

// ========== 配置管理 ==========
const CONFIG_KEY = 'config';

function getConfig() {
  try {
    const data = ext.storageGet(CONFIG_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.log('配置读取失败:', e);
  }
  return {
    baseUrl: 'https://api.openai.com/v1',
    token: '',
    model: 'gpt-3.5-turbo'
  };
}

function saveConfig(config) {
  ext.storageSet(CONFIG_KEY, JSON.stringify(config));
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
  const diceNames = ['骰娘', '海豹', '骰子', 'Dice', 'dice', 'SealDice'];
  // 用于识别KP的常见标识
  const kpKeywords = ['KP', 'kp', '守密人', 'GM', 'gm', 'DM', 'dm'];
  
  let currentSpeaker = null;
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
      const isDice = diceNames.some(name => speaker.includes(name));
      
      // 检查是否是KP
      const isKP = kpKeywords.some(kw => speaker.includes(kw));
      
      if (isDice) {
        // 骰娘发言：只提取成功/失败
        const rollMatch = content.match(/(\d+)\s*(?:出目|D100|d100)/i);
        const successMatch = content.match(/(成功|失败|大成功|大失败|极难成功|困难成功)/);
        if (rollMatch || successMatch) {
          info.diceResults.push({
            speaker,
            content: successMatch ? successMatch[0] : (rollMatch ? `出目${rollMatch[1]}` : content.slice(0, 50))
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
      // 无法解析的行，可能是描述文字
      info.rawLines.push({ speaker: '系统', content: line, isDice: false, isKP: false });
    }
  }
  
  // 如果没有通过名称识别到KP，找发言最多的玩家作为KP（启发式）
  if (!potentialKP && Object.keys(speakerCount).length > 0) {
    const sortedSpeakers = Object.entries(speakerCount).sort((a, b) => b[1] - a[1]);
    // 假设发言最多的是KP或主要玩家
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
  
  formatted += '\n【关键事件】\n';
  
  // 骰点结果摘要
  if (info.diceResults.length > 0) {
    formatted += '\n骰点记录:\n';
    const recentRolls = info.diceResults.slice(-20); // 最近20次
    for (const roll of recentRolls) {
      formatted += `- ${roll.speaker}: ${roll.content}\n`;
    }
  }
  
  // 角色扮演内容摘要
  formatted += '\n【对话摘要】\n';
  let content = '';
  for (const line of info.rawLines) {
    if (line.isDice) continue; // 跳过骰娘的详细输出
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
  } catch (e) {
    throw new Error(`调用AI失败: ${e.message}`);
  }
}

// ========== 图片生成 ==========
async function generateImage(config, comment) {
  // 使用AI生成点评图片的描述
  const imagePrompt = `创建一张精美的点评卡片图片，内容如下：

${comment}

风格要求：
- 可爱的猫咪主题边框
- 柔和的渐变背景（粉色到紫色）
- 清晰的文字排版
- 装饰性的星星和爪印图案
- 右下角有"猫掌柜点评"的水印`;

  try {
    // 如果配置了DALL-E或其他图像生成API
    const imageUrl = `${config.baseUrl}/images/generations`;
    
    const response = await fetch(imageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: imagePrompt.slice(0, 1000), // 限制长度
        size: '1024x1024',
        quality: 'standard',
        n: 1
      })
    });
    
    if (!response.ok) {
      // 如果图像API不可用，返回null
      console.log('图像生成不可用');
      return null;
    }
    
    const data = await response.json();
    return data.data[0].url;
  } catch (e) {
    console.log('图像生成失败:', e.message);
    return null;
  }
}

// 生成文字图片（使用HTML Canvas风格的SVG）
function generateTextImage(comment) {
  // 将评论转换为简化的HTML格式，供后续处理
  const lines = comment.split('\n');
  let htmlContent = `<html>
<head>
<style>
body { 
  font-family: 'Microsoft YaHei', sans-serif; 
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 30px;
  color: #333;
}
.card {
  background: rgba(255,255,255,0.95);
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
}
.title {
  text-align: center;
  font-size: 24px;
  color: #764ba2;
  margin-bottom: 20px;
  border-bottom: 2px dashed #667eea;
  padding-bottom: 10px;
}
.content {
  font-size: 16px;
  line-height: 1.8;
  white-space: pre-wrap;
}
.footer {
  text-align: right;
  margin-top: 20px;
  font-size: 14px;
  color: #999;
}
</style>
</head>
<body>
<div class="card">
<div class="title">🐱 猫掌柜点评</div>
<div class="content">${comment}</div>
<div class="footer">——猫掌柜 喵~</div>
</div>
</body>
</html>`;
  
  return htmlContent;
}

// ========== 命令定义 ==========

// 设置命令
const cmdConfig = seal.ext.newCmdItemInfo();
cmdConfig.name = '猫点评设置';
cmdConfig.help = `
猫点评设置：

.猫点评设置 地址 <url>  // 设置API地址（默认OpenAI）
.猫点评设置 token <token>  // 设置API密钥
.猫点评设置 模型 <model>  // 设置模型名称（默认gpt-3.5-turbo）
.猫点评设置 查看  // 查看当前配置
.猫点评设置 测试  // 测试API连接

示例:
.猫点评设置 地址 https://api.openai.com/v1
.猫点评设置 token sk-xxxxx
.猫点评设置 模型 gpt-4
`;
cmdConfig.solve = (ctx, msg, cmdArgs) => {
  const args = cmdArgs.args || [];
  const action = args[0];
  const value = args.slice(1).join(' ');
  
  let config = getConfig();
  let reply = '';
  
  switch (action) {
    case '地址':
    case 'url':
    case 'baseUrl':
      if (!value) {
        reply = '请提供API地址\n示例: .猫点评设置 地址 https://api.openai.com/v1';
      } else {
        config.baseUrl = value.replace(/\/$/, ''); // 移除末尾斜杠
        saveConfig(config);
        reply = `✅ API地址已设置为: ${config.baseUrl}`;
      }
      break;
      
    case 'token':
    case '密钥':
    case 'key':
      if (!value) {
        reply = '请提供API密钥\n示例: .猫点评设置 token sk-xxxxx';
      } else {
        config.token = value;
        saveConfig(config);
        reply = '✅ API密钥已设置（出于安全考虑不显示）';
      }
      break;
      
    case '模型':
    case 'model':
      if (!value) {
        reply = '请提供模型名称\n示例: .猫点评设置 模型 gpt-4';
      } else {
        config.model = value;
        saveConfig(config);
        reply = `✅ 模型已设置为: ${config.model}`;
      }
      break;
      
    case '查看':
    case 'view':
    case 'show':
      reply = `📋 当前配置:\n`;
      reply += `API地址: ${config.baseUrl}\n`;
      reply += `模型: ${config.model}\n`;
      reply += `密钥: ${config.token ? '已设置' : '未设置'}`;
      break;
      
    case '测试':
    case 'test':
      if (!config.token) {
        reply = '❌ 请先设置API密钥';
      } else {
        reply = '⏳ 正在测试连接...';
        seal.replyToSender(ctx, msg, reply);
        
        // 异步测试
        (async () => {
          try {
            const testResult = await callOpenAI(config, '请回复"连接成功"三个字');
            seal.replyToSender(ctx, msg, `✅ API连接成功！\n响应: ${testResult}`);
          } catch (e) {
            seal.replyToSender(ctx, msg, `❌ 连接失败: ${e.message}`);
          }
        })();
        return seal.ext.newCmdExecuteResult(true);
      }
      break;
      
    default:
      return seal.ext.newCmdExecuteResult(true);
  }
  
  seal.replyToSender(ctx, msg, reply);
  return seal.ext.newCmdExecuteResult(true);
};

// 主命令：猫点评
const cmdReview = seal.ext.newCmdItemInfo();
cmdReview.name = '猫点评';
cmdReview.help = `
猫点评 - 猫掌柜AI点评跑团日志

.猫点评 <日志链接>  // 点评跑团日志
.猫点评 图片 <日志链接>  // 生成点评图片
.猫点评设置 ...  // 配置API

支持的日志格式:
- https://log.xiaocui.icu/?key=xxx
- 其他跑团日志网站

示例:
.猫点评 https://log.xiaocui.icu/?key=N1AG#330891
.猫点评 图片 https://log.xiaocui.icu/?key=N1AG#330891
`;
cmdReview.solve = (ctx, msg, cmdArgs) => {
  const args = cmdArgs.args || [];
  
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
    seal.replyToSender(ctx, msg, '❌ 请先设置API密钥\n使用 .猫点评设置 token <密钥>');
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
        reply += '\n\n📸 正在生成点评图片...';
        seal.replyToSender(ctx, msg, reply);
        
        const imgUrl = await generateImage(config, comment);
        if (imgUrl) {
          seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl}]`);
        } else {
          // 生成HTML格式的文字版
          const htmlContent = generateTextImage(comment);
          seal.replyToSender(ctx, msg, '⚠️ 图片生成暂时不可用，以上是文字版点评喵~');
        }
      } else {
        seal.replyToSender(ctx, msg, reply);
      }
      
    } catch (e) {
      console.log('点评失败:', e);
      seal.replyToSender(ctx, msg, `❌ 点评失败: ${e.message}\n请检查日志链接是否有效，或API配置是否正确。`);
    }
  })();
  
  return seal.ext.newCmdExecuteResult(true);
};

// 注册命令
ext.cmdMap['猫点评'] = cmdReview;
ext.cmdMap['猫点评设置'] = cmdConfig;
ext.cmdMap['review'] = cmdReview;
