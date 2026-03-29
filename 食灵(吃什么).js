// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     3.4.0
// @description 不知道吃什么/喝什么？问问饭笥大人吧～支持云菜单同步
// @timestamp   1743456000
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E9%A3%9F%E7%81%B5(%E5%90%83%E4%BB%80%E4%B9%88).js
// ==/UserScript==

let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '3.4.0');
  seal.ext.register(ext);
}

// ==================== 配置 ====================
const CONFIG = {
  cloudUrls: [
    'https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    'https://cdn.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    'https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw'
  ],
  cacheTTL: 5 * 60 * 1000,
  tokenTTL: 10 * 60 * 1000,
  masters: ['铭茗', '猫掌柜'],
  periods: {
    food: {
      map: { '早餐': 'breakfast', '早上': 'breakfast', '中午': 'lunch', '午餐': 'lunch', '晚上': 'dinner', '晚餐': 'dinner', '夜宵': 'midnight' },
      names: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', midnight: '夜宵' },
      default: ['breakfast', 'lunch', 'dinner', 'midnight']
    },
    drink: {
      map: { '早茶': 'morning', '早上': 'morning', '下午茶': 'afternoon', '下午': 'afternoon', '晚茶': 'evening', '晚上': 'evening', '夜茶': 'night', '夜宵': 'night' },
      names: { morning: '早茶', afternoon: '下午茶', evening: '晚茶', night: '夜茶' },
      default: ['morning', 'afternoon', 'evening', 'night']
    }
  }
};

const DEFAULT_MENUS = {
  food: {
    breakfast: ['豆浆油条', '包子', '煎饼果子', '鸡蛋灌饼', '馄饨', '面包牛奶', '花卷', '豆腐脑', '烧饼夹肉', '胡辣汤'],
    lunch: ['盖浇饭', '炒面', '麻辣香锅', '米线', '汉堡薯条', '寿司', '卤肉饭', '酸辣粉', '鸡排饭', '咖喱饭'],
    dinner: ['火锅', '烧烤', '披萨', '炸鸡啤酒', '小炒', '砂锅粥', '红烧肉', '水煮鱼', '羊蝎子', '烤鱼'],
    midnight: ['泡面', '炸串', '烧烤', '凉皮', '烤冷面', '煎饺', '关东煮', '炒河粉', '鸡翅', '煎蛋炒饭']
  },
  drink: {
    morning: ['咖啡', '豆浆', '牛奶', '茶', '果汁', '燕麦奶', '红豆汤', '绿豆汤', '奶茶', '可可'],
    afternoon: ['奶茶', '柠檬茶', '可乐', '雪碧', '冰美式', '果茶', '气泡水', '椰汁', '杨枝甘露', '奶盖'],
    evening: ['啤酒', '红酒', '鸡尾酒', '热茶', '牛奶', '威士忌', '清酒', '果酒', '米酒', '蜂蜜柚子茶'],
    night: ['热牛奶', '蜂蜜水', '红酒', '花草茶', '可可', '洋甘菊茶', '薰衣草茶', '柠檬蜂蜜水', '姜茶', '热巧克力']
  }
};

// ==================== 数据管理 ====================
const DataManager = {
  cache: null,
  cacheTime: 0,
  
  getPeriod(type) {
    if (type === 'drink') return null; // 饮品不分时段
    const h = new Date().getHours();
    // 0-5点：夜宵，5-11点：早餐，11-16点：午餐，16-22点：晚餐，22-24点：夜宵
    if (h < 5 || h >= 22) return 'midnight';
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    return 'dinner';
  },
  
  loadLocal() {
    try {
      const data = ext.storageGet('localData');
      return data ? JSON.parse(data) : { food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } };
    } catch {
      return { food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } };
    }
  },
  
  saveLocal(data) {
    ext.storageSet('localData', JSON.stringify(data));
  },
  
  async fetchCloud() {
    const http = seal.http.new();
    for (let i = 0; i < CONFIG.cloudUrls.length; i++) {
      try {
        const res = await http.simpleGet(CONFIG.cloudUrls[i]);
        if (res && res.body) {
          this.cache = JSON.parse(res.body);
          this.cacheTime = Date.now();
          return this.cache;
        }
      } catch (e) {
        console.log('食灵: 源' + (i+1) + '失败', e);
      }
    }
    return null;
  },
  
  getMenus() {
    if (this.cache && Date.now() - this.cacheTime < CONFIG.cacheTTL) {
      return this.mergeData(this.cache, this.loadLocal());
    }
    return this.mergeData(this.cache || {}, this.loadLocal());
  },
  
  mergeData(cloud, local) {
    return {
      food: { ...DEFAULT_MENUS.food, ...(cloud.food || {}), ...(local.food || {}) },
      drink: { ...DEFAULT_MENUS.drink, ...(cloud.drink || {}), ...(local.drink || {}) },
      extraPool: [...(cloud.extraPool || []), ...(local.extraPool || [])]
    };
  }
};

