// ==UserScript==
// @name        万物有灵·万象篇
// @author      铭茗
// @version     3.2.4
// @description 万物有灵扩展合集：图鉴、探险、打工、竞技场、成就、装备、技能书、市场、季节活动
// @timestamp   1776696319
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵·万象篇.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵·万象篇');
if (!ext) {
  ext = seal.ext.new('万物有灵·万象篇', '铭茗', '3.2.4');
  seal.ext.register(ext);
}

const EXT_SCHEMA_VERSION = 1;
const GAME_TIPS = [
  '💡 每日首次喂食可获得双倍好感度',
  '💡 宠物好感度达到100时可触发进化',
  '💡 不同性格会影响宠物的属性成长',
  '💡 天赋可以大幅提升宠物的战斗能力',
  '💡 稀有宠物有更高的基础属性',
  '💡 战斗时注意属性克制，可造成额外伤害',
  '💡 宠物血量越低，捕捉成功率越高',
  '💡 探险和打工可以获得技能书',
  '💡 训练师装备可以提升宠物属性',
  '💡 组队副本需要多人配合才能通关',
  '💡 世界Boss每天12:00、18:00、22:00刷新',
  '💡 神话宠物拥有专属技能',
  '💡 育种可以继承父母的优秀基因',
  '💡 宠物达到50级可挑战守护者',
  '💡 使用.宠物 help 查看完整命令列表',
];

function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

function getRandomTip() {
  const main = getMain();
  if (main?.Tips?.getRandom) return main.Tips.getRandom();
  return GAME_TIPS[Math.floor(Math.random() * GAME_TIPS.length)];
}

// ==================== 任务通知系统 ====================
const TaskNotifier = {
  // 存储用户上下文 { uid: { ctx, msg, groupId, lastCheck } }
  userContexts: {},

  // 注册用户上下文
  register(uid, ctx, msg) {
    this.userContexts[uid] = {
      ctx,
      msg,
      groupId: msg.groupId,
      userId: msg.userId,
      lastCheck: Date.now()
    };
  },

  // 发送通知给用户
  notify(uid, text) {
    const context = this.userContexts[uid];
    if (!context) return;

    try {
      // 使用存储的上下文发送消息
      seal.replyToSender(context.ctx, context.msg, text);
    } catch (e) {
      console.log('[万物有灵-扩展合集] 通知发送失败:', e);
    }
  },

  // 检查并通知已完成的任务
  checkAndNotify(main) {
    const now = Date.now();

    // 清理过期的用户上下文（超过1小时未活动）
    for (const uid of Object.keys(this.userContexts)) {
      if (now - (this.userContexts[uid].lastCheck || 0) > 3600000) {
        delete this.userContexts[uid];
      }
    }

    for (const uid of Object.keys(this.userContexts)) {
      try {
        const data = DB.ext.get(uid);
        const userData = getUserData(main, uid);
        if (!userData) continue;

        const notifications = [];

        // 检查探险任务
        if (data.explore && data.explore.length > 0) {
          for (const e of data.explore) {
            if (e.endTime <= now && !e.notified) {
              const result = completeExploreTask(uid, userData, data, e);
              if (result) notifications.push(`【探险完成】\n${result}`);
            }
          }
        }

        // 检查打工任务
        if (data.work && data.work.length > 0) {
          for (const w of data.work) {
            if (w.endTime <= now && !w.notified) {
              const result = completeWorkTask(uid, userData, data, w);
              if (result) notifications.push(`【打工完成】\n${result}`);
            }
          }
        }

        // 发送通知
        if (notifications.length > 0) {
          this.notify(uid, notifications.join('\n\n'));
          saveUserData(main, uid, userData);

          // 清理已通知的任务
          data.explore = (data.explore || []).filter(e => e.endTime > now || !e.notified);
          data.work = (data.work || []).filter(w => w.endTime > now || !w.notified);
          DB.ext.save(uid, data);
        }
      } catch (e) {
        console.log('[万物有灵-扩展合集] 任务检查错误:', e);
      }
    }
  },

  // 启动定时检查
  startInterval(main) {
    // 清理旧的定时器
    if (this._interval) clearInterval(this._interval);
    // 每30秒检查一次
    this._interval = setInterval(() => this.checkAndNotify(main), 30000);
    console.log('[万物有灵-扩展合集] 任务通知系统已启动');
  }
};

// ==================== 通用工具 ====================
function waitForMain(cb, n = 10) {
  const m = getMain();
  if (m) cb(m);
  else if (n > 0) setTimeout(() => waitForMain(cb, n - 1), 500);
}

function getUserData(main, uid) {
  return main?.Utils?.getUserData ? main.Utils.getUserData(uid) : main.DB.get(uid);
}

function saveUserData(main, uid, data) {
  return main?.Utils?.saveUserData ? main.Utils.saveUserData(uid, data) : main.DB.save(uid, data);
}

function getPetCapacity(main, data) {
  return {
    maxPets: main?.Config?.maxPets || 3,
    maxStorage: data?.maxStorage || main?.Config?.maxStorage || 15,
  };
}

function normalizePetState(pet) {
  if (!pet || typeof pet !== 'object') return pet;
  pet.breedCount = pet.breedCount ?? 0;
  pet.canBreed = pet.canBreed ?? (pet.breedCount < 1);
  pet.retired = pet.retired ?? false;
  pet.evolved = pet.evolved ?? false;
  pet.parents = pet.parents ?? null;
  return pet;
}

function getShelterMarket(main) {
  if (main?.getShelterMarket) return main.getShelterMarket();
  return main?._shelterMarket || {};
}

function saveShelterMarket(main, shelter) {
  if (main?.saveShelterMarket) return main.saveShelterMarket(shelter);
  main._shelterMarket = shelter;
  return ext.storageSet('shelterMarket', JSON.stringify(shelter));
}

function getSharedStorage(main) {
  return main?.Storage || null;
}

// ==================== 数据存储 ====================
const DB = {
  ext: {
    migrate(data) {
      if (!data || typeof data !== 'object') return data;
      if (!data.schemaVersion) data.schemaVersion = EXT_SCHEMA_VERSION;
      return data;
    },
    get(userId) {
      const defaultData = { schemaVersion: EXT_SCHEMA_VERSION, pokedex: {}, explore: [], work: [], arenaWins: 0, arenaRank: 1000 };
      try {
        const d = ext.storageGet('e_' + userId);
        if (!d) return defaultData;
        const data = this.migrate(JSON.parse(d));
        return { ...defaultData, ...data };
      } catch { return defaultData; }
    },
    save(userId, data) { data.schemaVersion = EXT_SCHEMA_VERSION; ext.storageSet('e_' + userId, JSON.stringify(data)); },
  },
  achievement: {
    get(userId) {
      const defaultData = { schemaVersion: EXT_SCHEMA_VERSION, unlocked: {}, stats: { captureCount: 0, battleWins: 0, pvpWins: 0, exploreCount: 0, workCount: 0, feedStreak: { petId: null, count: 0 }, fightLoseStreak: 0 } };
      try {
        const d = ext.storageGet('ach_' + userId);
        if (!d) return defaultData;
        const data = JSON.parse(d);
        data.schemaVersion = data.schemaVersion || EXT_SCHEMA_VERSION;
        data.unlocked = data.unlocked || {};
        data.stats = { ...defaultData.stats, ...data.stats };
        return data;
      } catch { return defaultData; }
    },
    save(userId, data) { data.schemaVersion = EXT_SCHEMA_VERSION; ext.storageSet('ach_' + userId, JSON.stringify(data)); },
  },
  equip: {
    get(userId) {
      const defaultData = { schemaVersion: EXT_SCHEMA_VERSION, bag: {}, equipped: {} };
      try {
        const d = ext.storageGet('eq_' + userId);
        if (!d) return defaultData;
        const data = JSON.parse(d);
        return { ...defaultData, ...data, schemaVersion: data.schemaVersion || EXT_SCHEMA_VERSION };
      } catch { return defaultData; }
    },
    save(userId, data) { data.schemaVersion = EXT_SCHEMA_VERSION; ext.storageSet('eq_' + userId, JSON.stringify(data)); },
  },
  skillbook: {
    get(userId) {
      const defaultData = { schemaVersion: EXT_SCHEMA_VERSION, books: {} };
      try {
        const d = ext.storageGet('sb_' + userId);
        if (!d) return defaultData;
        const data = JSON.parse(d);
        return { ...defaultData, ...data, schemaVersion: data.schemaVersion || EXT_SCHEMA_VERSION };
      } catch { return defaultData; }
    },
    save(userId, data) { data.schemaVersion = EXT_SCHEMA_VERSION; ext.storageSet('sb_' + userId, JSON.stringify(data)); },
  },
};

