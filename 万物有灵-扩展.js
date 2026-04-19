// ==UserScript==
// @name        万物有灵-扩展
// @author      铭茗
// @version     1.0.0
// @description 宠物扩展功能：图鉴、探险、打工、竞技场
// @timestamp   1744924800
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵-扩展.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-扩展');
if (!ext) {
  ext = seal.ext.new('万物有灵-扩展', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

// ==================== 扩展配置 ====================
const EXT_CONFIG = {
  exploreTime: 30,
  workTime: 60,
  maxExplore: 2,
  maxWork: 1,
};

const EXPLORE_AREAS = [
  { name: '森林', gold: [20, 50], foods: ['苹果', '蜂蜜', '蘑菇'], danger: 0.1 },
  { name: '山脉', gold: [30, 70], foods: ['坚果', '蘑菇'], danger: 0.2 },
  { name: '湖泊', gold: [25, 60], foods: ['鱼干', '面包'], danger: 0.15 },
  { name: '洞穴', gold: [50, 100], foods: ['药水', '蘑菇'], danger: 0.3 },
  { name: '遗迹', gold: [80, 150], foods: ['药水', '牛排'], danger: 0.4 },
];

const WORK_TYPES = [
  { name: '看家', gold: [10, 20], energy: 10 },
  { name: '送货', gold: [20, 40], energy: 20 },
  { name: '狩猎', gold: [30, 60], energy: 30 },
  { name: '护送', gold: [50, 100], energy: 40 },
];

// ==================== 扩展数据存储 ====================
const EXT_DB = {
  get(userId) {
    try {
      const d = ext.storageGet('e_' + userId);
      return d ? JSON.parse(d) : { pokedex: {}, explore: [], work: [], arenaWins: 0, arenaRank: 1000 };
    } catch {
      return { pokedex: {}, explore: [], work: [], arenaWins: 0, arenaRank: 1000 };
    }
  },
  save(userId, data) {
    ext.storageSet('e_' + userId, JSON.stringify(data));
  },
};

// ==================== 工具函数 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return;

  // 订阅捕捉事件 - 记录图鉴
  main.on('capture', ({ uid, pet }) => {
    const extData = EXT_DB.get(uid);
    if (!extData.pokedex[pet.species]) {
      extData.pokedex[pet.species] = { count: 0, firstTime: Date.now() };
    }
    extData.pokedex[pet.species].count++;
    EXT_DB.save(uid, extData);
  });

  // 订阅对战事件 - PVP积分
  main.on('battle', ({ uid, winner, isNPC, targetUid }) => {
    if (isNPC || !targetUid) return;
    
    const extData = EXT_DB.get(uid);
    const targetExtData = EXT_DB.get(targetUid);
    
    if (winner) {
      const gain = Math.floor(Math.random() * 31) + 20;
      extData.arenaRank = (extData.arenaRank || 1000) + gain;
      extData.arenaWins = (extData.arenaWins || 0) + 1;
      targetExtData.arenaRank = Math.max(0, (targetExtData.arenaRank || 1000) - gain);
    } else {
      const loss = Math.floor(Math.random() * 21) + 10;
      extData.arenaRank = Math.max(0, (extData.arenaRank || 1000) - loss);
      targetExtData.arenaRank = (targetExtData.arenaRank || 1000) + loss;
    }
    
    EXT_DB.save(uid, extData);
    EXT_DB.save(targetUid, targetExtData);
  });

  // 注册命令
  registerCommands(main);
}

// ==================== 注册扩展命令 ====================
function registerCommands(main) {
  // 图鉴
  main.registerCommand('图鉴', (ctx, msg, p) => {
    const extData = EXT_DB.get(p.uid);
    const entries = Object.entries(extData.pokedex || {});
    if (!entries.length) return p.reply('【宠物图鉴】\n尚未发现任何宠物种族');
    const lines = ['【宠物图鉴】', `已发现: ${entries.length}种`, ''];
    entries.sort((a, b) => b[1].count - a[1].count).slice(0, 15).forEach(([s, i]) => lines.push(`${s}: 遇到${i.count}次`));
    if (entries.length > 15) lines.push(`...还有${entries.length - 15}种`);
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看图鉴');

  // 探险
  main.registerCommand('探险', (ctx, msg, p) => {
    const pet = p.getPet(p.p1);
    if (!pet) return p.reply('请指定正确的宠物编号');
    if (pet.energy < 30) return p.reply('宠物精力不足，需要30点精力');
    const area = EXPLORE_AREAS.find(a => a.name === p.p2);
    if (!area) return p.reply(`未知区域\n可用: ${EXPLORE_AREAS.map(a => a.name).join('、')}`);

    const extData = EXT_DB.get(p.uid);
    const now = Date.now();
    extData.explore = (extData.explore || []).filter(e => e.endTime > now);
    if (extData.explore.length >= EXT_CONFIG.maxExplore) return p.reply(`探险队伍已满(最多${EXT_CONFIG.maxExplore}只)`);
    if ([...(extData.explore || []), ...(extData.work || [])].find(e => e.petId === pet.id)) return p.reply('该宠物正在执行任务');

    extData.explore.push({ petId: pet.id, endTime: now + EXT_CONFIG.exploreTime * 60000, area: area.name });
    pet.energy -= 30;
    p.save();
    EXT_DB.save(p.uid, extData);
    p.reply(`${pet.name} 前往 ${area.name} 探险\n预计 ${EXT_CONFIG.exploreTime}分钟后返回`);
    return seal.ext.newCmdExecuteResult(true);
  }, '派宠物探险');

  // 探险状态
  main.registerCommand('探险状态', (ctx, msg, p) => {
    const extData = EXT_DB.get(p.uid);
    const now = Date.now();
    const lines = ['【探险状态】'];
    let changed = false;

    for (const e of (extData.explore || [])) {
      if (e.endTime <= now) {
        const area = EXPLORE_AREAS.find(a => a.name === e.area);
        if (area) {
          const pet = p.data.pets.find(pt => pt.id === e.petId);
          if (pet) {
            let r = `${pet.name} 从 ${area.name} 返回\n`;
            if (Math.random() < area.danger) { pet.hp = Math.max(1, pet.hp - 20); r += '遭遇危险受伤！\n'; }
            const gold = Math.floor(Math.random() * (area.gold[1] - area.gold[0] + 1)) + area.gold[0];
            p.data.money += gold;
            r += `获得 ${gold} 金币\n`;
            const food = area.foods[Math.floor(Math.random() * area.foods.length)];
            p.data.food[food] = (p.data.food[food] || 0) + 1;
            r += `获得 ${food} x1`;
            lines.push(r);
            changed = true;
          }
        }
      } else {
        const remain = Math.ceil((e.endTime - now) / 60000);
        lines.push(`${e.area}: 剩余${remain}分钟`);
      }
    }
    if (changed) {
      extData.explore = (extData.explore || []).filter(e => e.endTime > now);
      EXT_DB.save(p.uid, extData);
      p.save();
    }
    if (lines.length === 1) lines.push('没有进行中的探险');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看探险状态');

  // 打工
  main.registerCommand('打工', (ctx, msg, p) => {
    const pet = p.getPet(p.p1);
    if (!pet) return p.reply('请指定正确的宠物编号');
    const work = WORK_TYPES.find(w => w.name === p.p2);
    if (!work) return p.reply(`未知工作\n可用: ${WORK_TYPES.map(w => w.name).join('、')}`);
    if (pet.energy < work.energy) return p.reply(`精力不足，需要${work.energy}点`);

    const extData = EXT_DB.get(p.uid);
    const now = Date.now();
    extData.work = (extData.work || []).filter(w => w.endTime > now);
    if (extData.work.length >= EXT_CONFIG.maxWork) return p.reply(`打工位置已满(最多${EXT_CONFIG.maxWork}只)`);
    if ([...(extData.explore || []), ...(extData.work || [])].find(e => e.petId === pet.id)) return p.reply('该宠物正在执行任务');

    extData.work.push({ petId: pet.id, endTime: now + EXT_CONFIG.workTime * 60000, work: work.name });
    pet.energy -= work.energy;
    p.save();
    EXT_DB.save(p.uid, extData);
    p.reply(`${pet.name} 开始${work.name}\n预计 ${EXT_CONFIG.workTime}分钟后完成`);
    return seal.ext.newCmdExecuteResult(true);
  }, '派宠物打工');

  // 打工状态
  main.registerCommand('打工状态', (ctx, msg, p) => {
    const extData = EXT_DB.get(p.uid);
    const now = Date.now();
    const lines = ['【打工状态】'];
    let changed = false;

    for (const w of (extData.work || [])) {
      if (w.endTime <= now) {
        const work = WORK_TYPES.find(wt => wt.name === w.work);
        if (work) {
          const pet = p.data.pets.find(pt => pt.id === w.petId);
          if (pet) {
            const gold = Math.floor(Math.random() * (work.gold[1] - work.gold[0] + 1)) + work.gold[0];
            p.data.money += gold;
            lines.push(`${pet.name} 完成${work.name}，获得 ${gold} 金币`);
            changed = true;
          }
        }
      } else {
        const remain = Math.ceil((w.endTime - now) / 60000);
        lines.push(`${w.work}: 剩余${remain}分钟`);
      }
    }
    if (changed) {
      extData.work = (extData.work || []).filter(w => w.endTime > now);
      EXT_DB.save(p.uid, extData);
      p.save();
    }
    if (lines.length === 1) lines.push('没有进行中的打工');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看打工状态');

  // 竞技场
  main.registerCommand('竞技场', (ctx, msg, p) => {
    const extData = EXT_DB.get(p.uid);
    p.reply(`【竞技场】\n积分: ${extData.arenaRank || 1000}\n胜场: ${extData.arenaWins || 0}\n\n使用 .宠物 对战 <编号> @人 进行PVP对战`);
    return seal.ext.newCmdExecuteResult(true);
  }, '查看竞技场积分');
}

// 延迟初始化，等待主插件加载
setTimeout(init, 1000);
