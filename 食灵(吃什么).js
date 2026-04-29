// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     5.1.7
// @description 不知道吃什么/喝什么？问问饭笥大人吧
// @timestamp   1743456000
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/食灵(吃什么).js
// ==/UserScript==

let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '5.1.7');
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
  // 数据源：ghproxy优先，fastly.jsdelivr备选，GitHub原始源兜底
  cloudUrls: [
    'https://shiling.xiaocui.icu/api/menu',
    'https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    'https://fastly.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    'https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    'https://raw.githubusercontent.com/MOYIre/shiling-data/master/menu.json',
    'https://cdn.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json'
  ],
  kvApi: 'https://shiling.xiaocui.icu/api/pending',
  announcementApi: 'https://shiling.xiaocui.icu/api/announcement',
  tokenTTL: 10 * 60 * 1000,
  cacheTTL: 5 * 60 * 1000, // 缓存5分钟过期
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
  fetching: false, // 防止并发刷新
  
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
  
  // 检查缓存是否需要刷新
  needRefresh() {
    if (!this.cache) return true;
    if (Date.now() - this.cacheTime > CONFIG.cacheTTL) return true;
    return false;
  },
  
  async fetchCloud() {
    if (this.fetching) return this.cache; // 防止并发
    this.fetching = true;
    
    for (const url of CONFIG.cloudUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const payload = await res.json();
          this.cache = payload && payload.data ? payload.data : payload;
          this.cacheTime = Date.now();
          this.fetching = false;
          return this.cache;
        }
      } catch (e) {}
    }
    this.fetching = false;
    return null;
  },
  
  // 获取菜单，缓存过期时自动刷新
  async getMenus() {
    if (this.needRefresh()) {
      await this.fetchCloud();
    }
    return this.merge(this.cache || {}, this.loadLocal());
  },
  
  // 同步版本（用于简单场景，不刷新）
  getMenusSync() {
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

// 获取公告
async function fetchAnnouncement() {
  try {
    const res = await fetch(CONFIG.announcementApi);
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

function getUserPrefs() {
  try {
    const raw = ext.storageGet('userPrefs');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUserPrefs(prefs) {
  ext.storageSet('userPrefs', JSON.stringify(prefs || {}));
}

function getUserAvoidKeywords(ctx) {
  const qq = getQQ(ctx);
  if (!qq) return [];
  const prefs = getUserPrefs();
  const list = prefs?.[qq]?.avoidKeywords;
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

function setUserAvoidKeywords(ctx, keywords) {
  const qq = getQQ(ctx);
  if (!qq) return false;
  const prefs = getUserPrefs();
  if (!prefs[qq]) prefs[qq] = {};
  prefs[qq].avoidKeywords = Array.from(new Set((keywords || []).map(v => String(v).trim()).filter(Boolean)));
  saveUserPrefs(prefs);
  return true;
}

function clearUserAvoidKeywords(ctx) {
  const qq = getQQ(ctx);
  if (!qq) return false;
  const prefs = getUserPrefs();
  if (prefs[qq]) {
    delete prefs[qq].avoidKeywords;
    if (!Object.keys(prefs[qq]).length) delete prefs[qq];
    saveUserPrefs(prefs);
  }
  return true;
}

function getUserAvoidDrinkKeywords(ctx) {
  const qq = getQQ(ctx);
  if (!qq) return [];
  const prefs = getUserPrefs();
  const list = prefs?.[qq]?.avoidDrinkKeywords;
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

function setUserAvoidDrinkKeywords(ctx, keywords) {
  const qq = getQQ(ctx);
  if (!qq) return false;
  const prefs = getUserPrefs();
  if (!prefs[qq]) prefs[qq] = {};
  prefs[qq].avoidDrinkKeywords = Array.from(new Set((keywords || []).map(v => String(v).trim()).filter(Boolean)));
  saveUserPrefs(prefs);
  return true;
}

function clearUserAvoidDrinkKeywords(ctx) {
  const qq = getQQ(ctx);
  if (!qq) return false;
  const prefs = getUserPrefs();
  if (prefs[qq]) {
    delete prefs[qq].avoidDrinkKeywords;
    if (!Object.keys(prefs[qq]).length) delete prefs[qq];
    saveUserPrefs(prefs);
  }
  return true;
}

function filterByAvoidKeywords(list, keywords) {
  if (!Array.isArray(list) || !list.length) return [];
  if (!Array.isArray(keywords) || !keywords.length) return list;
  return list.filter(item => {
    const s = String(item || '');
    return !keywords.some(k => k && s.includes(k));
  });
}

function pickFoodForUser(ctx, menus, period) {
  const avoid = getUserAvoidKeywords(ctx);
  if (!avoid.length) {
    return Picker.pick(menus, 'food', period);
  }

  const cloned = {
    ...menus,
    food: { ...(menus.food || {}) },
    extraPool: [...(menus.extraPool || [])]
  };

  cloned.food[period] = filterByAvoidKeywords(menus.food?.[period] || [], avoid);
  cloned.extraPool = filterByAvoidKeywords(menus.extraPool || [], avoid);

  const choice = Picker.pick(cloned, 'food', period);
  if (choice) return choice;

  return Picker.pick(menus, 'food', period);
}

function pickDrinkForUser(ctx, menus) {
  const all = [
    ...(menus.drink?.morning || []),
    ...(menus.drink?.afternoon || []),
    ...(menus.drink?.evening || []),
    ...(menus.drink?.night || [])
  ];
  const avoid = getUserAvoidDrinkKeywords(ctx);
  const filtered = filterByAvoidKeywords(all, avoid);
  const pool = filtered.length ? filtered : all;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '食灵';
cmd.help = '.食灵 吃什么/.喝什么 - 推荐\n.食灵 今天吃什么 - 一次推荐早餐/午餐/晚餐/夜宵\n.食灵 忌口 [关键词...] - 设置个人忌口(如: 牛肉 香菜)\n.食灵 忌口查看 - 查看个人忌口\n.食灵 忌口清空 - 清空个人忌口\n.食灵 忌饮 [关键词...] - 设置个人不喝(如: 奶茶 可乐)\n.食灵 忌饮查看 - 查看个人不喝\n.食灵 忌饮清空 - 清空个人不喝\n.食灵 菜单/.饮单 - 查看\n.食灵 公告 - 查看公告\n.食灵 加菜 [时段] <菜名> - 提交新菜(无时段进通用池)\n.食灵 删菜 <时段> <菜名> - 申请删除\n.食灵 加饮 <饮名> - 提交新饮品\n.食灵 删饮 <饮名> - 申请删除\n.食灵 刷新 - 刷新数据\n.食灵 登录 - 获取Token';

cmd.solve = (ctx, msg, cmdArgs) => {
  const text = (cmdArgs.rawArgs || '').trim();
  
  if (!text || text === 'help') {
    // 异步获取公告并追加到帮助信息后面
    (async () => {
      const result = await fetchAnnouncement();
      if (result.content) {
        seal.replyToSender(ctx, msg, '【食灵公告】\n' + result.content);
      }
    })();
    const res = seal.ext.newCmdExecuteResult(true);
    res.showHelp = true;
    return res;
  }
  
  if (text === '公告') {
    (async () => {
      const result = await fetchAnnouncement();
      if (result.error) {
        seal.replyToSender(ctx, msg, '获取公告失败: ' + result.error);
      } else if (result.content) {
        const time = result.updatedAt ? '\n更新时间: ' + new Date(result.updatedAt).toLocaleString('zh-CN') : '';
        seal.replyToSender(ctx, msg, '【食灵公告】\n' + result.content + time);
      } else {
        seal.replyToSender(ctx, msg, '暂无公告');
      }
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '吃什么') {
    (async () => {
      const menus = await Data.getMenus();
      const period = Data.getPeriod();
      const choice = pickFoodForUser(ctx, menus, period);
      seal.replyToSender(ctx, msg, Picker.getPrefix(CONFIG.periods.food.names[period]) + (choice || '无数据'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '喝什么') {
    (async () => {
      const menus = await Data.getMenus();
      const choice = pickDrinkForUser(ctx, menus);
      seal.replyToSender(ctx, msg, Picker.getDrinkPrefix() + (choice || '无'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text === '忌饮查看') {
    const list = getUserAvoidDrinkKeywords(ctx);
    seal.replyToSender(ctx, msg, list.length ? ('你不喝关键词: ' + list.join('、')) : '你当前没有设置不喝关键词');
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text === '忌饮清空') {
    const ok = clearUserAvoidDrinkKeywords(ctx);
    seal.replyToSender(ctx, msg, ok ? '已清空你的不喝关键词' : '无法识别你的用户信息，清空失败');
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text.startsWith('忌饮 ')) {
    const raw = text.slice(3).trim();
    const keywords = raw.split(/[、,，\s]+/).map(v => v.trim()).filter(Boolean);
    if (!keywords.length) {
      seal.replyToSender(ctx, msg, '请提供不喝关键词\n示例: .食灵 忌饮 奶茶 可乐');
      return seal.ext.newCmdExecuteResult(true);
    }
    const ok = setUserAvoidDrinkKeywords(ctx, keywords);
    seal.replyToSender(ctx, msg, ok ? ('已设置不喝关键词: ' + keywords.join('、')) : '无法识别你的用户信息，设置失败');
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text === '忌口查看') {
    const list = getUserAvoidKeywords(ctx);
    seal.replyToSender(ctx, msg, list.length ? ('你的忌口关键词: ' + list.join('、')) : '你当前没有设置忌口关键词');
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text === '忌口清空') {
    const ok = clearUserAvoidKeywords(ctx);
    seal.replyToSender(ctx, msg, ok ? '已清空你的忌口关键词' : '无法识别你的用户信息，清空失败');
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text.startsWith('忌口 ')) {
    const raw = text.slice(3).trim();
    const keywords = raw.split(/[、,，\s]+/).map(v => v.trim()).filter(Boolean);
    if (!keywords.length) {
      seal.replyToSender(ctx, msg, '请提供忌口关键词\n示例: .食灵 忌口 牛肉 香菜');
      return seal.ext.newCmdExecuteResult(true);
    }
    const ok = setUserAvoidKeywords(ctx, keywords);
    seal.replyToSender(ctx, msg, ok ? ('已设置忌口关键词: ' + keywords.join('、')) : '无法识别你的用户信息，设置失败');
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text === '今天吃什么' || text === '今日吃什么') {
    (async () => {
      const menus = await Data.getMenus();
      const lines = ['=== 今日推荐 ==='];
      for (const p of CONFIG.periods.food.order) {
        const choice = pickFoodForUser(ctx, menus, p);
        lines.push(CONFIG.periods.food.names[p] + ': ' + (choice || '无数据'));
      }
      seal.replyToSender(ctx, msg, lines.join('\n'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }

  if (text === '菜单') {
    (async () => {
      const m = await Data.getMenus();
      const lines = ['=== 菜单 ==='];
      for (const p of CONFIG.periods.food.order) {
        lines.push(CONFIG.periods.food.names[p] + ': ' + (m.food[p] || []).join('、'));
      }
      if (m.extraPool?.length) lines.push('通用池: ' + m.extraPool.join('、'));
      seal.replyToSender(ctx, msg, lines.join('\n'));
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '饮单') {
    (async () => {
      const m = await Data.getMenus();
      const all = [...(m.drink.morning||[]), ...(m.drink.afternoon||[]), ...(m.drink.evening||[]), ...(m.drink.night||[])].filter((v,i,a)=>a.indexOf(v)===i);
      seal.replyToSender(ctx, msg, '=== 饮品 ===\n' + (all.join('、') || '无'));
    })();
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
      if (result.success) {
        seal.replyToSender(ctx, msg, '提交成功，等待审核\n查看审核进度: shiling.xiaocui.icu/history.html' + (qq ? '?qq=' + qq : ''));
      } else {
        seal.replyToSender(ctx, msg, result.error || '提交失败');
      }
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
      if (result.success) {
        seal.replyToSender(ctx, msg, '提交成功，等待审核\n查看审核进度: shiling.xiaocui.icu/history.html' + (qq ? '?qq=' + qq : ''));
      } else {
        seal.replyToSender(ctx, msg, result.error || '提交失败');
      }
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
      if (result.success) {
        seal.replyToSender(ctx, msg, '提交成功，等待审核\n查看审核进度: shiling.xiaocui.icu/history.html' + (qq ? '?qq=' + qq : ''));
      } else {
        seal.replyToSender(ctx, msg, result.error || '提交失败');
      }
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
      if (result.success) {
        seal.replyToSender(ctx, msg, '提交成功，等待审核\n查看审核进度: shiling.xiaocui.icu/history.html' + (qq ? '?qq=' + qq : ''));
      } else {
        seal.replyToSender(ctx, msg, result.error || '提交失败');
      }
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
  (async () => {
    const menus = await Data.getMenus();
    const period = Data.getPeriod();
    seal.replyToSender(ctx, msg, Picker.getPrefix(CONFIG.periods.food.names[period]) + (pickFoodForUser(ctx, menus, period) || '无'));
  })();
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['吃什么'] = cmdEat;

const cmdDrink = seal.ext.newCmdItemInfo();
cmdDrink.name = '喝什么';
cmdDrink.solve = (ctx, msg) => {
  (async () => {
    const menus = await Data.getMenus();
    seal.replyToSender(ctx, msg, Picker.getDrinkPrefix() + (pickDrinkForUser(ctx, menus) || '无'));
  })();
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['喝什么'] = cmdDrink;

const cmdTodayEat = seal.ext.newCmdItemInfo();
cmdTodayEat.name = '今天吃什么';
cmdTodayEat.solve = (ctx, msg) => {
  (async () => {
    const menus = await Data.getMenus();
    const lines = ['=== 今日推荐 ==='];
    for (const p of CONFIG.periods.food.order) {
      const choice = pickFoodForUser(ctx, menus, p);
      lines.push(CONFIG.periods.food.names[p] + ': ' + (choice || '无数据'));
    }
    seal.replyToSender(ctx, msg, lines.join('\n'));
  })();
  return seal.ext.newCmdExecuteResult(true);
};
const cmdNoEat = seal.ext.newCmdItemInfo();
cmdNoEat.name = '我不吃';
cmdNoEat.solve = (ctx, msg, cmdArgs) => {
  const text = (cmdArgs.rawArgs || '').trim();
  if (!text) {
    seal.replyToSender(ctx, msg, '请告诉我你不吃什么\n示例: .我不吃牛肉');
    return seal.ext.newCmdExecuteResult(true);
  }

  const keywords = text.split(/[、,，\s]+/).map(v => v.trim()).filter(Boolean);
  if (!keywords.length) {
    seal.replyToSender(ctx, msg, '请告诉我你不吃什么\n示例: .我不吃牛肉');
    return seal.ext.newCmdExecuteResult(true);
  }

  const current = getUserAvoidKeywords(ctx);
  const merged = Array.from(new Set([...current, ...keywords]));
  const ok = setUserAvoidKeywords(ctx, merged);
  seal.replyToSender(ctx, msg, ok ? ('记下了，以后不推荐: ' + keywords.join('、')) : '无法识别你的用户信息，设置失败');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['我不吃'] = cmdNoEat;

const cmdNoDrink = seal.ext.newCmdItemInfo();
cmdNoDrink.name = '我不喝';
cmdNoDrink.solve = (ctx, msg, cmdArgs) => {
  const text = (cmdArgs.rawArgs || '').trim();
  if (!text) {
    seal.replyToSender(ctx, msg, '请告诉我你不喝什么\n示例: .我不喝奶茶');
    return seal.ext.newCmdExecuteResult(true);
  }

  const keywords = text.split(/[、,，\s]+/).map(v => v.trim()).filter(Boolean);
  if (!keywords.length) {
    seal.replyToSender(ctx, msg, '请告诉我你不喝什么\n示例: .我不喝奶茶');
    return seal.ext.newCmdExecuteResult(true);
  }

  const current = getUserAvoidDrinkKeywords(ctx);
  const merged = Array.from(new Set([...current, ...keywords]));
  const ok = setUserAvoidDrinkKeywords(ctx, merged);
  seal.replyToSender(ctx, msg, ok ? ('记下了，以后不推荐饮品: ' + keywords.join('、')) : '无法识别你的用户信息，设置失败');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['我不喝'] = cmdNoDrink;

(async () => { await Data.fetchCloud(); })();