let marketData = { listings: {}, lastUpdate: 0 };
function loadMarket() {
  const main = getMain();
  if (main?.getMarketData) {
    marketData = main.getMarketData();
    return marketData;
  }
  const sharedStorage = getSharedStorage(main);
  if (sharedStorage?.getJSON) {
    marketData = sharedStorage.getJSON('market_global', { listings: {}, lastUpdate: 0 });
    return marketData;
  }
  try {
    const d = ext.storageGet('market_global');
    if (d) marketData = JSON.parse(d);
  } catch { marketData = { listings: {}, lastUpdate: 0 }; }
  return marketData;
}
function saveMarket() {
  const main = getMain();
  if (main?.saveMarketData) {
    main.saveMarketData(marketData);
    return;
  }
  const sharedStorage = getSharedStorage(main);
  if (sharedStorage?.setJSON) {
    sharedStorage.setJSON('market_global', marketData);
    return;
  }
  ext.storageSet('market_global', JSON.stringify(marketData));
}

// ==================== 配置定义 ====================
const EXT_CONFIG = {
  exploreTime: 30,
  workTime: 60,
  maxExplore: 2,
  maxWork: 1,
  dailyFullRewardTasks: 3,
  minDiminishRate: 0.35,
};

const EXPLORE_AREAS = [
  { name: '森林', gold: [20, 50], foods: ['苹果', '蜂蜜', '蘑菇'], danger: 0.1 },
  { name: '山脉', gold: [30, 70], foods: ['坚果', '蘑菇'], danger: 0.2 },
  { name: '湖泊', gold: [25, 60], foods: ['鱼干', '面包'], danger: 0.15 },
  { name: '洞穴', gold: [50, 100], foods: ['药水', '蘑菇'], danger: 0.3 },
  { name: '遗迹', gold: [80, 150], foods: ['药水', '牛排'], danger: 0.4 },
];

const WORK_TYPES = [
  { name: '看家', gold: [10, 20], energy: 5 },
  { name: '送货', gold: [20, 40], energy: 10 },
  { name: '狩猎', gold: [30, 60], energy: 15 },
  { name: '护送', gold: [50, 100], energy: 20 },
];

const ACHIEVEMENTS = {
  first_capture: { name: '初遇', desc: '捕捉第一只宠物', mark: '[*]' },
  capture_10: { name: '收藏家', desc: '累计捕捉10只宠物', mark: '[+]' },
  capture_50: { name: '动物园园长', desc: '累计捕捉50只宠物', mark: '[++]' },
  first_legend: { name: '传说降临', desc: '捕捉第一只传说宠物', mark: '[!]' },
  first_super: { name: '稀有发现', desc: '捕捉第一只超稀有宠物', mark: '[?]' },
  battle_win_10: { name: '初出茅庐', desc: '对战胜利10次', mark: '[>]' },
  battle_win_50: { name: '身经百战', desc: '对战胜利50次', mark: '[>>]' },
  battle_win_100: { name: '战神', desc: '对战胜利100次', mark: '[>>>]' },
  pvp_first_win: { name: '初试锋芒', desc: 'PVP首胜', mark: '[o]' },
  pvp_win_10: { name: '竞技新星', desc: 'PVP胜利10次', mark: '[oo]' },
  weakling: { name: '拜托，你很弱诶~', desc: '连续3次肉身搏斗被野外宠物打败', mark: '[~]' },
  feeder: { name: '宠物来吃饭了', desc: '连续喂同一只宠物10次', mark: '[&]' },
  lucky: { name: '天选之人', desc: '一次性捕捉到传说宠物', mark: '[*!]' },
  level_max: { name: '满级大师', desc: '将宠物培养到50级', mark: '[^]' },
  evolve_first: { name: '进化之光', desc: '首次进化宠物', mark: '[~]' },
  breed_first: { name: '生命延续', desc: '首次育种成功', mark: '[<]' },
  explore_10: { name: '探险家', desc: '完成10次探险', mark: '[#]' },
  work_10: { name: '打工人', desc: '完成10次打工', mark: '[$]' },
};

const EQUIP_TYPES = {
  weapon: { name: '武器', slot: 0 },
  armor: { name: '护甲', slot: 1 },
  accessory: { name: '饰品', slot: 2 },
};

const EQUIPS = {
  木剑: { type: 'weapon', atk: 5, cost: 100, desc: '简单的木制武器' },
  铁剑: { type: 'weapon', atk: 10, cost: 300, desc: '坚固的铁制武器' },
  精钢剑: { type: 'weapon', atk: 20, cost: 800, desc: '精炼钢材打造' },
  龙牙剑: { type: 'weapon', atk: 35, cost: 2000, desc: '传说中龙牙制成' },
  皮甲: { type: 'armor', def: 5, hp: 10, cost: 100, desc: '轻便的皮革护甲' },
  铁甲: { type: 'armor', def: 10, hp: 20, cost: 300, desc: '坚固的铁制护甲' },
  精钢甲: { type: 'armor', def: 20, hp: 40, cost: 800, desc: '精炼钢材打造' },
  龙鳞甲: { type: 'armor', def: 35, hp: 70, cost: 2000, desc: '传说中龙鳞制成' },
  力量戒指: { type: 'accessory', atk: 8, cost: 200, desc: '增加攻击力' },
  守护项链: { type: 'accessory', def: 8, cost: 200, desc: '增加防御力' },
  生命宝石: { type: 'accessory', hp: 30, cost: 250, desc: '增加生命值' },
  幸运符: { type: 'accessory', luck: 10, cost: 500, desc: '提升暴击几率' },
  风之羽: { type: 'accessory', spd: 15, cost: 400, desc: '提升速度' },
  疾风靴: { type: 'accessory', spd: 25, cost: 800, desc: '大幅提升速度' },
  龙心: { type: 'accessory', atk: 15, def: 15, hp: 50, spd: 10, cost: 3000, desc: '传说中的龙心' },
};


const SKILL_BOOKS = {
  '火焰术技能书': { skill: '火焰术', element: '火', rarity: '稀有', dropRate: 0.1 },
  '炎爆技能书': { skill: '炎爆', element: '火', rarity: '超稀有', dropRate: 0.03 },
  '水弹技能书': { skill: '水弹', element: '水', rarity: '稀有', dropRate: 0.1 },
  '洪流技能书': { skill: '洪流', element: '水', rarity: '超稀有', dropRate: 0.03 },
  '藤鞭技能书': { skill: '藤鞭', element: '草', rarity: '稀有', dropRate: 0.1 },
  '森葬技能书': { skill: '森葬', element: '草', rarity: '超稀有', dropRate: 0.03 },
  '闪电技能书': { skill: '闪电', element: '电', rarity: '稀有', dropRate: 0.1 },
  '雷暴技能书': { skill: '雷暴', element: '电', rarity: '超稀有', dropRate: 0.03 },
  '落石技能书': { skill: '落石', element: '岩石', rarity: '稀有', dropRate: 0.1 },
  '地裂技能书': { skill: '地裂', element: '岩石', rarity: '超稀有', dropRate: 0.03 },
  '念力技能书': { skill: '念力', element: '超能', rarity: '稀有', dropRate: 0.1 },
  '精神冲击技能书': { skill: '精神冲击', element: '超能', rarity: '超稀有', dropRate: 0.03 },
  '冲撞技能书': { skill: '冲撞', element: null, rarity: '普通', dropRate: 0.2 },
  '猛击技能书': { skill: '猛击', element: null, rarity: '稀有', dropRate: 0.08 },
};

const DROP_ZONES = {
  explore: { 森林: ['火焰术技能书', '藤鞭技能书', '冲撞技能书'], 山脉: ['落石技能书', '地裂技能书', '猛击技能书'], 湖泊: ['水弹技能书', '洪流技能书', '冲撞技能书'], 洞穴: ['闪电技能书', '雷暴技能书', '念力技能书'], 遗迹: ['炎爆技能书', '森葬技能书', '精神冲击技能书', '地裂技能书'] },
  work: { 狩猎: ['火焰术技能书', '闪电技能书', '猛击技能书'], 护送: ['落石技能书', '水弹技能书', '念力技能书'] },
};

