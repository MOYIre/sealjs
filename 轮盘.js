// ==UserScript==
// @name        轮盘对决
// @author      铭茗
// @version     1.1.0
// @description 2人轮盘对决游戏，出击或自用，看运气决定胜负，含道具牌系统
// @timestamp   1745136000
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/轮盘.js
// ==/UserScript==

let ext = seal.ext.find('轮盘对决');
if (!ext) {
  ext = seal.ext.new('轮盘对决', '铭茗', '1.1.0');
  seal.ext.register(ext);
}

let gameSessions = {};

const ITEM_NAMES = {
  '药': '✚药',
  '弃': '✘弃', 
  '毁': '✘毁'
};

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function getGroupId(ctx) {
  return ctx.group.groupId || ctx.channel.userId || 'private';
}

function getPlayerId(ctx) {
  return ctx.player.userId;
}

function getPlayerName(ctx) {
  return ctx.player.name || ctx.player.userId;
}

function itemsStr(items) {
  const parts = [];
  if (items['药'] > 0) parts.push(`✚药×${items['药']}`);
  if (items['弃'] > 0) parts.push(`✘弃×${items['弃']}`);
  if (items['毁'] > 0) parts.push(`✘毁×${items['毁']}`);
  return parts.length > 0 ? parts.join(' ') : '无';
}

function totalItems(items) {
  return items['药'] + items['弃'] + items['毁'];
}

class GameSession {
  constructor(groupId) {
    this.groupId = groupId;
    this.players = [];
    this.deck = [];
    this.topCard = null;
    this.phase = 'idle';
    this.hostId = null;
  }

  initDeck() {
    const total = random(4, 8);
    const swordNum = random(1, Math.floor(total * 0.4));
    const itemNum = random(1, Math.floor(total * 0.3));
    const heartNum = total - swordNum - itemNum;
    
    let deck = [];
    for (let i = 0; i < swordNum; i++) deck.push('剑');
    for (let i = 0; i < heartNum; i++) deck.push('心');
    
    const itemTypes = ['药', '弃', '毁'];
    for (let i = 0; i < itemNum; i++) {
      deck.push(itemTypes[random(0, 2)]);
    }
    
    this.deck = shuffle(deck);
    return { swordNum, heartNum, itemNum };
  }

  getDeckCount() {
    let sword = 0, heart = 0, item = 0;
    for (let c of this.deck) {
      if (c === '剑') sword++;
      else if (c === '心') heart++;
      else item++;
    }
    return { sword, heart, item };
  }

  getFullDeckCount() {
    let sword = 0, heart = 0, item = 0;
    for (let c of this.deck) {
      if (c === '剑') sword++;
      else if (c === '心') heart++;
      else item++;
    }
    if (this.topCard === '剑') sword++;
    else if (this.topCard === '心') heart++;
    else if (this.topCard) item++;
    return { sword, heart, item };
  }

  getCurrentPlayer() {
    return this.players.find(p => p.isCurrent);
  }

  getOtherPlayer(playerId) {
    return this.players.find(p => p.id !== playerId);
  }

  isPlayerInGame(playerId) {
    return this.players.some(p => p.id === playerId);
  }

  drawTopCard() {
    let regenerated = false;
    let sword = 0, heart = 0, item = 0;

    if (this.deck.length === 0) {
      this.initDeck();
      regenerated = true;
    }

    this.topCard = this.deck.pop();

    if (regenerated) {
      const cnt = this.getFullDeckCount();
      sword = cnt.sword;
      heart = cnt.heart;
      item = cnt.item;
    }
    return { regenerated, sword, heart, item };
  }

  switchTurn() {
    for (let p of this.players) {
      p.isCurrent = !p.isCurrent;
    }
  }

  checkGameOver() {
    const loser = this.players.find(p => p.hp <= 0);
    if (loser) {
      const winner = this.players.find(p => p.hp > 0);
      return { ended: true, loser, winner };
    }
    return { ended: false };
  }
}

function getSession(groupId) {
  if (!gameSessions[groupId]) {
    gameSessions[groupId] = new GameSession(groupId);
  }
  return gameSessions[groupId];
}

