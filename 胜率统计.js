// ==UserScript==
// @name        命题集
// @author      铭茗
// @version     1.0.8
// @description 手动录入胜负，统计各游戏胜率并支持排行榜/个人查询
// @timestamp   1777248000
// 2026-04-25
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/胜率统计.js
// ==/UserScript==

let ext = seal.ext.find('命题集') || seal.ext.find('胜率统计');
if (!ext) {
  ext = seal.ext.new('命题集', '铭茗', '1.0.8');
  seal.ext.register(ext);
} else {
  // 兼容旧扩展名：尽量复用，避免热重载出现重复扩展
  try {
    ext.name = '命题集';
  } catch (e) {
    // ignore
  }
}

// 全局共享数据
const STORAGE_KEY = 'winrate_global_v1';
const UNDO_LIMIT = 20;
const MAX_DELTA = 1000000;

function loadDB() {
  try {
    const raw = ext.storageGet(STORAGE_KEY);
    const db = raw ? JSON.parse(raw) : null;
    if (db && typeof db === 'object') {
      if (!db.games || typeof db.games !== 'object') db.games = {};
      if (!db.undo || typeof db.undo !== 'object') db.undo = {};
      if (!db.aliases || typeof db.aliases !== 'object') db.aliases = {};
      return db;
    }
  } catch (e) {
    // ignore
  }
  return { games: {}, undo: {}, aliases: {} };
}

function saveDB(db) {
  ext.storageSet(STORAGE_KEY, JSON.stringify(db));
}

function normalizeName(s) {
  return (s || '').toString().trim();
}

function normalizeAliasKey(s) {
  return normalizeName(s).toLowerCase().replace(/\s+/g, '');
}

function normalizeGameNameWithDB(db, s) {
  const raw = normalizeName(s);
  if (!raw) return '';

  const key = normalizeAliasKey(raw);
  const mapped = (db.aliases || {})[key];
  return mapped || raw;
}

function toNonNegativeInt(s) {
  const t = normalizeName(s);
  if (!/^\d+$/.test(t)) return NaN;
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return NaN;
  return n;
}

function calcRate(win, lose) {
  const w = Math.max(0, win || 0);
  const l = Math.max(0, lose || 0);
  const t = w + l;
  if (t <= 0) return 0;
  return w / t;
}

function fmtRate(r) {
  return (r * 100).toFixed(2) + '%';
}

function formatLineRank(i, name, win, lose) {
  const t = win + lose;
  const r = fmtRate(calcRate(win, lose));
  return `${i}. ${name}  ${win}/${lose}  胜率${r}  场次${t}`;
}

function getSelfPlayer(ctx) {
  const key = ctx.player.userId;
  const name = ctx.player.name || ctx.player.userId;
  return { key, name };
}

function parsePlayerSpec(ctx, spec) {
  const s = normalizeName(spec);
  if (!s || s === '我' || s === '自己' || s === '本人' || s === 'me') {
    return getSelfPlayer(ctx);
  }

  // 允许写 @123456 或 123456
  const m = s.match(/^@?(\d{3,})$/);
  if (m) {
    return { key: m[1], name: m[1] };
  }

  return { key: s, name: s };
}

function ensureGame(db, gameName) {
  const g = normalizeGameNameWithDB(db, gameName);
  if (!g) return null;
  if (!db.games[g]) db.games[g] = { players: {} };
  if (!db.games[g].players || typeof db.games[g].players !== 'object') db.games[g].players = {};
  return { gameKey: g, game: db.games[g] };
}

function ensureGameExact(db, gameKey) {
  const g = normalizeName(gameKey);
  if (!g) return null;
  if (!db.games[g]) db.games[g] = { players: {} };
  if (!db.games[g].players || typeof db.games[g].players !== 'object') db.games[g].players = {};
  return { gameKey: g, game: db.games[g] };
}

