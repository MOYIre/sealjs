// ==UserScript==
// @name        万物有灵
// @author      铭茗
// @version     1.2.8
// @description 宠物核心：捕捉、培养、对战、育种、进化、仓库
// @timestamp   1776610708
// @license     Apache-2
// @updateUrl   https://gitcode.com/MOYIre/sealjs/raw/main/万物有灵.js
// ==/UserScript==
//如果你打开了代码就会看到我！有任何问题请及时拷打铭茗:3029590078，欢迎交流与讨论
let ext = seal.ext.find('万物有灵');
if (!ext) {
  ext = seal.ext.new('万物有灵', '铭茗', '1.2.8');
  seal.ext.register(ext);
}

const CONFIG = {
  maxPets: 3,
  maxStorage: 15,
  maxSkills: 4,
  evolveLevel: 10,
  evolveBattles: [3, 5],
  baseExpGain: 10,
  // 战斗相关
  battleLogLimit: 8,
  battleLogPvPLimit: 10,
  battleEnergyCost: 20,
  battleHpLoss: 10,
  // 斗殴相关
  fightLogLimit: 8,
};

// ==================== 种族定义 ====================
const SPECIES = {
  '猫': { elements: ['火', '水', '草', '电', '超能'], baseMod: { hp: 1, atk: 1.1, def: 0.9, energy: 1 } },
  '犬': { elements: ['火', '电', '岩石'], baseMod: { hp: 1.1, atk: 1, def: 1, energy: 0.9 } },
  '龙': { elements: ['火', '水', '超能'], baseMod: { hp: 1.2, atk: 1.2, def: 1, energy: 1.1 } },
  '蛇': { elements: ['水', '草', '超能'], baseMod: { hp: 0.9, atk: 1.1, def: 0.9, energy: 1.2 } },
  '鸟': { elements: ['火', '电', '草'], baseMod: { hp: 0.8, atk: 1.2, def: 0.8, energy: 1.3 } },
  '龟': { elements: ['水', '岩石'], baseMod: { hp: 1.3, atk: 0.8, def: 1.3, energy: 0.8 } },
  '熊': { elements: ['岩石', '草'], baseMod: { hp: 1.3, atk: 1.2, def: 1.1, energy: 0.7 } },
  '狐': { elements: ['火', '超能', '电'], baseMod: { hp: 0.9, atk: 1.1, def: 0.9, energy: 1.2 } },
  '兔': { elements: ['草', '电'], baseMod: { hp: 0.9, atk: 1, def: 0.8, energy: 1.3 } },
  '鼠': { elements: ['电', '草', '水'], baseMod: { hp: 0.8, atk: 1, def: 0.8, energy: 1.2 } },
  '狼': { elements: ['电', '岩石', '水'], baseMod: { hp: 1, atk: 1.2, def: 1, energy: 1 } },
  '鹿': { elements: ['草', '超能'], baseMod: { hp: 1, atk: 0.9, def: 0.9, energy: 1.2 } },
  '猿': { elements: ['岩石', '火'], baseMod: { hp: 1.1, atk: 1.3, def: 1, energy: 0.9 } },
  '螳螂': { elements: ['草', '电'], baseMod: { hp: 0.8, atk: 1.4, def: 0.8, energy: 1 } },
  '史莱姆': { elements: ['水', '草', '火'], baseMod: { hp: 1.2, atk: 0.7, def: 0.8, energy: 1 } },
  '哥布林': { elements: ['岩石', '草'], baseMod: { hp: 0.9, atk: 1.1, def: 0.9, energy: 1.1 } },
  '精灵': { elements: ['超能', '草', '水'], baseMod: { hp: 0.9, atk: 1, def: 0.9, energy: 1.3 } },
  '元素': { elements: ['火', '水', '电'], baseMod: { hp: 1, atk: 1.2, def: 0.9, energy: 1.2 } },
  '幽灵': { elements: ['超能'], baseMod: { hp: 0.8, atk: 1.1, def: 0.7, energy: 1.4 } },
  '恶魔': { elements: ['火', '超能'], baseMod: { hp: 1, atk: 1.3, def: 0.9, energy: 1 } },
  '魅魔': { elements: ['超能', '火'], baseMod: { hp: 0.9, atk: 1.1, def: 0.8, energy: 1.3 } },
  '鱼': { elements: ['水', '电'], baseMod: { hp: 0.9, atk: 1, def: 0.9, energy: 1.1 } },
  '蟹': { elements: ['水', '岩石'], baseMod: { hp: 1.1, atk: 1.1, def: 1.2, energy: 0.8 } },
  '蜘蛛': { elements: ['草', '超能'], baseMod: { hp: 0.8, atk: 1.3, def: 0.8, energy: 1 } },
  '蝎': { elements: ['岩石', '火'], baseMod: { hp: 0.9, atk: 1.3, def: 1, energy: 0.9 } },
  '蝙蝠': { elements: ['超能', '电'], baseMod: { hp: 0.8, atk: 1.1, def: 0.8, energy: 1.2 } },
  '鹰': { elements: ['电', '火'], baseMod: { hp: 0.8, atk: 1.3, def: 0.7, energy: 1.2 } },
  '虎': { elements: ['火', '岩石'], baseMod: { hp: 1.1, atk: 1.3, def: 1, energy: 0.9 } },
  '狮': { elements: ['火', '岩石'], baseMod: { hp: 1.1, atk: 1.2, def: 1, energy: 0.9 } },
  '豹': { elements: ['电', '草'], baseMod: { hp: 1, atk: 1.3, def: 0.9, energy: 1 } },
  '牛': { elements: ['岩石', '火'], baseMod: { hp: 1.3, atk: 1.1, def: 1.2, energy: 0.7 } },
  '马': { elements: ['电', '火'], baseMod: { hp: 1, atk: 1.1, def: 0.9, energy: 1.1 } },
  '羊': { elements: ['草', '超能'], baseMod: { hp: 1, atk: 0.8, def: 0.9, energy: 1.1 } },
  '猪': { elements: ['草', '岩石'], baseMod: { hp: 1.2, atk: 0.9, def: 1, energy: 0.9 } },
  '骷髅': { elements: ['超能', '岩石'], baseMod: { hp: 0.7, atk: 1.2, def: 0.8, energy: 1.1 } },
  '傀儡': { elements: ['岩石', '超能'], baseMod: { hp: 1.4, atk: 0.9, def: 1.4, energy: 0.6 } },
};

