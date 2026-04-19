// ==UserScript==
// @name        轮盘对决
// @author      铭茗
// @version     1.0.0
// @description 2人轮盘对决游戏，出击或自用，看运气决定胜负
// @timestamp   1745136000
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/轮盘.js
// ==/UserScript==

let ext = seal.ext.find('轮盘对决');
if (!ext) {
  ext = seal.ext.new('轮盘对决', '铭茗', '1.0.0');
  seal.ext.register(ext);
}

// 按群组隔离: { groupId: GameSession }
let gameSessions = {};

// ===================== 工具函数 =====================
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

// ===================== 游戏会话类 =====================
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
    const total = random(3, 7);
    const swordNum = random(1, total - 1);
    const heartNum = total - swordNum;
    let deck = [];
    for (let i = 0; i < swordNum; i++) deck.push('剑');
    for (let i = 0; i < heartNum; i++) deck.push('心');
    this.deck = shuffle(deck);
    return { swordNum, heartNum };
  }

  getDeckCount() {
    let sword = 0, heart = 0;
    for (let c of this.deck) {
      if (c === '剑') sword++;
      else heart++;
    }
    return { sword, heart };
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
    if (this.deck.length === 0) {
      this.initDeck();
    }
    this.topCard = this.deck.pop();
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

// 血条显示
function hpBar(hp, max = 3, len = 5) {
  const filled = Math.floor((hp / max) * len);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, len - filled));
}

function showStatus(session) {
  const cnt = session.getDeckCount();
  const current = session.getCurrentPlayer();
  const p1 = session.players[0];
  const p2 = session.players[1];
  return `✦ 轮盘对决 ✧
${p1.name} ${hpBar(p1.hp)} ${p1.hp}/3  vs  ${p2.name} ${hpBar(p2.hp)} ${p2.hp}/3
牌堆: ⚔${cnt.sword} ♡${cnt.heart} (共${cnt.sword + cnt.heart}张)
当前回合: ${current ? current.name : '无'}
───────────────────────────`;
}

