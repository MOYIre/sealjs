// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     5.1.2
// @description 不知道吃什么/喝什么？问问饭笥大人吧
// @timestamp   1743456000
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E9%A3%9F%E7%81%B5(%E5%90%83%E4%BB%80%E4%B9%88).js
// ==/UserScript==

let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '5.1.2');
  seal.ext.register(ext);
}

// 注册配置项
seal.ext.registerTemplateConfig(ext, '食灵名字', ['铭茗', '猫猫'], '随机选择名字拼接，显示在推荐前缀');

// 获取配置
function getNames() {
  try {
    return seal.ext.getTemplateConfig(ext, '食灵名字') || ['铭茗', '猫猫'];
  } catch {
    return ['铭茗', '猫猫'];
  }
}

const CONFIG = {
  cloudUrls: [
    'https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    'https://cdn.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json'
  ],
  kvApi: 'https://shiling.xiaocui.icu/api/pending',
  tokenTTL: 10 * 60 * 1000,
  periods: {
    food: {
      names: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', midnight: '夜宵' },
      order: ['breakfast', 'lunch', 'dinner', 'midnight']
    }
  }
};

const DEFAULT_MENUS = {
  food: {
    breakfast: ['豆浆油条', '包子', '煎饼果子', '鸡蛋灌饼', '馄饨'],
    lunch: ['盖浇饭', '炒面', '麻辣香锅', '米线', '汉堡薯条'],
    dinner: ['火锅', '烧烤', '披萨', '炸鸡啤酒', '小炒'],
    midnight: ['泡面', '炸串', '烧烤', '凉皮', '烤冷面']
  },
  drink: {
    morning: ['咖啡', '豆浆', '牛奶', '茶', '果汁'],
    afternoon: ['奶茶', '柠檬茶', '可乐', '雪碧', '冰美式'],
    evening: ['啤酒', '红酒', '鸡尾酒', '热茶', '牛奶'],
    night: ['热牛奶', '蜂蜜水', '红酒', '花草茶', '可可']
  }
};

const Data = {
  cache: null,
  cacheTime: 0,
  
  getPeriod() {
    const h = new Date().getHours();
    if (h < 5 || h >= 22) return 'midnight';
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    return 'dinner';
  },
  
  loadLocal() {
    try {
      const d = ext.storageGet('localData');
      return d ? JSON.parse(d) : { food: {}, drink: {}, extraPool: [], history: {} };
    } catch { return { food: {}, drink: {}, extraPool: [], history: {} }; }
  },
  
  saveLocal(d) { ext.storageSet('localData', JSON.stringify(d)); },
  
  async fetchCloud() {
    for (const url of CONFIG.cloudUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          this.cache = await res.json();
          this.cacheTime = Date.now();
          return this.cache;
        }
      } catch (e) {}
    }
    return null;
  },
  
  getMenus() {
    return this.merge(this.cache || {}, this.loadLocal());
  },
  
  merge(cloud, local) {
    return {
      food: { ...DEFAULT_MENUS.food, ...(cloud.food || {}), ...(local.food || {}) },
      drink: { ...DEFAULT_MENUS.drink, ...(cloud.drink || {}), ...(local.drink || {}) },
      extraPool: [...(cloud.extraPool || []), ...(local.extraPool || [])]
    };
  }
};

const Picker = {
  pick(menus, type, period) {
    const list = menus[type]?.[period] || [];
    if (!list.length) return null;
    
    const local = Data.loadLocal();
    const history = local.history?.[type]?.[period] || [];
    let pool = type === 'food' ? [...list, ...(menus.extraPool || [])] : [...list];
    let available = pool.filter(x => !history.includes(x));
    
    if (!available.length) {
      if (!local.history) local.history = {};
      local.history[type] = { [period]: [] };
      available = [...pool];
    }
    
    const choice = available[Math.floor(Math.random() * available.length)];
    if (!local.history) local.history = {};
    if (!local.history[type]) local.history[type] = {};
    if (!local.history[type][period]) local.history[type][period] = [];
    local.history[type][period].push(choice);
    Data.saveLocal(local);
    return choice;
  },
  
  getPrefix(name) {
    const names = getNames();
    // 随机选择1-2个名字拼接
    const count = Math.random() < 0.3 ? 2 : 1;
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count).join('');
    return '今日' + name + selected + '推荐: ';
  },
  
  getDrinkPrefix() {
    const names = getNames();
    const count = Math.random() < 0.3 ? 2 : 1;
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count).join('');
    return '今日' + selected + '推荐饮品: ';
  }
};