function getGame(db, gameName) {
  const raw = normalizeName(gameName);
  if (!raw) return null;

  const mapped = normalizeGameNameWithDB(db, raw);
  if (db.games[mapped] && typeof db.games[mapped] === 'object') {
    if (!db.games[mapped].players || typeof db.games[mapped].players !== 'object') db.games[mapped].players = {};
    return { gameKey: mapped, game: db.games[mapped] };
  }

  if (db.games[raw] && typeof db.games[raw] === 'object') {
    if (!db.games[raw].players || typeof db.games[raw].players !== 'object') db.games[raw].players = {};
    return { gameKey: raw, game: db.games[raw] };
  }

  return null;
}

function ensurePlayer(game, playerKey, displayName) {
  const k = normalizeName(playerKey);
  if (!k) return null;

  if (!game.players[k]) {
    game.players[k] = { name: normalizeName(displayName) || k, win: 0, lose: 0 };
  }

  const dn = normalizeName(displayName);
  if (dn) game.players[k].name = dn;
  if (typeof game.players[k].win !== 'number') game.players[k].win = 0;
  if (typeof game.players[k].lose !== 'number') game.players[k].lose = 0;
  return game.players[k];
}

function getPlayer(game, playerKey) {
  const k = normalizeName(playerKey);
  if (!k) return null;
  const rec = game.players ? game.players[k] : null;
  if (!rec || typeof rec !== 'object') return null;
  if (typeof rec.win !== 'number') rec.win = 0;
  if (typeof rec.lose !== 'number') rec.lose = 0;
  if (!rec.name) rec.name = k;
  return rec;
}

function parseAddRest(rest) {
  const r = normalizeName(rest);
  if (!r) return null;
  const parts = r.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const loseN = toNonNegativeInt(parts[parts.length - 1]);
  const winN = toNonNegativeInt(parts[parts.length - 2]);
  if (isNaN(winN) || isNaN(loseN)) return null;

  const playerSpec = parts.slice(0, -2).join(' ');
  return { playerSpec: playerSpec || '我', winN, loseN };
}

function pushUndo(db, operatorId, entry) {
  if (!db.undo || typeof db.undo !== 'object') db.undo = {};
  if (!db.undo[operatorId] || !Array.isArray(db.undo[operatorId])) db.undo[operatorId] = [];
  db.undo[operatorId].push(entry);
  if (db.undo[operatorId].length > UNDO_LIMIT) {
    db.undo[operatorId] = db.undo[operatorId].slice(-UNDO_LIMIT);
  }
}

function popUndo(db, operatorId, predicate) {
  if (!db.undo || typeof db.undo !== 'object') return null;
  const stack = db.undo[operatorId];
  if (!Array.isArray(stack) || stack.length === 0) return null;

  if (!predicate) {
    return stack.pop();
  }

  for (let i = stack.length - 1; i >= 0; i--) {
    if (predicate(stack[i])) {
      const [x] = stack.splice(i, 1);
      return x;
    }
  }

  return null;
}

function replyHelp(ctx, msg) {
  const text = [
    '【命题集】',
    '手动录入胜负，计算胜率并展示排行榜（全局共享数据）',
    '',
    '━━━━━━━━ 录入 ━━━━━━━━',
    '.胜率 新增 <游戏> <玩家> <胜> <负>',
    '.胜率 新增 <游戏> <胜> <负>',
    '  └ 不写玩家时，默认记录为自己',
    '  └ 玩家名可以带空格；最后两个数字会被识别为胜/负',
    '',
    '.胜率 撤销 [游戏]',
    '  └ 撤销你最近一次录入；可指定游戏',
    '',
    '.胜率 游戏列表',
    '  └ 查看已记录的游戏',
    '',
    '━━━━━━━━ 别名 alias ━━━━━━━━',
    '.胜率 alias add <别名> <标准游戏名>',
    '.胜率 alias del <别名>',
    '.胜率 alias list',
    '.胜率 alias clear',
    '',
    '━━━━━━━━ 查询 ━━━━━━━━',
    '.胜率 <游戏>',
    '  └ 默认显示排行榜 + 你的数据',
    '',
    '.胜率 <游戏> 列表 [N]',
    '  └ 查看排行榜；默认 Top10',
    '',
    '.胜率 <游戏> <玩家/QQ/@QQ/我>',
    '  └ 查询指定玩家',
    '',
    '━━━━━━━━ 快捷 ━━━━━━━━',
    '.狼人杀胜率 [新增|撤销|列表 N|玩家]',
    '.血染钟楼胜率 [新增|撤销|列表 N|玩家]',
    '',
    '━━━━━━━━ 示例 ━━━━━━━━',
    '.胜率 alias add botc 血染钟楼',
    '.胜率 botc 列表 20',
    '.胜率 新增 狼人杀 张 三 3 2',
    '.胜率 撤销 狼人杀',
  ].join('\n');

  seal.replyToSender(ctx, msg, text);
}