// ==================== 宠物名字库 ====================
const PET_NAMES = {
  '火': ['炎', '焰', '烈', '灼', '赤', '红', '焚', '烬', '煌', '炽', '炎龙', '烈焰', '火舞', '赤焰'],
  '水': ['沧', '澜', '涟', '漪', '渊', '深', '清', '澈', '蓝', '波', '沧澜', '水月', '碧波', '深蓝'],
  '草': ['翠', '森', '叶', '芽', '藤', '蔓', '荣', '华', '青', '苍', '翠叶', '森灵', '青藤', '苍翠'],
  '电': ['雷', '电', '闪', '光', '紫', '金', '迅', '疾', '煌', '耀', '雷电', '闪电', '紫电', '疾风'],
  '岩石': ['岩', '石', '山', '岳', '峰', '崖', '坚', '磐', '地', '岩山', '石岳', '磐石', '巨岩'],
  '超能': ['幻', '灵', '梦', '虚', '冥', '幽', '玄', '秘', '影', '念', '幻灵', '梦境', '幽影', '玄冥'],
};

const NAME_SUFFIX = ['丸', '子', '酱', '儿', '灵', '兽', '君', '姬', '王', '皇', '神', '仙', '蛋', '宝', '球', ''];

// ==================== 基础属性 ====================
const BASE_STATS = {
  '普通': { hp: 45, atk: 50, def: 45, energy: 45, spd: 100 },
  '稀有': { hp: 60, atk: 70, def: 60, energy: 65, spd: 110 },
  '超稀有': { hp: 80, atk: 90, def: 80, energy: 85, spd: 120 },
  '传说': { hp: 100, atk: 110, def: 100, energy: 100, spd: 130 },
};

const ELEMENT_ADV = { '火': '草', '水': '火', '草': '水', '电': '水', '岩石': '电', '超能': '岩石' };
const RARITY_WEIGHTS = { '普通': 70, '稀有': 25, '超稀有': 4.9, '传说': 0.1 };
const RARITY_MARK = { '普通': '☆', '稀有': '★', '超稀有': '★★', '传说': '★★★' };
const ELEMENT_MARK = { '火': '[火]', '水': '[水]', '草': '[草]', '电': '[电]', '岩石': '[岩]', '超能': '[灵]' };

const FOODS = {
  '面包': { hp: 5, atk: 0, def: 0, energy: 10, cost: 10 },
  '烤肉': { hp: 15, atk: 2, def: 2, energy: 20, cost: 30 },
  '咖啡': { hp: 0, atk: 0, def: 0, energy: 50, cost: 20 },
  '药水': { hp: 50, atk: 0, def: 0, energy: 0, cost: 40 },
  '牛奶': { hp: 10, atk: 0, def: 2, energy: 15, cost: 15 },
  '鸡蛋': { hp: 8, atk: 1, def: 1, energy: 12, cost: 12 },
  '苹果': { hp: 5, atk: 0, def: 0, energy: 20, cost: 8 },
  '鱼干': { hp: 12, atk: 1, def: 1, energy: 15, cost: 18 },
  '蜂蜜': { hp: 15, atk: 0, def: 0, energy: 30, cost: 25 },
  '蘑菇': { hp: 0, atk: 3, def: 0, energy: 10, cost: 20 },
  '坚果': { hp: 0, atk: 0, def: 5, energy: 5, cost: 15 },
  '牛排': { hp: 25, atk: 3, def: 3, energy: 30, cost: 50 },
  '能量棒': { hp: 0, atk: 0, def: 0, energy: 80, cost: 35 },
  '治疗药': { hp: 80, atk: 0, def: 0, energy: 0, cost: 60 },
};

const SKILLS = {
  '冲撞': { power: 40, acc: 95, cost: 0 },
  '烈焰': { power: 50, acc: 90, cost: 10, element: '火' },
  '激流': { power: 50, acc: 90, cost: 10, element: '水' },
  '荆棘': { power: 50, acc: 90, cost: 10, element: '草' },
  '雷击': { power: 50, acc: 90, cost: 10, element: '电' },
  '落石': { power: 55, acc: 88, cost: 12, element: '岩石' },
  '炎爆': { power: 80, acc: 85, cost: 20, element: '火' },
  '洪流': { power: 85, acc: 80, cost: 25, element: '水' },
  '森葬': { power: 100, acc: 75, cost: 30, element: '草' },
  '雷暴': { power: 90, acc: 85, cost: 25, element: '电' },
  '地裂': { power: 95, acc: 80, cost: 28, element: '岩石' },
  '念力': { power: 70, acc: 90, cost: 15, element: '超能' },
};

const DB = {
  get(userId) {
    const defaultData = { pets: [], storage: [], money: 100, food: { '面包': 5 } };
    try {
      const d = ext.storageGet('u_' + userId);
      if (!d) return defaultData;

      const data = JSON.parse(d);

      // 兼容旧数据：检查是否原本没有storage字段
      const hadStorage = 'storage' in data;
      data.pets = data.pets || [];
      data.storage = data.storage || [];
      data.money = data.money || 100;
      data.food = data.food || { '面包': 5 };

      // 如果是旧数据格式且pets超过上限，移入仓库
      if (!hadStorage && data.pets.length > CONFIG.maxPets) {
        data.storage = data.pets.splice(CONFIG.maxPets);
      }

      return data;
    } catch (e) {
      console.log('[万物有灵] 数据解析失败:', e);
      return defaultData;
    }
  },
  save(userId, data) { ext.storageSet('u_' + userId, JSON.stringify(data)); },
  genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
};

