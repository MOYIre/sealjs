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

const MOD_ID = 'your-mod-id';  // 唯一ID，用于API调用

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

// ==================== Mod API ====================
const ModAPI = {
  // 生命周期 - 启用时调用
  onEnable() {
    console.log(`[${MOD_ID}] Mod已启用`);
  },
  
  // 生命周期 - 禁用时调用
  onDisable() {
    console.log(`[${MOD_ID}] Mod已禁用`);
  },

  // 暴露给其他Mod调用的API
  // 例如：main.call('your-mod-id', 'getSomething', uid)
  getSomething(uid) {
    return DB.get(uid).something;
  },
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) {
    console.log(`[${MOD_ID}] 主插件未加载`);
    return;
  }

  // 1. 注册Mod
  main.registerMod({
    id: MOD_ID,
    name: '你的Mod名称',
    version: '1.0.0',
    author: '你的名字',
    description: 'Mod描述',
    dependencies: [],  // 依赖的其他Mod ID，如 ['wanwu-ext']
  });

  // 2. 订阅事件
  // 捕捉宠物
  main.on('capture', ({ uid, pet }) => {
    // 你的逻辑
  }, MOD_ID);

  // 对战结束
  main.on('battle', ({ uid, winner, isNPC, targetUid, pet1, pet2 }) => {
    // 你的逻辑
  }, MOD_ID);

  // 喂食
  main.on('feed', ({ uid, pet, food, foodData }) => {
    // 你的逻辑
  }, MOD_ID);

  // 升级
  main.on('levelup', ({ uid, pet, oldLevel, newLevel }) => {
    // 你的逻辑
  }, MOD_ID);

  // 进化
  main.on('evolve', ({ uid, pet, oldRarity, newRarity }) => {
    // 你的逻辑
  }, MOD_ID);

  // 育种
  main.on('breed', ({ uid, parents, child }) => {
    // 你的逻辑
  }, MOD_ID);

  // 出售
  main.on('sell', ({ uid, pet, price }) => {
    // 你的逻辑
  }, MOD_ID);

  // 购买
  main.on('buy', ({ uid, item, count, cost }) => {
    // 你的逻辑
  }, MOD_ID);

  // 3. 注册命令
  main.registerCommand('你的命令', (ctx, msg, p) => {
    // p.uid - 用户ID
    // p.data - 用户数据
    // p.p1, p.p2 - 参数
    // p.reply('回复内容') - 回复
    // p.save() - 保存数据
    // p.getPet(编号) - 获取宠物
    
    p.reply('命令执行结果');
    return seal.ext.newCmdExecuteResult(true);
  }, '命令帮助说明', MOD_ID);

  // 4. 启用Mod
  const result = main.enableMod(MOD_ID, ModAPI);
  if (!result.success) {
    console.log(`[${MOD_ID}] 启用失败: ${result.error}`);
  }
}

// 延迟初始化，等待主插件加载
setTimeout(init, 1000);