function hpBar(hp, max = 3, len = 5) {
  const filled = Math.floor((hp / max) * len);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, len - filled));
}

function showStatus(session) {
  const cnt = session.getFullDeckCount();
  const current = session.getCurrentPlayer();
  const p1 = session.players[0];
  const p2 = session.players[1];
  return `✦ 轮盘对决 ✧
${p1.name} ${hpBar(p1.hp)} ${p1.hp}/3 [${itemsStr(p1.items)}]
${p2.name} ${hpBar(p2.hp)} ${p2.hp}/3 [${itemsStr(p2.items)}]
牌堆: ⚔${cnt.sword} ♡${cnt.heart} ✦${cnt.item} (含顶牌)
当前回合: ${current ? current.name : '无'}
───────────────────────────`;
}

// 主命令
const cmdRoulette = seal.ext.newCmdItemInfo();
cmdRoulette.name = '轮盘';
cmdRoulette.help = `【轮盘对决】2人对战游戏
.轮盘 开始        发起游戏
.轮盘 加入        加入游戏
.轮盘 状态        查看状态
.轮盘 结束        结束游戏

游戏中:
.出击/.自用       使用顶牌
.用药/.用弃/.用毁 使用道具

牌堆: ⚔剑 ♡心 ✚药(回血) ✘弃(移除顶牌) ✘毁(销毁对方道具)`;

cmdRoulette.solve = (ctx, msg, cmdArgs) => {
  const groupId = getGroupId(ctx);
  const playerId = getPlayerId(ctx);
  const playerName = getPlayerName(ctx);
  const session = getSession(groupId);
  const subCmd = cmdArgs.getArgN(1);

  switch (subCmd) {
    case 'help':
    case '帮助':
    case '': {
      const ret = seal.ext.newCmdExecuteResult(true);
      ret.showHelp = true;
      return ret;
    }

    case '开始':
    case '发起': {
      if (session.phase !== 'idle') {
        seal.replyToSender(ctx, msg, '[!] 当前有游戏进行中，请使用 .轮盘 结束');
        return seal.ext.newCmdExecuteResult(true);
      }
      session.players = [{ 
        id: playerId, name: playerName, hp: 3, isCurrent: false,
        items: { '药': 0, '弃': 0, '毁': 0 }
      }];
      session.hostId = playerId;
      session.phase = 'waiting';
      seal.replyToSender(ctx, msg, `✦ 发起对决 ✧\n${playerName} 发起了轮盘对决！\n使用 .轮盘 加入 来应战`);
      return seal.ext.newCmdExecuteResult(true);
    }

    case '加入':
    case '应战': {
      if (session.phase !== 'waiting') {
        seal.replyToSender(ctx, msg, '[!] 当前没有等待中的游戏');
        return seal.ext.newCmdExecuteResult(true);
      }
      if (session.isPlayerInGame(playerId)) {
        seal.replyToSender(ctx, msg, '[!] 你已经在游戏中了');
        return seal.ext.newCmdExecuteResult(true);
      }
      session.players.push({ 
        id: playerId, name: playerName, hp: 3, isCurrent: false,
        items: { '药': 0, '弃': 0, '毁': 0 }
      });
      session.initDeck();
      session.phase = 'playing';
      const firstIdx = random(0, 1);
      session.players[firstIdx].isCurrent = true;
      session.drawTopCard();
      const cnt = session.getFullDeckCount();
      seal.replyToSender(ctx, msg, `✦ 对决开始 ✧
${session.players[0].name} VS ${session.players[1].name}
牌堆: ⚔${cnt.sword} ♡${cnt.heart} ✦${cnt.item}
先手: ${session.players[firstIdx].name}
───────────────────────────
.出击/.自用 使用顶牌 | .用药/.用弃/.用偷 使用道具`);
      return seal.ext.newCmdExecuteResult(true);
    }

    case '状态': {
      if (session.phase === 'idle') {
        seal.replyToSender(ctx, msg, '当前没有进行中的游戏');
        return seal.ext.newCmdExecuteResult(true);
      }
      if (session.phase === 'waiting') {
        seal.replyToSender(ctx, msg, `✦ 等待中 ✧\n发起者: ${session.players[0].name}`);
        return seal.ext.newCmdExecuteResult(true);
      }
      seal.replyToSender(ctx, msg, showStatus(session));
      return seal.ext.newCmdExecuteResult(true);
    }

    case '结束':
    case '投降': {
      if (session.phase === 'idle') {
        seal.replyToSender(ctx, msg, '当前没有进行中的游戏');
        return seal.ext.newCmdExecuteResult(true);
      }
      if (!session.isPlayerInGame(playerId)) {
        seal.replyToSender(ctx, msg, '[!] 只有游戏参与者才能结束游戏');
        return seal.ext.newCmdExecuteResult(true);
      }
      const opponent = session.getOtherPlayer(playerId);
      gameSessions[groupId] = new GameSession(groupId);
      seal.replyToSender(ctx, msg, `✦ 游戏结束 ✧\n${opponent.name} 获胜！`);
      return seal.ext.newCmdExecuteResult(true);
    }

    default: {
      seal.replyToSender(ctx, msg, `未知子命令: ${subCmd}\n使用 .轮盘 帮助 查看帮助`);
      return seal.ext.newCmdExecuteResult(true);
    }
  }
};

