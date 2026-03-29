// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     3.7.0
// @description 不知道吃什么/喝什么？问问饭笥大人吧
// @timestamp   1743456000
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E9%A3%9F%E7%81%B5(%E5%90%83%E4%BB%80%E4%B9%88).js
// ==/UserScript==

let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '3.7.0');
  seal.ext.register(ext);
}

const CONFIG = {
  cloudUrls: [
    'https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    'https://cdn.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json'
  ],
  tokenTTL: 10 * 60 * 1000,
  masters: ['铭茗', '猫掌柜'],
  periods: {
    food: {
      names: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', midnight: '夜宵' },
      order: ['breakfast', 'lunch', 'dinner', 'midnight']
    },
    drink: {
      names: { morning: '早茶', afternoon: '下午茶', evening: '晚茶', night: '夜茶' },
      order: ['morning', 'afternoon', 'evening', 'night']
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
    const m = CONFIG.masters[Math.floor(Math.random() * CONFIG.masters.length)];
    return '今日' + name + m + '推荐: ';
  }
};

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '食灵';
cmd.help = '.食灵 吃什么/.喝什么 - 推荐\n.食灵 菜单 - 查看\n.食灵 刷新 - 刷新云端数据\n.食灵 登录 - 获取管理Token';

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
    seal.replyToSender(ctx, msg, '今日推荐饮品: ' + (choice || '无'));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '登录') {
    seal.replyToSender(ctx, msg, '验证中...');
    (async () => {
      try {
        const data = await Data.fetchCloud();
        if (!data) {
          seal.replyToSender(ctx, msg, '获取数据失败');
          return;
        }
        let uid = '';
        try { uid = ctx.player?.userId || ''; } catch {}
        if (!uid) {
          seal.replyToSender(ctx, msg, '无法获取用户信息');
          return;
        }
        uid = uid.replace(/^(QQ:?)?/i, '');
        const admins = data.admins || [];
        if (!admins.includes(uid)) {
          seal.replyToSender(ctx, msg, '非管理员');
          return;
        }
        const exp = Date.now() + CONFIG.tokenTTL;
        const sig = btoa(uid + exp + 'shiling').slice(0, 16);
        const token = btoa(JSON.stringify({ qq: uid, exp, sig }));
        seal.replyPerson(ctx, msg, 'Token: ' + token);
      } catch (e) {
        seal.replyToSender(ctx, msg, '错误: ' + e.message);
      }
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '刷新') {
    seal.replyToSender(ctx, msg, '刷新中...');
    (async () => {
      try {
        Data.cache = null;
        const data = await Data.fetchCloud();
        seal.replyToSender(ctx, msg, data ? '已刷新菜单' : '刷新失败');
      } catch (e) {
        seal.replyToSender(ctx, msg, '错误: ' + e.message);
      }
    })();
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '菜单') {
    const m = Data.getMenus();
    const lines = ['=== 菜单 ==='];
    for (const p of CONFIG.periods.food.order) {
      lines.push(CONFIG.periods.food.names[p] + ': ' + (m.food[p] || []).join('、'));
    }
    seal.replyToSender(ctx, msg, lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '饮单') {
    const m = Data.getMenus();
    const lines = ['=== 饮单 ==='];
    for (const p of CONFIG.periods.drink.order) {
      lines.push(CONFIG.periods.drink.names[p] + ': ' + (m.drink[p] || []).join('、'));
    }
    seal.replyToSender(ctx, msg, lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  if (text === '重置') {
    Data.saveLocal({ food: {}, drink: {}, extraPool: [], history: {} });
    Data.cache = null;
    seal.replyToSender(ctx, msg, '已重置为默认菜单');
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
  const choice = Picker.pick(menus, 'food', period);
  seal.replyToSender(ctx, msg, Picker.getPrefix(CONFIG.periods.food.names[period]) + (choice || '无'));
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['吃什么'] = cmdEat;

const cmdDrink = seal.ext.newCmdItemInfo();
cmdDrink.name = '喝什么';
cmdDrink.solve = (ctx, msg) => {
  const menus = Data.getMenus();
  const all = [
    ...(menus.drink.morning || []),
    ...(menus.drink.afternoon || []),
    ...(menus.drink.evening || []),
    ...(menus.drink.night || [])
  ];
  seal.replyToSender(ctx, msg, '今日推荐饮品: ' + (all[Math.floor(Math.random() * all.length)] || '无'));
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['喝什么'] = cmdDrink;

// 初始化
(async () => { await Data.fetchCloud(); })();
