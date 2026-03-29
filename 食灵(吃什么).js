// ==UserScript==
// @name       食灵
// @author      御铭茗
// @version     3.3.0
// @description 不知道吃什么/喝什么？问问饭笥大人吧～支持云菜单同步
// @timestamp   1743456000
// @license     Apache-2
// @updateUrl   https://cdn.jsdelivr.net/gh/MOYIre/sealjs@main/%E9%A3%9F%E7%81%B5(%E5%90%83%E4%BB%80%E4%B9%88).js
// ==/UserScript==

// ==================== 扩展注册 ====================
let ext = seal.ext.find('食灵');
if (!ext) {
  ext = seal.ext.new('食灵', '铭茗', '3.3.0');
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
  
  getPeriod: function(type) {
    var h = new Date().getHours();
    if (type === 'food') {
      return h >= 5 && h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 22 ? 'dinner' : 'midnight';
    } else {
      return h >= 5 && h < 11 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
    }
  },
  
  loadLocal: function() {
    try {
      var data = ext.storageGet('localData');
      return data ? JSON.parse(data) : { food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } };
    } catch (e) {
      return { food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } };
    }
  },
  
  saveLocal: function(data) {
    ext.storageSet('localData', JSON.stringify(data));
  },
  
  fetchCloud: function(callback) {
    var self = this;
    var http = seal.http.new();
    var urls = CONFIG.cloudUrls;
    var index = 0;
    
    function tryNext() {
      if (index >= urls.length) {
        console.log('食灵: 所有源均获取失败');
        callback(null);
        return;
      }
      
      var url = urls[index];
      index++;
      
      console.log('食灵: 尝试从源 ' + index + '/' + urls.length + ' 获取数据');
      
      try {
        http.simpleGet(url, function(res) {
          if (res && res.body) {
            try {
              var cloudData = JSON.parse(res.body);
              self.cache = cloudData;
              self.cacheTime = Date.now();
              console.log('食灵: 成功获取数据');
              callback(cloudData);
            } catch (e) {
              console.log('食灵: JSON解析失败');
              tryNext();
            }
          } else {
            tryNext();
          }
        });
      } catch (e) {
        console.log('食灵: 请求失败 ' + e);
        tryNext();
      }
    }
    
    tryNext();
  },
  
  getMenus: function() {
    if (this.cache && Date.now() - this.cacheTime < CONFIG.cacheTTL) {
      return this.mergeData(this.cache, this.loadLocal());
    }
    return this.mergeData(this.cache || {}, this.loadLocal());
  },
  
  mergeData: function(cloud, local) {
    return {
      food: Object.assign({}, DEFAULT_MENUS.food, cloud.food || {}, local.food || {}),
      drink: Object.assign({}, DEFAULT_MENUS.drink, cloud.drink || {}, local.drink || {}),
      extraPool: (cloud.extraPool || []).concat(local.extraPool || [])
    };
  }
};

// ==================== 抽选器 ====================
const Picker = {
  pick: function(menus, type, period) {
    var list = menus[type] && menus[type][period] ? menus[type][period] : [];
    if (list.length === 0) return null;
    
    var local = DataManager.loadLocal();
    var history = local.history && local.history[type] && local.history[type][period] ? local.history[type][period] : [];
    
    var pool = type === 'food' ? list.concat(menus.extraPool || []) : list.slice();
    var available = pool.filter(function(item) { return history.indexOf(item) < 0; });
    
    if (available.length === 0) {
      if (!local.history[type]) local.history[type] = {};
      local.history[type][period] = [];
      available = pool.slice();
    }
    
    var choice = available[Math.floor(Math.random() * available.length)];
    
    if (!local.history[type]) local.history[type] = {};
    if (!local.history[type][period]) local.history[type][period] = [];
    local.history[type][period].push(choice);
    DataManager.saveLocal(local);
    
    return choice;
  },
  
  getPrefix: function(periodName) {
    var masters = CONFIG.masters;
    var master = masters[Math.floor(Math.random() * masters.length)];
    return '今日' + periodName + master + '推荐: ';
  }
};