const PetFactory = {
  randomRarity() {
    const rand = Math.random() * 100;
    let threshold = 0;
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
      threshold += weight;
      if (rand < threshold) return rarity;
    }
    return '普通';
  },

  generateName(element) {
    const prefixes = PET_NAMES[element] || PET_NAMES['火'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = NAME_SUFFIX[Math.floor(Math.random() * NAME_SUFFIX.length)];
    return prefix + (Math.random() > 0.5 ? suffix : '');
  },

  create(customName = null) {
    const rarity = this.randomRarity();
    const speciesKeys = Object.keys(SPECIES);
    const species = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
    const speciesData = SPECIES[species];
    const element = speciesData.elements[Math.floor(Math.random() * speciesData.elements.length)];
    const base = BASE_STATS[rarity];
    const v = 0.9 + Math.random() * 0.2;

    const maxHp = Math.floor(base.hp * speciesData.baseMod.hp * v);
    const maxEnergy = Math.floor(base.energy * speciesData.baseMod.energy * v);
    const spd = Math.floor(base.spd * v);

    return {
      id: DB.genId(),
      name: customName || this.generateName(element),
      species,
      element,
      rarity,
      level: 1,
      exp: 0,
      maxHp, hp: maxHp,
      atk: Math.floor(base.atk * speciesData.baseMod.atk * v),
      def: Math.floor(base.def * speciesData.baseMod.def * v),
      spd,
      maxEnergy, energy: maxEnergy,
      sp: 0,
      skills: ['冲撞'],
      evolved: false,
      retired: false,
      battles: 0,
      maxBattles: null,
      canBreed: true,
    };
  },

  power(pet) {
    return Math.floor((pet.atk * 1.5 + pet.def + pet.maxHp * 0.5 + pet.maxEnergy * 0.3) * (1 + pet.level * 0.1));
  },

  bar(current, max, len = 10) {
    const filled = Math.floor((current / max) * len);
    return '█'.repeat(filled) + '░'.repeat(len - filled);
  },

  info(pet, idx = null) {
    const e = ELEMENT_MARK[pet.element] || '';
    const r = RARITY_MARK[pet.rarity] || '';
    const header = idx !== null ? `【${idx + 1}. ${pet.name}】` : `【${pet.name}】`;
    const status = pet.retired ? '已退休' : (pet.evolved ? '已进化' : '正常');
    let text = `${header} ${r}${e}\n种族: ${pet.species} | 等级: Lv.${pet.level} (${pet.exp}/${pet.level * 100})\n状态: ${status} | 战力: ${this.power(pet)}\n生命: ${this.bar(pet.hp, pet.maxHp)} ${pet.hp}/${pet.maxHp}\n精力: ${this.bar(pet.energy, pet.maxEnergy)} ${pet.energy}/${pet.maxEnergy}\n攻击: ${pet.atk} | 防御: ${pet.def} | 速度: ${pet.spd || 100} | 技能点: ${pet.sp}\n技能: ${pet.skills.join('、')}`;
    if (pet.evolved) text += `\n剩余对战: ${pet.maxBattles - pet.battles}次`;
    return text;
  },

  // 获取可学习的技能列表
  getLearnableSkills(pet) {
    return Object.entries(SKILLS)
      .filter(([name, sk]) => sk.element === pet.element && !pet.skills.includes(name))
      .map(([name]) => name);
  },

  // 学习技能（不检查sp，由调用方负责）
  learnSkill(pet, skillName) {
    if (pet.skills.includes(skillName)) return { success: false, error: '已学会该技能' };
    const sk = SKILLS[skillName];
    if (!sk || sk.element !== pet.element) return { success: false, error: '无法学习该技能' };
    pet.skills.push(skillName);
    return { success: true, skill: skillName };
  },

  // 随机学习一个技能（消耗sp）
  learnRandomSkill(pet) {
    if (pet.skills.length >= CONFIG.maxSkills) return { success: false, error: '技能已满' };
    if (pet.sp < 1) return { success: false, error: '技能点不足' };
    const candidates = this.getLearnableSkills(pet);
    if (candidates.length === 0) return { success: false, error: '没有可学习的技能' };
    const skill = candidates[Math.floor(Math.random() * candidates.length)];
    pet.skills.push(skill);
    pet.sp--;
    return { success: true, skill };
  },
};

// ==================== 玩家肉身属性 ====================
const PLAYER_BASE = { hp: 50, atk: 25, def: 20, energy: 100, spd: 100 };

const Battle = {
  calcDmg(atk, def, skill, atkLv, atkEle, defEle) {
    const sk = SKILLS[skill] || SKILLS['冲撞'];
    let dmg = (atk + sk.power) * (1 + atkLv * 0.05) * (100 / (100 + def));
    if (atkEle && defEle && ELEMENT_ADV[atkEle] === defEle) dmg *= 1.5;
    return Math.floor(dmg);
  },

  attack(a, d, logs, isPlayer = false) {
    try {
      const usable = (a.skills || ['冲撞']).filter(s => (SKILLS[s]?.cost || 0) <= (a.energy || 0));
      const skill = usable.length > 0 && Math.random() > 0.3 ? usable[Math.floor(Math.random() * usable.length)] : '冲撞';
      const sk = SKILLS[skill] || SKILLS['冲撞'];
      if (Math.random() * 100 > (sk.acc || 95)) {
        logs.push(`${a.name} 使用 ${skill}，但打偏了！`);
        return;
      }
      const dmg = this.calcDmg(a.atk || 10, d.def || 10, skill, a.level || 1, a.element, d.element);
      d.hp = Math.max(0, (d.hp || 0) - dmg);
      a.energy = Math.max(0, (a.energy || 0) - (sk.cost || 0));
      const adv = a.element && d.element && ELEMENT_ADV[a.element] === d.element ? '（克制！）' : '';
      logs.push(`${a.name} 使用 ${skill}，造成 ${dmg} 伤害${adv}`);
    } catch (e) {
      logs.push(`${a.name} 攻击时发生错误`);
      console.log('[万物有灵] attack错误:', e);
    }
  },

  run(p1, p2) {
    const logs = [];
    let turn = 1;

    // 行动条机制：按速度排序
    const getActionOrder = (a, b) => {
      const spdA = a.spd || 100;
      const spdB = b.spd || 100;
      if (spdA > spdB) return [a, b];
      if (spdB > spdA) return [b, a];
      // 速度相同，随机决定
      return Math.random() < 0.5 ? [a, b] : [b, a];
    };

    while ((p1.hp || 0) > 0 && (p2.hp || 0) > 0 && turn <= 15) {
      const order = getActionOrder(p1, p2);
      logs.push(`\n--- 第${turn}回合 [行动条: ${order[0].name}(${order[0].spd||100}) > ${order[1].name}(${order[1].spd||100})] ---`);

      // 按行动条顺序攻击
      this.attack(order[0], order[1], logs, order[0].isPlayer);
      if ((order[1].hp || 0) <= 0) break;
      this.attack(order[1], order[0], logs, order[1].isPlayer);

      turn++;
    }

    const p1Alive = (p1.hp || 0) > 0;
    const p2Alive = (p2.hp || 0) > 0;
    return {
      winner: p1Alive ? p1 : (p2Alive ? p2 : null),
      loser: p1Alive ? p2 : (p2Alive ? p1 : null),
      draw: !p1Alive && !p2Alive,
      logs,
    };
  },
};