// ===================== 主命令 =====================
const cmdRoulette = seal.ext.newCmdItemInfo();
cmdRoulette.name = '轮盘';
cmdRoulette.help = `【轮盘对决】2人对战游戏
.轮盘 开始        发起游戏，等待对手加入
.轮盘 加入        加入当前等待中的游戏
.轮盘 挑战 @某人  直接挑战某人
.轮盘 状态        查看当前游戏状态
.轮盘 结束        强制结束游戏（仅参与者可用）

游戏进行中:
.出击             对对手使用顶牌
.自用             对自己使用顶牌

规则: 每人3血，牌堆随机剑/心，抽到剑扣血，心无效果`;

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
      if (session.phase === 'playing') {
        seal.replyToSender(ctx, msg, '[!] 当前有游戏进行中，请等待结束或使用 .轮盘 结束');
        return seal.ext.newCmdExecuteResult(true);
      }
      if (session.phase === 'waiting') {
        seal.replyToSender(ctx, msg, '[!] 已有等待中的游戏，请使用 .轮盘 加入');
        return seal.ext.newCmdExecuteResult(true);
      }
      session.players = [{ id: playerId, name: playerName, hp: 3, isCurrent: false }];
      session.hostId = playerId;
      session.phase = 'waiting';
      seal.replyToSender(ctx, msg, `✦ 发起对决 ✧\n${playerName} 发起了轮盘对决！\n使用 .轮盘 加入 来应战`);
      return seal.ext.newCmdExecuteResult(true);
    }

    case '加入':
    case '应战': {
      if (session.phase !== 'waiting') {
        seal.replyToSender(ctx, msg, '[!] 当前没有等待中的游戏，请先使用 .轮盘 开始');
        return seal.ext.newCmdExecuteResult(true);
      }
      if (session.isPlayerInGame(playerId)) {
        seal.replyToSender(ctx, msg, '[!] 你已经在游戏中了');
        return seal.ext.newCmdExecuteResult(true);
      }
      session.players.push({ id: playerId, name: playerName, hp: 3, isCurrent: false });
      const { swordNum, heartNum } = session.initDeck();
      session.phase = 'playing';
      const firstIdx = random(0, 1);
      session.players[firstIdx].isCurrent = true;
      session.drawTopCard();
      seal.replyToSender(ctx, msg, `✦ 对决开始 ✧
${session.players[0].name} VS ${session.players[1].name}
新牌堆: ⚔${swordNum}张 ♡${heartNum}张
先手: ${session.players[firstIdx].name}
───────────────────────────
使用 .出击 对对手使用顶牌
使用 .自用 对自己使用顶牌`);
      return seal.ext.newCmdExecuteResult(true);
    }

    case '挑战': {
      if (session.phase === 'playing') {
        seal.replyToSender(ctx, msg, '[!] 当前有游戏进行中，请等待结束');
        return seal.ext.newCmdExecuteResult(true);
      }
      const targetId = msg.message?.match(/\[CQ:at,qq=(\d+)\]/)?.[1];
      if (!targetId) {
        seal.replyToSender(ctx, msg, '用法: .轮盘 挑战 @某人');
        return seal.ext.newCmdExecuteResult(true);
      }
      session.players = [{ id: playerId, name: playerName, hp: 3, isCurrent: false }];
      session.hostId = playerId;
      session.phase = 'waiting';
      seal.replyToSender(ctx, msg, `✦ 发起挑战 ✧\n${playerName} 向你发起轮盘对决挑战！\n被挑战者请使用 .轮盘 加入 应战`);
      return seal.ext.newCmdExecuteResult(true);
    }

    case '状态': {
      if (session.phase === 'idle') {
        seal.replyToSender(ctx, msg, '当前没有进行中的游戏');
        return seal.ext.newCmdExecuteResult(true);
      }
      if (session.phase === 'waiting') {
        seal.replyToSender(ctx, msg, `✦ 等待中 ✧\n发起者: ${session.players[0].name}\n使用 .轮盘 加入 应战`);
        return seal.ext.newCmdExecuteResult(true);
      }
      seal.replyToSender(ctx, msg, showStatus(session));
      return seal.ext.newCmdExecuteResult(true);
    }

    case '结束':
    case '投降':
    case '认输': {
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

// ===================== 出击命令 =====================
const cmdAttack = seal.ext.newCmdItemInfo();
cmdAttack.name = '出击';
cmdAttack.help = '对对手使用顶牌，抽到剑则对手扣血';

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
  } else {
    result = `✦ 揭示顶牌 ✧ ♡心\n${opponent.name} 幸运躲过，无效果`;
  }

  const gameOver = session.checkGameOver();
  if (gameOver.ended) {
    gameSessions[groupId] = new GameSession(groupId);
    seal.replyToSender(ctx, msg, `${result}\n\n✦ 游戏结束 ✧\n${gameOver.loser.name} 血量归零！\n${gameOver.winner.name} 获胜！`);
    return seal.ext.newCmdExecuteResult(true);
  }

  session.switchTurn();
  session.drawTopCard();
  seal.replyToSender(ctx, msg, `${result}\n\n${showStatus(session)}`);
  return seal.ext.newCmdExecuteResult(true);
};

// ===================== 自用命令 =====================
const cmdSelfUse = seal.ext.newCmdItemInfo();
cmdSelfUse.name = '自用';
cmdSelfUse.help = '对自己使用顶牌，抽到剑则自己扣血';

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

  const self = current;
  const card = session.topCard;
  let result;

  if (card === '剑') {
    self.hp -= 1;
    result = `✦ 揭示顶牌 ✧ ⚔剑\n${self.name} 对自己造成伤害，剩余血量: ${self.hp}`;
  } else {
    result = `✦ 揭示顶牌 ✧ ♡心\n${self.name} 抽到心，安然无恙`;
  }

  const gameOver = session.checkGameOver();
  if (gameOver.ended) {
    gameSessions[groupId] = new GameSession(groupId);
    seal.replyToSender(ctx, msg, `${result}\n\n✦ 游戏结束 ✧\n${gameOver.loser.name} 血量归零！\n${gameOver.winner.name} 获胜！`);
    return seal.ext.newCmdExecuteResult(true);
  }

  session.switchTurn();
  session.drawTopCard();
  seal.replyToSender(ctx, msg, `${result}\n\n${showStatus(session)}`);
  return seal.ext.newCmdExecuteResult(true);
};

// ===================== 注册命令 =====================
ext.cmdMap['轮盘'] = cmdRoulette;
ext.cmdMap['出击'] = cmdAttack;
ext.cmdMap['自用'] = cmdSelfUse;
