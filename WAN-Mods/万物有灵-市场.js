// ==UserScript==
// @name        万物有灵-市场
// @author      铭茗
// @version     1.1.0
// @description 交易市场：玩家间买卖宠物
// @timestamp   1776593883
// @license     Apache-2
// @updateUrl   https://gitcode.com/MOYIre/sealjs/raw/main/WAN-Mods/万物有灵-市场.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-市场');
if (!ext) {
  ext = seal.ext.new('万物有灵-市场', '铭茗', '1.1.0');
  seal.ext.register(ext);
}

const MOD_ID = 'wanwu-market';

// ==================== 配置 ====================
const CONFIG = {
  maxListings: 5,
  taxRate: 0.05,
  minPrice: 50,
  maxPrice: 99999,
  listingExpire: 7 * 24 * 60 * 60 * 1000,
};

// ==================== 数据存储 ====================
let marketData = { listings: {}, lastUpdate: 0 };

function loadMarket() {
  try {
    const d = ext.storageGet('market_global');
    if (d) marketData = JSON.parse(d);
  } catch {
    marketData = { listings: {}, lastUpdate: 0 };
  }
}

function saveMarket() { ext.storageSet('market_global', JSON.stringify(marketData)); }

function getUserListings(uid) {
  return Object.entries(marketData.listings)
    .filter(([, item]) => item.sellerId === uid)
    .map(([id, item]) => ({ id, ...item }));
}