// ==================== 命令处理器 ====================
const CommandHandler = {
  handleRecommend: function(ctx, msg, type, periodKey) {
    var menus = DataManager.getMenus();
    var periodConfig = CONFIG.periods[type];
    
    var period;
    if (periodKey && periodConfig.map[periodKey]) {
      period = periodConfig.map[periodKey];
    } else {
      period = DataManager.getPeriod(type);
    }
    
    var choice = Picker.pick(menus, type, period);
    var periodName = periodConfig.names[period];
    
    if (choice) {
      seal.replyToSender(ctx, msg, Picker.getPrefix(periodName) + choice);
    } else {
      seal.replyToSender(ctx, msg, '暂无' + periodName + '菜单数据');
    }
  },
  
  handleShowMenu: function(ctx, msg, type) {
    var menus = DataManager.getMenus();
    var periodConfig = CONFIG.periods[type];
    
    var lines = ['====== ' + (type === 'food' ? '食灵' : '饮品') + '菜单 ======'];
    
    for (var i = 0; i < periodConfig.default.length; i++) {
      var period = periodConfig.default[i];
      var list = menus[type] && menus[type][period] ? menus[type][period] : [];
      lines.push(periodConfig.names[period] + ':\n  ' + list.join('、'));
    }
    
    if (type === 'food' && menus.extraPool && menus.extraPool.length) {
      lines.push('\n通用池:\n  ' + menus.extraPool.join('、'));
    }
    
    lines.push('========================');
    seal.replyToSender(ctx, msg, lines.join('\n'));
  },
  
  handleRandomMenu: function(ctx, msg, type) {
    var menus = DataManager.getMenus();
    var periodConfig = CONFIG.periods[type];
    
    var local = DataManager.loadLocal();
    local.history = { food: {}, drink: {} };
    DataManager.saveLocal(local);
    
    var lines = ['====== 随机' + (type === 'food' ? '菜单' : '饮品单') + ' ======'];
    
    for (var i = 0; i < periodConfig.default.length; i++) {
      var period = periodConfig.default[i];
      var choice = Picker.pick(menus, type, period);
      lines.push(Picker.getPrefix(periodConfig.names[period]) + (choice || '无数据'));
    }
    
    lines.push('======================');
    seal.replyToSender(ctx, msg, lines.join('\n'));
  },
  
  handleAdd: function(type, periodKey, items) {
    var local = DataManager.loadLocal();
    var periodConfig = CONFIG.periods[type];
    
    var added = [], skipped = [];
    
    if (periodKey && periodConfig.map[periodKey]) {
      var period = periodConfig.map[periodKey];
      if (!local[type]) local[type] = {};
      if (!local[type][period]) local[type][period] = [];
      
      for (var i = 0; i < items.length; i++) {
        var name = items[i].trim();
        var exists = false;
        for (var j = 0; j < local[type][period].length; j++) {
          if (local[type][period][j].toLowerCase() === name.toLowerCase()) {
            exists = true;
            break;
          }
        }
        if (exists) {
          skipped.push(name);
        } else {
          local[type][period].push(name);
          added.push(name);
        }
      }
      DataManager.saveLocal(local);
      return added.length ? '已将 ' + added.join('、') + ' 加入' + periodKey + '菜单' : '没有新增，已存在: ' + skipped.join('、');
    } else {
      if (!local.extraPool) local.extraPool = [];
      for (var i = 0; i < items.length; i++) {
        var name = items[i].trim();
        if (local.extraPool.indexOf(name) >= 0) {
          skipped.push(name);
        } else {
          local.extraPool.push(name);
          added.push(name);
        }
      }
      DataManager.saveLocal(local);
      return added.length ? '已将 ' + added.join('、') + ' 加入通用池' : '没有新增，已存在: ' + skipped.join('、');
    }
  },
  
  handleRemove: function(type, periodKey, items) {
    var local = DataManager.loadLocal();
    var periodConfig = CONFIG.periods[type];
    
    var removed = [], notFound = [];
    
    if (periodKey && periodConfig.map[periodKey]) {
      var period = periodConfig.map[periodKey];
      var list = local[type] && local[type][period] ? local[type][period] : [];
      
      for (var i = 0; i < items.length; i++) {
        var name = items[i].trim().toLowerCase();
        var found = -1;
        for (var j = 0; j < list.length; j++) {
          if (list[j].toLowerCase() === name) {
            found = j;
            break;
          }
        }
        if (found >= 0) {
          removed.push(list.splice(found, 1)[0]);
        } else {
          notFound.push(items[i]);
        }
      }
      DataManager.saveLocal(local);
    } else {
      for (var i = 0; i < items.length; i++) {
        var name = items[i].trim().toLowerCase();
        var found = -1;
        for (var j = 0; j < (local.extraPool || []).length; j++) {
          if (local.extraPool[j].toLowerCase() === name) {
            found = j;
            break;
          }
        }
        if (found >= 0) {
          removed.push(local.extraPool.splice(found, 1)[0]);
        } else {
          notFound.push(items[i]);
        }
      }
      DataManager.saveLocal(local);
    }
    
    var msg = '';
    if (removed.length) msg += '已删除: ' + removed.join('、') + '\n';
    if (notFound.length) msg += '未找到: ' + notFound.join('、');
    return msg || '操作完成';
  },
  
  handleReset: function() {
    DataManager.saveLocal({ food: {}, drink: {}, extraPool: [], history: { food: {}, drink: {} } });
    DataManager.cache = null;
    return '已重置为云端菜单，本地修改已清空';
  },
  
  handleRefresh: function(ctx, msg) {
    DataManager.cache = null;
    DataManager.fetchCloud(function(cloudData) {
      seal.replyToSender(ctx, msg, cloudData ? '已从云端刷新菜单' : '刷新失败，使用缓存数据');
    });
    return '正在刷新...';
  },
  
  handleLogin: function(ctx, msg) {
    // 获取用户ID
    var userId = '';
    try {
      if (ctx.player && ctx.player.userId) {
        userId = ctx.player.userId;
      } else if (ctx.message && ctx.message.sender && ctx.message.sender.userId) {
        userId = ctx.message.sender.userId;
      }
    } catch (e) {}
    
    if (!userId) {
      seal.replyToSender(ctx, msg, '无法获取用户信息');
      return;
    }
    
    // 去除QQ前缀
    userId = userId.replace(/^(QQ|qq|QQ:|qq:)/i, '');
    
    // 检查管理员权限
    var admins = DataManager.cache && DataManager.cache.admins ? DataManager.cache.admins : [];
    if (admins.indexOf(userId) < 0) {
      seal.replyToSender(ctx, msg, '您不是管理员，无法获取登录Token');
      return;
    }
    
    // 生成Token
    var exp = Date.now() + CONFIG.tokenTTL;
    var sig = btoa(userId + exp + 'shiling').slice(0, 16);
    var tokenData = JSON.stringify({ qq: userId, exp: exp, sig: sig });
    var token = btoa(tokenData);
    
    seal.replyToSender(ctx, msg, '【食灵管理面板登录Token】\n\nToken: ' + token + '\n\n有效期: 10分钟\n管理面板: https://shiling.xiaocui.icu');
  }
};

