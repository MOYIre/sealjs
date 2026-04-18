// ==UserScript==
// @name        万物有灵-扩展
// @author      铭茗
// @version     1.0.0
// @description 宠物扩展功能：掉落、探险、打工、图鉴、竞技场
// @timestamp   1744924800
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵-扩展.js
// ==/UserScript==

let ext = seal.ext.find('万物有灵-扩展');
if (!ext) {
  ext = seal.ext.new('万物有灵-扩展', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

const CONFIG = {
  exploreTime: 30,
  workTime: 60,
  maxExplore: 2,
  maxWork: 1,
};

const DB = {
  get(userId) {
    try {
      const d = ext.storageGet('e_' + userId);
      return d ? JSON.parse(d) : { pokedex: {}, explore: [], work: [], arenaWins: 0, arenaRank: 1000 };
    } catch { return { pokedex: {}, explore: [], work: [], arenaWins: 0, arenaRank: 1000 }; }
  },
  save(userId, data) { ext.storageSet('e_' + userId, JSON.stringify(data)); },
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

function getMain() {
  if (typeof WanwuYouling !== 'undefined') return WanwuYouling;
  if (typeof globalThis !== 'undefined' && globalThis.WanwuYouling) return globalThis.WanwuYouling;
  return null;
}
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function formatTime(m) { return m < 60 ? `${m}分钟` : `${Math.floor(m/60)}小时${m%60||''}分钟`; }

// 记录图鉴
function recordPokedex(uid, species) {
  const data = DB.get(uid);
  if (!data.pokedex[species]) {
    data.pokedex[species] = { count: 0, firstTime: Date.now() };
  }
  data.pokedex[species].count++;
  DB.save(uid, data);
}

// 处理对战掉落
function handleDrop(uid) {
  const main = getMain();
  if (!main) return null;
  const mainData = main.DB.get(uid);
  const gold = rand(10, 50);
  mainData.money += gold;
  const drops = [`获得 ${gold} 金币`];
  
  if (Math.random() < 0.5) {
    const foods = ['面包', '牛奶', '苹果', '鱼干'];
    const food = foods[rand(0, foods.length - 1)];
    mainData.food[food] = (mainData.food[food] || 0) + 1;
    drops.push(`获得 ${food} x1`);
  }
  main.DB.save(uid, mainData);
  return drops.join('\n');
}

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '宠物扩展';
cmd.help = `【万物有灵-扩展】
.宠物扩展 图鉴 - 查看图鉴
.宠物扩展 探险 <编号> <区域> - 派宠物探险
.宠物扩展 探险状态 - 查看探险状态
.宠物扩展 打工 <编号> <类型> - 派宠物打工
.宠物扩展 打工状态 - 查看打工状态
.宠物扩展 竞技场 - 查看竞技场信息
.宠物扩展 挑战 @人 - 挑战其他玩家`;

cmd.solve = (ctx, msg, argv) => {
  const uid = msg.sender.userId;
  const main = getMain();
  const args = (argv.rawArgs || '').trim().split(/\s+/);
  const action = args[0] || '';
  const p1 = args[1] || '';
  const p2 = args[2] || '';
  const reply = (t) => seal.replyToSender(ctx, msg, t);
  const data = DB.get(uid);
  const save = () => DB.save(uid, data);

  if (!action || action === 'help' || action === '帮助') return reply(cmd.help);

  if (action === '图鉴') {
    const entries = Object.entries(data.pokedex);
    if (!entries.length) return reply('【宠物图鉴】\n尚未发现任何宠物种族');
    const lines = ['【宠物图鉴】', `已发现: ${entries.length}种`, ''];
    entries.sort((a, b) => b[1].count - a[1].count).slice(0, 15).forEach(([s, i]) => lines.push(`${s}: 遇到${i.count}次`));
    if (entries.length > 15) lines.push(`...还有${entries.length - 15}种`);
    return reply(lines.join('\n'));
  }

  if (action === '探险') {
    if (!main) return reply('主插件未加载');
    const mainData = main.DB.get(uid);
    const pet = mainData.pets[parseInt(p1) - 1];
    if (!pet) return reply('请指定正确的宠物编号');
    if (pet.energy < 30) return reply('宠物精力不足，需要30点精力');
    const area = EXPLORE_AREAS.find(a => a.name === p2);
    if (!area) return reply(`未知区域\n可用: ${EXPLORE_AREAS.map(a => a.name).join('、')}`);
    
    const now = Date.now();
    data.explore = data.explore.filter(e => e.endTime > now);
    if (data.explore.length >= CONFIG.maxExplore) return reply(`探险队伍已满(最多${CONFIG.maxExplore}只)`);
    if ([...data.explore, ...data.work].find(e => e.petId === pet.id)) return reply('该宠物正在执行任务');

    data.explore.push({ petId: pet.id, endTime: now + CONFIG.exploreTime * 60000, area: area.name });
    pet.energy -= 30;
    main.DB.save(uid, mainData);
    save();
    return reply(`${pet.name} 前往 ${area.name} 探险\n预计 ${formatTime(CONFIG.exploreTime)} 后返回`);
  }

  if (action === '探险状态') {
    const now = Date.now();
    const lines = ['【探险状态】'];
    let changed = false;

    for (const e of data.explore) {
      if (e.endTime <= now) {
        const area = EXPLORE_AREAS.find(a => a.name === e.area);
        if (area) {
          const mainData = main.DB.get(uid);
          const pet = mainData.pets.find(p => p.id === e.petId);
          if (pet) {
            let r = `${pet.name} 从 ${area.name} 返回\n`;
            if (Math.random() < area.danger) { pet.hp = Math.max(1, pet.hp - 20); r += '遭遇危险受伤！\n'; }
            const gold = rand(area.gold[0], area.gold[1]);
            mainData.money += gold;
            r += `获得 ${gold} 金币\n`;
            const food = area.foods[rand(0, area.foods.length - 1)];
            mainData.food[food] = (mainData.food[food] || 0) + 1;
            r += `获得 ${food} x1`;
            main.DB.save(uid, mainData);
            lines.push(r);
            changed = true;
          }
        }
      } else {
        lines.push(`${e.area}: 剩余${formatTime(Math.ceil((e.endTime - now) / 60000))}`);
      }
    }
    if (changed) { data.explore = data.explore.filter(e => e.endTime > now); save(); }
    if (lines.length === 1) lines.push('没有进行中的探险');
    return reply(lines.join('\n'));
  }

  if (action === '打工') {
    if (!main) return reply('主插件未加载');
    const mainData = main.DB.get(uid);
    const pet = mainData.pets[parseInt(p1) - 1];
    if (!pet) return reply('请指定正确的宠物编号');
    const work = WORK_TYPES.find(w => w.name === p2);
    if (!work) return reply(`未知工作\n可用: ${WORK_TYPES.map(w => w.name).join('、')}`);
    if (pet.energy < work.energy) return reply(`精力不足，需要${work.energy}点`);

    const now = Date.now();
    data.work = data.work.filter(w => w.endTime > now);
    if (data.work.length >= CONFIG.maxWork) return reply(`打工位置已满(最多${CONFIG.maxWork}只)`);
    if ([...data.explore, ...data.work].find(e => e.petId === pet.id)) return reply('该宠物正在执行任务');

    data.work.push({ petId: pet.id, endTime: now + CONFIG.workTime * 60000, work: work.name });
    pet.energy -= work.energy;
    main.DB.save(uid, mainData);
    save();
    return reply(`${pet.name} 开始${work.name}\n预计 ${formatTime(CONFIG.workTime)} 后完成`);
  }

  if (action === '打工状态') {
    const now = Date.now();
    const lines = ['【打工状态】'];
    let changed = false;

    for (const w of data.work) {
      if (w.endTime <= now) {
        const work = WORK_TYPES.find(wt => wt.name === w.work);
        if (work) {
          const mainData = main.DB.get(uid);
          const pet = mainData.pets.find(p => p.id === w.petId);
          if (pet) {
            const gold = rand(work.gold[0], work.gold[1]);
            mainData.money += gold;
            main.DB.save(uid, mainData);
            lines.push(`${pet.name} 完成${work.name}，获得 ${gold} 金币`);
            changed = true;
          }
        }
      } else {
        lines.push(`${w.work}: 剩余${formatTime(Math.ceil((w.endTime - now) / 60000))}`);
      }
    }
    if (changed) { data.work = data.work.filter(w => w.endTime > now); save(); }
    if (lines.length === 1) lines.push('没有进行中的打工');
    return reply(lines.join('\n'));
  }

  if (action === '竞技场') {
    return reply(`【竞技场】\n积分: ${data.arenaRank}\n胜场: ${data.arenaWins}\n\n使用 .宠物扩展 挑战 @人 进行挑战`);
  }

  if (action === '挑战') {
    if (!main) return reply('主插件未加载');
    const atList = ctx.atInfo || [];
    if (!atList.length) return reply('请@要挑战的玩家');
    const targetUid = atList[0].userId;
    if (targetUid === uid) return reply('不能挑战自己');

    const mainData = main.DB.get(uid);
    if (!mainData.pets.length) return reply('你没有宠物');
    const targetData = main.DB.get(targetUid);
    if (!targetData.pets.length) return reply('对方没有宠物');

    const myPet = mainData.pets.reduce((a, b) => main.PetFactory.power(a) > main.PetFactory.power(b) ? a : b);
    const theirPet = targetData.pets.reduce((a, b) => main.PetFactory.power(a) > main.PetFactory.power(b) ? a : b);
    const result = main.Battle.run(myPet, theirPet);
    const targetExtData = DB.get(targetUid);

    const lines = [`【竞技场挑战】`, `${myPet.name} VS ${theirPet.name}`, ''];
    result.logs.slice(0, 5).forEach(l => lines.push(l));
    lines.push('');

    if (result.winner === myPet) {
      const gain = rand(20, 50);
      data.arenaRank += gain;
      data.arenaWins++;
      targetExtData.arenaRank = Math.max(0, targetExtData.arenaRank - gain);
      lines.push(`胜利！积分 +${gain}`);
    } else {
      const loss = rand(10, 30);
      data.arenaRank = Math.max(0, data.arenaRank - loss);
      targetExtData.arenaRank += loss;
      lines.push(`失败，积分 -${loss}`);
    }
    save();
    DB.save(targetUid, targetExtData);
    return reply(lines.join('\n'));
  }

  return reply('未知命令，发送 .宠物扩展 帮助 查看');
};

ext.cmdMap['宠物扩展'] = cmd;

// 暴露接口供主插件调用
const WanwuYoulingExt = {
  recordPokedex,
  handleDrop,
  DB,
};

if (typeof global !== 'undefined') {
  global.WanwuYoulingExt = WanwuYoulingExt;
}
if (typeof globalThis !== 'undefined') {
  globalThis.WanwuYoulingExt = WanwuYoulingExt;
}
