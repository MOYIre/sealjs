// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     3.0.0
// @description 不知道吃什么/喝什么？问问饭笥大人吧～支持云菜单同步
// @timestamp   1743283200
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E9%A3%9F%E7%81%B5(%E5%90%83%E4%BB%80%E4%B9%88).js
// ==/UserScript==

// ==================== 扩展注册 ====================
let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '3.0.0');
  seal.ext.register(ext);
}

// ==================== 配置 ====================
const CONFIG = {
  // 云端菜单地址
  cloudUrl: 'https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
  
  // 缓存时间（毫秒）- 5分钟
  cacheTTL: 5 * 60 * 1000,
  
  // 大师列表
  masters: ['铭茗', '猫掌柜'],
  
  // 时段映射
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

// ==================== 默认菜单 ====================
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

// ==================== 数据管理器 ====================
const DataManager = {
  cache: null,
  cacheTime: 0,
  
  // 获取当前时段
  getPeriod(type) {
    const h = new Date().getHours();
    if (type === 'food') {
      return h >= 5 && h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 22 ? 'dinner' : 'midnight';
    } else {
      return h >= 5 && h < 11 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
    }
  },
  
  // 从存储加载本地数据
  loadLocal() {
    try {
      const data = ext.storageGet('localData');
      return data ? JSON.parse(data) : { food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } };
    } catch {
      return { food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } };
    }
  },
  
  // 保存本地数据
  saveLocal(data) {
    ext.storageSet('localData', JSON.stringify(data));
  },
  
  // 从云端获取菜单
  async fetchCloud() {
    try {
      const http = seal.http.new();
      const res = await http.simpleGet(CONFIG.cloudUrl);
      if (res && res.body) {
        const cloudData = JSON.parse(res.body);
        this.cache = cloudData;
        this.cacheTime = Date.now();
        return cloudData;
      }
    } catch (e) {
      console.log('食灵: 云端获取失败，使用缓存或默认数据', e);
    }
    return null;
  },
  
  // 获取合并后的菜单（云端 + 本地覆盖）
  async getMenus() {
    // 检查缓存
    if (this.cache && Date.now() - this.cacheTime < CONFIG.cacheTTL) {
      return this.mergeData(this.cache, this.loadLocal());
    }
    
    // 尝试从云端获取
    const cloudData = await this.fetchCloud();
    if (cloudData) {
      return this.mergeData(cloudData, this.loadLocal());
    }
    
    // 使用本地或默认
    const local = this.loadLocal();
    if (Object.keys(local.food || {}).length > 0) {
      return { food: local.food, drink: local.drink, extraPool: local.extraPool || [] };
    }
    return { food: DEFAULT_MENUS.food, drink: DEFAULT_MENUS.drink, extraPool: [] };
  },
  
  // 合并云端和本地数据
  mergeData(cloud, local) {
    return {
      food: { ...DEFAULT_MENUS.food, ...cloud.food, ...local.food },
      drink: { ...DEFAULT_MENUS.drink, ...cloud.drink, ...local.drink },
      extraPool: [...(cloud.extraPool || []), ...(local.extraPool || [])]
    };
  }
};

// ==================== 抽选器 ====================
const Picker = {
  // 随机选择（带去重历史）
  pick(menus, type, period) {
    const list = menus[type]?.[period] || [];
    if (list.length === 0) return null;
    
    const local = DataManager.loadLocal();
    const history = local.history?.[type]?.[period] || [];
    
    // 结合额外池（仅食物）
    let pool = type === 'food' ? [...list, ...(menus.extraPool || [])] : [...list];
    
    // 过滤已选过的
    let available = pool.filter(item => !history.includes(item));
    
    // 如果全部选过了，重置历史
    if (available.length === 0) {
      local.history[type][period] = [];
      available = [...pool];
    }
    
    const choice = available[Math.floor(Math.random() * available.length)];
    
    // 记录历史
    if (!local.history[type]) local.history[type] = {};
    if (!local.history[type][period]) local.history[type][period] = [];
    local.history[type][period].push(choice);
    DataManager.saveLocal(local);
    
    return choice;
  },
  
  // 生成随机前缀
  getPrefix(periodName) {
    const master = CONFIG.masters[Math.floor(Math.random() * CONFIG.masters.length)];
    return `今日${periodName}${master}推荐: `;
  }
};