// ==================== 命令处理 ====================
const cmd = seal.ext.newCmdItemInfo();
cmd.name = '宠物';
cmd.help = `【万物有灵】
.宠物 捉宠 [编号] - 捕捉野外宠物(肉身或指定宠物出战)
.宠物 列表 - 查看队伍
.宠物 仓库 - 查看仓库
.宠物 存入 <编号> - 存入仓库
.宠物 取出 <编号> - 取出到队伍
.宠物 信息 <编号> - 宠物详情
.宠物 背包 - 查看背包
.宠物 喂食 <编号> <食物> - 喂食
.宠物 休息 <编号> - 恢复精力
.宠物 改名 <编号> <名字> - 改名
.宠物 学习 <编号> - 学习技能
.宠物 对战 <编号> [编号/@人] - 对战(可PVP)
.宠物 育种 <编号> <编号> - 育种
.宠物 进化 <编号> - 进化
.宠物 出售 <编号> - 卖给机构
.宠物 商店 - 查看商店
.宠物 购买 <物品> [数量] - 购买
.宠物 mod - 查看已安装的Mod`;

cmd.solve = (ctx, msg, argv) => {
  const uid = msg.sender.userId;
  const data = DB.get(uid);

  const rawArgs = argv.rawArgs || '';
  const args = rawArgs.trim().split(/\s+/);
  const action = args[0] || '';
  const p1 = args[1] || '';
  const p2 = args.slice(2).join(' ') || '';

  // 从 argv.atInfo 获取@用户（SealDice已解析好）
  const atInfo = argv.atInfo || argv.at || [];
  const atUserId = atInfo.length > 0 ? atInfo[0].userId : null;

  console.log('[万物有灵] 命令解析:', JSON.stringify({ action, p1, p2 }), 'atUserId:', atUserId, 'atInfo:', JSON.stringify(atInfo));

  const reply = (text) => seal.replyToSender(ctx, msg, text);
  const save = () => DB.save(uid, data);
  const getPet = (idx) => data.pets[parseInt(idx) - 1];

  if (action === 'help') {
    let help = cmd.help;
    const extHelp = WanwuYouling.getExtHelp();
    if (extHelp) help += '\n' + extHelp;
    reply(help);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (action === '捉宠' || action === '斗殴') {
    // 检查总容量
    if (data.pets.length >= CONFIG.maxPets && data.storage.length >= CONFIG.maxStorage) {
      return reply(`宠物和仓库都已满，无法捉宠`);
    }

    const wildPet = PetFactory.create();
    let fighter;
    let fighterInfo;
    let isPlayerFight = true;

    // 判断出战方式
    if (p1 && p1 !== '肉身') {
      // 指定宠物出战
      const pet = getPet(p1);
      if (!pet) return reply('请指定正确的宠物编号');
      if (pet.hp <= 0) return reply('宠物生命值不足，请先喂食恢复');
      if (pet.energy < 20) return reply('宠物精力不足，请先休息');
      
      fighter = JSON.parse(JSON.stringify(pet));
      fighterInfo = `【${pet.name}出战】`;
      isPlayerFight = false;
    } else if (data.pets.length > 0 && (!p1 || p1 === '肉身')) {
      // 有宠物但选择肉身，提示可选
      fighterInfo = `【肉身出战】(你有${data.pets.length}只宠物，可指定编号让宠物出战)`;
      fighter = {
        name: '你',
        hp: PLAYER_BASE.hp,
        atk: PLAYER_BASE.atk,
        def: PLAYER_BASE.def,
        spd: PLAYER_BASE.spd,
        energy: PLAYER_BASE.energy,
        skills: ['冲撞'],
        element: null,
        level: 1,
        isPlayer: true,
      };
    } else {
      // 没有宠物，肉身出战
      fighterInfo = `【肉身出战】`;
      fighter = {
        name: '你',
        hp: PLAYER_BASE.hp,
        atk: PLAYER_BASE.atk,
        def: PLAYER_BASE.def,
        spd: PLAYER_BASE.spd,
        energy: PLAYER_BASE.energy,
        skills: ['冲撞'],
        element: null,
        level: 1,
        isPlayer: true,
      };
    }

    try {
      const result = Battle.run(fighter, wildPet);
      const logs = [fighterInfo, '', `遭遇 ${RARITY_MARK[wildPet.rarity]}${ELEMENT_MARK[wildPet.element]} ${wildPet.name}(${wildPet.species}) Lv.${wildPet.level}`];
      logs.push(...result.logs.slice(0, CONFIG.fightLogLimit - 3));
      if (result.logs.length > CONFIG.fightLogLimit - 3) logs.push('...\n（战斗太激烈，省略部分回合）');

      if (result.draw) {
        logs.push(`\n[平局] ${fighter.name}和 ${wildPet.name} 同归于尽，它逃跑了...`);
        if (!isPlayerFight) {
          const pet = getPet(p1);
          pet.hp = Math.max(0, fighter.hp);  // 同步战斗后的血量
          pet.energy = Math.max(0, pet.energy - 20);
          save();
        }
      } else if (result.winner === fighter) {
        logs.push(`\n[胜利] ${fighter.name}战胜了 ${wildPet.name}！`);
        logs.push(`[捕捉] 成功捕捉 ${RARITY_MARK[wildPet.rarity]}${ELEMENT_MARK[wildPet.element]} ${wildPet.name}！`);
        wildPet.hp = wildPet.maxHp;
        wildPet.energy = wildPet.maxEnergy;

        if (data.pets.length < CONFIG.maxPets) {
          data.pets.push(wildPet);
          logs.push(`已加入队伍 (${data.pets.length}/${CONFIG.maxPets})`);
        } else if (data.storage.length < CONFIG.maxStorage) {
          data.storage.push(wildPet);
          logs.push(`队伍已满，已存入仓库 (${data.storage.length}/${CONFIG.maxStorage})`);
        }

        // 宠物出战消耗：同步战斗后的血量
        if (!isPlayerFight) {
          const pet = getPet(p1);
          pet.hp = Math.max(0, fighter.hp);  // 同步战斗后的血量
          pet.energy = Math.max(0, pet.energy - 20);
        }

        save();
        WanwuYouling.emit('capture', { uid, pet: wildPet });
      } else {
        logs.push(`\n[失败] ${fighter.name}被 ${wildPet.name} 打败了，它逃跑了...`);
        if (!isPlayerFight) {
          const pet = getPet(p1);
          pet.hp = Math.max(0, fighter.hp);  // 同步战斗后的血量
          pet.energy = Math.max(0, pet.energy - 20);
          save();
        }
      }

      reply(logs.join('\n'));
    } catch (e) {
      console.log('[万物有灵] 捉宠错误:', e);
      reply('捉宠过程发生错误，请稍后重试');
    }
    return seal.ext.newCmdExecuteResult(true);
  }

  if (action === '列表' || action === '') {
    if (!data.pets.length) return reply('你还没有宠物，发送 .宠物 斗殴 去捕捉一只');
    const lines = [`【队伍】(${data.pets.length}/${CONFIG.maxPets})`, `金币: ${data.money}`];
    data.pets.forEach((pet, i) => {
      const e = ELEMENT_MARK[pet.element] || '';
      const r = RARITY_MARK[pet.rarity] || '';
      lines.push(`${i + 1}. ${r}${e} ${pet.name} (${pet.species}) Lv.${pet.level} 战力:${PetFactory.power(pet)}`);
    });
    if (data.storage.length) lines.push(`\n仓库: ${data.storage.length}/${CONFIG.maxStorage} (.宠物 仓库 查看)`);
    return reply(lines.join('\n'));
  }

  if (action === '仓库') {
    if (!data.storage.length) return reply(`【仓库】(${data.storage.length}/${CONFIG.maxStorage})\n仓库空空如也`);
    const lines = [`【仓库】(${data.storage.length}/${CONFIG.maxStorage})`, ''];
    data.storage.forEach((pet, i) => {
      const e = ELEMENT_MARK[pet.element] || '';
      const r = RARITY_MARK[pet.rarity] || '';
      const hp = pet.hp > 0 ? `HP:${pet.hp}/${pet.maxHp}` : '已阵亡';
      lines.push(`${i + 1}. ${r}${e} ${pet.name} (${pet.species}) Lv.${pet.level} ${hp}`);
    });
    lines.push('\n.宠物 取出 <编号> - 取出到队伍');
    lines.push('.宠物 存入 <编号> - 存入仓库');
    return reply(lines.join('\n'));
  }

  if (action === '存入') {
    const idx = parseInt(p1) - 1;
    const pet = data.pets[idx];
    if (!pet) return reply('请指定正确的宠物编号');
    if (data.pets.length <= 1) return reply('队伍至少要保留1只宠物');
    if (data.storage.length >= CONFIG.maxStorage) return reply(`仓库已满(${CONFIG.maxStorage}只)`);
    data.pets.splice(idx, 1);
    data.storage.push(pet);
    save();
    WanwuYouling.emit('store', { uid, pet, to: 'storage' });
    return reply(`${pet.name} 已存入仓库 (${data.storage.length}/${CONFIG.maxStorage})`);
  }

  if (action === '取出') {
    const idx = parseInt(p1) - 1;
    const pet = data.storage[idx];
    if (!pet) return reply('请指定正确的仓库编号');
    if (data.pets.length >= CONFIG.maxPets) return reply(`队伍已满(${CONFIG.maxPets}只)，请先存入一只`);
    data.storage.splice(idx, 1);
    data.pets.push(pet);
    save();
    WanwuYouling.emit('store', { uid, pet, to: 'team' });
    return reply(`${pet.name} 已加入队伍 (${data.pets.length}/${CONFIG.maxPets})`);
  }

  if (action === '信息') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    return reply(PetFactory.info(pet, parseInt(p1) - 1));
  }

  if (action === '背包') {
    const lines = [`【我的背包】`, `金币: ${data.money}`];
    const foodItems = Object.entries(data.food).filter(([_, count]) => count > 0);
    if (foodItems.length === 0) {
      lines.push('背包空空如也');
    } else {
      lines.push('食物:');
      for (const [name, count] of foodItems) {
        const f = FOODS[name];
        const effects = [];
        if (f.hp) effects.push(`生命+${f.hp}`);
        if (f.atk) effects.push(`攻击+${f.atk}`);
        if (f.def) effects.push(`防御+${f.def}`);
        if (f.energy) effects.push(`精力+${f.energy}`);
        lines.push(`  ${name} x${count} (${effects.join(', ')})`);
      }
    }
    return reply(lines.join('\n'));
  }

  if (action === '喂食') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    const foodName = p2;
    if (!FOODS[foodName]) return reply(`未知食物，可用: ${Object.keys(FOODS).join('、')}`);
    const food = data.food[foodName] || 0;
    if (food <= 0) return reply(`你没有 ${foodName}，发送 .宠物 背包 查看拥有的食物`);
    data.food[foodName]--;
    const f = FOODS[foodName];
    pet.hp = Math.min(pet.maxHp, pet.hp + f.hp);
    pet.atk += f.atk;
    pet.def += f.def;
    pet.energy = Math.min(pet.maxEnergy, pet.energy + f.energy);
    save();
    WanwuYouling.emit('feed', { uid, pet, food: foodName, foodData: f });
    return reply(`喂食成功！${pet.name} 的属性提升了\n${PetFactory.info(pet, parseInt(p1) - 1)}`);
  }

  if (action === '休息') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    const recover = Math.floor(pet.maxEnergy * 0.5);
    pet.energy = Math.min(pet.maxEnergy, pet.energy + recover);
    save();
    WanwuYouling.emit('rest', { uid, pet, recover });
    return reply(`${pet.name} 休息了一会，恢复了 ${recover} 点精力`);
  }

  if (action === '改名') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    if (!p2) return reply('请指定新名字');
    if (p2.length > 10) return reply('名字最长10个字符');
    if (p2.length < 1) return reply('名字不能为空');
    if (/[^\u4e00-\u9fa5a-zA-Z0-9]/.test(p2)) return reply('名字只能包含中英文和数字');
    const oldName = pet.name;
    pet.name = p2;
    save();
    WanwuYouling.emit('rename', { uid, pet, oldName, newName: p2 });
    return reply(`已将宠物改名为 ${p2}`);
  }

  if (action === '学习') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    const result = PetFactory.learnRandomSkill(pet);
    if (!result.success) return reply(result.error);
    save();
    WanwuYouling.emit('learn', { uid, pet, skill: result.skill });
    return reply(`${pet.name} 学会了 ${result.skill}！`);
  }

  if (action === '对战') {
    const pet1 = getPet(p1);
    if (!pet1) return reply('请指定正确的宠物编号');
    if (pet1.hp <= 0) return reply('宠物生命值不足，请先喂食恢复');
    if (pet1.energy < 20) return reply('宠物精力不足，请先休息或喂食');

    let pet2;
    let isNPC = true;
    let targetUid = null;

    console.log('[万物有灵] PVP atUserId:', atUserId, 'p1:', p1, 'p2:', p2);

    if (atUserId) {
      // atUserId 格式为 "QQ:3059226574"，直接使用
      targetUid = atUserId;
      if (targetUid === uid) {
        return reply('不能和自己对战');
      }
      const targetData = DB.get(targetUid);
      if (!targetData.pets.length) return reply('对方没有宠物');
      pet2 = JSON.parse(JSON.stringify(targetData.pets[0]));
      isNPC = false;
    } else if (p2) {
      pet2 = getPet(p2);
      if (!pet2) return reply('请指定正确的对手编号');
      pet2 = JSON.parse(JSON.stringify(pet2));
    } else {
      pet2 = PetFactory.create();
    }

    try {
      const p1Copy = JSON.parse(JSON.stringify(pet1));
      const result = Battle.run(p1Copy, pet2);
      const logs = result.logs.slice(0, CONFIG.battleLogPvPLimit);
      if (result.logs.length > CONFIG.battleLogPvPLimit) logs.push('...\n（战斗太激烈，省略部分回合）');

      // 同步战斗后的状态（血量和能量都从战斗副本同步）
      pet1.hp = Math.max(0, p1Copy.hp);
      pet1.energy = Math.max(0, p1Copy.energy - CONFIG.battleEnergyCost);

      if (result.draw) {
        logs.push('\n[平局] 双方同归于尽！');
      } else {
        logs.push(`\n[胜利] ${result.winner.name} 获胜！`);
        if (result.winner === p1Copy) {
          const exp = CONFIG.baseExpGain + Math.floor(Math.random() * 10);
          pet1.exp += exp;
          pet1.sp++;
          pet1.battles++;
          logs.push(`${pet1.name} 获得 ${exp} 经验和 1 技能点`);

          const expNeed = pet1.level * 100;
          if (pet1.exp >= expNeed) {
            const oldLevel = pet1.level;
            pet1.exp -= expNeed;
            pet1.level++;
            pet1.maxHp += 5;
            pet1.hp = Math.min(pet1.hp + 5, pet1.maxHp);
            pet1.atk += 2;
            pet1.def += 2;
            logs.push(`[升级] ${pet1.name} 升级到 Lv.${pet1.level}！`);
            WanwuYouling.emit('levelup', { uid, pet: pet1, oldLevel, newLevel: pet1.level });
          }
        } else {
          pet1.battles++;
          logs.push(`${pet1.name} 战败`);
        }
      }

      if (pet1.evolved && pet1.battles >= pet1.maxBattles) {
        pet1.retired = true;
        logs.push(`${pet1.name} 已完成对战次数，退休了`);
        WanwuYouling.emit('retire', { uid, pet: pet1 });
      }

      // PVP时同步对手宠物状态
      if (!isNPC && targetUid) {
        const targetData = DB.get(targetUid);
        if (targetData.pets[0]) {
          targetData.pets[0].hp = Math.max(0, pet2.hp);
          targetData.pets[0].energy = Math.max(0, targetData.pets[0].energy - CONFIG.battleEnergyCost);
          DB.save(targetUid, targetData);
        }
      }

      save();
      // 触发对战事件
      WanwuYouling.emit('battle', { uid, winner: result.winner === p1Copy, draw: result.draw, isNPC, targetUid, pet1, pet2 });
      reply(logs.join('\n'));
    } catch (e) {
      console.log('[万物有灵] 对战错误:', e);
      reply('对战过程发生错误，请稍后重试');
    }
    return seal.ext.newCmdExecuteResult(true);
  }

  if (action === '育种') {
    const idx1 = parseInt(p1);
    const idx2 = parseInt(p2);
    if (isNaN(idx1) || isNaN(idx2)) return reply('请指定两只正确的宠物编号');
    const pet1 = getPet(p1);
    const pet2 = getPet(p2);
    if (!pet1 || !pet2) return reply('请指定两只正确的宠物编号');
    if (pet1.id === pet2.id) return reply('不能和自己育种');
    if (!pet1.canBreed || !pet2.canBreed) return reply('该宠物无法育种（进化后失去生育能力）');
    if (data.pets.length >= CONFIG.maxPets) return reply(`宠物已达上限（${CONFIG.maxPets}只）`);

    const child = PetFactory.create();
    if (Math.random() < 0.5) child.species = pet1.species;
    else child.species = pet2.species;

    if (Math.random() < 0.1) {
      const speciesKeys = Object.keys(SPECIES);
      child.species = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
    }

    const parentElements = [pet1.element, pet2.element];
    child.element = parentElements[Math.floor(Math.random() * 2)];
    child.name = PetFactory.generateName(child.element);

    data.pets.push(child);
    pet1.canBreed = false;
    pet2.canBreed = false;
    save();
    WanwuYouling.emit('breed', { uid, parents: [pet1, pet2], child });
    return reply(`[育种] 育种成功！获得了 ${RARITY_MARK[child.rarity]}${ELEMENT_MARK[child.element]} ${child.name}(${child.species})\n${PetFactory.info(child)}`);
  }

  if (action === '进化') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    if (pet.evolved) return reply('该宠物已经进化过了');
    if (pet.level < CONFIG.evolveLevel) return reply(`等级不足，需要 Lv.${CONFIG.evolveLevel}`);

    const oldRarity = pet.rarity;
    const rarityOrder = ['普通', '稀有', '超稀有', '传说'];
    const rarityIdx = rarityOrder.indexOf(pet.rarity);
    if (rarityIdx < rarityOrder.length - 1 && Math.random() < 0.5) {
      pet.rarity = rarityOrder[rarityIdx + 1];
    }

    const boost = 1.3;
    pet.maxHp = Math.floor(pet.maxHp * boost);
    pet.hp = pet.maxHp;
    pet.atk = Math.floor(pet.atk * boost);
    pet.def = Math.floor(pet.def * boost);
    pet.maxEnergy = Math.floor(pet.maxEnergy * boost);
    pet.energy = pet.maxEnergy;
    pet.evolved = true;
    pet.canBreed = false;
    pet.maxBattles = CONFIG.evolveBattles[0] + Math.floor(Math.random() * (CONFIG.evolveBattles[1] - CONFIG.evolveBattles[0]));
    pet.battles = 0;
    save();
    WanwuYouling.emit('evolve', { uid, pet, oldRarity, newRarity: pet.rarity });
    return reply(`[进化] ${pet.name} 进化了！\n${PetFactory.info(pet, parseInt(p1) - 1)}`);
  }

  if (action === '出售') {
    const idx = parseInt(p1) - 1;
    const pet = data.pets[idx];
    if (!pet) return reply('请指定正确的宠物编号');

    const price = pet.retired ? 50 : (100 + PetFactory.power(pet) * 2);
    data.money += price;
    data.pets.splice(idx, 1);
    save();
    WanwuYouling.emit('sell', { uid, pet, price });
    return reply(`已将 ${pet.name} 卖给宠物保护协会，获得 ${price} 金币`);
  }

  if (action === '商店') {
    const lines = ['【宠物商店】', `你的金币: ${data.money}`, '', '【食物】'];
    for (const [name, f] of Object.entries(FOODS)) {
      const effects = [];
      if (f.hp) effects.push(`生命+${f.hp}`);
      if (f.atk) effects.push(`攻击+${f.atk}`);
      if (f.def) effects.push(`防御+${f.def}`);
      if (f.energy) effects.push(`精力+${f.energy}`);
      lines.push(`${name}: ${f.cost}金币 (${effects.join(', ')})`);
    }
    lines.push('', '使用 .宠物 购买 <物品> [数量] 购买');
    return reply(lines.join('\n'));
  }

  if (action === '购买') {
    const item = p1;
    const count = parseInt(p2) || 1;
    if (!FOODS[item]) return reply('未知物品');
    const cost = FOODS[item].cost * count;
    if (data.money < cost) return reply(`金币不足，需要 ${cost} 金币`);
    data.money -= cost;
    data.food[item] = (data.food[item] || 0) + count;
    save();
    WanwuYouling.emit('buy', { uid, item, count, cost });
    return reply(`购买成功！获得 ${item} x${count}，花费 ${cost} 金币`);
  }

  // ==================== 扩展命令 ====================
  if (WanwuYouling._extCommands[action]) {
    const result = WanwuYouling._extCommands[action].handler(ctx, msg, { uid, data, args, p1, p2, reply, save, getPet, DB, PetFactory, Battle, CONFIG, FOODS, SPECIES });
    if (result) return result;
  }

  // ==================== Mod管理 ====================
  if (action === 'mod') {
    const mods = WanwuYouling.getMods();
    if (!mods.length) return reply('【Mod管理】\n没有已安装的Mod');
    const lines = ['【Mod管理】', ''];
    for (const mod of mods) {
      const status = mod.enabled ? '[√]' : '[×]';
      lines.push(`${status} ${mod.name} v${mod.version} (${mod.author})`);
      if (mod.description) lines.push(`  ${mod.description}`);
    }
    return reply(lines.join('\n'));
  }

  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['宠物'] = cmd;
