// ==UserScript==
// @name        万物有灵-Mod模板
// @author      你的名字
// @version     1.0.0
// @description 这是一个Mod模板，复制后修改。适配万物有灵 v4.3.3+
// @timestamp   1744924800
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/你的仓库/sealjs/你的文件.js
// ==/UserScript==

const MOD_ID = 'your-mod-id';
const MOD_NAME = '你的Mod名称';
const MOD_VERSION = '1.0.0';
const MOD_AUTHOR = '你的名字';

// ==================== Mod配置 ====================
const MOD_CONFIG = {
  // 你的配置项
  exampleSetting: true,
};

// ==================== 数据存储 ====================
const DB = {
  get(userId) {
    try {
      const d = ext.storageGet('mod_' + MOD_ID + '_' + userId);
      return d ? JSON.parse(d) : {};
    } catch {
      return {};
    }
  },
  save(userId, data) {
    ext.storageSet('mod_' + MOD_ID + '_' + userId, JSON.stringify(data));
  },
  getGlobal() {
    try {
      const d = ext.storageGet('mod_' + MOD_ID + '_global');
      return d ? JSON.parse(d) : {};
    } catch {
      return {};
    }
  },
  saveGlobal(data) {
    ext.storageSet('mod_' + MOD_ID + '_global', JSON.stringify(data));
  },
};

// ==================== 获取主插件 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

// ==================== 工具函数 ====================

/**
 * 获取宠物（支持队伍和仓库）
 * @param {object} p - 玩家数据对象 { data, uid }
 * @param {number|string} idx - 编号: 1-3队伍，4-18仓库
 * @returns {object|null} { pet, from: 'team'|'storage', idx }
 */
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

/**
 * 查找宠物（通过ID）
 * @param {object} p - 玩家数据对象
 * @param {string} petId - 宠物ID
 * @returns {object|null} { pet, from: 'team'|'storage' }
 */
function findPetById(p, petId) {
  let pet = p.data.pets.find(pt => pt.id === petId);
  if (pet) return { pet, from: 'team' };
  pet = (p.data.storage || []).find(pt => pt.id === petId);
  if (pet) return { pet, from: 'storage' };
  return null;
}

/**
 * 格式化宠物简报
 * @param {object} pet - 宠物对象
 * @returns {string}
 */
function formatPetBrief(pet) {
  if (!pet) return '无宠物';
  return `[${pet.rarity}]${pet.name} Lv.${pet.level} ${pet.element}`;
}

/**
 * 计算宠物战力（简化版）
 * @param {object} pet - 宠物对象
 * @returns {number}
 */
function calcPower(pet) {
  if (!pet) return 0;
  return Math.floor((pet.hp || 100) + (pet.atk || 10) * 2 + (pet.def || 10) * 1.5 + (pet.energy || 50));
}

// ==================== Mod API ====================
const ModAPI = {
  onLoad() {
    console.log(`[${MOD_ID}] Mod已加载 v${MOD_VERSION}`);
  },

  onUnload() {
    console.log(`[${MOD_ID}] Mod已卸载`);
    // 清理资源、取消订阅等
  },

  // 暴露给其他Mod调用的API
  getSomething(uid) {
    return DB.get(uid).something;
  },

  // 配置项
  getConfig() {
    return { ...MOD_CONFIG };
  },
};

// ==================== 事件处理器 ====================
const EventHandlers = {
  // 捕捉宠物
  onCapture({ uid, pet }) {
    console.log(`[${MOD_ID}] ${uid} 捕捉了 ${pet.name}`);
  },

  // 喂食
  onFeed({ uid, pet, food, foodData, count, mode }) {
    // mode: 'normal' | 'bonus'
  },

  // 战斗结束
  onBattle({ uid, winner, isNPC, targetUid, pet1, pet2 }) {
    // winner: 'win' | 'lose' | 'draw'
  },

  // 升级
  onLevelup({ uid, pet, oldLevel, newLevel }) {
    console.log(`[${MOD_ID}] ${pet.name} 升级 ${oldLevel} -> ${newLevel}`);
  },

  // 进化
  onEvolution({ uid, pet, oldSpecies, newSpecies }) {
    console.log(`[${MOD_ID}] ${pet.name} 进化 ${oldSpecies} -> ${newSpecies}`);
  },

  // 育种
  onBreed({ uid, parents, babies }) {
    // parents: [pet1, pet2], babies: [pet, ...]
  },

  // 存入/取出仓库
  onStore({ uid, pet, to }) {
    // to: 'storage' | 'team'
  },

  // 学习技能
  onLearn({ uid, pet, skill }) {},

  // 重命名
  onRename({ uid, pet, oldName, newName }) {},

  // 退休
  onRetire({ uid, pet }) {},

  // 购买物品
  onBuy({ uid, item, count, cost, type }) {
    // type: 'food' | 'item'
  },

  // 使用物品
  onUseItem({ uid, item, pet }) {},

  // 命令执行
  onCommand({ uid, ctx, msg, action }) {},
};