function handleAdd(ctx, msg, cmdArgs, fixedGameName) {
  const db = loadDB();

  let gameName;
  let restFrom;

  if (fixedGameName) {
    gameName = fixedGameName;
    restFrom = 2;
  } else {
    gameName = cmdArgs.getArgN(2);
    restFrom = 3;
  }

  const g = ensureGame(db, gameName);
  if (!g) {
    seal.replyToSender(ctx, msg, fixedGameName
      ? `用法：.${fixedGameName}胜率 新增 <玩家> <胜> <负> / 新增 <胜> <负>`
      : '用法：.胜率 新增 <游戏> <玩家> <胜> <负>');
    return;
  }

  const parsed = parseAddRest(cmdArgs.getRestArgsFrom(restFrom));
  if (!parsed) {
    seal.replyToSender(ctx, msg, fixedGameName
      ? `用法：.${fixedGameName}胜率 新增 <玩家> <胜> <负> / 新增 <胜> <负>`
      : '用法：.胜率 新增 <游戏> <玩家> <胜> <负>（胜负为非负整数）');
    return;
  }

  const { playerSpec, winN, loseN } = parsed;
  if (winN > MAX_DELTA || loseN > MAX_DELTA) {
    seal.replyToSender(ctx, msg, `单次录入过大，请将胜负分别控制在 ${MAX_DELTA} 以内`);
    return;
  }

  const p = parsePlayerSpec(ctx, playerSpec);
  const rec = ensurePlayer(g.game, p.key, p.name);

  const nextWin = rec.win + winN;
  const nextLose = rec.lose + loseN;
  if (!Number.isSafeInteger(nextWin) || !Number.isSafeInteger(nextLose)) {
    seal.replyToSender(ctx, msg, '累计数据过大，超出安全整数范围，已拒绝录入');
    return;
  }

  rec.win = nextWin;
  rec.lose = nextLose;

  pushUndo(db, ctx.player.userId, {
    ts: Date.now(),
    gameKey: g.gameKey,
    playerKey: p.key,
    playerName: rec.name,
    win: winN,
    lose: loseN,
  });

  saveDB(db);

  const rate = fmtRate(calcRate(rec.win, rec.lose));
  const total = rec.win + rec.lose;
  seal.replyToSender(ctx, msg, `已录入【${g.gameKey}】${rec.name}: +${winN}/+${loseN}；当前 ${rec.win}/${rec.lose} 胜率${rate} 场次${total}`);
}