// ==================== 命令处理器 ====================
const CommandHandler = {
  // 处理推荐
  async handleRecommend(ctx, msg, type, periodKey) {
    const menus = await DataManager.getMenus();
    const periodConfig = CONFIG.periods[type];
    
    let period;
    if (periodKey && periodConfig.map[periodKey]) {
      period = periodConfig.map[periodKey];
    } else {
      period = DataManager.getPeriod(type);
    }
    
    const choice = Picker.pick(menus, type, period);
    const periodName = periodConfig.names[period];
    
    if (choice) {
      seal.replyToSender(ctx, msg, Picker.getPrefix(periodName) + choice);
    } else {
      seal.replyToSender(ctx, msg, `暂无${periodName}菜单数据`);
    }
  },
  
  // 添加菜品/饮品
  handleAdd(type, periodKey, items) {
    const local = DataManager.loadLocal();
    const periodConfig = CONFIG.periods[type];
    
    const added = [], skipped = [];
    
    if (periodKey && periodConfig.map[periodKey]) {
      // 添加到指定时段
      const period = periodConfig.map[periodKey];
      if (!local[type]) local[type] = {};
      if (!local[type][period]) local[type][period] = [];
      
      for (const item of items) {
        const name = item.trim();
        if (local[type][period].some(x => x.toLowerCase() === name.toLowerCase())) {
          skipped.push(name);
        } else {
          local[type][period].push(name);
          added.push(name);
        }
      }
      DataManager.saveLocal(local);
      return added.length 
        ? `已将 ${added.join('、')} 加入${periodKey}菜单` 
        : `没有新增，已存在: ${skipped.join('、')}`;
    } else {
      // 添加到通用池（仅食物）
      if (!local.extraPool) local.extraPool = [];
      for (const item of items) {
        const name = item.trim();
        if (local.extraPool.some(x => x.toLowerCase() === name.toLowerCase())) {
          skipped.push(name);
        } else {
          local.extraPool.push(name);
          added.push(name);
        }
      }
      DataManager.saveLocal(local);
      return added.length 
        ? `已将 ${added.join('、')} 加入通用池` 
        : `没有新增，已存在: ${skipped.join('、')}`;
    }
  },
  
  // 删除菜品/饮品
  handleRemove(type, periodKey, items) {
    const local = DataManager.loadLocal();
    const periodConfig = CONFIG.periods[type];
    
    const removed = [], notFound = [];
    
    if (periodKey && periodConfig.map[periodKey]) {
      const period = periodConfig.map[periodKey];
      const list = local[type]?.[period] || [];
      
      for (const item of items) {
        const name = item.trim().toLowerCase();
        const idx = list.findIndex(x => x.toLowerCase() === name);
        if (idx >= 0) {
          removed.push(list.splice(idx, 1)[0]);
        } else {
          notFound.push(item);
        }
      }
      DataManager.saveLocal(local);
    } else {
      // 从通用池删除
      for (const item of items) {
        const name = item.trim().toLowerCase();
        const idx = (local.extraPool || []).findIndex(x => x.toLowerCase() === name);
        if (idx >= 0) {
          removed.push(local.extraPool.splice(idx, 1)[0]);
        } else {
          notFound.push(item);
        }
      }
      DataManager.saveLocal(local);
    }
    
    let msg = '';
    if (removed.length) msg += `已删除: ${removed.join('、')}\n`;
    if (notFound.length) msg += `未找到: ${notFound.join('、')}`;
    return msg || '操作完成';
  },
  
  // 显示菜单
  async handleShowMenu(ctx, msg, type) {
    const menus = await DataManager.getMenus();
    const periodConfig = CONFIG.periods[type];
    
    const lines = [`====== ${type === 'food' ? '食灵' : '饮品'}菜单 ======`];
    
    for (const period of periodConfig.default) {
      const list = menus[type]?.[period] || [];
      const name = periodConfig.names[period];
      lines.push(`${name}:\n  ${list.join('、')}`);
    }
    
    if (type === 'food' && menus.extraPool?.length) {
      lines.push(`\n通用池:\n  ${menus.extraPool.join('、')}`);
    }
    
    lines.push('========================');
    seal.replyToSender(ctx, msg, lines.join('\n'));
  },
  
  // 随机菜单
  async handleRandomMenu(ctx, msg, type) {
    const menus = await DataManager.getMenus();
    const periodConfig = CONFIG.periods[type];
    
    // 重置历史以获取完整随机
    const local = DataManager.loadLocal();
    local.history = { food: {}, drink: {} };
    DataManager.saveLocal(local);
    
    const lines = [`====== 随机${type === 'food' ? '菜单' : '饮品单'} ======`];
    
    for (const period of periodConfig.default) {
      const choice = Picker.pick(menus, type, period);
      const name = periodConfig.names[period];
      lines.push(Picker.getPrefix(name) + (choice || '无数据'));
    }
    
    lines.push('======================');
    seal.replyToSender(ctx, msg, lines.join('\n'));
  },
  
  // 重置菜单
  handleReset() {
    DataManager.saveLocal({
      food: {},
      drink: {},
      extraPool: [],
      history: { food: {}, drink: {} }
    });
    DataManager.cache = null;
    return '已重置为云端菜单，本地修改已清空';
  },
  
  // 刷新缓存
  async handleRefresh() {
    DataManager.cache = null;
    const cloud = await DataManager.fetchCloud();
    return cloud ? '已从云端刷新菜单' : '刷新失败，使用缓存数据';
  }
};