// ==================== 抽选器 ====================
const Picker = {
  pick(menus, type, period) {
    const list = menus[type]?.[period] || [];
    if (list.length === 0) return null;
    
    const local = DataManager.loadLocal();
    const history = local.history?.[type]?.[period] || [];
    
    let pool = type === 'food' ? [...list, ...(menus.extraPool || [])] : [...list];
    let available = pool.filter(item => !history.includes(item));
    
    if (available.length === 0) {
      if (!local.history[type]) local.history[type] = {};
      local.history[type][period] = [];
      available = [...pool];
    }
    
    const choice = available[Math.floor(Math.random() * available.length)];
    
    if (!local.history[type]) local.history[type] = {};
    if (!local.history[type][period]) local.history[type][period] = [];
    local.history[type][period].push(choice);
    DataManager.saveLocal(local);
    
    return choice;
  },
  
  getPrefix(periodName) {
    const master = CONFIG.masters[Math.floor(Math.random() * CONFIG.masters.length)];
    return `今日${periodName}${master}推荐: `;
  }
};

// ==================== 命令处理器 ====================
const CommandHandler = {
  handleRecommend(ctx, msg, type, periodKey) {
    const menus = DataManager.getMenus();
    const periodConfig = CONFIG.periods[type];
    let choice, periodName;
    
    if (type === 'drink') {
      // 饮品：从所有时段合并后随机
      const allDrinks = [];
      for (const p of periodConfig.default) {
        const list = menus.drink?.[p] || [];
        allDrinks.push(...list);
      }
      if (allDrinks.length === 0) {
        seal.replyToSender(ctx, msg, '暂无饮品数据');
        return;
      }
      choice = allDrinks[Math.floor(Math.random() * allDrinks.length)];
      const master = CONFIG.masters[Math.floor(Math.random() * CONFIG.masters.length)];
      seal.replyToSender(ctx, msg, `今日${master}推荐饮品: ${choice}`);
      return;
    }
    
    const period = periodKey && periodConfig.map[periodKey] 
      ? periodConfig.map[periodKey] 
      : DataManager.getPeriod(type);
    choice = Picker.pick(menus, type, period);
    periodName = periodConfig.names[period];
    
    seal.replyToSender(ctx, msg, choice 
      ? Picker.getPrefix(periodName) + choice 
      : `暂无${periodName}菜单数据`);
  },
  
  handleShowMenu(ctx, msg, type) {
    const menus = DataManager.getMenus();
    const periodConfig = CONFIG.periods[type];
    const lines = [`====== ${type === 'food' ? '食灵' : '饮品'}菜单 ======`];
    
    for (const period of periodConfig.default) {
      const list = menus[type]?.[period] || [];
      lines.push(`${periodConfig.names[period]}:\n  ${list.join('、')}`);
    }
    if (type === 'food' && menus.extraPool?.length) {
      lines.push(`\n通用池:\n  ${menus.extraPool.join('、')}`);
    }
    lines.push('========================');
    seal.replyToSender(ctx, msg, lines.join('\n'));
  },
  
  handleRandomMenu(ctx, msg, type) {
    const menus = DataManager.getMenus();
    const periodConfig = CONFIG.periods[type];
    const local = DataManager.loadLocal();
    local.history = { food: {}, drink: {} };
    DataManager.saveLocal(local);
    
    const lines = [`====== 随机${type === 'food' ? '菜单' : '饮品单'} ======`];
    for (const period of periodConfig.default) {
      const choice = Picker.pick(menus, type, period);
      lines.push(Picker.getPrefix(periodConfig.names[period]) + (choice || '无数据'));
    }
    lines.push('======================');
    seal.replyToSender(ctx, msg, lines.join('\n'));
  },
  
  handleAdd(type, periodKey, items) {
    const local = DataManager.loadLocal();
    const periodConfig = CONFIG.periods[type];
    const added = [], skipped = [];
    
    if (periodKey && periodConfig.map[periodKey]) {
      const period = periodConfig.map[periodKey];
      if (!local[type]) local[type] = {};
      if (!local[type][period]) local[type][period] = [];
      
      for (const name of items) {
        if (local[type][period].some(x => x.toLowerCase() === name.toLowerCase())) {
          skipped.push(name);
        } else {
          local[type][period].push(name);
          added.push(name);
        }
      }
      DataManager.saveLocal(local);
      return added.length ? `已将 ${added.join('、')} 加入${periodKey}菜单` : `没有新增，已存在: ${skipped.join('、')}`;
    } else {
      if (!local.extraPool) local.extraPool = [];
      for (const name of items) {
        if (local.extraPool.some(x => x.toLowerCase() === name.toLowerCase())) {
          skipped.push(name);
        } else {
          local.extraPool.push(name);
          added.push(name);
        }
      }
      DataManager.saveLocal(local);
      return added.length ? `已将 ${added.join('、')} 加入通用池` : `没有新增，已存在: ${skipped.join('、')}`;
    }
  },
  
  handleRemove(type, periodKey, items) {
    const local = DataManager.loadLocal();
    const periodConfig = CONFIG.periods[type];
    const removed = [], notFound = [];
    
    if (periodKey && periodConfig.map[periodKey]) {
      const period = periodConfig.map[periodKey];
      const list = local[type]?.[period] || [];
      for (const item of items) {
        const idx = list.findIndex(x => x.toLowerCase() === item.toLowerCase());
        if (idx >= 0) removed.push(list.splice(idx, 1)[0]);
        else notFound.push(item);
      }
      DataManager.saveLocal(local);
    } else {
      for (const item of items) {
        const idx = (local.extraPool || []).findIndex(x => x.toLowerCase() === item.toLowerCase());
        if (idx >= 0) removed.push(local.extraPool.splice(idx, 1)[0]);
        else notFound.push(item);
      }
      DataManager.saveLocal(local);
    }
    
    let msg = '';
    if (removed.length) msg += `已删除: ${removed.join('、')}\n`;
    if (notFound.length) msg += `未找到: ${notFound.join('、')}`;
    return msg || '操作完成';
  },
  
  handleReset() {
    DataManager.saveLocal({ food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } });
    DataManager.cache = null;
    return '已重置为云端菜单，本地修改已清空';
  },
  
  handleRefresh(ctx, msg) {
    DataManager.cache = null;
    (async () => {
      const cloud = await DataManager.fetchCloud();
      seal.replyToSender(ctx, msg, cloud ? '已从云端刷新菜单' : '刷新失败，使用缓存数据');
    })();
    return seal.ext.newCmdExecuteResult(true);
  },
  
  handleLogin(ctx, msg) {
    let userId = '';
    try {
      userId = ctx.player?.userId || ctx.message?.sender?.userId || '';
    } catch {}
    if (!userId) {
      seal.replyToSender(ctx, msg, '无法获取用户信息');
      return;
    }
    userId = userId.replace(/^(QQ|qq|QQ:|qq:)/i, '');
    
    const admins = DataManager.cache?.admins || [];
    if (!admins.includes(userId)) {
      seal.replyToSender(ctx, msg, '您不是管理员，无法获取登录Token');
      return;
    }
    
    const exp = Date.now() + CONFIG.tokenTTL;
    const sig = btoa(userId + exp + 'shiling').slice(0, 16);
    const token = btoa(JSON.stringify({ qq: userId, exp, sig }));
    seal.replyToSender(ctx, msg, `【食灵管理面板登录Token】\n\nToken: ${token}\n\n有效期: 10分钟\n管理面板: https://shiling.xiaocui.icu`);
  }
};