function cleanExpired() {
  const now = Date.now();
  Object.keys(marketData.listings).forEach(id => {
    if (marketData.listings[id].expire < now) {
      const item = marketData.listings[id];
      returnPetToSeller(item);
      delete marketData.listings[id];
    }
  });
  saveMarket();
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

function returnPetToSeller(item) {
  const main = getMain();
  if (!main) return;
  const sellerData = main.DB.get(item.sellerId);
  if (sellerData.storage.length < main.Config.maxStorage) {
    sellerData.storage.push(normalizePetState(item.pet));
    main.DB.save(item.sellerId, sellerData);
  }
}

// ==================== 工具函数 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

function formatPet(pet) {
  const r = { '普通': '', '稀有': '*', '超稀有': '**', '传说': '***' }[pet.rarity];
  const e = pet.element ? `[${pet.element}]` : '';
  const power = Math.floor(pet.atk * 2 + pet.def * 1.5 + pet.hp * 0.5);
  return `${r}${e} ${pet.name} Lv.${pet.level} 战力:${power}`;
}

// ==================== Mod API ====================
const ModAPI = {
  getListings: () => { loadMarket(); cleanExpired(); return marketData.listings; },
  getUserListings,
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return;

  main.registerMod({
    id: MOD_ID, name: '万物有灵-市场', version: '1.0.0', author: '铭茗',
    description: '宠物交易市场', dependencies: [],
  });

  loadMarket();
  cleanExpired();

  main.registerCommand('市场', (ctx, msg, p) => {
    loadMarket();
    cleanExpired();
    const listings = Object.entries(marketData.listings);
    if (!listings.length) return p.reply('【宠物市场】\n暂无宠物出售\n使用 .宠物 挂售 <仓库编号> <价格>');
    const lines = ['【宠物市场】', `当前在售: ${listings.length}只`, ''];
    listings.slice(0, 10).forEach(([id, item]) => {
      lines.push(`#${id.slice(-4)} ${formatPet(item.pet)}`);
      lines.push(`    价格: ${item.price}金 卖家: ${item.sellerName}`);
    });
    if (listings.length > 10) lines.push(`\n...还有${listings.length - 10}只宠物`);
    lines.push('\n.宠物 购买宠物 <编号>');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看市场', MOD_ID);

  main.registerCommand('挂售', (ctx, msg, p) => {
    const storageIdx = parseInt(p.p1) - 1;
    const price = parseInt(p.p2);
    if (isNaN(storageIdx) || isNaN(price)) return p.reply('用法: .宠物 挂售 <仓库编号> <价格>');
    if (price < CONFIG.minPrice || price > CONFIG.maxPrice) return p.reply(`价格范围: ${CONFIG.minPrice} - ${CONFIG.maxPrice}`);
    const mainData = main.DB.get(p.uid);
    const pet = (mainData.storage || [])[storageIdx];
    if (!pet) return p.reply('仓库中没有该宠物');
    const myListings = getUserListings(p.uid);
    if (myListings.length >= CONFIG.maxListings) return p.reply(`每人最多挂售${CONFIG.maxListings}只宠物`);
    mainData.storage.splice(storageIdx, 1);
    main.DB.save(p.uid, mainData);
    const listingId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const petForSale = normalizePetState(pet);
    marketData.listings[listingId] = {
      pet: petForSale, price, sellerId: p.uid, sellerName: msg.sender.nickname || msg.sender.userId,
      time: Date.now(), expire: Date.now() + CONFIG.listingExpire,
    };
    saveMarket();
    p.reply(`已将 ${pet.name} 挂售\n价格: ${price} 金币\nID: #${listingId.slice(-4)}`);
    return seal.ext.newCmdExecuteResult(true);
  }, '挂售宠物', MOD_ID);

  main.registerCommand('购买宠物', (ctx, msg, p) => {
    const shortId = p.p1;
    if (!shortId) return p.reply('用法: .宠物 购买宠物 <编号>');
    loadMarket();
    const listingId = Object.keys(marketData.listings).find(id => id.slice(-4) === shortId);
    if (!listingId) return p.reply('未找到该宠物');
    const item = marketData.listings[listingId];
    if (item.sellerId === p.uid) return p.reply('不能购买自己的宠物');
    const mainData = main.DB.get(p.uid);
    if (mainData.money < item.price) return p.reply(`金币不足，需要 ${item.price} 金币`);
    if (mainData.pets.length >= main.Config.maxPets && mainData.storage.length >= main.Config.maxStorage) {
      return p.reply('宠物和仓库都已满');
    }
    mainData.money -= item.price;
    const purchasedPet = normalizePetState(item.pet);
    if (mainData.pets.length < main.Config.maxPets) mainData.pets.push(purchasedPet);
    else mainData.storage.push(purchasedPet);
    main.DB.save(p.uid, mainData);
    const sellerData = main.DB.get(item.sellerId);
    const actualPrice = Math.floor(item.price * (1 - CONFIG.taxRate));
    sellerData.money = (sellerData.money || 0) + actualPrice;
    main.DB.save(item.sellerId, sellerData);
    delete marketData.listings[listingId];
    saveMarket();
    p.reply(`购买成功！\n获得: ${item.pet.name}\n花费: ${item.price} 金币\n卖家获得: ${actualPrice} 金币(扣税${Math.floor(CONFIG.taxRate * 100)}%)`);
    return seal.ext.newCmdExecuteResult(true);
  }, '购买宠物', MOD_ID);

  main.registerCommand('撤销挂售', (ctx, msg, p) => {
    const shortId = p.p1;
    if (!shortId) return p.reply('用法: .宠物 撤销挂售 <编号>');
    loadMarket();
    const listingId = Object.keys(marketData.listings).find(id => id.slice(-4) === shortId);
    if (!listingId) return p.reply('未找到该挂售');
    const item = marketData.listings[listingId];
    if (item.sellerId !== p.uid) return p.reply('只能撤销自己的挂售');
    const mainData = main.DB.get(p.uid);
    if (mainData.storage.length >= main.Config.maxStorage) return p.reply('仓库已满，无法返还宠物');
    mainData.storage.push(normalizePetState(item.pet));
    main.DB.save(p.uid, mainData);
    delete marketData.listings[listingId];
    saveMarket();
    p.reply(`已撤销挂售，${item.pet.name} 已返还到仓库`);
    return seal.ext.newCmdExecuteResult(true);
  }, '撤销挂售', MOD_ID);

  main.registerCommand('我的挂售', (ctx, msg, p) => {
    const myListings = getUserListings(p.uid);
    if (!myListings.length) return p.reply('【我的挂售】\n暂无挂售中的宠物');
    const lines = ['【我的挂售】', ''];
    myListings.forEach(item => {
      lines.push(`#${item.id.slice(-4)} ${formatPet(item.pet)}`);
      lines.push(`    价格: ${item.price}金`);
    });
    lines.push('\n.宠物 撤销挂售 <编号>');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看我的挂售', MOD_ID);

  main.enableMod(MOD_ID, ModAPI);
}

function waitForMain(cb, n = 10) {
  const m = getMain();
  if (m) cb(m);
  else if (n > 0) setTimeout(() => waitForMain(cb, n - 1), 500);
}

waitForMain(init);