function handleUndo(ctx, msg, gameNameOpt) {
  const db = loadDB();
  const operatorId = ctx.player.userId;

  let predicate = null;
  let displayFilter = '';
  if (gameNameOpt) {
    const raw = normalizeName(gameNameOpt);
    const mapped = normalizeGameNameWithDB(db, raw);
    displayFilter = mapped || raw;
    predicate = (entry) => entry && (entry.gameKey === raw || entry.gameKey === mapped);
  }

  const x = popUndo(db, operatorId, predicate);
  if (!x) {
    seal.replyToSender(ctx, msg, displayFilter ? `没有可撤销的【${displayFilter}】录入` : '没有可撤销的录入');
    return;
  }

  const g = ensureGameExact(db, x.gameKey);
  const rec = ensurePlayer(g.game, x.playerKey, x.playerName);

  const beforeWin = rec.win || 0;
  const beforeLose = rec.lose || 0;
  rec.win = Math.max(0, beforeWin - (x.win || 0));
  rec.lose = Math.max(0, beforeLose - (x.lose || 0));

  saveDB(db);

  const rate = fmtRate(calcRate(rec.win, rec.lose));
  const total = rec.win + rec.lose;
  const clamped = beforeWin < (x.win || 0) || beforeLose < (x.lose || 0);
  const suffix = clamped ? '（检测到历史数据变更，已按0截断）' : '';
  seal.replyToSender(ctx, msg, `已撤销【${g.gameKey}】${rec.name}: -${x.win}/-${x.lose}；当前 ${rec.win}/${rec.lose} 胜率${rate} 场次${total}${suffix}`);
}

function handleAlias(ctx, msg, cmdArgs) {
  const db = loadDB();
  const sub = (cmdArgs.getArgN(2) || '').toLowerCase();

  if (!sub || sub === 'help') {
    seal.replyToSender(ctx, msg, [
      '用法：',
      '.胜率 alias add <别名> <标准游戏名>',
      '.胜率 alias del <别名>',
      '.胜率 alias list',
      '.胜率 alias clear',
      '说明：别名匹配会忽略大小写和空格',
    ].join('\n'));
    return;
  }

  if (sub === 'list') {
    const aliases = db.aliases || {};
    const keys = Object.keys(aliases);
    if (keys.length === 0) {
      seal.replyToSender(ctx, msg, '当前没有任何别名');
      return;
    }

    keys.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    const lines = keys.map((k) => `- ${k} -> ${aliases[k]}`);
    seal.replyToSender(ctx, msg, `别名列表：\n${lines.join('\n')}`);
    return;
  }

  if (sub === 'clear') {
    db.aliases = {};
    saveDB(db);
    seal.replyToSender(ctx, msg, '已清空全部别名');
    return;
  }

  if (sub === 'add') {
    const aliasRaw = cmdArgs.getArgN(3);
    const canonicalRaw = cmdArgs.getRestArgsFrom(4);
    const aliasKey = normalizeAliasKey(aliasRaw);
    const canonName = normalizeName(canonicalRaw);
    const canonKey = normalizeAliasKey(canonName);

    if (!aliasKey || !canonName) {
      seal.replyToSender(ctx, msg, '用法：.胜率 alias add <别名> <标准游戏名>');
      return;
    }

    if (aliasKey.length > 50 || canonName.length > 50) {
      seal.replyToSender(ctx, msg, '别名/游戏名过长');
      return;
    }

    if (aliasKey === canonKey) {
      seal.replyToSender(ctx, msg, '别名不需要和标准游戏名相同');
      return;
    }

    if (db.aliases[canonKey]) {
      seal.replyToSender(ctx, msg, `标准游戏名“${canonName}”当前是某个别名，请先清理冲突后再设置`);
      return;
    }

    if (db.aliases[aliasKey] && db.aliases[aliasKey] !== canonName) {
      seal.replyToSender(ctx, msg, `别名“${aliasRaw}”已存在且指向 ${db.aliases[aliasKey]}，请先 del 后再 add`);
      return;
    }

    const existingGameNameConflict = Object.keys(db.games || {}).some((g) => normalizeAliasKey(g) === aliasKey);
    if (existingGameNameConflict) {
      seal.replyToSender(ctx, msg, '该别名与已有游戏名冲突，请换一个别名');
      return;
    }

    db.aliases[aliasKey] = canonName;
    saveDB(db);
    seal.replyToSender(ctx, msg, `已添加别名：${aliasRaw} -> ${canonName}`);
    return;
  }

  if (sub === 'del' || sub === 'delete' || sub === 'rm' || sub === 'remove') {
    const aliasRaw = cmdArgs.getArgN(3);
    const aliasKey = normalizeAliasKey(aliasRaw);
    if (!aliasKey) {
      seal.replyToSender(ctx, msg, '用法：.胜率 alias del <别名>');
      return;
    }

    if (!db.aliases[aliasKey]) {
      seal.replyToSender(ctx, msg, `未找到别名：${aliasRaw}`);
      return;
    }

    delete db.aliases[aliasKey];
    saveDB(db);
    seal.replyToSender(ctx, msg, `已删除别名：${aliasRaw}`);
    return;
  }

  seal.replyToSender(ctx, msg, '未知 alias 子命令，可用 .胜率 alias help');
}

