// ==UserScript==
// @name        神无月
// @author      铭茗
// @version     1.2.0
// @description 通过自定义COC房规改写原生ra/rc/sc判定：大成功/大失败自动重骰一次
// @timestamp   1777593600
// @license     Apache-2.0
// ==/UserScript==

let ext = seal.ext.find('神无月');
if (!ext) {
  ext = seal.ext.new('神无月', '铭茗', '1.2.0');
  seal.ext.register(ext);
}

const RULE_KEY = 'rr';
const RULE_NAME = '神无月';
const RULE_DESC = '大成功/大失败时自动重骰一次，并以重骰结果作为最终判定';

let ruleRegistered = false;

const TRIGGER_LINES = [
  '神树的枝影轻颤，命轨在月下悄然改写。',
  '古神无言注视，此刻的因果被重新抽离。',
  '渎神者的低语掠过耳畔，命运再掷一面。',
  '浮游岛的风穿过裂隙，旧结果被夜色吞没。',
  '光耀会的钟声回荡，你的终局尚未落笔。',
  '守护者于残月前举刃，重掷为你争来一线。'
];

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function d100() {
  return Math.floor(Math.random() * 100) + 1;
}

function baseResult(d100, checkValue, difficultyRequired) {
  let criticalSuccessValue = 1;
  let fumbleValue = 100;

  let checkVal = checkValue;
  if (difficultyRequired === 2) checkVal = Math.floor(checkVal / 2);
  if (difficultyRequired === 3) checkVal = Math.floor(checkVal / 5);
  if (difficultyRequired === 4) checkVal = 1;

  let successRank = d100 <= checkVal ? 1 : -1;

  // 使用常见COC7判定阈值
  if (checkValue >= 50) criticalSuccessValue = 5;
  if (checkValue < 50) fumbleValue = 96;

  if (d100 <= criticalSuccessValue && d100 <= checkVal) successRank = 4;
  else if (d100 >= fumbleValue && d100 > checkVal) successRank = -2;
  else if (successRank > 0) {
    if (d100 <= Math.floor(checkVal / 5)) successRank = 3;
    else if (d100 <= Math.floor(checkVal / 2)) successRank = 2;
    else successRank = 1;
  }

  return { successRank, criticalSuccessValue };
}

function getKey(ctx) {
  const gid = (ctx.group && ctx.group.groupId) ? ctx.group.groupId : 'private';
  return `rr-switch:${gid}`;
}

function isOn(ctx) {
  const v = ext.storageGet(getKey(ctx));
  return v === 'on';
}

function setOn(ctx, on) {
  ext.storageSet(getKey(ctx), on ? 'on' : 'off');
}

function registerRuleIfNeeded() {
  if (ruleRegistered) return true;

  const rule = seal.coc.newRule();
  rule.key = RULE_KEY;
  rule.name = RULE_NAME;
  rule.desc = RULE_DESC;

  rule.check = (ctx, d100Value, checkValue, difficultyRequired) => {
    const first = baseResult(d100Value, checkValue, difficultyRequired);

    if (!isOn(ctx)) {
      const ret = seal.coc.newRuleCheckResult();
      ret.successRank = first.successRank;
      ret.criticalSuccessValue = first.criticalSuccessValue;
      return ret;
    }

    // 仅在大成功/大失败时重骰
    if (first.successRank === 4 || first.successRank === -2) {
      const secondRoll = d100();
      const second = baseResult(secondRoll, checkValue, difficultyRequired);

      const ret = seal.coc.newRuleCheckResult();
      ret.successRank = second.successRank;
      ret.criticalSuccessValue = second.criticalSuccessValue;

      try {
        const line = randomPick(TRIGGER_LINES);
        seal.vars.strSet(
          ctx,
          '$t附加判定结果',
          `（神无月重骰: ${d100Value} -> ${secondRoll}）\n${line}`
        );
      } catch (e) {
        // 忽略变量写入失败，不影响判定
      }
      return ret;
    }

    const ret = seal.coc.newRuleCheckResult();
    ret.successRank = first.successRank;
    ret.criticalSuccessValue = first.criticalSuccessValue;
    return ret;
  };

  ruleRegistered = seal.coc.registerRule(rule);
  return ruleRegistered;
}

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '神无月';
cmd.help = '神无月开关\n' +
  '.神无月 开\n' +
  '.神无月 关\n' +
  '.神无月 状态\n\n' +
  '说明：\n' +
  '1) 本插件通过自定义COC房规影响原生 .ra/.rc/.sc\n' +
  `2) 使用前请执行：.setcoc ${RULE_KEY}`;

cmd.solve = (ctx, msg, cmdArgs) => {
  registerRuleIfNeeded();

  const sub = cmdArgs.getArgN(1);
  if (!sub || sub === 'help' || sub === '帮助') {
    const ret = seal.ext.newCmdExecuteResult(true);
    ret.showHelp = true;
    return ret;
  }

  if (sub === '开' || sub === 'on') {
    setOn(ctx, true);
    seal.replyToSender(ctx, msg,
      '[神无月] 已开启（本群）\n' +
      `请执行：.setcoc ${RULE_KEY}\n` +
      '之后原生 .ra/.rc/.sc 在大成功/大失败时会自动重骰一次。'
    );
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === '关' || sub === 'off') {
    setOn(ctx, false);
    seal.replyToSender(ctx, msg,
      '[神无月] 已关闭（本群）\n' +
      '可切回你常用房规，例如：.setcoc 0'
    );
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === '状态') {
    const on = isOn(ctx);
    seal.replyToSender(ctx, msg,
      `[神无月] 当前状态：${on ? '开启' : '关闭'}\n` +
      `房规键：${RULE_KEY}\n` +
      `启用命令：.setcoc ${RULE_KEY}`
    );
    return seal.ext.newCmdExecuteResult(true);
  }

  seal.replyToSender(ctx, msg, '[神无月] 子命令仅支持：开 / 关 / 状态');
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['神无月'] = cmd;
ext.cmdMap['成败重骰'] = cmd;
ext.cmdMap['重骰开关'] = cmd;

registerRuleIfNeeded();