// ==================== 命令注册 ====================
const cmd = seal.ext.newCmdItemInfo();
cmd.name = '食灵';
cmd.help = `
食灵帮助 v3.0

【推荐】
.食灵/饭笥 吃什么 - 根据时间推荐
.食灵/饭笥 喝什么 - 根据时间推荐饮品
.食灵 [时段]吃什么 - 指定时段(早餐/中午/晚上/夜宵)
.食灵 [时段]喝什么 - 指定时段(早茶/下午茶/晚茶/夜茶)

【管理】
.食灵 加菜 [时段] 菜名 - 不指定时段则加入通用池
.食灵 删菜 [时段] 菜名 - 从菜单删除
.食灵 加饮 [时段] 饮品 - 添加饮品
.食灵 删饮 [时段] 饮品 - 删除饮品

【查看】
.食灵 菜单 - 查看食物菜单
.食灵 饮单 - 查看饮品菜单
.食灵 随机菜单 - 随机推荐各时段
.食灵 随机饮单 - 随机推荐各时段饮品

【其他】
.食灵 刷新 - 强制从云端同步
.食灵 重置 - 清空本地修改
.食灵 help - 显示本帮助
`;

cmd.solve = async (ctx, msg, argv) => {
  const res = seal.ext.newCmdExecuteResult(true);
  const text = argv.args.join(' ').trim().replace(/^\.?食灵\s*/, '');
  
  if (!text || text === 'help') {
    res.showHelp = true;
    return res;
  }
  
  // 吃什么
  if (text === '吃什么') {
    await CommandHandler.handleRecommend(ctx, msg, 'food');
    return res;
  }
  
  // 喝什么
  if (text === '喝什么') {
    await CommandHandler.handleRecommend(ctx, msg, 'drink');
    return res;
  }
  
  // 指定时段吃什么
  for (const [key, period] of Object.entries(CONFIG.periods.food.map)) {
    if (text === key + '吃什么') {
      await CommandHandler.handleRecommend(ctx, msg, 'food', key);
      return res;
    }
  }
  
  // 指定时段喝什么
  for (const [key, period] of Object.entries(CONFIG.periods.drink.map)) {
    if (text === key + '喝什么') {
      await CommandHandler.handleRecommend(ctx, msg, 'drink', key);
      return res;
    }
  }
  
  // 加菜/删菜
  if (text.startsWith('加菜 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.food.map[args[0]] ? args[0] : null;
    const items = periodKey ? args.slice(1) : args;
    seal.replyToSender(ctx, msg, CommandHandler.handleAdd('food', periodKey, items));
    return res;
  }
  
  if (text.startsWith('删菜 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.food.map[args[0]] ? args[0] : null;
    const items = periodKey ? args.slice(1) : args;
    seal.replyToSender(ctx, msg, CommandHandler.handleRemove('food', periodKey, items));
    return res;
  }
  
  // 加饮/删饮
  if (text.startsWith('加饮 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.drink.map[args[0]] ? args[0] : null;
    const items = periodKey ? args.slice(1) : args;
    seal.replyToSender(ctx, msg, CommandHandler.handleAdd('drink', periodKey, items));
    return res;
  }
  
  if (text.startsWith('删饮 ')) {
    const args = text.slice(3).split(/\s+/);
    const periodKey = CONFIG.periods.drink.map[args[0]] ? args[0] : null;
    const items = periodKey ? args.slice(1) : args;
    seal.replyToSender(ctx, msg, CommandHandler.handleRemove('drink', periodKey, items));
    return res;
  }
  
  // 查看菜单
  if (text === '菜单') {
    await CommandHandler.handleShowMenu(ctx, msg, 'food');
    return res;
  }
  
  if (text === '饮单') {
    await CommandHandler.handleShowMenu(ctx, msg, 'drink');
    return res;
  }
  
  // 随机菜单
  if (text === '随机菜单') {
    await CommandHandler.handleRandomMenu(ctx, msg, 'food');
    return res;
  }
  
  if (text === '随机饮单') {
    await CommandHandler.handleRandomMenu(ctx, msg, 'drink');
    return res;
  }
  
  // 刷新
  if (text === '刷新') {
    seal.replyToSender(ctx, msg, await CommandHandler.handleRefresh());
    return res;
  }
  
  // 重置
  if (text === '重置') {
    seal.replyToSender(ctx, msg, CommandHandler.handleReset());
    return res;
  }
  
  seal.replyToSender(ctx, msg, '未知命令，输入 .食灵 help 查看帮助');
  return res;
};

// 注册命令
ext.cmdMap['食灵'] = cmd;
ext.cmdMap['饭笥'] = cmd;

// 注册喝什么快捷命令
const cmdDrink = seal.ext.newCmdItemInfo();
cmdDrink.name = '喝什么';
cmdDrink.solve = async (ctx, msg, argv) => {
  await CommandHandler.handleRecommend(ctx, msg, 'drink');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['喝什么'] = cmdDrink;