// 添加道具（带上限检查）
function addItem(player, itemType) {
  player.items[itemType]++;
  const total = totalItems(player.items);
  if (total > 4) {
    // 超过上限，返回需要弃置的提示
    return { overLimit: true, total };
  }
  return { overLimit: false };
}

// 弃置道具
function discardItem(player, itemType) {
  if (player.items[itemType] > 0) {
    player.items[itemType]--;
    return true;
  }
  return false;
}

// 随机弃置一张道具
function randomDiscardItem(player) {
  const types = ['药', '弃', '毁'].filter(t => player.items[t] > 0);
  if (types.length === 0) return null;
  const type = types[random(0, types.length - 1)];
  player.items[type]--;
  return type;
}

// 出击命令
const cmdAttack = seal.ext.newCmdItemInfo();
cmdAttack.name = '出击';
cmdAttack.help = '对对手使用顶牌';

cmdAttack.solve = (ctx, msg, cmdArgs) => {
  const groupId = getGroupId(ctx);
  const playerId = getPlayerId(ctx);
  const session = getSession(groupId);

  if (session.phase !== 'playing') {
    seal.replyToSender(ctx, msg, '[!] 当前没有进行中的游戏');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (!session.isPlayerInGame(playerId)) {
    seal.replyToSender(ctx, msg, '[!] 你不是游戏参与者');
    return seal.ext.newCmdExecuteResult(true);
  }
  const current = session.getCurrentPlayer();
  if (current.id !== playerId) {
    seal.replyToSender(ctx, msg, `[!] 现在是 ${current.name} 的回合`);
    return seal.ext.newCmdExecuteResult(true);
  }

  const opponent = session.getOtherPlayer(playerId);
  const card = session.topCard;
  let result;

  if (card === '剑') {
    opponent.hp -= 1;
    result = `✦ 揭示顶牌 ✧ ⚔剑\n${opponent.name} 受到伤害，剩余血量: ${opponent.hp}`;
  } else if (card === '心') {
    result = `✦ 揭示顶牌 ✧ ♡心\n${opponent.name} 幸运躲过，无效果`;
  } else {
    // 道具牌
    const addResult = addItem(current, card);
    result = `✦ 揭示顶牌 ✧ ${ITEM_NAMES[card]}\n${current.name} 获得道具 ${ITEM_NAMES[card]}`;
    if (addResult.overLimit) {
      const discarded = randomDiscardItem(current);
      result += `\n[道具上限4张，随机弃置 ${ITEM_NAMES[discarded]}]`;
    }
  }

  const gameOver = session.checkGameOver();
  if (gameOver.ended) {
    gameSessions[groupId] = new GameSession(groupId);
    seal.replyToSender(ctx, msg, `${result}\n\n✦ 游戏结束 ✧\n${gameOver.loser.name} 血量归零！\n${gameOver.winner.name} 获胜！`);
    return seal.ext.newCmdExecuteResult(true);
  }

  session.switchTurn();
  const drawResult = session.drawTopCard();
  let extraMsg = drawResult.regenerated ? `\n[牌堆已重新生成]` : '';
  seal.replyToSender(ctx, msg, `${result}${extraMsg}\n\n${showStatus(session)}`);
  return seal.ext.newCmdExecuteResult(true);
};

// 自用命令
const cmdSelfUse = seal.ext.newCmdItemInfo();
cmdSelfUse.name = '自用';
cmdSelfUse.help = '对自己使用顶牌';

cmdSelfUse.solve = (ctx, msg, cmdArgs) => {
  const groupId = getGroupId(ctx);
  const playerId = getPlayerId(ctx);
  const session = getSession(groupId);

  if (session.phase !== 'playing') {
    seal.replyToSender(ctx, msg, '[!] 当前没有进行中的游戏');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (!session.isPlayerInGame(playerId)) {
    seal.replyToSender(ctx, msg, '[!] 你不是游戏参与者');
    return seal.ext.newCmdExecuteResult(true);
  }
  const current = session.getCurrentPlayer();
  if (current.id !== playerId) {
    seal.replyToSender(ctx, msg, `[!] 现在是 ${current.name} 的回合`);
    return seal.ext.newCmdExecuteResult(true);
  }

  const card = session.topCard;
  let result;
  let skipTurn = false;

  if (card === '剑') {
    current.hp -= 1;
    result = `✦ 揭示顶牌 ✧ ⚔剑\n${current.name} 对自己造成伤害，剩余血量: ${current.hp}`;
  } else if (card === '心') {
    result = `✦ 揭示顶牌 ✧ ♡心\n${current.name} 抽到心，安然无恙，继续行动！`;
    skipTurn = true;
  } else {
    const addResult = addItem(current, card);
    result = `✦ 揭示顶牌 ✧ ${ITEM_NAMES[card]}\n${current.name} 获得道具 ${ITEM_NAMES[card]}`;
    if (addResult.overLimit) {
      const discarded = randomDiscardItem(current);
      result += `\n[道具上限4张，随机弃置 ${ITEM_NAMES[discarded]}]`;
    }
  }

  const gameOver = session.checkGameOver();
  if (gameOver.ended) {
    gameSessions[groupId] = new GameSession(groupId);
    seal.replyToSender(ctx, msg, `${result}\n\n✦ 游戏结束 ✧\n${gameOver.loser.name} 血量归零！\n${gameOver.winner.name} 获胜！`);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (!skipTurn) {
    session.switchTurn();
  }
  const drawResult = session.drawTopCard();
  let extraMsg = drawResult.regenerated ? `\n[牌堆已重新生成]` : '';
  seal.replyToSender(ctx, msg, `${result}${extraMsg}\n\n${showStatus(session)}`);
  return seal.ext.newCmdExecuteResult(true);
};

// 用药命令
const cmdUseMed = seal.ext.newCmdItemInfo();
cmdUseMed.name = '用药';
cmdUseMed.help = '使用药牌，回复1血';

cmdUseMed.solve = (ctx, msg, cmdArgs) => {
  const groupId = getGroupId(ctx);
  const playerId = getPlayerId(ctx);
  const session = getSession(groupId);

  if (session.phase !== 'playing') {
    seal.replyToSender(ctx, msg, '[!] 当前没有进行中的游戏');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (!session.isPlayerInGame(playerId)) {
    seal.replyToSender(ctx, msg, '[!] 你不是游戏参与者');
    return seal.ext.newCmdExecuteResult(true);
  }
  const current = session.getCurrentPlayer();
  if (current.id !== playerId) {
    seal.replyToSender(ctx, msg, `[!] 现在是 ${current.name} 的回合`);
    return seal.ext.newCmdExecuteResult(true);
  }
  if (current.items['药'] <= 0) {
    seal.replyToSender(ctx, msg, '[!] 你没有药牌');
    return seal.ext.newCmdExecuteResult(true);
  }

  current.items['药']--;
  current.hp = Math.min(current.hp + 1, 3);
  seal.replyToSender(ctx, msg, `✦ 使用道具 ✧ ✚药\n${current.name} 回复1血，当前血量: ${current.hp}/3`);
  return seal.ext.newCmdExecuteResult(true);
};

// 用弃命令
const cmdUseDiscard = seal.ext.newCmdItemInfo();
cmdUseDiscard.name = '用弃';
cmdUseDiscard.help = '使用弃牌，移除当前顶牌';

cmdUseDiscard.solve = (ctx, msg, cmdArgs) => {
  const groupId = getGroupId(ctx);
  const playerId = getPlayerId(ctx);
  const session = getSession(groupId);

  if (session.phase !== 'playing') {
    seal.replyToSender(ctx, msg, '[!] 当前没有进行中的游戏');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (!session.isPlayerInGame(playerId)) {
    seal.replyToSender(ctx, msg, '[!] 你不是游戏参与者');
    return seal.ext.newCmdExecuteResult(true);
  }
  const current = session.getCurrentPlayer();
  if (current.id !== playerId) {
    seal.replyToSender(ctx, msg, `[!] 现在是 ${current.name} 的回合`);
    return seal.ext.newCmdExecuteResult(true);
  }
  if (current.items['弃'] <= 0) {
    seal.replyToSender(ctx, msg, '[!] 你没有弃牌');
    return seal.ext.newCmdExecuteResult(true);
  }

  current.items['弃']--;
  const oldCard = session.topCard;
  const drawResult = session.drawTopCard();
  let extraMsg = drawResult.regenerated ? '\n[牌堆已重新生成]' : '';
  seal.replyToSender(ctx, msg, `✦ 使用道具 ✧ ✘弃\n移除顶牌 ${ITEM_NAMES[oldCard] || (oldCard === '剑' ? '⚔剑' : '♡心')}${extraMsg}\n\n${showStatus(session)}`);
  return seal.ext.newCmdExecuteResult(true);
};

// 用毁命令
const cmdUseDestroy = seal.ext.newCmdItemInfo();
cmdUseDestroy.name = '用毁';
cmdUseDestroy.help = '使用毁牌，随机销毁对方一张道具';

cmdUseDestroy.solve = (ctx, msg, cmdArgs) => {
  const groupId = getGroupId(ctx);
  const playerId = getPlayerId(ctx);
  const session = getSession(groupId);

  if (session.phase !== 'playing') {
    seal.replyToSender(ctx, msg, '[!] 当前没有进行中的游戏');
    return seal.ext.newCmdExecuteResult(true);
  }
  if (!session.isPlayerInGame(playerId)) {
    seal.replyToSender(ctx, msg, '[!] 你不是游戏参与者');
    return seal.ext.newCmdExecuteResult(true);
  }
  const current = session.getCurrentPlayer();
  if (current.id !== playerId) {
    seal.replyToSender(ctx, msg, `[!] 现在是 ${current.name} 的回合`);
    return seal.ext.newCmdExecuteResult(true);
  }
  if (current.items['毁'] <= 0) {
    seal.replyToSender(ctx, msg, '[!] 你没有毁牌');
    return seal.ext.newCmdExecuteResult(true);
  }

  const opponent = session.getOtherPlayer(playerId);
  const opponentTotal = totalItems(opponent.items);

  if (opponentTotal === 0) {
    seal.replyToSender(ctx, msg, '[!] 对方没有道具可销毁');
    return seal.ext.newCmdExecuteResult(true);
  }

  current.items['毁']--;
  const removedType = randomDiscardItem(opponent);

  seal.replyToSender(ctx, msg, `✦ 使用道具 ✧ ✘毁\n${current.name} 销毁了 ${opponent.name} 的 ${ITEM_NAMES[removedType]}\n\n${showStatus(session)}`);
  return seal.ext.newCmdExecuteResult(true);
};

// 注册命令
ext.cmdMap['轮盘'] = cmdRoulette;
ext.cmdMap['出击'] = cmdAttack;
ext.cmdMap['自用'] = cmdSelfUse;
ext.cmdMap['用药'] = cmdUseMed;
ext.cmdMap['用弃'] = cmdUseDiscard;
ext.cmdMap['用毁'] = cmdUseDestroy;
