// ==UserScript==
// @name        万物有灵-Mod模板
// @author      你的名字
// @version     1.0.0
// @description 这是一个Mod模板，复制后修改
// @timestamp   1744924800
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/你的仓库/sealjs/你的文件.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-你的Mod名');
if (!ext) {
  ext = seal.ext.new('万物有灵-你的Mod名', '你的名字', '1.0.0');
  seal.ext.register(ext);
}

const MOD_ID = 'your-mod-id';

// ==================== Mod配置 ====================
const CONFIG = {
  // 你的配置
};

// ==================== 数据存储 ====================
const DB = {
  get(userId) {
    try {
      const d = ext.storageGet('mod_' + userId);
      return d ? JSON.parse(d) : {};
    } catch {
      return {};
    }
  },
  save(userId, data) {
    ext.storageSet('mod_' + userId, JSON.stringify(data));
  },
};

// ==================== 获取主插件 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

// ==================== 工具函数 ====================
// 获取宠物（支持队伍和仓库）编号: 1-3队伍，4-18仓库
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

// ==================== Mod API ====================
const ModAPI = {
  onEnable() { console.log(`[${MOD_ID}] Mod已启用`); },
  onDisable() { console.log(`[${MOD_ID}] Mod已禁用`); },
  // 暴露给其他Mod调用的API
  getSomething(uid) { return DB.get(uid).something; },
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return;

  main.registerMod({
    id: MOD_ID,
    name: '你的Mod名称',
    version: '1.0.0',
    author: '你的名字',
    description: 'Mod描述',
    dependencies: [],
  });

  // 可用事件: capture, feed, rest, rename, learn, battle, levelup, retire, breed, evolve, sell, buy, store
  main.on('capture', ({ uid, pet }) => { }, MOD_ID);
  main.on('battle', ({ uid, winner, isNPC, targetUid, pet1, pet2 }) => { }, MOD_ID);
  main.on('levelup', ({ uid, pet, oldLevel, newLevel }) => { }, MOD_ID);
  main.on('evolve', ({ uid, pet, oldRarity, newRarity }) => { }, MOD_ID);
  main.on('store', ({ uid, pet, to }) => { }, MOD_ID);

  main.registerCommand('你的命令', (ctx, msg, p) => {
    // p.uid, p.data, p.p1, p.p2, p.reply(), p.save(), p.getPet()
    p.reply('命令执行结果');
    return seal.ext.newCmdExecuteResult(true);
  }, '命令帮助说明', MOD_ID);

  main.enableMod(MOD_ID, ModAPI);
}

// 轮询等待主插件加载
function waitForMain(callback, maxAttempts = 10) {
  const main = getMain();
  if (main) { callback(main); return; }
  if (maxAttempts <= 0) { console.log('[你的Mod名] 主插件未找到'); return; }
  setTimeout(() => waitForMain(callback, maxAttempts - 1), 500);
}

waitForMain(init);

