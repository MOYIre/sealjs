// ==UserScript==
// @name        万物有灵-季节
// @author      铭茗
// @version     1.0.0
// @description 季节活动：特殊时间开放特殊区域和宠物
// @timestamp   1776574167
// @license     Apache-2
// @updateUrl   https://gitcode.com/MOYIre/sealjs/raw/main/万物有灵-季节.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-季节');
if (!ext) {
  ext = seal.ext.new('万物有灵-季节', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

const MOD_ID = 'wanwu-season';

// ==================== 季节定义 ====================
const SEASONS = {
  spring: { name: '春季', months: [3, 4, 5] },
  summer: { name: '夏季', months: [6, 7, 8] },
  autumn: { name: '秋季', months: [9, 10, 11] },
  winter: { name: '冬季', months: [12, 1, 2] },
};

const SEASONAL_PETS = {
  spring: [
    { species: '花仙子', element: '草', rarity: '超稀有', bonus: { hp: 10, atk: 5 } },
    { species: '春风精灵', element: '超能', rarity: '稀有', bonus: { energy: 20 } },
  ],
  summer: [
    { species: '烈焰凤凰', element: '火', rarity: '传说', bonus: { atk: 15 } },
    { species: '海神之子', element: '水', rarity: '超稀有', bonus: { hp: 15, def: 5 } },
  ],
  autumn: [
    { species: '丰收之灵', element: '草', rarity: '超稀有', bonus: { hp: 10, def: 10 } },
    { species: '月光狼', element: '超能', rarity: '稀有', bonus: { atk: 8, energy: 10 } },
  ],
  winter: [
    { species: '冰霜巨龙', element: '水', rarity: '传说', bonus: { hp: 20, def: 10 } },
    { species: '雪女', element: '超能', rarity: '超稀有', bonus: { def: 15 } },
  ],
};

const FESTIVALS = [
  { name: '春节', dates: [[1, 20], [2, 10]], bonus: { exp: 2, gold: 2 }, pets: ['年兽'] },
  { name: '情人节', dates: [[2, 14], [2, 14]], bonus: { breedChance: 0.3 }, pets: ['爱神丘比特'] },
  { name: '万圣节', dates: [[10, 25], [11, 1]], bonus: { captureChance: 0.2 }, pets: ['南瓜精', '幽灵王'] },
  { name: '圣诞节', dates: [[12, 20], [12, 26]], bonus: { exp: 1.5 }, pets: ['圣诞驯鹿', '雪人'] },
];

const SEASONAL_AREAS = {
  spring: { name: '花海', gold: [50, 100], foods: ['花蜜', '春茶'], danger: 0.2 },
  summer: { name: '火山', gold: [80, 150], foods: ['火龙果', '冰淇淋'], danger: 0.35 },
  autumn: { name: '枫林', gold: [60, 120], foods: ['枫糖', '栗子'], danger: 0.25 },
  winter: { name: '冰原', gold: [70, 130], foods: ['热可可', '烤红薯'], danger: 0.3 },
};

// ==================== 工具函数 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  return Object.entries(SEASONS).find(([, s]) => s.months.includes(month))?.[0] || 'spring';
}

function getCurrentFestival() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return FESTIVALS.find(f => {
    const [start, end] = f.dates;
    if (start[0] === end[0]) return month === start[0] && day >= start[1] && day <= end[1];
    return (month === start[0] && day >= start[1]) || (month === end[0] && day <= end[1]);
  });
}