// ==================== 命令处理器 ====================
const CommandHandlers = {
  // .宠物 示例命令
  example(p) {
    const { uid, data, p1, p2, reply, save, getPet } = p;
    const pet = getPet();
    if (!pet) return reply('你没有选中宠物');

    reply(`你的宠物: ${formatPetBrief(pet)}\n战力: ${calcPower(pet)}`);
    return seal.ext.newCmdExecuteResult(true);
  },

  // .宠物 我的mod配置
  config(p) {
    const { uid, data, p1, p2, reply, save } = p;
    const modData = DB.get(uid);

    if (p1 === '开启' || p1 === 'on') {
      modData.enabled = true;
      DB.save(uid, modData);
      reply('功能已开启');
    } else if (p1 === '关闭' || p1 === 'off') {
      modData.enabled = false;
      DB.save(uid, modData);
      reply('功能已关闭');
    } else {
      reply(`当前状态: ${modData.enabled ? '开启' : '关闭'}\n用法: .宠物 ${MOD_ID} 开启/关闭`);
    }

    return seal.ext.newCmdExecuteResult(true);
  },
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) {
    console.log(`[${MOD_ID}] 主插件未找到，等待加载...`);
    return false;
  }

  // 注册Mod
  const result = main.registerMod({
    id: MOD_ID,
    name: MOD_NAME,
    version: MOD_VERSION,
    author: MOD_AUTHOR,
    description: 'Mod描述',
    dependencies: [], // 依赖的其他Mod ID
    hotReloadable: true, // 支持热重载
  }, ModAPI);

  if (!result.success) {
    console.error(`[${MOD_ID}] 注册失败:`, result.error);
    return false;
  }

  console.log(`[${MOD_ID}] 注册成功，${result.reloaded ? '已重载' : '首次加载'}`);

  // 订阅事件
  // 可用事件: command, capture, feed, battle, levelup, evolution, breed, store, learn, rename, retire, buy, useItem
  main.on('capture', EventHandlers.onCapture, MOD_ID);
  main.on('battle', EventHandlers.onBattle, MOD_ID);
  main.on('levelup', EventHandlers.onLevelup, MOD_ID);
  main.on('evolution', EventHandlers.onEvolution, MOD_ID);
  // main.on('feed', EventHandlers.onFeed, MOD_ID);
  // main.on('breed', EventHandlers.onBreed, MOD_ID);
  // main.on('store', EventHandlers.onStore, MOD_ID);

  // 注册命令
  main.registerCommand(MOD_ID, CommandHandlers.example, '示例命令说明', MOD_ID, 'Mod功能');
  main.registerCommand(MOD_ID + '配置', CommandHandlers.config, 'Mod配置', MOD_ID, 'Mod功能');

  ModAPI.onLoad();
  return true;
}

// ==================== 热重载支持 ====================
function cleanup() {
  const main = getMain();
  if (!main) return;

  // 取消事件订阅
  main.off(MOD_ID);

  // 注销命令
  main.unregisterCommand(MOD_ID);
  main.unregisterCommand(MOD_ID + '配置');

  ModAPI.onUnload();
}

// 如果已加载过，先清理
if (typeof globalThis !== 'undefined' && globalThis[`__mod_${MOD_ID}_loaded`]) {
  cleanup();
}
if (typeof globalThis !== 'undefined') {
  globalThis[`__mod_${MOD_ID}_loaded`] = true;
}

// ==================== 等待主插件加载 ====================
function waitForMain(callback, maxAttempts = 20) {
  const main = getMain();
  if (main) {
    callback(main);
    return;
  }
  if (maxAttempts <= 0) {
    console.error(`[${MOD_ID}] 主插件未找到，加载失败`);
    return;
  }
  setTimeout(() => waitForMain(callback, maxAttempts - 1), 500);
}

waitForMain(init);

// ==================== API 参考 ====================
/*
主插件 WanwuYouling 对象结构:

WanwuYouling.version          - 版本号
WanwuYouling.ext              - seal扩展对象

WanwuYouling.DB.get(userId)   - 获取玩家数据
WanwuYouling.DB.save(userId, data) - 保存玩家数据

WanwuYouling.Storage.getJSON(key, default) - 获取存储
WanwuYouling.Storage.setJSON(key, value)   - 设置存储

WanwuYouling.Species          - 物种定义
WanwuYouling.Elements         - 元素列表
WanwuYouling.Rarities         - 稀有度列表
WanwuYouling.Skills           - 技能定义
WanwuYouling.Foods            - 食物定义
WanwuYouling.Config           - 配置

WanwuYouling.PetFactory.create(rarityBoost, forceLegend, customName) - 创建宠物
WanwuYouling.PetFactory.generateName(element) - 生成名字
WanwuYouling.PetFactory.power(pet) - 计算战力
WanwuYouling.PetFactory.info(pet, idx) - 获取信息
WanwuYouling.PetFactory.getLearnableSkills(pet) - 可学技能
WanwuYouling.PetFactory.learnSkill(pet, skillName) - 学习技能

WanwuYouling.Battle.run(attacker, defender) - 执行战斗

WanwuYouling.Utils.addPet(userId, pet) - 添加宠物
WanwuYouling.Utils.removePet(userId, petId) - 移除宠物
WanwuYouling.Utils.addMoney(userId, amount) - 增加金币
WanwuYouling.Utils.costMoney(userId, amount) - 消耗金币

Mod系统方法:
WanwuYouling.registerMod(meta, api) - 注册Mod
WanwuYouling.unregisterMod(modId) - 注销Mod
WanwuYouling.getMod(modId) - 获取Mod
WanwuYouling.getMods() - 获取所有Mod
WanwuYouling.on(event, handler, modId) - 订阅事件
WanwuYouling.off(modId) - 取消该Mod所有订阅
WanwuYouling.emit(event, data) - 触发事件
WanwuYouling.registerCommand(name, handler, helpText, modId, category) - 注册命令
WanwuYouling.unregisterCommand(name) - 注销命令

命令处理器参数 p:
{
  uid,      // 用户ID
  data,     // 玩家数据
  p1, p2,   // 命令参数
  reply(msg),  // 回复消息
  save(),      // 保存数据
  getPet(),    // 获取选中宠物
}
*/
