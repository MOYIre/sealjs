// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     3.2.0
// @description 不知道吃什么/喝什么？问问饭笥大人吧～支持云菜单
// @timestamp   1743456000
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E9%A3%9F%E7%81%B5(%E5%90%83%E4%BB%80%E4%B9%88).js
// ==/UserScript==

// ==================== 扩展注册 ====================
let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '3.2.0');
  seal.ext.register(ext);
}

// ==================== 配置 ====================
const CONFIG = {
  // 云端菜单地址（多镜像源，按优先级排列）
  cloudUrls: [
    // 国内镜像源（优先，无缓存问题）
    'https://ghproxy.net/https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    // jsdelivr CDN（快速但有缓存）
    'https://cdn.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    'https://fastly.jsdelivr.net/gh/MOYIre/shiling-data@master/menu.json',
    // 原始GitHub（备用）
    'https://gist.githubusercontent.com/MOYIre/a9f8a81d1ec3498c0d7b7afc24f43794/raw',
    'https://raw.githubusercontent.com/MOYIre/shiling-data/master/menu.json'
  ],
  
  // 缓存时间（毫秒）5分钟
  cacheTTL: 5 * 60 * 1000,
  
  // 登录Token有效期 10分钟
  tokenTTL: 10 * 60 * 1000,
  
  // 食灵列表
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

// ==================== 工具函数 ====================
const Utils = {
  // Base64编码
  base64Encode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    while (i < str.length) {
      const a = str.charCodeAt(i++);
      const b = i < str.length ? str.charCodeAt(i++) : 0;
      const c = i < str.length ? str.charCodeAt(i++) : 0;
      const bitmap = (a << 16) | (b << 8) | c;
      result += chars[(bitmap >> 18) & 63] + chars[(bitmap >> 12) & 63];
      result += (i > str.length + 1 ? '=' : chars[(bitmap >> 6) & 63]);
      result += (i > str.length ? '=' : chars[bitmap & 63]);
    }
    return result;
  },
  
  // 生成登录Token
  generateLoginToken(qq) {
    const exp = Date.now() + CONFIG.tokenTTL;
    const sig = this.base64Encode(String(qq) + String(exp) + 'shiling').slice(0, 16);
    const data = JSON.stringify({ qq, exp, sig });
    return this.base64Encode(data);
  },
  
  // 获取QQ号
  getUserId(ctx) {
    try {
      // 从消息中获取用户ID
      const userId = ctx.player?.userId || ctx.message?.sender?.userId;
      if (userId) {
        // 去除平台前缀（QQ:12345 -> 12345）
        return userId.replace(/^(QQ|qq|QQ:|qq:)/i, '');
      }
      return null;
    } catch {
      return null;
    }
  },
  
  // 发送私聊消息
  sendPrivateMessage(userId, message) {
    try {
      // 构造私聊消息
      const ctx = seal.getCtx(userId, 'private');
      seal.sendMessage(ctx, message);
      return true;
    } catch (e) {
      console.log('食灵: 发送私聊失败', e);
      return false;
    }
  },
  
  // 检查是否是私聊
  isPrivateChat(ctx) {
    return ctx.group?.groupId === '' || !ctx.group?.groupId;
  }
};

