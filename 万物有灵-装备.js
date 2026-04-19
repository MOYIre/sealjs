// ==UserScript==
// @name        万物有灵-装备
// @author      铭茗
// @version     1.0.0
// @description 宠物装备系统：给宠物穿戴装备提升属性
// @timestamp   1776574167
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵-装备.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-装备');
if (!ext) {
  ext = seal.ext.new('万物有灵-装备', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

const MOD_ID = 'wanwu-equip';

// ==================== 装备定义 ====================
const EQUIP_TYPES = {
  weapon: { name: '武器', slot: 0 },
  armor: { name: '护甲', slot: 1 },
  accessory: { name: '饰品', slot: 2 },
};

const EQUIPS = {
  // 武器
  木剑: { type: 'weapon', atk: 5, cost: 100, desc: '简单的木制武器' },
  铁剑: { type: 'weapon', atk: 10, cost: 300, desc: '坚固的铁制武器' },
  精钢剑: { type: 'weapon', atk: 20, cost: 800, desc: '精炼钢材打造' },
  龙牙剑: { type: 'weapon', atk: 35, cost: 2000, desc: '传说中龙牙制成' },
  // 护甲
  皮甲: { type: 'armor', def: 5, hp: 10, cost: 100, desc: '轻便的皮革护甲' },
  铁甲: { type: 'armor', def: 10, hp: 20, cost: 300, desc: '坚固的铁制护甲' },
  精钢甲: { type: 'armor', def: 20, hp: 40, cost: 800, desc: '精炼钢材打造' },
  龙鳞甲: { type: 'armor', def: 35, hp: 70, cost: 2000, desc: '传说中龙鳞制成' },
  // 饰品
  力量戒指: { type: 'accessory', atk: 8, cost: 200, desc: '增加攻击力' },
  守护项链: { type: 'accessory', def: 8, cost: 200, desc: '增加防御力' },
  生命宝石: { type: 'accessory', hp: 30, cost: 250, desc: '增加生命值' },
  幸运符: { type: 'accessory', luck: 10, cost: 500, desc: '提升暴击几率' },
  龙心: { type: 'accessory', atk: 15, def: 15, hp: 50, cost: 3000, desc: '传说中的龙心' },
};

// ==================== 数据存储 ====================
const DB = {
  get(userId) {
    const defaultData = { bag: {}, equipped: {} };
    try {
      const d = ext.storageGet('eq_' + userId);
      if (!d) return defaultData;
      return { ...defaultData, ...JSON.parse(d) };
    } catch {
      return defaultData;
    }
  },
  save(userId, data) { ext.storageSet('eq_' + userId, JSON.stringify(data)); },
};

// ==================== 工具函数 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

function getEquipStats(pet, equipData) {
  const equipped = equipData.equipped[pet.id] || {};
  let bonus = { atk: 0, def: 0, hp: 0, luck: 0 };
  Object.values(equipped).forEach(name => {
    const eq = EQUIPS[name];
    if (eq) {
      if (eq.atk) bonus.atk += eq.atk;
      if (eq.def) bonus.def += eq.def;
      if (eq.hp) bonus.hp += eq.hp;
      if (eq.luck) bonus.luck += eq.luck;
    }
  });
  return bonus;
}

// ==================== Mod API ====================
const ModAPI = {
  getEquips: (uid) => DB.get(uid),
  getEquipStats,
  getEquipInfo: (name) => EQUIPS[name],
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return;

  main.registerMod({
    id: MOD_ID, name: '万物有灵-装备', version: '1.0.0', author: '铭茗',
    description: '宠物装备系统', dependencies: [],
  });

  main.registerCommand('装备商店', (ctx, msg, p) => {
    const mainData = main.DB.get(p.uid);
    const lines = ['【装备商店】', `金币: ${mainData.money}`, ''];
    const categories = { weapon: '武器', armor: '护甲', accessory: '饰品' };
    Object.entries(categories).forEach(([type, title]) => {
      lines.push(`-- ${title} --`);
      Object.entries(EQUIPS).filter(([, eq]) => eq.type === type).forEach(([name, eq]) => {
        const effects = [];
        if (eq.atk) effects.push(`攻击+${eq.atk}`);
        if (eq.def) effects.push(`防御+${eq.def}`);
        if (eq.hp) effects.push(`生命+${eq.hp}`);
        if (eq.luck) effects.push(`幸运+${eq.luck}`);
        lines.push(`  ${name}: ${eq.cost}金 (${effects.join(', ')})`);
      });
      lines.push('');
    });
    lines.push('.宠物 购买装备 <名称>');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看装备商店', MOD_ID);

  main.registerCommand('购买装备', (ctx, msg, p) => {
    const name = p.p1;
    if (!name) return p.reply('请指定装备名称');
    const eq = EQUIPS[name];
    if (!eq) return p.reply('未知装备');
    const mainData = main.DB.get(p.uid);
    if (mainData.money < eq.cost) return p.reply(`金币不足，需要 ${eq.cost} 金币`);
    mainData.money -= eq.cost;
    main.DB.save(p.uid, mainData);
    const data = DB.get(p.uid);
    data.bag[name] = (data.bag[name] || 0) + 1;
    DB.save(p.uid, data);
    p.reply(`购买成功！获得 ${name} x1，花费 ${eq.cost} 金币`);
    return seal.ext.newCmdExecuteResult(true);
  }, '购买装备', MOD_ID);

  main.registerCommand('装备背包', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    const items = Object.entries(data.bag).filter(([, count]) => count > 0);
    if (!items.length) return p.reply('【装备背包】\n背包空空如也');
    const lines = ['【装备背包】', ''];
    items.forEach(([name, count]) => {
      const eq = EQUIPS[name];
      lines.push(`[${EQUIP_TYPES[eq.type].name}] ${name} x${count} - ${eq.desc}`);
    });
    lines.push('\n.宠物 装备 <宠物编号> <装备名>');
    lines.push('.宠物 卸下 <宠物编号> <武器/护甲/饰品>');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看装备背包', MOD_ID);

  main.registerCommand('装备', (ctx, msg, p) => {
    const petIdx = parseInt(p.p1);
    const equipName = p.p2;
    if (!petIdx || !equipName) return p.reply('用法: .宠物 装备 <宠物编号> <装备名>');
    const mainData = main.DB.get(p.uid);
    const pet = mainData.pets[petIdx - 1];
    if (!pet) return p.reply('宠物不存在');
    const data = DB.get(p.uid);
    if (!data.bag[equipName] || data.bag[equipName] < 1) return p.reply('你没有这件装备');
    const eq = EQUIPS[equipName];
    if (!eq) return p.reply('未知装备');
    const slot = EQUIP_TYPES[eq.type].slot;
    const equipped = data.equipped[pet.id] || {};
    if (equipped[slot]) data.bag[equipped[slot]] = (data.bag[equipped[slot]] || 0) + 1;
    equipped[slot] = equipName;
    data.equipped[pet.id] = equipped;
    data.bag[equipName]--;
    DB.save(p.uid, data);
    const bonus = getEquipStats(pet, data);
    p.reply(`${pet.name} 穿戴了 ${equipName}\n加成: 攻击+${bonus.atk} 防御+${bonus.def} 生命+${bonus.hp}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '穿戴装备', MOD_ID);

  main.registerCommand('卸下', (ctx, msg, p) => {
    const petIdx = parseInt(p.p1);
    const slotName = p.p2;
    if (!petIdx || !slotName) return p.reply('用法: .宠物 卸下 <宠物编号> <武器/护甲/饰品>');
    const typeMap = { 武器: 'weapon', 护甲: 'armor', 饰品: 'accessory' };
    const type = typeMap[slotName];
    if (!type) return p.reply('槽位名称错误，可选：武器、护甲、饰品');
    const mainData = main.DB.get(p.uid);
    const pet = mainData.pets[petIdx - 1];
    if (!pet) return p.reply('宠物不存在');
    const data = DB.get(p.uid);
    const equipped = data.equipped[pet.id] || {};
    const slot = EQUIP_TYPES[type].slot;
    if (!equipped[slot]) return p.reply('该槽位没有装备');
    const equipName = equipped[slot];
    data.bag[equipName] = (data.bag[equipName] || 0) + 1;
    delete equipped[slot];
    DB.save(p.uid, data);
    p.reply(`${pet.name} 卸下了 ${equipName}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '卸下装备', MOD_ID);

  main.registerCommand('宠物装备', (ctx, msg, p) => {
    const petIdx = parseInt(p.p1);
    if (!petIdx) return p.reply('用法: .宠物 宠物装备 <宠物编号>');
    const mainData = main.DB.get(p.uid);
    const pet = mainData.pets[petIdx - 1];
    if (!pet) return p.reply('宠物不存在');
    const data = DB.get(p.uid);
    const equipped = data.equipped[pet.id] || {};
    const bonus = getEquipStats(pet, data);
    const lines = [`【${pet.name}的装备】`, ''];
    Object.entries(EQUIP_TYPES).forEach(([type, info]) => {
      const name = equipped[info.slot];
      lines.push(`[${info.name}] ${name ? `${name} - ${EQUIPS[name].desc}` : '无'}`);
    });
    lines.push('', `总加成: 攻击+${bonus.atk} 防御+${bonus.def} 生命+${bonus.hp}${bonus.luck ? ` 幸运+${bonus.luck}` : ''}`);
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看宠物装备', MOD_ID);

  main.enableMod(MOD_ID, ModAPI);
}

function waitForMain(cb, n = 10) {
  const m = getMain();
  if (m) cb(m);
  else if (n > 0) setTimeout(() => waitForMain(cb, n - 1), 500);
}

waitForMain(init);