function handleGameList(ctx, msg) {
  const db = loadDB();
  const games = Object.keys(db.games || {});
  if (games.length === 0) {
    seal.replyToSender(ctx, msg, '当前还没有任何游戏记录');
    return;
  }

  games.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const lines = games.map((g) => {
    const players = db.games[g] && db.games[g].players ? Object.keys(db.games[g].players).length : 0;
    return `- ${g}（${players}人）`;
  });
  seal.replyToSender(ctx, msg, `已记录游戏：\n${lines.join('\n')}`);
}

function buildLeaderboard(game, topN) {
  const list = Object.entries(game.players || {}).map(([k, v]) => {
    const win = typeof v.win === 'number' ? v.win : 0;
    const lose = typeof v.lose === 'number' ? v.lose : 0;
    const total = win + lose;
    const rate = calcRate(win, lose);
    return {
      key: k,
      name: v.name || k,
      win,
      lose,
      total,
      rate,
    };
  });

  list.sort((a, b) => {
    if (b.rate !== a.rate) return b.rate - a.rate;
    if (b.total !== a.total) return b.total - a.total;
    if (b.win !== a.win) return b.win - a.win;
    return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN');
  });

  const n = Math.max(1, Math.min(200, topN || 10));
  return list.slice(0, n);
}

function replyPlayerLine(ctx, msg, gameKey, playerName, win, lose) {
  const total = win + lose;
  const rate = fmtRate(calcRate(win, lose));
  seal.replyToSender(ctx, msg, `【${gameKey}】${playerName}\n胜/负: ${win}/${lose}\n胜率: ${rate}\n场次: ${total}`);
}

function handleQuery(ctx, msg, cmdArgs, fixedGameName) {
  const db = loadDB();

  let gameName;
  let arg2;
  let arg3;

  if (fixedGameName) {
    gameName = fixedGameName;
    arg2 = cmdArgs.getArgN(2);
    arg3 = cmdArgs.getArgN(3);
  } else {
    gameName = cmdArgs.getArgN(1);
    arg2 = cmdArgs.getArgN(2);
    arg3 = cmdArgs.getArgN(3);
  }

  const g = getGame(db, gameName);
  if (!g) {
    seal.replyToSender(ctx, msg, `【${normalizeGameNameWithDB(db, gameName) || normalizeName(gameName)}】暂无记录`);
    return;
  }

  const game = g.game;

  // 列表
  if (arg2 === '列表' || arg2 === '排行' || arg2 === 'rank' || arg2 === 'list') {
    const n = toNonNegativeInt(arg3);
    const topN = !isNaN(n) && n > 0 ? n : 10;
    const rows = buildLeaderboard(game, topN);
    if (rows.length === 0) {
      seal.replyToSender(ctx, msg, `【${g.gameKey}】暂无数据\n用法：.胜率 新增 ${g.gameKey} <玩家> <胜> <负>`);
      return;
    }

    const lines = rows.map((r, i) => formatLineRank(i + 1, r.name, r.win, r.lose));
    seal.replyToSender(ctx, msg, `【${g.gameKey}】胜率排行榜 Top${rows.length}\n${lines.join('\n')}`);
    return;
  }

  // 个人（指定玩家）
  if (arg2 && arg2 !== '我的' && arg2 !== '我') {
    const p = parsePlayerSpec(ctx, arg2);
    const rec = getPlayer(game, p.key);
    if (!rec) {
      seal.replyToSender(ctx, msg, `【${g.gameKey}】暂无玩家“${p.name}”的记录`);
      return;
    }
    replyPlayerLine(ctx, msg, g.gameKey, rec.name, rec.win, rec.lose);
    return;
  }

  // 默认：排行榜(10) + 自己
  const rows = buildLeaderboard(game, 10);
  const me = getSelfPlayer(ctx);
  const myRec = getPlayer(game, me.key);

  const lines = [];
  lines.push(`【${g.gameKey}】胜率 Top${Math.min(10, rows.length)}（全局）`);
  if (rows.length === 0) {
    lines.push('暂无数据');
  } else {
    rows.forEach((r, i) => lines.push(formatLineRank(i + 1, r.name, r.win, r.lose)));
  }

  lines.push('');
  if (myRec) {
    const myRate = fmtRate(calcRate(myRec.win, myRec.lose));
    lines.push(`你的数据：${myRec.name}  ${myRec.win}/${myRec.lose}  胜率${myRate}`);
  } else {
    lines.push(`你的数据：${me.name} 暂无记录`);
  }

  seal.replyToSender(ctx, msg, lines.join('\n'));
}

