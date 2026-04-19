// ==UserScript==
// @name        万物有灵-成就
// @author      铭茗
// @version     1.0.0
// @description 成就系统：记录游戏里程碑
// @timestamp   1776574167
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵-成就.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-成就');
if (!ext) {
  ext = seal.ext.new('万物有灵-成就', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

const MOD_ID = 'wanwu-achievement';

// ==================== 成就定义 ====================
const ACHIEVEMENTS = {
  // 捕捉类
  first_capture: { name: '初遇', desc: '捕捉第一只宠物', icon: '🎉' },
  capture_10: { name: '收藏家', desc: '累计捕捉10只宠物', icon: '📦' },
  capture_50: { name: '动物园园长', desc: '累计捕捉50只宠物', icon: '🏛️' },
  first_legend: { name: '传说降临', desc: '捕捉第一只传说宠物', icon: '⭐' },
  first_super: { name: '稀有发现', desc: '捕捉第一只超稀有宠物', icon: '💎' },
  
  // 战斗类
  battle_win_10: { name: '初出茅庐', desc: '对战胜利10次', icon: '⚔️' },
  battle_win_50: { name: '身经百战', desc: '对战胜利50次', icon: '🗡️' },
  battle_win_100: { name: '战神', desc: '对战胜利100次', icon: '🏆' },
  pvp_first_win: { name: '初试锋芒', desc: 'PVP首胜', icon: '🎯' },
  pvp_win_10: { name: '竞技新星', desc: 'PVP胜利10次', icon: '🌟' },
  
  // 趣味类
  weakling: { name: '拜托，你很弱诶～', desc: '连续3次肉身搏斗被野外宠物打败', icon: '😅' },
  feeder: { name: '宠物来吃饭了', desc: '连续喂同一只宠物10次', icon: '🍖' },
  lucky: { name: '天选之人', desc: '一次性捕捉到传说宠物', icon: '🍀' },
  
  // 培养类
  level_max: { name: '满级大师', desc: '将宠物培养到50级', icon: '📈' },
  evolve_first: { name: '进化之光', desc: '首次进化宠物', icon: '✨' },
  breed_first: { name: '生命延续', desc: '首次育种成功', icon: '💕' },
  
  // 探索类
  explore_10: { name: '探险家', desc: '完成10次探险', icon: '🗺️' },
  work_10: { name: '打工人', desc: '完成10次打工', icon: '💼' },
};

// ==================== 数据存储 ====================
const DB = {
  get(userId) {
    const defaultData = {
      unlocked: {},           // 已解锁成就
      stats: {
        captureCount: 0,      // 捕捉次数
        battleWins: 0,        // 对战胜利次数
        pvpWins: 0,           // PVP胜利次数
        exploreCount: 0,      // 探险次数
        workCount: 0,         // 打工次数
        feedStreak: { petId: null, count: 0 },  // 喂食连续记录
        fightLoseStreak: 0,   // 肉身搏斗连败
      },
    };
    try {
      const d = ext.storageGet('ach_' + userId);
      if (!d) return defaultData;
      const data = JSON.parse(d);
      data.unlocked = data.unlocked || {};
      data.stats = { ...defaultData.stats, ...data.stats };
      return data;
    } catch {
      return defaultData;
    }
  },
  save(userId, data) {
    ext.storageSet('ach_' + userId, JSON.stringify(data));
  },
};

// ==================== 工具函数 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

function unlockAchievement(uid, achievementId, reply) {
  const data = DB.get(uid);
  if (data.unlocked[achievementId]) return; // 已解锁
  
  const ach = ACHIEVEMENTS[achievementId];
  if (!ach) return;
  
  data.unlocked[achievementId] = { time: Date.now(), name: ach.name };
  DB.save(uid, data);
  
  reply(`\n🎊 [成就解锁] ${ach.icon} ${ach.name}\n   ${ach.desc}`);
}

// ==================== Mod API ====================
const ModAPI = {
  getAchievements(uid) {
    return DB.get(uid).unlocked;
  },
  getStats(uid) {
    return DB.get(uid).stats;
  },
  hasAchievement(uid, achievementId) {
    return !!DB.get(uid).unlocked[achievementId];
  },
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return;

  main.registerMod({
    id: MOD_ID,
    name: '万物有灵-成就',
    version: '1.0.0',
    author: '铭茗',
    description: '成就系统',
    dependencies: [],
  });

  // 捕捉事件
  main.on('capture', ({ uid, pet, isPlayerFight }) => {
    const data = DB.get(uid);
    const mainData = main.DB.get(uid);
    
    data.stats.captureCount++;
    
    // 检查成就
    const checkAchievements = [];
    
    if (data.stats.captureCount === 1) checkAchievements.push('first_capture');
    if (data.stats.captureCount >= 10) checkAchievements.push('capture_10');
    if (data.stats.captureCount >= 50) checkAchievements.push('capture_50');
    if (pet.rarity === '传说') {
      checkAchievements.push('first_legend');
      if (data.stats.captureCount === 1) checkAchievements.push('lucky');
    }
    if (pet.rarity === '超稀有') checkAchievements.push('first_super');
    
    // 重置肉身搏斗连败
    data.stats.fightLoseStreak = 0;
    
    DB.save(uid, data);
    
    // 延迟解锁（等主插件回复后再发）
    setTimeout(() => {
      checkAchievements.forEach(id => unlockAchievement(uid, id, (msg) => {
        // 通过主插件发送
        const ctx = { reply: (text) => seal.replyToSender(ctx, { sender: { userId: uid } }, text) };
      }));
    }, 100);
  }, MOD_ID);

  // 对战事件
  main.on('battle', ({ uid, winner, draw, isNPC, pet1 }) => {
    if (draw) return;
    
    const data = DB.get(uid);
    
    if (winner) {
      data.stats.battleWins++;
      
      if (!isNPC) {
        data.stats.pvpWins++;
      }
      
      DB.save(uid, data);
      
      // 检查成就
      const checks = [];
      if (data.stats.battleWins >= 10) checks.push('battle_win_10');
      if (data.stats.battleWins >= 50) checks.push('battle_win_50');
      if (data.stats.battleWins >= 100) checks.push('battle_win_100');
      if (!isNPC && data.stats.pvpWins === 1) checks.push('pvp_first_win');
      if (!isNPC && data.stats.pvpWins >= 10) checks.push('pvp_win_10');
      
      checks.forEach(id => unlockAchievement(uid, id, () => {}));
    }
  }, MOD_ID);

  // 喂食事件
  main.on('feed', ({ uid, pet }) => {
    const data = DB.get(uid);
    
    // 检查是否喂同一只宠物
    if (data.stats.feedStreak.petId === pet.id) {
      data.stats.feedStreak.count++;
    } else {
      data.stats.feedStreak = { petId: pet.id, count: 1 };
    }
    
    if (data.stats.feedStreak.count >= 10) {
      unlockAchievement(uid, 'feeder', () => {});
    }
    
    DB.save(uid, data);
  }, MOD_ID);

  // 升级事件
  main.on('levelup', ({ uid, pet, newLevel }) => {
    if (newLevel >= 50) {
      unlockAchievement(uid, 'level_max', () => {});
    }
  }, MOD_ID);

  // 进化事件
  main.on('evolve', ({ uid }) => {
    unlockAchievement(uid, 'evolve_first', () => {});
  }, MOD_ID);

  // 育种事件
  main.on('breed', ({ uid }) => {
    unlockAchievement(uid, 'breed_first', () => {});
  }, MOD_ID);

  // 注册命令
  main.registerCommand('成就', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    const unlocked = Object.entries(data.unlocked);
    
    if (!unlocked.length) {
      return p.reply('【成就系统】\n暂无成就，继续努力吧！');
    }
    
    const lines = ['【成就系统】', `已解锁: ${unlocked.length}/${Object.keys(ACHIEVEMENTS).length}`, ''];
    
    unlocked.slice(0, 10).forEach(([id, info]) => {
      const ach = ACHIEVEMENTS[id];
      if (ach) {
        const date = new Date(info.time).toLocaleDateString();
        lines.push(`${ach.icon} ${ach.name} - ${date}`);
      }
    });
    
    if (unlocked.length > 10) {
      lines.push(`...还有${unlocked.length - 10}个成就`);
    }
    
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看成就', MOD_ID);

  main.registerCommand('成就列表', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    const lines = ['【全部成就】', ''];
    
    Object.entries(ACHIEVEMENTS).forEach(([id, ach]) => {
      const unlocked = data.unlocked[id] ? '✓' : '✗';
      lines.push(`${unlocked} ${ach.icon} ${ach.name}\n   ${ach.desc}`);
    });
    
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看所有成就', MOD_ID);

  main.enableMod(MOD_ID, ModAPI);
}

// 轮询等待主插件
function waitForMain(callback, maxAttempts = 10) {
  const main = getMain();
  if (main) { callback(main); return; }
  if (maxAttempts <= 0) { console.log('[万物有灵-成就] 主插件未找到'); return; }
  setTimeout(() => waitForMain(callback, maxAttempts - 1), 500);
}

waitForMain(init);