// ==================== 数据管理器 ====================
const DataManager = {
  cache: null,
  cacheTime: 0,
  
  getPeriod(type) {
    const h = new Date().getHours();
    if (type === 'food') {
      return h >= 5 && h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 22 ? 'dinner' : 'midnight';
    } else {
      return h >= 5 && h < 11 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
    }
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
      const url = CONFIG.cloudUrls[i];
      try {
        console.log(`食灵: 尝试从源 ${i + 1}/${CONFIG.cloudUrls.length} 获取数据`);
        const res = await http.simpleGet(url);
        if (res && res.body) {
          const cloudData = JSON.parse(res.body);
          this.cache = cloudData;
          this.cacheTime = Date.now();
          console.log(`食灵: 成功从源 ${i + 1} 获取数据`);
          return cloudData;
        }
      } catch (e) {
        console.log(`食灵: 源 ${i + 1} 获取失败: ${e.message || e}`);
      }
    }
    
    console.log('食灵: 所有源均获取失败，使用缓存或默认数据');
    return null;
  },
  
  async getMenus() {
    if (this.cache && Date.now() - this.cacheTime < CONFIG.cacheTTL) {
      return this.mergeData(this.cache, this.loadLocal());
    }
    
    const cloudData = await this.fetchCloud();
    if (cloudData) {
      return this.mergeData(cloudData, this.loadLocal());
    }
    
    const local = this.loadLocal();
    if (Object.keys(local.food || {}).length > 0) {
      return { food: local.food, drink: local.drink, extraPool: local.extraPool || [] };
    }
    return { food: DEFAULT_MENUS.food, drink: DEFAULT_MENUS.drink, extraPool: [] };
  },
  
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
  pick(menus, type, period) {
    const list = menus[type]?.[period] || [];
    if (list.length === 0) return null;
    
    const local = DataManager.loadLocal();
    const history = local.history?.[type]?.[period] || [];
    
    let pool = type === 'food' ? [...list, ...(menus.extraPool || [])] : [...list];
    let available = pool.filter(item => !history.includes(item));
    
    if (available.length === 0) {
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
  async handleRecommend(ctx, msg, type, periodKey) {
    const menus = await DataManager.getMenus();
    const periodConfig = CONFIG.periods[type];
    
    let period = periodKey && periodConfig.map[periodKey] 
      ? periodConfig.map[periodKey] 
      : DataManager.getPeriod(type);
    
    const choice = Picker.pick(menus, type, period);
    const periodName = periodConfig.names[period];
    
    seal.replyToSender(ctx, msg, choice 
      ? Picker.getPrefix(periodName) + choice 
      : `暂无${periodName}菜单数据`
    );
  },
  
  handleAdd(type, periodKey, items) {
    const local = DataManager.loadLocal();
    const periodConfig = CONFIG.periods[type];
    
    const added = [], skipped = [];
    
    if (periodKey && periodConfig.map[periodKey]) {
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
        if (idx >= 0) removed.push(list.splice(idx, 1)[0]);
        else notFound.push(item);
      }
      DataManager.saveLocal(local);
    } else {
      for (const item of items) {
        const name = item.trim().toLowerCase();
        const idx = (local.extraPool || []).findIndex(x => x.toLowerCase() === name);
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
  
  async handleShowMenu(ctx, msg, type) {
    const menus = await DataManager.getMenus();
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
  
  async handleRandomMenu(ctx, msg, type) {
    const menus = await DataManager.getMenus();
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
  
  handleReset() {
    DataManager.saveLocal({ food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } });
    DataManager.cache = null;
    return '已重置为云端菜单，本地修改已清空';
  },
  
  async handleRefresh() {
    DataManager.cache = null;
    const cloud = await DataManager.fetchCloud();
    return cloud ? '已从云端刷新菜单' : '刷新失败，使用缓存数据';
  },
  
  // 处理登录命令
  async handleLogin(ctx, msg) {
    const userId = Utils.getUserId(ctx);
    
    if (!userId) {
      seal.replyToSender(ctx, msg, '无法获取用户信息，请稍后重试');
      return;
    }
    
    // 获取云端数据检查管理员权限
    const cloudData = await DataManager.fetchCloud();
    const admins = cloudData?.admins || [];
    
    // 检查是否是管理员
    if (!admins.includes(userId)) {
      seal.replyToSender(ctx, msg, '您不是管理员，无法获取登录Token');
      return;
    }
    
    // 生成Token
    const token = Utils.generateLoginToken(userId);
    
    // 构造私聊消息
    const tokenMsg = `【食灵管理面板登录Token】\n\nToken: ${token}\n\n有效期: 10分钟\n请前往管理面板输入此Token登录\n管理面板地址: https://shiling.xiaocui.icu`;
    
    // 发送私聊（无论当前是群聊还是私聊）
    const sent = Utils.sendPrivateMessage(userId, tokenMsg);
    
    if (sent) {
      // 如果是群聊，提示已发送私聊
      if (!Utils.isPrivateChat(ctx)) {
        seal.replyToSender(ctx, msg, `登录Token已通过私聊发送给 ${userId}，请查看私聊消息`);
      }
    } else {
      // 发送失败，直接在当前对话返回（降级处理）
      seal.replyToSender(ctx, msg, tokenMsg);
    }
  }
};

// ==================== 命令注册 ====================
const cmd = seal.ext.newCmdItemInfo();
cmd.name = '食灵';
cmd.help = `
食灵帮助 v3.2

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

【登录】
.食灵 登录 - 获取管理面板登录Token（私聊发送）

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
  
  if (text === '吃什么') {
    await CommandHandler.handleRecommend(ctx, msg, 'food');
    return res;
  }
  
  if (text === '喝什么') {
    await CommandHandler.handleRecommend(ctx, msg, 'drink');
    return res;
  }
  
  if (text === '登录') {
    await CommandHandler.handleLogin(ctx, msg);
    return res;
  }
  
  for (const [key] of Object.entries(CONFIG.periods.food.map)) {
    if (text === key + '吃什么') {
      await CommandHandler.handleRecommend(ctx, msg, 'food', key);
      return res;
    }
  }
  
  for (const [key] of Object.entries(CONFIG.periods.drink.map)) {
    if (text === key + '喝什么') {
      await CommandHandler.handleRecommend(ctx, msg, 'drink', key);
      return res;
    }
  }
  
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
  
  if (text === '菜单') {
    await CommandHandler.handleShowMenu(ctx, msg, 'food');
    return res;
  }
  
  if (text === '饮单') {
    await CommandHandler.handleShowMenu(ctx, msg, 'drink');
    return res;
  }
  
  if (text === '随机菜单') {
    await CommandHandler.handleRandomMenu(ctx, msg, 'food');
    return res;
  }
  
  if (text === '随机饮单') {
    await CommandHandler.handleRandomMenu(ctx, msg, 'drink');
    return res;
  }
  
  if (text === '刷新') {
    seal.replyToSender(ctx, msg, await CommandHandler.handleRefresh());
    return res;
  }
  
  if (text === '重置') {
    seal.replyToSender(ctx, msg, CommandHandler.handleReset());
    return res;
  }
  
  seal.replyToSender(ctx, msg, '未知命令，输入 .食灵 help 查看帮助');
  return res;
};

ext.cmdMap['食灵'] = cmd;
ext.cmdMap['饭笥'] = cmd;

// 注册 .吃什么 快捷命令
const cmdEat = seal.ext.newCmdItemInfo();
cmdEat.name = '吃什么';
cmdEat.solve = async (ctx, msg, argv) => {
  await CommandHandler.handleRecommend(ctx, msg, 'food');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['吃什么'] = cmdEat;

const cmdDrink = seal.ext.newCmdItemInfo();
cmdDrink.name = '喝什么';
cmdDrink.solve = async (ctx, msg, argv) => {
  await CommandHandler.handleRecommend(ctx, msg, 'drink');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['喝什么'] = cmdDrink;