// ==================== 命令：.胜率 ====================
const cmdWinrate = seal.ext.newCmdItemInfo();
cmdWinrate.name = '胜率';
cmdWinrate.help = '胜率统计，输入 .胜率 help 查看用法';
cmdWinrate.solve = (ctx, msg, cmdArgs) => {
  const sub = cmdArgs.getArgN(1);

  if (!sub || sub === 'help' || sub === '帮助') {
    replyHelp(ctx, msg);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === '新增' || sub === 'add') {
    handleAdd(ctx, msg, cmdArgs, null);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === '撤销' || sub === 'undo') {
    const g = cmdArgs.getArgN(2);
    handleUndo(ctx, msg, g);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === 'alias') {
    handleAlias(ctx, msg, cmdArgs);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === '游戏列表' || sub === '列表游戏' || sub === 'games') {
    handleGameList(ctx, msg);
    return seal.ext.newCmdExecuteResult(true);
  }

  // sub 当作游戏名
  handleQuery(ctx, msg, cmdArgs, null);
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['胜率'] = cmdWinrate;

// ==================== 快捷命令：.狼人杀胜率 / .血染钟楼胜率 ====================
function makeGameCmd(commandName, canonicalGameName) {
  const cmd = seal.ext.newCmdItemInfo();
  cmd.name = `${commandName}胜率`;
  cmd.help = `用法：.${commandName}胜率 [新增|撤销|列表 N|玩家]\n例如：.${commandName}胜率 新增 1 0`;
  cmd.solve = (ctx, msg, cmdArgs) => {
    const sub = cmdArgs.getArgN(1);

    if (!sub || sub === 'help' || sub === '帮助') {
      const ret = seal.ext.newCmdExecuteResult(true);
      ret.showHelp = true;
      return ret;
    }

    if (sub === '新增' || sub === 'add') {
      handleAdd(ctx, msg, cmdArgs, canonicalGameName);
      return seal.ext.newCmdExecuteResult(true);
    }

    if (sub === '撤销' || sub === 'undo') {
      handleUndo(ctx, msg, canonicalGameName);
      return seal.ext.newCmdExecuteResult(true);
    }

    // 兼容：直接写 “列表 20” 或 “张三”
    handleQuery(ctx, msg, cmdArgs, canonicalGameName);
    return seal.ext.newCmdExecuteResult(true);
  };

  return cmd;
}

// fixed quick commands
ext.cmdMap['狼人杀胜率'] = makeGameCmd('狼人杀', '狼人杀');
ext.cmdMap['血染钟楼胜率'] = makeGameCmd('血染钟楼', '血染钟楼');