// ==================== 命令注册 ====================
var cmd = seal.ext.newCmdItemInfo();
cmd.name = '食灵';
cmd.help = '食灵帮助 v3.3\n\n.食灵/.饭笥 吃什么 - 根据时间推荐\n.食灵/.饭笥 喝什么 - 根据时间推荐饮品\n.食灵 [时段]吃什么 - 指定时段(早餐/中午/晚上/夜宵)\n.食灵 菜单 - 查看菜单\n.食灵 随机菜单 - 随机推荐\n.食灵 加菜 [时段] 菜名 - 添加菜品\n.食灵 删菜 [时段] 菜名 - 删除菜品\n.食灵 刷新 - 刷新菜单\n.食灵 登录 - 获取管理Token\n.食灵 help - 显示帮助';

cmd.solve = function(ctx, msg, argv) {
  var res = seal.ext.newCmdExecuteResult(true);
  var args = argv.args || [];
  var text = args.join(' ').trim().replace(/^\.?食灵\s*/, '').replace(/^\.?饭笥\s*/, '');
  
  if (!text || text === 'help') {
    res.showHelp = true;
    return res;
  }
  
  if (text === '吃什么') {
    CommandHandler.handleRecommend(ctx, msg, 'food');
    return res;
  }
  
  if (text === '喝什么') {
    CommandHandler.handleRecommend(ctx, msg, 'drink');
    return res;
  }
  
  if (text === '登录') {
    CommandHandler.handleLogin(ctx, msg);
    return res;
  }
  
  // 时段吃什么
  var foodMap = CONFIG.periods.food.map;
  for (var key in foodMap) {
    if (text === key + '吃什么') {
      CommandHandler.handleRecommend(ctx, msg, 'food', key);
      return res;
    }
  }
  
  // 时段喝什么
  var drinkMap = CONFIG.periods.drink.map;
  for (var key in drinkMap) {
    if (text === key + '喝什么') {
      CommandHandler.handleRecommend(ctx, msg, 'drink', key);
      return res;
    }
  }
  
  if (text.indexOf('加菜 ') === 0) {
    var items = text.slice(3).split(/\s+/);
    var periodKey = foodMap[items[0]] ? items[0] : null;
    var dishes = periodKey ? items.slice(1) : items;
    seal.replyToSender(ctx, msg, CommandHandler.handleAdd('food', periodKey, dishes));
    return res;
  }
  
  if (text.indexOf('删菜 ') === 0) {
    var items = text.slice(3).split(/\s+/);
    var periodKey = foodMap[items[0]] ? items[0] : null;
    var dishes = periodKey ? items.slice(1) : items;
    seal.replyToSender(ctx, msg, CommandHandler.handleRemove('food', periodKey, dishes));
    return res;
  }
  
  if (text.indexOf('加饮 ') === 0) {
    var items = text.slice(3).split(/\s+/);
    var periodKey = drinkMap[items[0]] ? items[0] : null;
    var drinks = periodKey ? items.slice(1) : items;
    seal.replyToSender(ctx, msg, CommandHandler.handleAdd('drink', periodKey, drinks));
    return res;
  }
  
  if (text.indexOf('删饮 ') === 0) {
    var items = text.slice(3).split(/\s+/);
    var periodKey = drinkMap[items[0]] ? items[0] : null;
    var drinks = periodKey ? items.slice(1) : items;
    seal.replyToSender(ctx, msg, CommandHandler.handleRemove('drink', periodKey, drinks));
    return res;
  }
  
  if (text === '菜单') {
    CommandHandler.handleShowMenu(ctx, msg, 'food');
    return res;
  }
  
  if (text === '饮单') {
    CommandHandler.handleShowMenu(ctx, msg, 'drink');
    return res;
  }
  
  if (text === '随机菜单') {
    CommandHandler.handleRandomMenu(ctx, msg, 'food');
    return res;
  }
  
  if (text === '随机饮单') {
    CommandHandler.handleRandomMenu(ctx, msg, 'drink');
    return res;
  }
  
  if (text === '刷新') {
    seal.replyToSender(ctx, msg, CommandHandler.handleRefresh(ctx, msg));
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

// 注册快捷命令
var cmdEat = seal.ext.newCmdItemInfo();
cmdEat.name = '吃什么';
cmdEat.solve = function(ctx, msg, argv) {
  CommandHandler.handleRecommend(ctx, msg, 'food');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['吃什么'] = cmdEat;

var cmdDrink = seal.ext.newCmdItemInfo();
cmdDrink.name = '喝什么';
cmdDrink.solve = function(ctx, msg, argv) {
  CommandHandler.handleRecommend(ctx, msg, 'drink');
  return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['喝什么'] = cmdDrink;

// 初始化时获取云端数据
DataManager.fetchCloud(function(data) {
  if (data) {
    console.log('食灵: 初始化完成，已获取云端数据');
  }
});