const SEASONS = { spring: { name: '春季', months: [3, 4, 5] }, summer: { name: '夏季', months: [6, 7, 8] }, autumn: { name: '秋季', months: [9, 10, 11] }, winter: { name: '冬季', months: [12, 1, 2] } };

const SEASONAL_PETS = {
  spring: [{ species: '花仙子', element: '草', rarity: '超稀有', bonus: { hp: 10, atk: 5 } }, { species: '春风精灵', element: '超能', rarity: '稀有', bonus: { energy: 20 } }],
  summer: [{ species: '烈焰凤凰', element: '火', rarity: '传说', bonus: { atk: 15 } }, { species: '海神之子', element: '水', rarity: '超稀有', bonus: { hp: 15, def: 5 } }],
  autumn: [{ species: '丰收之灵', element: '草', rarity: '超稀有', bonus: { hp: 10, def: 10 } }, { species: '月光狼', element: '超能', rarity: '稀有', bonus: { atk: 8, energy: 10 } }],
  winter: [{ species: '冰霜巨龙', element: '水', rarity: '传说', bonus: { hp: 20, def: 10 } }, { species: '雪女', element: '超能', rarity: '超稀有', bonus: { def: 15 } }],
};

const FESTIVALS = [
  { name: '春节', dates: [[1, 20], [2, 10]], bonus: { exp: 2, gold: 2 }, pets: ['年兽'] },
  { name: '情人节', dates: [[2, 14], [2, 14]], bonus: { breedChance: 0.3 }, pets: ['爱神丘比特'] },
  { name: '万圣节', dates: [[10, 25], [11, 1]], bonus: { captureChance: 0.2 }, pets: ['南瓜精', '幽灵王'] },
  { name: '圣诞节', dates: [[12, 20], [12, 26]], bonus: { exp: 1.5 }, pets: ['圣诞驯鹿', '雪人'] },
];

const SEASONAL_AREAS = { spring: { name: '花海', gold: [50, 100], foods: ['花蜜', '春茶'], danger: 0.2 }, summer: { name: '火山', gold: [80, 150], foods: ['火龙果', '冰淇淋'], danger: 0.35 }, autumn: { name: '枫林', gold: [60, 120], foods: ['枫糖', '栗子'], danger: 0.25 }, winter: { name: '冰原', gold: [70, 130], foods: ['热可可', '烤红薯'], danger: 0.3 } };

const MARKET_CONFIG = { maxListings: 5, taxRate: 0.1, listingTaxRate: 0.02, minPrice: 50, maxPrice: 99999, listingExpire: 7 * 24 * 60 * 60 * 1000 };

// ==================== 辅助函数 ====================
function getPetAnywhere(p, idx) {
  const num = parseInt(idx);
  if (isNaN(num) || num < 1) return null;
  if (num <= 3) { const pet = p.data.pets[num - 1]; if (pet) return { pet, from: 'team', idx: num - 1 }; }
  const pet = (p.data.storage || [])[num - 4];
  if (pet) return { pet, from: 'storage', idx: num - 4 };
  return null;
}

function findPetById(playerData, petId) {
  const root = playerData?.data || playerData;
  let pet = (root?.pets || []).find(pt => pt.id === petId);
  if (pet) return { pet, from: 'team' };
  pet = (root?.storage || []).find(pt => pt.id === petId);
  if (pet) return { pet, from: 'storage' };
  return null;
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  return Object.entries(SEASONS).find(([, s]) => s.months.includes(month))?.[0] || 'spring';
}

function getCurrentFestival() {
  const now = new Date(), month = now.getMonth() + 1, day = now.getDate();
  return FESTIVALS.find(f => {
    const [start, end] = f.dates;
    if (start[0] === end[0]) return month === start[0] && day >= start[1] && day <= end[1];
    return (month === start[0] && day >= start[1]) || (month === end[0] && day <= end[1]);
  });
}

function getEquipStats(pet, equipData) {
  const equipped = equipData.equipped[pet.id] || {};
  let bonus = { atk: 0, def: 0, hp: 0, luck: 0, spd: 0 };
  Object.values(equipped).forEach(name => {
    const eq = EQUIPS[name];
    if (eq) { if (eq.atk) bonus.atk += eq.atk; if (eq.def) bonus.def += eq.def; if (eq.hp) bonus.hp += eq.hp; if (eq.luck) bonus.luck += eq.luck; if (eq.spd) bonus.spd += eq.spd; }
  });
  return bonus;
}

