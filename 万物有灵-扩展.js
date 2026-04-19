// ==UserScript==
// @name        万物有灵-扩展
// @author      铭茗
// @version     1.1.0
// @description 宠物扩展功能：图鉴、探险、打工、竞技场
// @timestamp   1744924800
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵-扩展.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-扩展');
if (!ext) {
  ext = seal.ext.new('万物有灵-扩展', '铭茗', '1.1.0');
  seal.ext.register(ext);
}

const MOD_ID = 'wanwu-ext';

const CONFIG = {
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

const DB = {
  get(userId) {
    const defaultData = { pokedex: {}, explore: [], work: [], arenaWins: 0, arenaRank: 1000 };
    try {
      const d = ext.storageGet('e_' + userId);
      if (!d) return defaultData;
      const data = JSON.parse(d);
      // 自动清理过期任务
      const now = Date.now();
      if (data.explore) data.explore = data.explore.filter(e => e.endTime > now);
      if (data.work) data.work = data.work.filter(w => w.endTime > now);
      return data;
    } catch (e) {
      console.log('[万物有灵-扩展] 数据解析失败，使用默认数据:', e);
      return defaultData;
    }
  },
  save(userId, data) { ext.storageSet('e_' + userId, JSON.stringify(data)); },
};

function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

// 获取宠物（支持队伍和仓库）
function getPetAnywhere(p, idx) {
  const num = parseInt(idx);
  if (isNaN(num) || num < 1) return null;
  if (num <= 3) {
    const pet = p.data.pets[num - 1];
    if (pet) return { pet, from: 'team', idx: num - 1 };
  }
  const storageIdx = num - 4;
  const pet = (p.data.storage || [])[storageIdx];
  if (pet) return { pet, from: 'storage', idx: storageIdx };
  return null;
}

// 查找宠物（通过ID）
function findPetById(p, petId) {
  let pet = p.data.pets.find(pt => pt.id === petId);
  if (pet) return { pet, from: 'team' };
  pet = (p.data.storage || []).find(pt => pt.id === petId);
  if (pet) return { pet, from: 'storage' };
  return null;
}

const ModAPI = {
  onEnable() { console.log(`[万物有灵-扩展] Mod已启用`); },
  onDisable() { console.log(`[万物有灵-扩展] Mod已禁用`); },
  getPokedex(uid) { return DB.get(uid).pokedex; },
  getArenaRank(uid) { return DB.get(uid).arenaRank || 1000; },
  getExploreAreas() { return EXPLORE_AREAS; },
  getWorkTypes() { return WORK_TYPES; },
  getConfig() { return CONFIG; },
};

function init() {
  const main = getMain();
  if (!main) return;

  main.registerMod({
    id: MOD_ID,
    name: '万物有灵-扩展',
    version: '1.1.0',
    author: '铭茗',
    description: '图鉴、探险、打工、竞技场',
    dependencies: [],
  });

  main.on('capture', ({ uid, pet }) => {
    const data = DB.get(uid);
    if (!data.pokedex[pet.species]) data.pokedex[pet.species] = { count: 0, firstTime: Date.now() };
    data.pokedex[pet.species].count++;
    DB.save(uid, data);
  }, MOD_ID);

  main.on('battle', ({ uid, winner, draw, isNPC, targetUid }) => {
    if (draw || isNPC || !targetUid) return;
    const data = DB.get(uid);
    const targetData = DB.get(targetUid);
    
    // 先计算积分变化
    let rankChange;
    if (winner) {
      rankChange = Math.floor(Math.random() * 31) + 20;
      data.arenaRank = (data.arenaRank || 1000) + rankChange;
      data.arenaWins = (data.arenaWins || 0) + 1;
      targetData.arenaRank = Math.max(0, (targetData.arenaRank || 1000) - rankChange);
    } else {
      rankChange = Math.floor(Math.random() * 21) + 10;
      data.arenaRank = Math.max(0, (data.arenaRank || 1000) - rankChange);
      targetData.arenaRank = (targetData.arenaRank || 1000) + rankChange;
    }
    
    // 统一保存
    try {
      DB.save(uid, data);
      DB.save(targetUid, targetData);
    } catch (e) {
      console.log('[万物有灵-扩展] 竞技场积分保存失败:', e);
    }
  }, MOD_ID);

  main.registerCommand('图鉴', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    const entries = Object.entries(data.pokedex || {});
    if (!entries.length) return p.reply('【宠物图鉴】\n尚未发现任何宠物种族');
    const lines = ['【宠物图鉴】', `已发现: ${entries.length}种`, ''];
    entries.sort((a, b) => b[1].count - a[1].count).slice(0, 15).forEach(([s, i]) => lines.push(`${s}: 遇到${i.count}次`));
    if (entries.length > 15) lines.push(`...还有${entries.length - 15}种`);
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看图鉴', MOD_ID);

  main.registerCommand('探险', (ctx, msg, p) => {
    const result = getPetAnywhere(p, p.p1);
    if (!result) return p.reply('请指定正确的宠物编号\n(1-3队伍，4-18仓库)');
    const pet = result.pet;
    if (pet.hp <= 0) return p.reply('宠物已阵亡，无法探险');
    if (pet.energy < 30) return p.reply('宠物精力不足，需要30点精力');
    const area = EXPLORE_AREAS.find(a => a.name === p.p2);
    if (!area) return p.reply(`未知区域\n可用: ${EXPLORE_AREAS.map(a => a.name).join('、')}`);

    const data = DB.get(p.uid);
    const now = Date.now();
    data.explore = (data.explore || []).filter(e => e.endTime > now);
    if (data.explore.length >= CONFIG.maxExplore) return p.reply(`探险队伍已满(最多${CONFIG.maxExplore}只)`);
    if ([...(data.explore || []), ...(data.work || [])].find(e => e.petId === pet.id)) return p.reply('该宠物正在执行任务');

    data.explore.push({ petId: pet.id, endTime: now + CONFIG.exploreTime * 60000, area: area.name });
    pet.energy -= 30;
    p.save();
    DB.save(p.uid, data);
    p.reply(`[${result.from === 'team' ? '队伍' : '仓库'}] ${pet.name} 前往 ${area.name} 探险\n预计 ${CONFIG.exploreTime}分钟后返回`);
    return seal.ext.newCmdExecuteResult(true);
  }, '派宠物探险', MOD_ID);

  main.registerCommand('探险状态', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    const now = Date.now();
    const lines = ['【探险状态】'];
    let changed = false;

    for (const e of (data.explore || [])) {
      if (e.endTime <= now) {
        const area = EXPLORE_AREAS.find(a => a.name === e.area);
        if (area) {
          const found = findPetById(p, e.petId);
          if (found) {
            const pet = found.pet;
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
    if (changed) { data.explore = (data.explore || []).filter(e => e.endTime > now); DB.save(p.uid, data); p.save(); }
    if (lines.length === 1) lines.push('没有进行中的探险');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看探险状态', MOD_ID);

  main.registerCommand('打工', (ctx, msg, p) => {
    const result = getPetAnywhere(p, p.p1);
    if (!result) return p.reply('请指定正确的宠物编号\n(1-3队伍，4-18仓库)');
    const pet = result.pet;
    if (pet.hp <= 0) return p.reply('宠物已阵亡，无法打工');
    const work = WORK_TYPES.find(w => w.name === p.p2);
    if (!work) return p.reply(`未知工作\n可用: ${WORK_TYPES.map(w => w.name).join('、')}`);
    if (pet.energy < work.energy) return p.reply(`精力不足，需要${work.energy}点`);

    const data = DB.get(p.uid);
    const now = Date.now();
    data.work = (data.work || []).filter(w => w.endTime > now);
    if (data.work.length >= CONFIG.maxWork) return p.reply(`打工位置已满(最多${CONFIG.maxWork}只)`);
    if ([...(data.explore || []), ...(data.work || [])].find(e => e.petId === pet.id)) return p.reply('该宠物正在执行任务');

    data.work.push({ petId: pet.id, endTime: now + CONFIG.workTime * 60000, work: work.name });
    pet.energy -= work.energy;
    p.save();
    DB.save(p.uid, data);
    p.reply(`[${result.from === 'team' ? '队伍' : '仓库'}] ${pet.name} 开始${work.name}\n预计 ${CONFIG.workTime}分钟后完成`);
    return seal.ext.newCmdExecuteResult(true);
  }, '派宠物打工', MOD_ID);

  main.registerCommand('打工状态', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    const now = Date.now();
    const lines = ['【打工状态】'];
    let changed = false;

    for (const w of (data.work || [])) {
      if (w.endTime <= now) {
        const work = WORK_TYPES.find(wt => wt.name === w.work);
        if (work) {
          const found = findPetById(p, w.petId);
          if (found) {
            const pet = found.pet;
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
    if (changed) { data.work = (data.work || []).filter(w => w.endTime > now); DB.save(p.uid, data); p.save(); }
    if (lines.length === 1) lines.push('没有进行中的打工');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看打工状态', MOD_ID);

  main.registerCommand('竞技场', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    p.reply(`【竞技场】\n积分: ${data.arenaRank || 1000}\n胜场: ${data.arenaWins || 0}\n\n使用 .宠物 对战 <编号> @人 进行PVP对战`);
    return seal.ext.newCmdExecuteResult(true);
  }, '查看竞技场积分', MOD_ID);

  main.enableMod(MOD_ID, ModAPI);
}

// 轮询等待主插件加载
function waitForMain(callback, maxAttempts = 10) {
  const main = getMain();
  if (main) {
    callback(main);
    return;
  }
  if (maxAttempts <= 0) {
    console.log('[万物有灵-扩展] 主插件未找到，初始化失败');
    return;
  }
  setTimeout(() => waitForMain(callback, maxAttempts - 1), 500);
}

waitForMain(init);