ext.cmdMap['万物有灵'] = cmd;

// ==================== 外部接口 ====================
const WanwuYouling = {
  version: '1.2.8',
  ext,

  DB: {
    get: (userId) => DB.get(userId),
    save: (userId, data) => DB.save(userId, data),
  },

  Species: SPECIES,
  Elements: Object.keys(ELEMENT_MARK),
  Rarities: Object.keys(RARITY_WEIGHTS),

  PetFactory: {
    create: (customName) => PetFactory.create(customName),
    generateName: (element) => PetFactory.generateName(element),
    power: (pet) => PetFactory.power(pet),
    info: (pet, idx) => PetFactory.info(pet, idx),
    getLearnableSkills: (pet) => PetFactory.getLearnableSkills(pet),
    learnSkill: (pet, skillName) => PetFactory.learnSkill(pet, skillName),
    learnRandomSkill: (pet) => PetFactory.learnRandomSkill(pet),
  },

  Battle: {
    run: (attacker, defender) => Battle.run(attacker, defender),
    calcDmg: (atk, def, skill, atkLv, atkEle, defEle) => Battle.calcDmg(atk, def, skill, atkLv, atkEle, defEle),
  },

  Utils: {
    addPet: (userId, pet) => {
      const data = DB.get(userId);
      if (data.pets.length >= CONFIG.maxPets) return { success: false, error: '宠物已达上限' };
      data.pets.push(pet);
      DB.save(userId, data);
      return { success: true, pet };
    },
    removePet: (userId, petId) => {
      const data = DB.get(userId);
      const idx = data.pets.findIndex(p => p.id === petId);
      if (idx === -1) return { success: false, error: '宠物不存在' };
      const pet = data.pets.splice(idx, 1)[0];
      DB.save(userId, data);
      return { success: true, pet };
    },
    getPet: (userId, petId) => {
      const data = DB.get(userId);
      return data.pets.find(p => p.id === petId) || null;
    },
    addMoney: (userId, amount) => {
      const data = DB.get(userId);
      data.money += amount;
      DB.save(userId, data);
      return data.money;
    },
    addFood: (userId, foodName, count) => {
      const data = DB.get(userId);
      data.food[foodName] = (data.food[foodName] || 0) + count;
      DB.save(userId, data);
      return data.food[foodName];
    },
    addSkill: (pet, skillName) => {
      if (!SKILLS[skillName]) return { success: false, error: '技能不存在' };
      if (pet.skills.includes(skillName)) return { success: false, error: '已学会该技能' };
      pet.skills.push(skillName);
      return { success: true, skill: skillName };
    },
  },

  Config: CONFIG,
  Skills: SKILLS,
  Foods: FOODS,

  // ==================== Mod系统 ====================
  _mods: {},           // 已注册的mod
  _extCommands: {},    // 扩展命令
  _hooks: {},          // 事件钩子
  _overrides: {},      // 函数覆写

  // 注册Mod
  registerMod(meta) {
    if (!meta.id) return false;
    if (this._mods[meta.id]) {
      console.log(`[万物有灵] Mod ${meta.id} 已存在，将被替换`);
    }
    this._mods[meta.id] = {
      id: meta.id,
      name: meta.name || meta.id,
      version: meta.version || '1.0.0',
      author: meta.author || '未知',
      description: meta.description || '',
      dependencies: meta.dependencies || [],
      enabled: false,
      api: {},
    };
    return true;
  },

  // 启用Mod
  enableMod(modId, api = {}) {
    const mod = this._mods[modId];
    if (!mod) return { success: false, error: 'Mod不存在' };
    
    // 检查依赖
    for (const dep of mod.dependencies) {
      const depMod = this._mods[dep];
      if (!depMod || !depMod.enabled) {
        return { success: false, error: `缺少依赖: ${dep}` };
      }
    }
    
    mod.enabled = true;
    mod.api = api;
    
    // 调用onEnable
    if (api.onEnable) {
      try { api.onEnable(); } catch (e) { console.log(`[万物有灵] Mod ${modId} onEnable错误:`, e); }
    }

    return { success: true };
  },

  // 禁用Mod
  disableMod(modId) {
    const mod = this._mods[modId];
    if (!mod) return false;

    // 调用onDisable
    if (mod.api.onDisable) {
      try { mod.api.onDisable(); } catch (e) { console.log(`[万物有灵] Mod ${modId} onDisable错误:`, e); }
    }
    
    // 清理命令
    for (const [name, cmd] of Object.entries(this._extCommands)) {
      if (cmd.modId === modId) delete this._extCommands[name];
    }
    
    // 清理钩子
    for (const event of Object.keys(this._hooks)) {
      this._hooks[event] = this._hooks[event].filter(h => h.modId !== modId);
    }
    
    mod.enabled = false;
    mod.api = {};
    return true;
  },

  // 获取Mod
  getMod(modId) {
    return this._mods[modId];
  },

  // 获取所有Mod
  getMods() {
    return Object.values(this._mods);
  },

  // 注册命令
  registerCommand(name, handler, helpText, modId) {
    this._extCommands[name] = { handler, helpText, modId };
  },

  // 注销命令
  unregisterCommand(name) {
    delete this._extCommands[name];
  },

  // 获取帮助
  getExtHelp() {
    const lines = [];
    for (const [name, cmd] of Object.entries(this._extCommands)) {
      if (cmd.helpText) lines.push(`.宠物 ${name} - ${cmd.helpText}`);
    }
    return lines.join('\n');
  },

  // 订阅事件
  on(event, handler, modId) {
    if (!this._hooks[event]) this._hooks[event] = [];
    handler.modId = modId;
    this._hooks[event].push(handler);
  },

  // 取消订阅
  off(event, handler) {
    if (!this._hooks[event]) return;
    this._hooks[event] = this._hooks[event].filter(h => h !== handler);
  },

  // 触发事件
  emit(event, data) {
    if (!this._hooks[event]) return data;
    let result = data;
    for (const h of this._hooks[event]) {
      try {
        const r = h(result);
        if (r !== undefined) result = r;
      } catch (e) {
        console.log(`[万物有灵] 事件${event}处理错误:`, e);
      }
    }
    return result;
  },

  // 覆写函数
  override(name, fn, modId) {
    this._overrides[name] = { fn, modId };
  },

  // 获取覆写
  getOverride(name) {
    return this._overrides[name]?.fn;
  },

  // 调用其他Mod API
  call(modId, method, ...args) {
    const mod = this._mods[modId];
    if (!mod || !mod.enabled || !mod.api[method]) return undefined;
    return mod.api[method](...args);
  },
};

if (typeof global !== 'undefined') {
  global.WanwuYouling = WanwuYouling;
}
if (typeof globalThis !== 'undefined') {
  globalThis.WanwuYouling = WanwuYouling;
}