// ==================== 命令注册 ====================
const cmd = seal.ext.newCmdItemInfo();
cmd.name = '食灵';
cmd.help = `食灵帮助 v3.4

【推荐】
.食灵/.饭笥 吃什么 - 根据时间推荐
.食灵/.饭笥 喝什么 - 根据时间推荐饮品
.食灵 [时段]吃什么 - 指定时段
.食灵 菜单 - 查看菜单
.食灵 随机菜单 - 随机推荐
.食灵 加菜 [时段] 菜名 - 添加菜品
.食灵 刷新 - 刷新菜单
.食灵 登录 - 获取管理Token`;

cmd.solve = (ctx, msg, cmdArgs) => {
  const rawArgs = cmdArgs.rawArgs || '';
  const text = rawArgs.trim();
  
  if (!text || text === 'help') {
    const res = seal.ext.newCmdExecuteResult(true);
    res.showHelp = true;
    return res;
  }
  
  // 快捷命令：吃什么、喝什么
  if (text === '吃什么') {
    CommandHandler.handleRecommend(ctx, msg, 'food');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text === '喝什么') {
    CommandHandler.handleRecommend(ctx, msg, 'drink');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text === '登录') {
    CommandHandler.handleLogin(ctx, msg);
    return seal.ext.newCmdExecuteResult(true);
  }
  
  // 时段推荐
  for (const [key] of Object.entries(CONFIG.periods.food.map)) {
    if (text === key + '吃什么') {
      CommandHandler.handleRecommend(ctx, msg, 'food', key);
      return seal.ext.newCmdExecuteResult(true);
    }
  }
  for (const [key] of Object.entries(CONFIG.periods.drink.map)) {
    if (text === key + '喝什么') {
      CommandHandler.handleRecommend(ctx, msg, 'drink', key);
      return seal.ext.newCmdExecuteResult(true);
    }
  }
  
  // 管理命令
  if (text.startsWith('加菜 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.food.map[args[0]] ? args[0] : null;
    seal.replyToSender(ctx, msg, CommandHandler.handleAdd('food', periodKey, periodKey ? args.slice(1) : args));
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text.startsWith('删菜 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.food.map[args[0]] ? args[0] : null;
    seal.replyToSender(ctx, msg, CommandHandler.handleRemove('food', periodKey, periodKey ? args.slice(1) : args));
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text.startsWith('加饮 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.drink.map[args[0]] ? args[0] : null;
    seal.replyToSender(ctx, msg, CommandHandler.handleAdd('drink', periodKey, periodKey ? args.slice(1) : args));
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text.startsWith('删饮 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.drink.map[args[0]] ? args[0] : null;
    seal.replyToSender(ctx, msg, CommandHandler.handleRemove('drink', periodKey, periodKey ? args.slice(1) : args));
    return seal.ext.newCmdExecuteResult(true);
  }
  
  // 查看命令
  if (text === '菜单') {
    CommandHandler.handleShowMenu(ctx, msg, 'food');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text === '饮单') {
    CommandHandler.handleShowMenu(ctx, msg, 'drink');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text === '随机菜单') {
    CommandHandler.handleRandomMenu(ctx, msg, 'food');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text === '随机饮单') {
    CommandHandler.handleRandomMenu(ctx, msg, 'drink');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (text === '刷新') {
    return CommandHandler.handleRefresh(ctx, msg);
  }
  if (text === '重置') {
    seal.replyToSender(ctx, msg, CommandHandler.handleReset());
    return seal.ext.newCmdExecuteResult(true);
  }
  
  seal.replyToSender(ctx, msg, '未知命令，输入 .食灵 help 查看帮助');
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['食灵'] = cmd;
ext.cmdMap['饭笥'] = cmd;

// 快捷命令
const cmdEat = seal.ext.newCmdItemInfo();
cmdEat.name = '吃什么';
cmdEat.solve = (ctx, msg, cmdArgs) => {
  CommandHandler.handleRecommend(ctx, msg, 'food');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['吃什么'] = cmdEat;

const cmdDrink = seal.ext.newCmdItemInfo();
cmdDrink.name = '喝什么';
cmdDrink.solve = (ctx, msg, cmdArgs) => {
  CommandHandler.handleRecommend(ctx, msg, 'drink');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['喝什么'] = cmdDrink;

// 初始化加载云端数据
(async () => {
  await DataManager.fetchCloud();
  console.log('食灵: 初始化完成');
})();