function getRandomSkillDrop(type, area) {
  const pool = DROP_ZONES[type]?.[area];
  if (!pool || !pool.length) return null;
  const bookName = pool[Math.floor(Math.random() * pool.length)];
  const book = SKILL_BOOKS[bookName];
  if (!book || Math.random() > book.dropRate) return null;
  return bookName;
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getTaskRewardRate(extData, type) {
  const key = dayKey();
  extData.dailyTaskStats = extData.dailyTaskStats || {};
  const stats = extData.dailyTaskStats[type] || { date: key, count: 0 };
  if (stats.date !== key) {
    stats.date = key;
    stats.count = 0;
  }
  const rate = Math.max(EXT_CONFIG.minDiminishRate, 1 - Math.max(0, stats.count - EXT_CONFIG.dailyFullRewardTasks) * 0.15);
  return {
    rate,
    commit() {
      stats.count++;
      extData.dailyTaskStats[type] = stats;
    },
  };
}

function scaleRangeReward(range, rate) {
  const min = Math.max(1, Math.floor(range[0] * rate));
  const max = Math.max(min, Math.floor(range[1] * rate));
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function completeExploreTask(uid, playerData, data, task) {
  const area = EXPLORE_AREAS.find(a => a.name === task.area);
  if (!area) return null;
  const found = findPetById(playerData, task.petId);
  if (!found) return null;
  const pet = found.pet;
  const root = playerData?.data || playerData;
  let r = `${pet.name} 从 ${area.name} 返回\n`;
  if (Math.random() < area.danger) {
    pet.hp = Math.max(1, pet.hp - 20);
    r += '遭遇危险受伤！\n';
  }
  const rewardRate = getTaskRewardRate(data, 'explore');
  const gold = scaleRangeReward(area.gold, rewardRate.rate);
  root.money = (root.money || 0) + gold;
  r += `获得 ${gold} 金币${rewardRate.rate < 1 ? '（收益递减）' : ''}\n`;
  const food = area.foods[Math.floor(Math.random() * area.foods.length)];
  root.food = root.food || {};
  root.food[food] = (root.food[food] || 0) + 1;
  r += `获得 ${food} x1`;
  const skillBook = getRandomSkillDrop('explore', area.name);
  if (skillBook && Math.random() < 0.1) {
    const sbData = DB.skillbook.get(uid);
    sbData.books[skillBook] = (sbData.books[skillBook] || 0) + 1;
    DB.skillbook.save(uid, sbData);
    r += `\n获得技能书【${skillBook}】x1`;
  }
  const achData = DB.achievement.get(uid);
  achData.stats.exploreCount = (achData.stats.exploreCount || 0) + 1;
  DB.achievement.save(uid, achData);
  if (achData.stats.exploreCount >= 10) unlockAchievement(uid, 'explore_10');
  rewardRate.commit();
  task.notified = true;
  return `${r}\n${getRandomTip()}`;
}

function completeWorkTask(uid, playerData, data, task) {
  const work = WORK_TYPES.find(wt => wt.name === task.work);
  if (!work) return null;
  const found = findPetById(playerData, task.petId);
  if (!found) return null;
  const pet = found.pet;
  const root = playerData?.data || playerData;
  const rewardRate = getTaskRewardRate(data, 'work');
  const gold = scaleRangeReward(work.gold, rewardRate.rate);
  root.money = (root.money || 0) + gold;
  let r = `${pet.name} 完成${work.name}，获得 ${gold} 金币${rewardRate.rate < 1 ? '（收益递减）' : ''}`;
  const skillBook = getRandomSkillDrop('work', work.name);
  if (skillBook && Math.random() < 0.05) {
    const sbData = DB.skillbook.get(uid);
    sbData.books[skillBook] = (sbData.books[skillBook] || 0) + 1;
    DB.skillbook.save(uid, sbData);
    r += `\n获得技能书【${skillBook}】x1`;
  }
  const achData = DB.achievement.get(uid);
  achData.stats.workCount = (achData.stats.workCount || 0) + 1;
  DB.achievement.save(uid, achData);
  if (achData.stats.workCount >= 10) unlockAchievement(uid, 'work_10');
  rewardRate.commit();
  task.notified = true;
  return `${r}\n${getRandomTip()}`;
}

function formatPet(pet) {
  const r = { '普通': '', '稀有': '*', '超稀有': '**', '传说': '***' }[pet.rarity] || '';
  const e = pet.element ? `[${pet.element}]` : '';
  return `${r}${e} ${pet.name} Lv.${pet.level}`;
}

function unlockAchievement(uid, id, dataOverride = null) {
  const data = dataOverride || DB.achievement.get(uid);
  if (data.unlocked[id]) return;
  const ach = ACHIEVEMENTS[id];
  if (!ach) return;
  data.unlocked[id] = { time: Date.now(), name: ach.name };
  if (!dataOverride) DB.achievement.save(uid, data);
  return ach;
}

function inferMarketSource(item) {
  if (!item || item.type !== 'item') return item?.source || '';
  if (item.source) return item.source;
  if (typeof ITEMS !== 'undefined' && ITEMS[item.itemName]) return 'items';
  if (EQUIPS[item.itemName]) return 'equip';
  if (SKILL_BOOKS[item.itemName]) return 'skillbook';
  return 'playerItems';
}

function normalizeMarketListings() {
  loadMarket();
  let changed = false;
  marketData.listings = marketData.listings || {};
  for (const item of Object.values(marketData.listings)) {
    if (item?.type === 'item' && !item.source) {
      item.source = inferMarketSource(item);
      changed = true;
    }
  }
  if (changed) saveMarket();
  return changed;
}

function getUserListings(uid) {
  loadMarket();
  return Object.entries(marketData.listings).filter(([, item]) => item.sellerId === uid).map(([id, item]) => ({ id, ...item }));
}

function resolveMarketId(shortId) {
  loadMarket();
  const key = String(shortId || '').trim();
  if (!key) return { error: '请输入编号' };
  if (marketData.listings[key]) return { id: key };
  const matches = Object.keys(marketData.listings).filter(id => id.endsWith(key));
  if (matches.length === 0) return { error: '未找到' };
  if (matches.length > 1) return { error: '编号不唯一，请输入更长编号' };
  return { id: matches[0] };
}

function addMarketItemToOwner(main, uid, item) {
  if (!item || item.type !== 'item') return false;
  const source = item.source || 'playerItems';
  if (source === 'equip') {
    const eq = DB.equip.get(uid);
    eq.bag[item.itemName] = (eq.bag[item.itemName] || 0) + item.count;
    DB.equip.save(uid, eq);
    return true;
  }
  if (source === 'skillbook') {
    const sb = DB.skillbook.get(uid);
    sb.books[item.itemName] = (sb.books[item.itemName] || 0) + item.count;
    DB.skillbook.save(uid, sb);
    return true;
  }
  const data = getUserData(main, uid);
  if (!data) return false;
  const bag = source === 'items' ? (data.items = data.items || {}) : (data.playerItems = data.playerItems || {});
  bag[item.itemName] = (bag[item.itemName] || 0) + item.count;
  saveUserData(main, uid, data);
  return true;
}

function takeMarketItemFromSeller(main, uid, itemName, count) {
  const data = getUserData(main, uid);
  if (!data) return { success: false };
  data.playerItems = data.playerItems || {};
  data.items = data.items || {};
  if ((data.playerItems[itemName] || 0) >= count) {
    data.playerItems[itemName] -= count;
    if (data.playerItems[itemName] <= 0) delete data.playerItems[itemName];
    saveUserData(main, uid, data);
    return { success: true, source: 'playerItems' };
  }
  if ((data.items[itemName] || 0) >= count) {
    data.items[itemName] -= count;
    if (data.items[itemName] <= 0) delete data.items[itemName];
    saveUserData(main, uid, data);
    return { success: true, source: 'items' };
  }
  const eq = DB.equip.get(uid);
  if ((eq.bag[itemName] || 0) >= count) {
    eq.bag[itemName] -= count;
    if (eq.bag[itemName] <= 0) delete eq.bag[itemName];
    DB.equip.save(uid, eq);
    return { success: true, source: 'equip' };
  }
  const sb = DB.skillbook.get(uid);
  if ((sb.books[itemName] || 0) >= count) {
    sb.books[itemName] -= count;
    if (sb.books[itemName] <= 0) delete sb.books[itemName];
    DB.skillbook.save(uid, sb);
    return { success: true, source: 'skillbook' };
  }
  return { success: false };
}

function prepareMarketItemFromSeller(main, uid, itemName, count) {
  const data = getUserData(main, uid);
  if (!data) return { success: false };
  data.playerItems = data.playerItems || {};
  data.items = data.items || {};
  if ((data.playerItems[itemName] || 0) >= count) return { success: true, source: 'playerItems', data };
  if ((data.items[itemName] || 0) >= count) return { success: true, source: 'items', data };
  const eq = DB.equip.get(uid);
  if ((eq.bag[itemName] || 0) >= count) return { success: true, source: 'equip', eq };
  const sb = DB.skillbook.get(uid);
  if ((sb.books[itemName] || 0) >= count) return { success: true, source: 'skillbook', sb };
  return { success: false };
}

function commitPreparedMarketItem(main, uid, itemName, count, prepared, listingTax) {
  if (!prepared?.success) return false;
  if (prepared.source === 'playerItems' || prepared.source === 'items') {
    const data = prepared.data;
    const bag = prepared.source === 'items' ? data.items : data.playerItems;
    bag[itemName] -= count;
    if (bag[itemName] <= 0) delete bag[itemName];
    data.money = Math.max(0, (data.money || 0) - listingTax);
    saveUserData(main, uid, data);
    return true;
  }
  const feeData = getUserData(main, uid);
  if (!feeData || (feeData.money || 0) < listingTax) return false;
  feeData.money = Math.max(0, (feeData.money || 0) - listingTax);
  saveUserData(main, uid, feeData);
  if (prepared.source === 'equip') {
    prepared.eq.bag[itemName] -= count;
    if (prepared.eq.bag[itemName] <= 0) delete prepared.eq.bag[itemName];
    DB.equip.save(uid, prepared.eq);
    return true;
  }
  if (prepared.source === 'skillbook') {
    prepared.sb.books[itemName] -= count;
    if (prepared.sb.books[itemName] <= 0) delete prepared.sb.books[itemName];
    DB.skillbook.save(uid, prepared.sb);
    return true;
  }
  return false;
}

function parseSellArgs(p) {
  let args = Array.isArray(p.args) ? p.args.filter(Boolean) : [];
  if (args[0] === '挂售' || args[0] === 'sell') args = args.slice(1);
  if (args.length >= 2) {
    let count = 1;
    let price = parseInt(args[args.length - 1]);
    let nameEnd = args.length - 1;
    if (args.length >= 3 && !isNaN(parseInt(args[args.length - 2]))) {
      price = parseInt(args[args.length - 1]);
      count = Math.max(1, parseInt(args[args.length - 2]));
      nameEnd = args.length - 2;
    }
    return { target: args.slice(0, nameEnd).join(' '), price, count };
  }
  return { target: p.p1, price: parseInt(p.p2), count: parseInt(p.p3) || 1 };
}

function validateMarketPrice(price) {
  if (!Number.isInteger(price) || price < MARKET_CONFIG.minPrice || price > MARKET_CONFIG.maxPrice) {
    return `价格需在${MARKET_CONFIG.minPrice}-${MARKET_CONFIG.maxPrice}之间`;
  }
  return '';
}

function cleanExpired() {
  const now = Date.now();
  let changed = false;
  Object.keys(marketData.listings).forEach(id => {
    const item = marketData.listings[id];
    if (!item || item.expire >= now) return;

    const main = getMain();
    let recovered = false;

    if (main && item.type === 'pet') {
      try {
        const sellerData = getUserData(main, item.sellerId);
        if (sellerData) {
          const capacity = getPetCapacity(main, sellerData);
          sellerData.storage = sellerData.storage || [];
          if (sellerData.storage.length < capacity.maxStorage) {
            sellerData.storage.push(normalizePetState(item.pet));
            saveUserData(main, item.sellerId, sellerData);
            recovered = true;
          }
        }
      } catch (e) {
        console.log('[万物有灵-万象篇] 归还过期宠物失败:', e);
      }
    } else if (main && item.type === 'item') {
      try {
        recovered = addMarketItemToOwner(main, item.sellerId, item);
      } catch (e) {
        console.log('[万物有灵-万象篇] 归还过期物品失败:', e);
      }
    }

    if (recovered) {
      delete marketData.listings[id];
      changed = true;
    } else if (item.type === 'pet' || item.type === 'item') {
      // 卖家空间/数据暂不可用时延期，避免挂单资产丢失
      item.expire = now + 6 * 60 * 60 * 1000;
      item.recoverAttempts = (item.recoverAttempts || 0) + 1;
      changed = true;
    } else {
      delete marketData.listings[id];
      changed = true;
    }
  });
  if (changed) saveMarket();
}

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return console.log('[万物有灵-扩展合集] 主插件未找到');

  // 注册Mod
  main.registerMod({ id: 'wanwu-all', name: '万物有灵-扩展合集', version: '3.2.4', author: '铭茗', description: '图鉴、探险、打工、竞技场、成就、装备、技能书、市场、季节活动', dependencies: [] });

  // 启动任务通知系统
  TaskNotifier.startInterval(main);

  // 注册用户上下文的钩子 - 在任何宠物命令时注册
  main.on('command', ({ uid, ctx, msg }) => {
    TaskNotifier.register(uid, ctx, msg);
  }, 'wanwu-all', '通知');

  // 事件监听
  main.on('capture', ({ uid, pet }) => {
    if (!pet || !pet.species) return;
    const data = DB.ext.get(uid);
    if (!data.pokedex[pet.species]) data.pokedex[pet.species] = { count: 0, firstTime: Date.now() };
    data.pokedex[pet.species].count++;
    DB.ext.save(uid, data);
    const achData = DB.achievement.get(uid);
    achData.stats.captureCount++;
    if (achData.stats.captureCount === 1) unlockAchievement(uid, 'first_capture', achData);
    if (achData.stats.captureCount >= 10) unlockAchievement(uid, 'capture_10', achData);
    if (achData.stats.captureCount >= 50) unlockAchievement(uid, 'capture_50', achData);
    if (pet.rarity === '传说') { unlockAchievement(uid, 'first_legend', achData); if (achData.stats.captureCount === 1) unlockAchievement(uid, 'lucky', achData); }
    if (pet.rarity === '超稀有') unlockAchievement(uid, 'first_super', achData);
    DB.achievement.save(uid, achData);
  }, 'wanwu-all', '万象篇');

  main.on('battle', ({ uid, winner, draw, isNPC, targetUid, pet1, mode, playerMode }) => {
    if (draw) return;

    const data = DB.achievement.get(uid);
    // winner是布尔值：true表示当前玩家获胜
    if (winner) {
      data.stats.battleWins++;
      data.stats.fightLoseStreak = 0;
      if (!isNPC) data.stats.pvpWins++;
      DB.achievement.save(uid, data);
      if (data.stats.battleWins >= 10) unlockAchievement(uid, 'battle_win_10');
      if (data.stats.battleWins >= 50) unlockAchievement(uid, 'battle_win_50');
      if (data.stats.battleWins >= 100) unlockAchievement(uid, 'battle_win_100');
      if (!isNPC && data.stats.pvpWins === 1) unlockAchievement(uid, 'pvp_first_win');
      if (!isNPC && data.stats.pvpWins >= 10) unlockAchievement(uid, 'pvp_win_10');
    } else {
      if ((mode === 'wild' || isNPC) && playerMode === 'body') {
        data.stats.fightLoseStreak = (data.stats.fightLoseStreak || 0) + 1;
        if (data.stats.fightLoseStreak >= 3) unlockAchievement(uid, 'weakling', data);
      } else {
        data.stats.fightLoseStreak = 0;
      }
      DB.achievement.save(uid, data);
    }

    // 竞技场积分
    if (!isNPC && targetUid) {
      const extData = DB.ext.get(uid);
      const targetData = DB.ext.get(targetUid);
      if (extData && targetData) {
        // 积分变化基于双方分差计算，更公平
        const baseChange = 25;
        const ratingDiff = (extData.arenaRank || 1000) - (targetData.arenaRank || 1000);
        const change = Math.max(10, Math.min(50, baseChange + Math.floor(ratingDiff / 20)));
        if (winner) {
          extData.arenaRank = (extData.arenaRank || 1000) + change;
          extData.arenaWins++;
          targetData.arenaRank = Math.max(0, (targetData.arenaRank || 1000) - change);
        } else {
          extData.arenaRank = Math.max(0, (extData.arenaRank || 1000) - change);
          targetData.arenaRank = (targetData.arenaRank || 1000) + change;
        }
        DB.ext.save(uid, extData); DB.ext.save(targetUid, targetData);
      }
    }
  }, 'wanwu-all', '万象篇');

  main.on('feed', ({ uid, pet }) => {
    if (!pet) return;
    const data = DB.achievement.get(uid);
    if (data.stats.feedStreak.petId === pet.id) data.stats.feedStreak.count++;
    else data.stats.feedStreak = { petId: pet.id, count: 1 };
    if (data.stats.feedStreak.count >= 10) unlockAchievement(uid, 'feeder');
    DB.achievement.save(uid, data);
  }, 'wanwu-all', '万象篇');

  main.on('levelup', ({ uid, newLevel }) => { if (newLevel >= 50) unlockAchievement(uid, 'level_max'); }, 'wanwu-all', '万象篇');
  main.on('evolution', ({ uid }) => unlockAchievement(uid, 'evolve_first'), 'wanwu-all', '万象篇');
  main.on('breed', ({ uid }) => unlockAchievement(uid, 'breed_first'), 'wanwu-all', '万象篇');

  // ========== 图鉴 ==========
  main.registerCommand('捕捉统计', (ctx, msg, p) => {
    const data = DB.ext.get(p.uid);
    const entries = Object.entries(data.pokedex || {});
    if (!entries.length) return p.reply('【捕捉统计】\n尚未捕捉任何宠物');
    const lines = ['【捕捉统计】', `已捕捉: ${entries.length}种`];
    entries.sort((a, b) => b[1].count - a[1].count).slice(0, 15).forEach(([s, i]) => lines.push(`${s}: ${i.count}次`));
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看捕捉统计', 'wanwu-all', '万象篇');

  // ========== 竞技场 ==========
  main.registerCommand('竞技场', (ctx, msg, p) => {
    const data = DB.ext.get(p.uid);
    p.reply(`【竞技场】\n积分: ${data.arenaRank || 1000}\n胜场: ${data.arenaWins || 0}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '查看竞技场', 'wanwu-all', '万象篇');

  // ========== 成就 ==========
  main.registerCommand('成就', (ctx, msg, p) => {
    const data = DB.achievement.get(p.uid);
    const unlocked = Object.entries(data.unlocked);
    if (!unlocked.length) return p.reply('【成就】\n暂无成就');
    const lines = ['【成就】', `已解锁: ${unlocked.length}/${Object.keys(ACHIEVEMENTS).length}`];
    unlocked.slice(0, 10).forEach(([id]) => { const ach = ACHIEVEMENTS[id]; if (ach) lines.push(`${ach.mark} ${ach.name}`); });
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看成就', 'wanwu-all', '万象篇');

  main.registerCommand('成就列表', (ctx, msg, p) => {
    const data = DB.achievement.get(p.uid);
    const lines = ['【全部成就】'];
    Object.entries(ACHIEVEMENTS).forEach(([id, ach]) => lines.push(`${data.unlocked[id] ? '[v]' : '[ ]'} ${ach.name} - ${ach.desc}`));
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看所有成就', 'wanwu-all', '万象篇');

  // ========== 装备商店 ==========
  main.registerCommand('宠物装备商店', (ctx, msg, p) => {
    const mainData = getUserData(main, p.uid);
    const lines = ['【宠物装备商店】', `金币: ${mainData.money}`];
    Object.entries(EQUIPS).forEach(([name, eq]) => {
      const e = []; if (eq.atk) e.push(`攻+${eq.atk}`); if (eq.def) e.push(`防+${eq.def}`); if (eq.hp) e.push(`血+${eq.hp}`); if (eq.spd) e.push(`速+${eq.spd}`);
      lines.push(`[${EQUIP_TYPES[eq.type].name}] ${name}: ${eq.cost}金 (${e.join(',')})`);
    });
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看宠物装备商店', 'wanwu-all', '万象篇');

  main.registerCommand('购买宠物装备', (ctx, msg, p) => {
    const name = p.p1; if (!name) return p.reply('请指定装备名称');
    const eq = EQUIPS[name]; if (!eq) return p.reply('未知装备');
    const mainData = getUserData(main, p.uid);
    if (mainData.money < eq.cost) return p.reply(`金币不足，需要 ${eq.cost}`);
    mainData.money -= eq.cost; saveUserData(main, p.uid, mainData);
    const data = DB.equip.get(p.uid); data.bag[name] = (data.bag[name] || 0) + 1; DB.equip.save(p.uid, data);
    p.reply(`购买成功！获得 ${name}\n${getRandomTip()}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '购买宠物装备', 'wanwu-all', '万象篇');

  main.registerCommand('宠物装备背包', (ctx, msg, p) => {
    const data = DB.equip.get(p.uid);
    const items = Object.entries(data.bag).filter(([, c]) => c > 0);
    if (!items.length) return p.reply('【装备背包】\n空');
    const lines = ['【装备背包】']; items.forEach(([n, c]) => lines.push(`${n} x${c}`));
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看宠物装备背包', 'wanwu-all', '万象篇');

  main.registerCommand('穿戴装备', (ctx, msg, p) => {
    const petIdx = parseInt(p.p1), equipName = p.p2;
    if (!petIdx || !equipName) return p.reply('用法: .宠物 穿戴装备 <编号> <装备名>');
    const mainData = getUserData(main, p.uid);
    if (!mainData.pets || !mainData.pets[petIdx - 1]) return p.reply('宠物不存在');
    const pet = mainData.pets[petIdx - 1];
    const data = DB.equip.get(p.uid); if (!data.bag[equipName]) return p.reply('没有这件装备');
    const eq = EQUIPS[equipName]; if (!eq) return p.reply('未知装备');
    const slot = EQUIP_TYPES[eq.type].slot;
    const equipped = data.equipped[pet.id] || {};
    
    // 卸下旧装备：返还背包并扣除属性
    if (equipped[slot]) {
      const oldName = equipped[slot];
      const oldEq = EQUIPS[oldName];
      if (oldEq) {
        if (oldEq.atk) pet.atk = Math.max(1, (pet.atk || 10) - oldEq.atk);
        if (oldEq.def) pet.def = Math.max(1, (pet.def || 10) - oldEq.def);
        if (oldEq.hp) { pet.maxHp = Math.max(10, (pet.maxHp || 50) - oldEq.hp); pet.hp = Math.min(pet.hp, pet.maxHp); }
        if (oldEq.spd) pet.spd = Math.max(1, (pet.spd || 100) - oldEq.spd);
      }
      data.bag[oldName] = (data.bag[oldName] || 0) + 1;
    }
    
    // 穿上新装备：扣除背包并应用属性
    equipped[slot] = equipName;
    data.equipped[pet.id] = equipped;
    data.bag[equipName]--;
    if (data.bag[equipName] <= 0) delete data.bag[equipName];
    if (eq.atk) pet.atk = (pet.atk || 10) + eq.atk;
    if (eq.def) pet.def = (pet.def || 10) + eq.def;
    if (eq.hp) { pet.maxHp = (pet.maxHp || 50) + eq.hp; pet.hp = Math.min(pet.hp + eq.hp, pet.maxHp); }
    if (eq.spd) pet.spd = (pet.spd || 100) + eq.spd;
    
    DB.equip.save(p.uid, data);
    saveUserData(main, p.uid, mainData);
    p.reply(`${pet.name} 穿戴了 ${equipName}\n${eq.desc}\n${getRandomTip()}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '宠物穿戴装备', 'wanwu-all', '万象篇');

  // ========== 宠物技能书 ==========
  main.registerCommand('宠物技能书', (ctx, msg, p) => {
    const data = DB.skillbook.get(p.uid);
    const items = Object.entries(data.books).filter(([, c]) => c > 0);
    if (!items.length) return p.reply('【技能书】\n暂无\n探险打工有机会获得');
    const lines = ['【技能书】']; items.forEach(([n, c]) => { const b = SKILL_BOOKS[n]; lines.push(`${n} x${c} -> ${b.skill}`); });
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看宠物技能书', 'wanwu-all', '万象篇');

  main.registerCommand('宠物学习技能', (ctx, msg, p) => {
    const petIdx = parseInt(p.p1), bookName = p.p2;
    if (!petIdx || !bookName) return p.reply('用法: .宠物 宠物学习技能 <编号> <技能书名>');
    const mainData = getUserData(main, p.uid);
    if (!mainData.pets || !mainData.pets[petIdx - 1]) return p.reply('宠物不存在');
    const pet = mainData.pets[petIdx - 1];
    const data = DB.skillbook.get(p.uid);
    if (!data.books[bookName] || data.books[bookName] <= 0) return p.reply('没有这本技能书');
    const book = SKILL_BOOKS[bookName]; if (!book) return p.reply('未知技能书');
    // 属性匹配检查：技能书有属性要求时，宠物必须有对应属性
    if (book.element && pet.element !== book.element) {
      return p.reply(`属性不匹配：${bookName}需要${book.element}属性宠物，当前宠物是${pet.element || '无属性'}`);
    }
    if (pet.skills && pet.skills.includes(book.skill)) return p.reply('已学会该技能');
    pet.skills = pet.skills || [];
    if (pet.skills.length >= 4) return p.reply('技能已满(最多4个)，请先遗忘一个技能');
    pet.skills.push(book.skill);
    data.books[bookName]--;
    if (data.books[bookName] <= 0) delete data.books[bookName];
    saveUserData(main, p.uid, mainData); DB.skillbook.save(p.uid, data);
    p.reply(`${pet.name} 学会了 ${book.skill}！\n${getRandomTip()}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '宠物学习技能书', 'wanwu-all', '万象篇');

  // ========== 市场 ==========
  main.registerCommand('市场', (ctx, msg, p) => {
    loadMarket(); normalizeMarketListings(); cleanExpired();
    const listings = Object.entries(marketData.listings);
    if (!listings.length) {
      p.reply('【市场】\n暂无物品\n.宠物 挂售 <仓库编号/物品名> <价格> [数量]\n.宠物 购买 <编号>\n.宠物 取消出售 <编号>');
      return seal.ext.newCmdExecuteResult(true);
    }
    const lines = ['【市场】', `在售: ${listings.length}件`];
    listings.slice(0, 10).forEach(([id, item]) => {
      const code = id.slice(-6);
      if (item.type === 'item') {
        lines.push(`#${code} ${item.itemName} x${item.count} ${item.price}金 卖家:${item.sellerName}`);
      } else {
        lines.push(`#${code} ${formatPet(item.pet)} ${item.price}金 卖家:${item.sellerName}`);
      }
    });
    lines.push('.宠物 购买 <编号>');
    lines.push('.宠物 取消出售 <编号>');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看市场', 'wanwu-all', '万象篇');

  main.registerCommand('挂售', (ctx, msg, p) => {
    loadMarket(); normalizeMarketListings(); cleanExpired();
    const { target, price, count } = parseSellArgs(p);
    const priceError = validateMarketPrice(price);
    if (!target || priceError || count <= 0) return p.reply(`用法: .宠物 挂售 <宠物编号/物品名> <价格> [数量]\n${priceError || '价格和数量必须有效'}\n编号: 1-3队伍, 4-18仓库`);
    if (getUserListings(p.uid).length >= MARKET_CONFIG.maxListings) return p.reply(`挂单已达上限(${MARKET_CONFIG.maxListings})`);

    const mainData = getUserData(main, p.uid);
    if (!mainData) return p.reply('读取玩家数据失败');
    mainData.pets = mainData.pets || [];
    mainData.storage = mainData.storage || [];
    const listingTax = Math.floor(price * MARKET_CONFIG.listingTaxRate);
    if ((mainData.money || 0) < listingTax) return p.reply(`上架需要手续费${listingTax}金币`);
    const listingId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    const chargeListingTax = (ownerData) => {
      if (listingTax <= 0) return true;
      if (!ownerData || (ownerData.money || 0) < listingTax) return false;
      ownerData.money = Math.max(0, (ownerData.money || 0) - listingTax);
      return true;
    };

    // 尝试解析为宠物编号
    const petNum = parseInt(target);
    if (!isNaN(petNum) && String(petNum) === String(target)) {
      let pet;
      let storageIdx = -1;
      if (petNum <= 3) {
        if (petNum < 1 || petNum > mainData.pets.length) return p.reply('队伍无此宠物');
        pet = mainData.pets[petNum - 1];
        mainData.pets.splice(petNum - 1, 1);
      } else {
        storageIdx = petNum - 4;
        if (storageIdx < 0 || storageIdx >= mainData.storage.length) return p.reply('仓库无此宠物');
        pet = mainData.storage[storageIdx];
        mainData.storage.splice(storageIdx, 1);
      }
      if (!chargeListingTax(mainData)) return p.reply(`上架需要手续费${listingTax}金币`);
      const petForSale = normalizePetState(JSON.parse(JSON.stringify(pet)));
      marketData.listings[listingId] = { type: 'pet', pet: petForSale, price, sellerId: p.uid, sellerName: msg.sender.nickname || p.uid, time: Date.now(), expire: Date.now() + MARKET_CONFIG.listingExpire };
      try {
        saveUserData(main, p.uid, mainData);
        saveMarket();
      } catch (e) {
        if (petNum <= 3) mainData.pets.splice(petNum - 1, 0, pet);
        else mainData.storage.splice(storageIdx, 0, pet);
        mainData.money = (mainData.money || 0) + listingTax;
        saveUserData(main, p.uid, mainData);
        delete marketData.listings[listingId];
        saveMarket();
        console.log('[万物有灵-万象篇] 宠物挂售失败，已回滚:', e);
        return p.reply('挂售失败，资产已回滚，请稍后再试');
      }
      p.reply(`已挂售 ${pet.name} ${price}金 #${listingId.slice(-6)}${listingTax ? `\n已扣上架费${listingTax}金币` : ''}`);
      return seal.ext.newCmdExecuteResult(true);
    }

    const prepared = prepareMarketItemFromSeller(main, p.uid, target, count);
    if (!prepared.success) return p.reply(`你没有足够的 ${target} 或宠物编号错误`);
    if (prepared.source !== 'playerItems' && prepared.source !== 'items' && (mainData.money || 0) < listingTax) return p.reply(`上架需要手续费${listingTax}金币`);
    if (!commitPreparedMarketItem(main, p.uid, target, count, prepared, listingTax)) return p.reply('挂售失败，请稍后再试');
    marketData.listings[listingId] = { type: 'item', itemName: target, count, source: prepared.source, price, sellerId: p.uid, sellerName: msg.sender.nickname || p.uid, time: Date.now(), expire: Date.now() + MARKET_CONFIG.listingExpire };
    saveMarket();
    p.reply(`已挂售 ${target}x${count} ${price}金 #${listingId.slice(-6)}${listingTax ? `\n已扣上架费${listingTax}金币` : ''}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '挂售宠物', 'wanwu-all', '万象篇');

  main.registerCommand('购买', (ctx, msg, p) => {
    const shortId = p.p1; if (!shortId) return p.reply('用法: .宠物 购买 <编号>');
    loadMarket(); normalizeMarketListings(); cleanExpired();
    const resolved = resolveMarketId(shortId);
    if (resolved.error) return p.reply(resolved.error);
    const listingId = resolved.id;
    const item = marketData.listings[listingId];
    if (!item) return p.reply('未找到');
    if (item.sellerId === p.uid) return p.reply('不能买自己的');
    const mainData = getUserData(main, p.uid);
    const sellerData = getUserData(main, item.sellerId);
    if (!mainData || !sellerData) return p.reply('交易数据读取失败，请稍后再试');
    mainData.pets = mainData.pets || [];
    mainData.storage = mainData.storage || [];
    if ((mainData.money || 0) < item.price) return p.reply(`金币不足 ${item.price}`);

    if (item.type === 'pet') {
      const capacity = getPetCapacity(main, mainData);
      if (mainData.pets.length >= capacity.maxPets && mainData.storage.length >= capacity.maxStorage) {
        return p.reply(`宠物和仓库已满(${capacity.maxPets + capacity.maxStorage}只上限)，无法购买`);
      }
    }

    const lockedItem = { ...item, processingAt: Date.now() };
    delete marketData.listings[listingId];
    saveMarket();
    try {
      mainData.money -= item.price;
      if (item.type === 'item') {
        if (item.source === 'items') {
          mainData.items = mainData.items || {};
          mainData.items[item.itemName] = (mainData.items[item.itemName] || 0) + item.count;
        } else if (item.source === 'equip') {
          const eq = DB.equip.get(p.uid);
          eq.bag[item.itemName] = (eq.bag[item.itemName] || 0) + item.count;
          DB.equip.save(p.uid, eq);
        } else if (item.source === 'skillbook') {
          const sb = DB.skillbook.get(p.uid);
          sb.books[item.itemName] = (sb.books[item.itemName] || 0) + item.count;
          DB.skillbook.save(p.uid, sb);
        } else {
          mainData.playerItems = mainData.playerItems || {};
          mainData.playerItems[item.itemName] = (mainData.playerItems[item.itemName] || 0) + item.count;
        }
      } else {
        const adoptedPet = normalizePetState(item.pet);
        const capacity = getPetCapacity(main, mainData);
        if (mainData.pets.length < capacity.maxPets) mainData.pets.push(adoptedPet);
        else mainData.storage.push(adoptedPet);
      }
      sellerData.money = (sellerData.money || 0) + Math.floor(item.price * (1 - MARKET_CONFIG.taxRate));
      saveUserData(main, p.uid, mainData);
      saveUserData(main, item.sellerId, sellerData);
    } catch (e) {
      marketData.listings[listingId] = lockedItem;
      saveMarket();
      console.log('[万物有灵-万象篇] 市场交易失败，已恢复挂单:', e);
      return p.reply('交易失败，挂单已恢复，请稍后再试');
    }
    p.reply(item.type === 'item' ? `购买成功！获得 ${item.itemName}x${item.count}\n${getRandomTip()}` : `购买成功！获得 ${item.pet.name}\n${getRandomTip()}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '购买物品', 'wanwu-all', '万象篇');

  main.registerCommand('取消出售', (ctx, msg, p) => {
    const shortId = p.p1;
    if (!shortId) return p.reply('用法: .宠物 取消出售 <编号>');
    loadMarket(); normalizeMarketListings(); cleanExpired();
    const resolved = resolveMarketId(shortId);
    if (resolved.error) return p.reply(resolved.error);
    const listingId = resolved.id;
    const item = marketData.listings[listingId];
    if (!item) return p.reply('未找到');
    if (item.sellerId !== p.uid) return p.reply('只能取消自己的挂单');
    if (item.type === 'pet') {
      const data = getUserData(main, p.uid);
      if (!data) return p.reply('读取玩家数据失败');
      const capacity = getPetCapacity(main, data);
      data.storage = data.storage || [];
      if (data.storage.length >= capacity.maxStorage) return p.reply('仓库已满，暂时无法取回宠物');
      data.storage.push(normalizePetState(item.pet));
      saveUserData(main, p.uid, data);
    } else if (!addMarketItemToOwner(main, p.uid, item)) {
      return p.reply('取回物品失败，请稍后再试');
    }
    delete marketData.listings[listingId];
    saveMarket();
    p.reply(item.type === 'pet' ? `已取消出售，${item.pet.name}已放入仓库` : `已取消出售，取回 ${item.itemName}x${item.count}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '取消出售', 'wanwu-all', '万象篇');

  // 为了兼容旧命令，保留 购买宠物 别名
  main.registerCommand('购买宠物', (ctx, msg, p) => {
    const shortId = p.p1 || p.p2;
    if (!shortId) return p.reply('用法: .宠物 购买宠物 <编号>');

    const buyCmd = main._extCommands && main._extCommands['购买'];
    if (!buyCmd || typeof buyCmd.handler !== 'function') {
      return p.reply('购买命令不可用，请检查万象篇是否正确加载');
    }

    const aliasPayload = { ...p, p1: shortId, p2: '' };
    return buyCmd.handler(ctx, msg, aliasPayload);
  }, '购买宠物', 'wanwu-all', '万象篇');

  // ========== 生灵保护机构 ==========
  main.registerCommand('机构', (ctx, msg, p) => {
    const shelter = getShelterMarket(main);
    // 清理过期（放生）
    const now = Date.now();
    let released = 0;
    for (const [id, item] of Object.entries(shelter)) {
      if (item.expire < now) {
        delete shelter[id];
        released++;
      }
    }
    if (released > 0) {
      saveShelterMarket(main, shelter);
    }

    const listings = Object.entries(shelter);
    if (!listings.length) {
      p.reply('【生灵保护机构】\n暂无待领养宠物\n\n.宠物 出售 [编号] 机构 - 交给机构');
      return seal.ext.newCmdExecuteResult(true);
    }
    
    // 分页显示，每页15只
    const page = parseInt(p.p1) || 1;
    const pageSize = 15;
    const totalPages = Math.ceil(listings.length / pageSize);
    const startIdx = (page - 1) * pageSize;
    const pageListings = listings.slice(startIdx, startIdx + pageSize);
    
    const lines = ['【生灵保护机构 - 待领养】', `在售: ${listings.length}只 (第${page}/${totalPages}页)`];
    pageListings.forEach(([id, item]) => {
      const pet = item.pet;
      const remain = Math.max(0, Math.ceil((item.expire - now) / 3600000));
      lines.push(`#${id.slice(-4)} [${pet.rarity}]${pet.name} Lv.${pet.level} ${item.price}金 剩${remain}h`);
    });
    if (totalPages > 1) {
      lines.push(`\n.宠物 机构 ${page + 1} 查看下一页`);
    }
    lines.push('\n.宠物 领养 <编号>');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看生灵保护机构', 'wanwu-all', '万象篇');

  main.registerCommand('领养', (ctx, msg, p) => {
    const shortId = p.p1;
    if (!shortId) return p.reply('用法: .宠物 领养 <编号>');

    const shelter = getShelterMarket(main);
    const listingId = Object.keys(shelter).find(id => id.slice(-4) === shortId);
    if (!listingId) return p.reply('未找到该宠物，可能已被领养或放生');

    const item = shelter[listingId];
    const mainData = getUserData(main, p.uid);
    if (mainData.money < item.price) return p.reply(`金币不足，需要 ${item.price} 金币`);

    mainData.money -= item.price;
    const rescuedPet = normalizePetState(item.pet);
    const capacity = getPetCapacity(main, mainData);
    if (mainData.pets.length < capacity.maxPets) mainData.pets.push(rescuedPet);
    else {
      mainData.storage = mainData.storage || [];
      if (mainData.storage.length >= capacity.maxStorage) return p.reply('仓库已满，无法领养');
      mainData.storage.push(rescuedPet);
    }
    saveUserData(main, p.uid, mainData);

    delete shelter[listingId];
    saveShelterMarket(main, shelter);

    p.reply(`【领养成功】\n获得 ${item.pet.name}\n花费 ${item.price} 金币\n${getRandomTip()}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '从生灵保护机构领养', 'wanwu-all', '万象篇');

  // ========== 季节 ==========
  main.registerCommand('季节', (ctx, msg, p) => {
    const season = getCurrentSeason();
    const s = SEASONS[season], area = SEASONAL_AREAS[season], pets = SEASONAL_PETS[season];
    const festival = getCurrentFestival();
    const lines = [`【${s.name}】`, `限定区域: ${area.name}`, `限定宠物: ${pets.map(x => x.species).join('、')}`];
    if (festival) lines.push(`[活动] ${festival.name}进行中`);
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看季节', 'wanwu-all', '万象篇');

  // ========== 探险系统 ==========
  main.registerCommand('探险', (ctx, msg, p) => {
    const result = getPetAnywhere(p, p.p1);
    if (!result) return p.reply('请指定正确的宠物编号\n(1-3队伍，4-18仓库)');
    const pet = result.pet;
    if (pet.hp <= 0) return p.reply('宠物已阵亡，无法探险');
    if (pet.energy < 15) return p.reply('宠物精力不足，需要15点精力');
    const area = EXPLORE_AREAS.find(a => a.name === p.p2);
    if (!area) return p.reply(`未知区域\n可用: ${EXPLORE_AREAS.map(a => a.name).join('、')}`);

    const data = DB.ext.get(p.uid);
    const now = Date.now();
    data.explore = (data.explore || []).filter(e => e.endTime > now);
    if (data.explore.length >= EXT_CONFIG.maxExplore) return p.reply(`探险队伍已满(最多${EXT_CONFIG.maxExplore}只)`);
    if ([...(data.explore || []), ...(data.work || [])].find(e => e.petId === pet.id)) return p.reply('该宠物正在执行任务');

    data.explore.push({ petId: pet.id, endTime: now + EXT_CONFIG.exploreTime * 60000, area: area.name });
    pet.energy -= 15;
    p.save();
    DB.ext.save(p.uid, data);
    TaskNotifier.register(p.uid, ctx, msg);
    p.reply(`[${result.from === 'team' ? '队伍' : '仓库'}] ${pet.name} 前往 ${area.name} 探险\n预计 ${EXT_CONFIG.exploreTime}分钟后返回，完成后将自动通知\n${getRandomTip()}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '派宠物探险', 'wanwu-all', '万象篇');

  main.registerCommand('探险状态', (ctx, msg, p) => {
    const data = DB.ext.get(p.uid);
    const now = Date.now();
    const lines = ['【探险状态】'];
    let changed = false;

    for (const e of (data.explore || [])) {
      // 只处理已完成且未通知的任务
      if (e.endTime <= now && !e.notified) {
        const result = completeExploreTask(p.uid, p, data, e);
        if (result) {
          lines.push(result);
          changed = true;
        }
      } else if (e.endTime > now) {
        const remain = Math.ceil((e.endTime - now) / 60000);
        lines.push(`${e.area}: 剩余${remain}分钟`);
      }
    }
    if (changed) { data.explore = (data.explore || []).filter(e => e.endTime > now || !e.notified); DB.ext.save(p.uid, data); p.save(); }
    if (lines.length === 1) lines.push('没有进行中的探险');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看探险状态', 'wanwu-all', '万象篇');

  // ========== 打工系统 ==========
  main.registerCommand('打工', (ctx, msg, p) => {
    const result = getPetAnywhere(p, p.p1);
    if (!result) return p.reply('请指定正确的宠物编号\n(1-3队伍，4-18仓库)');
    const pet = result.pet;
    if (pet.hp <= 0) return p.reply('宠物已阵亡，无法打工');
    const work = WORK_TYPES.find(w => w.name === p.p2);
    if (!work) return p.reply(`未知工作\n可用: ${WORK_TYPES.map(w => w.name).join('、')}`);
    if (pet.energy < work.energy) return p.reply(`精力不足，需要${work.energy}点`);

    const data = DB.ext.get(p.uid);
    const now = Date.now();
    data.work = (data.work || []).filter(w => w.endTime > now);
    if (data.work.length >= EXT_CONFIG.maxWork) return p.reply(`打工位置已满(最多${EXT_CONFIG.maxWork}只)`);
    if ([...(data.explore || []), ...(data.work || [])].find(e => e.petId === pet.id)) return p.reply('该宠物正在执行任务');

    data.work.push({ petId: pet.id, endTime: now + EXT_CONFIG.workTime * 60000, work: work.name });
    pet.energy -= work.energy;
    p.save();
    DB.ext.save(p.uid, data);
    TaskNotifier.register(p.uid, ctx, msg);
    p.reply(`[${result.from === 'team' ? '队伍' : '仓库'}] ${pet.name} 开始${work.name}\n预计 ${EXT_CONFIG.workTime}分钟后完成，完成后将自动通知\n${getRandomTip()}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '派宠物打工', 'wanwu-all', '万象篇');

  main.registerCommand('打工状态', (ctx, msg, p) => {
    const data = DB.ext.get(p.uid);
    const now = Date.now();
    const lines = ['【打工状态】'];
    let changed = false;

    for (const w of (data.work || [])) {
      // 只处理已完成且未通知的任务
      if (w.endTime <= now && !w.notified) {
        const result = completeWorkTask(p.uid, p, data, w);
        if (result) {
          lines.push(result);
          changed = true;
        }
      } else if (w.endTime > now) {
        const remain = Math.ceil((w.endTime - now) / 60000);
        lines.push(`${w.work}: 剩余${remain}分钟`);
      }
    }
    if (changed) { data.work = (data.work || []).filter(w => w.endTime > now || !w.notified); DB.ext.save(p.uid, data); p.save(); }
    if (lines.length === 1) lines.push('没有进行中的打工');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看打工状态', 'wanwu-all', '万象篇');

  console.log('[万物有灵-扩展合集] Mod已启用，任务通知系统运行中');
}

waitForMain(init);