// ==================== Mod API ====================
const ModAPI = {
  getCurrentSeason,
  getCurrentFestival,
  getSeasonInfo: () => SEASONS[getCurrentSeason()],
  getSeasonalPets: () => SEASONAL_PETS[getCurrentSeason()] || [],
  getSeasonalArea: () => SEASONAL_AREAS[getCurrentSeason()],
  getActiveBonuses: () => getCurrentFestival()?.bonus || {},
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return;

  main.registerMod({
    id: MOD_ID, name: '万物有灵-季节', version: '1.0.0', author: '铭茗',
    description: '季节活动系统', dependencies: [],
  });

  main.registerCommand('季节', (ctx, msg, p) => {
    const season = getCurrentSeason();
    const s = SEASONS[season];
    const area = SEASONAL_AREAS[season];
    const pets = SEASONAL_PETS[season];
    const festival = getCurrentFestival();
    const lines = [`【${s.name}】`, '', `季节限定区域: ${area.name}`, `季节限定宠物: ${pets.map(x => x.species).join('、')}`];
    if (festival) {
      lines.push('', `[!] 【${festival.name}活动进行中】`);
      const b = [];
      if (festival.bonus.exp) b.push(`经验x${festival.bonus.exp}`);
      if (festival.bonus.gold) b.push(`金币x${festival.bonus.gold}`);
      lines.push(`活动加成: ${b.join(' ')}`);
    }
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看当前季节', MOD_ID);

  main.registerCommand('季节探险', (ctx, msg, p) => {
    const petIdx = parseInt(p.p1);
    if (!petIdx) return p.reply('用法: .宠物 季节探险 <宠物编号>');
    const mainData = main.DB.get(p.uid);
    const pet = mainData.pets[petIdx - 1];
    if (!pet) return p.reply('宠物不存在');
    if (pet.hp <= 0) return p.reply('宠物已阵亡');
    if (pet.energy < 30) return p.reply('宠物精力不足');
    const area = SEASONAL_AREAS[getCurrentSeason()];
    const festival = getCurrentFestival();
    const gold = Math.floor((Math.random() * (area.gold[1] - area.gold[0] + 1) + area.gold[0]) * (festival?.bonus?.gold || 1));
    const food = area.foods[Math.floor(Math.random() * area.foods.length)];
    if (Math.random() < area.danger) pet.hp = Math.max(1, pet.hp - 20);
    mainData.money = (mainData.money || 0) + gold;
    mainData.food[food] = (mainData.food[food] || 0) + 1;
    pet.energy -= 30;
    main.DB.save(p.uid, mainData);
    p.reply(`【${area.name}探险】\n${pet.name} 完成探险\n获得 ${gold} 金币\n获得 ${food} x1`);
    return seal.ext.newCmdExecuteResult(true);
  }, '季节探险', MOD_ID);

  main.registerCommand('季节商店', (ctx, msg, p) => {
    const pets = SEASONAL_PETS[getCurrentSeason()];
    const festival = getCurrentFestival();
    const lines = ['【季节商店】', ''];
    pets.forEach(x => {
      const price = { '稀有': 500, '超稀有': 1500, '传说': 5000 }[x.rarity];
      lines.push(`[${x.rarity}] ${x.species} [${x.element}] - ${price}金`);
    });
    if (festival) lines.push('', `[${festival.name}限定]`, ...festival.pets.map(n => `${n} - 2000金`));
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看季节商店', MOD_ID);

  main.registerCommand('购买季节宠物', (ctx, msg, p) => {
    const species = p.p1;
    if (!species) return p.reply('用法: .宠物 购买季节宠物 <名称>');
    const pets = SEASONAL_PETS[getCurrentSeason()];
    const festival = getCurrentFestival();
    let petInfo = pets.find(x => x.species === species);
    if (!petInfo && festival?.pets?.includes(species)) {
      petInfo = { species, element: '超能', rarity: '超稀有', bonus: {} };
    }
    if (!petInfo) return p.reply('当前季节没有这个宠物');
    const price = { '稀有': 500, '超稀有': 1500, '传说': 5000 }[petInfo.rarity];
    const mainData = main.DB.get(p.uid);
    if (mainData.money < price) return p.reply(`金币不足，需要 ${price} 金币`);
    const pet = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: species, species, element: petInfo.element, rarity: petInfo.rarity, level: 1,
      hp: 50 + (petInfo.bonus?.hp || 0), maxHp: 50 + (petInfo.bonus?.hp || 0),
      atk: 25 + (petInfo.bonus?.atk || 0), def: 20 + (petInfo.bonus?.def || 0),
      energy: 100 + (petInfo.bonus?.energy || 0), maxEnergy: 100 + (petInfo.bonus?.energy || 0),
      exp: 0, sp: 0, skills: ['冲撞'], battles: 0, canBreed: true,
    };
    mainData.money -= price;
    if (mainData.pets.length < main.Config.maxPets) mainData.pets.push(pet);
    else mainData.storage.push(pet);
    main.DB.save(p.uid, mainData);
    p.reply(`购买成功！获得 ${species}\n花费 ${price} 金币`);
    return seal.ext.newCmdExecuteResult(true);
  }, '购买季节宠物', MOD_ID);

  main.enableMod(MOD_ID, ModAPI);
}

function waitForMain(cb, n = 10) {
  const m = getMain();
  if (m) cb(m);
  else if (n > 0) setTimeout(() => waitForMain(cb, n - 1), 500);
}

waitForMain(init);