// 提交到KV存储
async function submitPending(action, type, period, name, qq) {
  try {
    const res = await fetch(CONFIG.kvApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, type, period, name, qq })
    });
    const result = await res.json();
    return result;
  } catch (e) {
    return { error: '网络错误: ' + e.message };
  }
}

// 获取用户QQ号
function getQQ(ctx) {
  try {
    let uid = ctx.player?.userId || '';
    return uid.replace(/^(QQ:?)?/i, '');
  } catch {
    return '';
  }
}

function parseArgs(text) {
  const parts = text.split(/\s+/);
  return { action: parts[0] || '', p1: parts[1] || '', rest: parts.slice(2).join(' ') || '' };
}

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '食灵';
cmd.help = '.食灵 吃什么/.喝什么 - 推荐\n.食灵 菜单/.饮单 - 查看\n.食灵 加菜 [时段] <菜名> - 提交新菜(无时段进通用池)\n.食灵 删菜 <时段> <菜名> - 申请删除\n.食灵 加饮 <饮名> - 提交新饮品\n.食灵 删饮 <饮名> - 申请删除\n.食灵 刷新 - 刷新数据\n.食灵 登录 - 获取Token';

cmd.solve = (ctx, msg, cmdArgs) => {
  const text = (cmdArgs.rawArgs || '').trim();
  
  if (!text || text === 'help') {
    const res = seal.ext.newCmdExecuteResult(true);
    res.showHelp = true;
    return res;
  }
  
  if (text === '吃什么') {
    const menus = Data.getMenus();
    const period = Data.getPeriod();
    const choice = Picker.pick(menus, 'food', period);
    seal.replyToSender(ctx, msg, Picker.getPrefix(CONFIG.periods.food.names[period]) + (choice || '无数据'));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '喝什么') {
    const menus = Data.getMenus();
    const all = [
      ...(menus.drink.morning || []),
      ...(menus.drink.afternoon || []),
      ...(menus.drink.evening || []),
      ...(menus.drink.night || [])
    ];
    const choice = all[Math.floor(Math.random() * all.length)];
    seal.replyToSender(ctx, msg, Picker.getDrinkPrefix() + (choice || '无'));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '菜单') {
    const m = Data.getMenus();
    const lines = ['=== 菜单 ==='];
    for (const p of CONFIG.periods.food.order) {
      lines.push(CONFIG.periods.food.names[p] + ': ' + (m.food[p] || []).join('、'));
    }
    if (m.extraPool?.length) lines.push('通用池: ' + m.extraPool.join('、'));
    seal.replyToSender(ctx, msg, lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '饮单') {
    const m = Data.getMenus();
    const all = [...(m.drink.morning||[]), ...(m.drink.afternoon||[]), ...(m.drink.evening||[]), ...(m.drink.night||[])].filter((v,i,a)=>a.indexOf(v)===i);
    seal.replyToSender(ctx, msg, '=== 饮品 ===\n' + (all.join('、') || '无'));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '登录') {
    seal.replyToSender(ctx, msg, '验证中...');
    (async () => {
      try {
        const data = await Data.fetchCloud();
        if (!data) { seal.replyToSender(ctx, msg, '获取数据失败'); return; }
        let uid = '';
        try { uid = ctx.player?.userId || ''; } catch {}
        if (!uid) { seal.replyToSender(ctx, msg, '无法获取用户信息'); return; }
        uid = uid.replace(/^(QQ:?)?/i, '');
        if (!(data.admins || []).includes(uid)) { seal.replyToSender(ctx, msg, '非管理员'); return; }
        const exp = Date.now() + CONFIG.tokenTTL;
        const sig = btoa(uid + exp + 'shiling').slice(0, 16);
        seal.replyPerson(ctx, msg, 'Token: ' + btoa(JSON.stringify({qq:uid,exp,sig})) + '\n管理面板: shiling.xiaocui.icu');
      } catch (e) { seal.replyToSender(ctx, msg, '错误: ' + e.message); }
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '刷新') {
    seal.replyToSender(ctx, msg, '刷新中...');
    (async () => {
      Data.cache = null;
      const data = await Data.fetchCloud();
      seal.replyToSender(ctx, msg, data ? '已刷新' : '失败');
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  // 加菜/删菜/加饮/删饮
  const args = parseArgs(text);
  const periodMap = { '早餐': 'breakfast', '午餐': 'lunch', '晚餐': 'dinner', '夜宵': 'midnight' };
  const qq = getQQ(ctx);
  
  if (args.action === '加菜') {
    const period = periodMap[args.p1];
    const name = period ? args.rest : (args.p1 + ' ' + args.rest).trim();
    if (!name) {
      seal.replyToSender(ctx, msg, '请指定菜名\n示例: .食灵 加菜 早餐 豆浆油条\n示例: .食灵 加菜 炸鸡');
      return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg, '提交中...');
    (async () => {
      const result = await submitPending('加菜', 'food', period || 'extra', name, qq);
      seal.replyToSender(ctx, msg, result.success ? '提交成功，等待审核' : (result.error || '提交失败'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (args.action === '删菜') {
    const period = periodMap[args.p1];
    if (!period) {
      seal.replyToSender(ctx, msg, '请指定时段\n时段: 早餐/午餐/晚餐/夜宵\n示例: .食灵 删菜 早餐 豆浆油条');
      return seal.ext.newCmdExecuteResult(true);
    }
    if (!args.rest) {
      seal.replyToSender(ctx, msg, '请指定菜名');
      return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg, '提交中...');
    (async () => {
      const result = await submitPending('删菜', 'food', period, args.rest, qq);
      seal.replyToSender(ctx, msg, result.success ? '提交成功，等待审核' : (result.error || '提交失败'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (args.action === '加饮') {
    const name = (args.p1 + ' ' + args.rest).trim();
    if (!name) {
      seal.replyToSender(ctx, msg, '请指定饮名\n示例: .食灵 加饮 奶茶');
      return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg, '提交中...');
    (async () => {
      const result = await submitPending('加饮', 'drink', 'all', name, qq);
      seal.replyToSender(ctx, msg, result.success ? '提交成功，等待审核' : (result.error || '提交失败'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (args.action === '删饮') {
    const name = (args.p1 + ' ' + args.rest).trim();
    if (!name) {
      seal.replyToSender(ctx, msg, '请指定饮名\n示例: .食灵 删饮 奶茶');
      return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg, '提交中...');
    (async () => {
      const result = await submitPending('删饮', 'drink', 'all', name, qq);
      seal.replyToSender(ctx, msg, result.success ? '提交成功，等待审核' : (result.error || '提交失败'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  seal.replyToSender(ctx, msg, '未知命令，发送 .食灵 查看帮助');
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['食灵'] = cmd;
ext.cmdMap['饭笥'] = cmd;

const cmdEat = seal.ext.newCmdItemInfo();
cmdEat.name = '吃什么';
cmdEat.solve = (ctx, msg) => {
  const menus = Data.getMenus();
  const period = Data.getPeriod();
  seal.replyToSender(ctx, msg, Picker.getPrefix(CONFIG.periods.food.names[period]) + (Picker.pick(menus, 'food', period) || '无'));
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['吃什么'] = cmdEat;

const cmdDrink = seal.ext.newCmdItemInfo();
cmdDrink.name = '喝什么';
cmdDrink.solve = (ctx, msg) => {
  const menus = Data.getMenus();
  const all = [...(menus.drink.morning||[]), ...(menus.drink.afternoon||[]), ...(menus.drink.evening||[]), ...(menus.drink.night||[])];
  seal.replyToSender(ctx, msg, Picker.getDrinkPrefix() + (all[Math.floor(Math.random()*all.length)] || '无'));
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['喝什么'] = cmdDrink;

(async () => { await Data.fetchCloud(); })();
