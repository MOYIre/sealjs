// ==UserScript==
// @name        万物有灵-技能书
// @author      铭茗
// @version     1.0.0
// @description 技能书系统：探险打工掉落技能书，学习指定技能
// @timestamp   1776574167
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵-技能书.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-技能书');
if (!ext) {
  ext = seal.ext.new('万物有灵-技能书', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

const MOD_ID = 'wanwu-skillbook';

// ==================== 技能书定义 ====================
// 技能书按元素分类，对应属性的宠物才能学习
const SKILL_BOOKS = {
  // 火系技能书
  '火焰术技能书': { skill: '火焰术', element: '火', rarity: '稀有', dropRate: 0.1 },
  '炎爆技能书': { skill: '炎爆', element: '火', rarity: '超稀有', dropRate: 0.03 },
  
  // 水系技能书
  '水弹技能书': { skill: '水弹', element: '水', rarity: '稀有', dropRate: 0.1 },
  '洪流技能书': { skill: '洪流', element: '水', rarity: '超稀有', dropRate: 0.03 },
  
  // 草系技能书
  '藤鞭技能书': { skill: '藤鞭', element: '草', rarity: '稀有', dropRate: 0.1 },
  '森葬技能书': { skill: '森葬', element: '草', rarity: '超稀有', dropRate: 0.03 },
  
  // 电系技能书
  '闪电技能书': { skill: '闪电', element: '电', rarity: '稀有', dropRate: 0.1 },
  '雷暴技能书': { skill: '雷暴', element: '电', rarity: '超稀有', dropRate: 0.03 },
  
  // 岩石系技能书
  '落石技能书': { skill: '落石', element: '岩石', rarity: '稀有', dropRate: 0.1 },
  '地裂技能书': { skill: '地裂', element: '岩石', rarity: '超稀有', dropRate: 0.03 },
  
  // 超能系技能书
  '念力技能书': { skill: '念力', element: '超能', rarity: '稀有', dropRate: 0.1 },
  '精神冲击技能书': { skill: '精神冲击', element: '超能', rarity: '超稀有', dropRate: 0.03 },
  
  // 通用技能书
  '冲撞技能书': { skill: '冲撞', element: null, rarity: '普通', dropRate: 0.2 },
  '猛击技能书': { skill: '猛击', element: null, rarity: '稀有', dropRate: 0.08 },
};

// 掉落区域配置
const DROP_ZONES = {
  explore: {
    森林: ['火焰术技能书', '藤鞭技能书', '冲撞技能书'],
    山脉: ['落石技能书', '地裂技能书', '猛击技能书'],
    湖泊: ['水弹技能书', '洪流技能书', '冲撞技能书'],
    洞穴: ['闪电技能书', '雷暴技能书', '念力技能书'],
    遗迹: ['炎爆技能书', '森葬技能书', '精神冲击技能书', '地裂技能书'],
  },
  work: {
    狩猎: ['火焰术技能书', '闪电技能书', '猛击技能书'],
    护送: ['落石技能书', '水弹技能书', '念力技能书'],
  },
};

// ==================== 数据存储 ====================
const DB = {
  get(userId) {
    const defaultData = { books: {} }; // books: {技能书名: 数量}
    try {
      const d = ext.storageGet('sb_' + userId);
      if (!d) return defaultData;
      return { ...defaultData, ...JSON.parse(d) };
    } catch {
      return defaultData;
    }
  },
  save(userId, data) {
    ext.storageSet('sb_' + userId, JSON.stringify(data));
  },
};

// ==================== 工具函数 ====================
function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}

function getRandomDrop(type, area) {
  const pool = DROP_ZONES[type]?.[area];
  if (!pool || !pool.length) return null;
  
  const bookName = pool[Math.floor(Math.random() * pool.length)];
  const book = SKILL_BOOKS[bookName];
  if (!book) return null;
  
  // 根据掉落率判断
  if (Math.random() > book.dropRate) return null;
  
  return bookName;
}

// ==================== Mod API ====================
const ModAPI = {
  getBooks(uid) {
    return DB.get(uid).books;
  },
  addBook(uid, bookName) {
    const data = DB.get(uid);
    data.books[bookName] = (data.books[bookName] || 0) + 1;
    DB.save(uid, data);
  },
  getBookInfo(name) {
    return SKILL_BOOKS[name];
  },
};

// ==================== 初始化 ====================
function init() {
  const main = getMain();
  if (!main) return;

  main.registerMod({
    id: MOD_ID,
    name: '万物有灵-技能书',
    version: '1.0.0',
    author: '铭茗',
    description: '技能书系统',
    dependencies: ['wanwu-ext'],
  });

  // 监听探险完成（通过扩展插件的API）
  // 这里需要在扩展插件中添加事件触发，暂时通过命令模拟

  // 技能书背包
  main.registerCommand('技能书', (ctx, msg, p) => {
    const data = DB.get(p.uid);
    const items = Object.entries(data.books).filter(([, count]) => count > 0);
    
    if (!items.length) return p.reply('【技能书】\n暂无技能书\n探险和打工有机会获得技能书');
    
    const lines = ['【技能书】', ''];
    items.forEach(([name, count]) => {
      const book = SKILL_BOOKS[name];
      const element = book.element ? `[${book.element}]` : '[通用]';
      lines.push(`📖 ${name} x${count} ${element}`);
      lines.push(`   学习技能: ${book.skill}`);
    });
    
    lines.push('\n.宠物 学习技能 <宠物编号> <技能书名> - 使用技能书');
    p.reply(lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
  }, '查看技能书', MOD_ID);

  // 使用技能书学习技能
  main.registerCommand('学习技能', (ctx, msg, p) => {
    const petIdx = parseInt(p.p1);
    const bookName = p.p2;
    
    if (!petIdx || !bookName) return p.reply('用法: .宠物 学习技能 <宠物编号> <技能书名>');
    
    const mainData = main.DB.get(p.uid);
    const pet = mainData.pets[petIdx - 1];
    if (!pet) return p.reply('宠物不存在');
    
    const data = DB.get(p.uid);
    if (!data.books[bookName] || data.books[bookName] < 1) return p.reply('你没有这本技能书');
    
    const book = SKILL_BOOKS[bookName];
    if (!book) return p.reply('未知技能书');
    
    // 检查属性匹配
    if (book.element && pet.element !== book.element) {
      return p.reply(`${pet.name}是${pet.element}属性，无法学习${book.element}系技能`);
    }
    
    // 检查是否已学会
    if (pet.skills.includes(book.skill)) {
      return p.reply(`${pet.name}已经学会了${book.skill}`);
    }
    
    // 学习技能
    pet.skills.push(book.skill);
    data.books[bookName]--;
    
    main.DB.save(p.uid, mainData);
    DB.save(p.uid, data);
    
    p.reply(`📖 ${pet.name} 阅读了 ${bookName}\n✨ 学会了 ${book.skill}！`);
    return seal.ext.newCmdExecuteResult(true);
  }, '使用技能书', MOD_ID);

  // GM命令：给予技能书（测试用）
  main.registerCommand('给予技能书', (ctx, msg, p) => {
    const bookName = p.p1;
    if (!bookName) return p.reply('用法: .宠物 给予技能书 <技能书名>');
    
    if (!SKILL_BOOKS[bookName]) {
      const books = Object.keys(SKILL_BOOKS).slice(0, 10).join('、');
      return p.reply(`未知技能书\n可用: ${books}...`);
    }
    
    const data = DB.get(p.uid);
    data.books[bookName] = (data.books[bookName] || 0) + 1;
    DB.save(p.uid, data);
    
    p.reply(`获得 ${bookName} x1`);
    return seal.ext.newCmdExecuteResult(true);
  }, '获得技能书(测试)', MOD_ID);

  main.enableMod(MOD_ID, ModAPI);
}

function waitForMain(callback, maxAttempts = 10) {
  const main = getMain();
  if (main) { callback(main); return; }
  if (maxAttempts <= 0) { console.log('[万物有灵-技能书] 主插件未找到'); return; }
  setTimeout(() => waitForMain(callback, maxAttempts - 1), 500);
}

waitForMain(init);
