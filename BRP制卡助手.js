// ==UserScript==
// @name        BRP制卡助手
// @author      铭茗
// @version     1.0.3
// @description BRP：.brp 制卡、.brpst 录卡、.snbrp 改名与自动名片
// @timestamp   1779148800
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/BRP制卡助手.js
// ==/UserScript==

if (!seal.ext.find('BRP制卡助手')) {
  const ext = seal.ext.new('BRP制卡助手', 'Qwen', '1.0.3');

  const TEMPLATE_PREFIX = 'brp_auto_template:';
  const AUTO_PREFIX = 'brp_auto_card:';
  const DEFAULT_TEMPLATE = '{$t玩家_RAW} hp{生命}/{最大生命} pp{能量}/{最大能量} DEX{敏捷}';

  function uid(ctx) {
    return (ctx && ctx.player && ctx.player.userId) ? ctx.player.userId : 'default';
  }

  function getTemplate(ctx) {
    return ext.storageGet(`${TEMPLATE_PREFIX}${uid(ctx)}`) || DEFAULT_TEMPLATE;
  }

  function setTemplate(ctx, tmpl) {
    ext.storageSet(`${TEMPLATE_PREFIX}${uid(ctx)}`, tmpl || DEFAULT_TEMPLATE);
  }

  function isAutoOn(ctx) {
    return ext.storageGet(`${AUTO_PREFIX}${uid(ctx)}`) === '1';
  }

  function setAutoOn(ctx, on) {
    ext.storageSet(`${AUTO_PREFIX}${uid(ctx)}`, on ? '1' : '0');
  }

  function canApplyGroupCard() {
    return typeof seal.applyPlayerGroupCardByTemplate === 'function';
  }

  function applyCard(ctx, tmpl) {
    if (!canApplyGroupCard()) return '';
    const t = tmpl || getTemplate(ctx);
    ctx.player.autoSetNameTemplate = t;
    return seal.applyPlayerGroupCardByTemplate(ctx, t);
  }

  function replyDone(ctx, msg, text) {
    seal.replyToSender(ctx, msg, text);
    return seal.ext.newCmdExecuteResult(true);
  }

  function rollD6() { return Math.floor(Math.random() * 6) + 1; }
  function roll3d6() { return rollD6() + rollD6() + rollD6(); }

  function buildBrpCard() {
    const STR = roll3d6();
    const CON = roll3d6();
    const SIZ = roll3d6();
    const INT = roll3d6();
    const POW = roll3d6();
    const DEX = roll3d6();
    const CHA = roll3d6();
    const HP = Math.floor((CON + SIZ) / 2);
    const PP = POW;
    return {
      力量: STR, 体质: CON, 体型: SIZ, 智力: INT, 意志: POW, 敏捷: DEX, 外貌: CHA,
      气力: STR * 5, 耐力: CON * 5, 灵感: INT * 5, 幸运: POW * 5, 灵巧: DEX * 5, 魅力: CHA * 5,
      生命: HP, 最大生命: HP, 能量: PP, 最大能量: PP
    };
  }

  function applyCardDataToVars(ctx, card) {
    Object.keys(card).forEach((k) => {
      const v = card[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        seal.vars.intSet(ctx, k, v);
      }
    });
  }

  function cardToText(card) {
    const n = (k) => String(card[k]);
    return [
      `力量:${n('力量').padEnd(2)}  体质:${n('体质').padEnd(2)}   体型:${n('体型').padEnd(2)}   智力:${n('智力')}`,
      `意志:${n('意志').padEnd(2)}    敏捷:${n('敏捷').padEnd(2)}   外貌:${n('外貌').padEnd(2)}   气力:${n('气力')}`,
      `耐力:${n('耐力')} 灵感:${n('灵感')} 幸运:${n('幸运')} 灵巧:${n('灵巧')}`,
      `魅力:${n('魅力')}       生命:${n('生命')}/${n('最大生命')}        能量:${n('能量')}/${n('最大能量')}`
    ].join('\n');
  }

  function formatCards(cards) {
    const sep = '\n━━━━━━━━━━━━━━━━\n';
    return cards.map((c, i) => `【第${i + 1}组】\n${cardToText(c)}`).join(sep);
  }

  const cmdBrp = seal.ext.newCmdItemInfo();
  cmdBrp.name = 'brp';
  cmdBrp.help = '.brp[数字] / .brp [数字]\n按 BRP 规则生成属性并写入当前卡';
  cmdBrp.solve = (ctx, msg, cmdArgs) => {
    let times = 1;
    const suffix = (cmdArgs.command || 'brp').slice(3);
    const arg1 = (cmdArgs.getArgN(1) || '').trim();

    if (/^\d+$/.test(suffix)) {
      times = parseInt(suffix, 10);
    } else if (/^\d+$/.test(arg1)) {
      times = parseInt(arg1, 10);
    }
    times = Math.max(1, Math.min(times, 10));

    const cards = [];
    for (let i = 0; i < times; i += 1) cards.push(buildBrpCard());

    const head = `BRP制卡结果（共${times}组）`;
    return replyDone(ctx, msg, `${head}\n\n${formatCards(cards)}`);
  };

  const cmdBrpst = seal.ext.newCmdItemInfo();
  cmdBrpst.name = 'brpst';
  cmdBrpst.help = '.brpst 属性值...\n录入 BRP 属性，如 .brpst 力量12 敏捷14 生命10';
  cmdBrpst.solve = (ctx, msg, cmdArgs) => {
    const raw = cmdArgs.getRestArgsFrom(1).trim();
    if (!raw) return replyDone(ctx, msg, '用法：.brpst 力量12 敏捷14 生命10');

    const parts = raw.split(/\s+/).filter(Boolean);
    const updated = [];
    const reg = /^(.+?)([-+]?\d+)$/;

    for (const p of parts) {
      const m = p.match(reg);
      if (!m) continue;
      const key = m[1].trim();
      const val = parseInt(m[2], 10);
      if (!key || Number.isNaN(val)) continue;
      seal.vars.intSet(ctx, key, val);
      updated.push(`${key}:${val}`);
    }

    if (!updated.length) {
      return replyDone(ctx, msg, '未识别到可写入的属性，请使用“属性名+数字”的格式。');
    }

    if (isAutoOn(ctx)) {
      try { applyCard(ctx); } catch (e) {}
    }

    return replyDone(ctx, msg, `已录入：${updated.join(' ')}`);
  };

  const cmdSnbrp = seal.ext.newCmdItemInfo();
  cmdSnbrp.name = 'snbrp';
  cmdSnbrp.help = '.snbrp <名字>\n改角色名并同步群名片\n.snbrp\n立即同步群名片\n.snbrp auto / .snbrp auto off\n开启/关闭自动名片\n.snbrp tmpl <模板>\n设置名片模板';
  cmdSnbrp.solve = (ctx, msg, cmdArgs) => {
    const a1 = (cmdArgs.getArgN(1) || '').trim();

    if (!a1) {
      if (!canApplyGroupCard()) return replyDone(ctx, msg, '当前环境不支持自动改群名片');
      const text = applyCard(ctx);
      return replyDone(ctx, msg, `已同步群名片：${text || ctx.player.name}`);
    }

    if (a1 === 'help') {
      const ret = seal.ext.newCmdExecuteResult(true);
      ret.showHelp = true;
      return ret;
    }

    if (a1 === 'auto' || a1 === 'on') {
      const off = (cmdArgs.getArgN(2) || '').trim() === 'off';
      setAutoOn(ctx, !off);
      if (!off && canApplyGroupCard()) {
        try { applyCard(ctx); } catch (e) {}
      }
      return replyDone(ctx, msg, off ? '已关闭 BRP 自动名片。' : '已开启 BRP 自动名片。');
    }

    if (a1 === 'off') {
      setAutoOn(ctx, false);
      return replyDone(ctx, msg, '已关闭 BRP 自动名片。');
    }

    if (a1 === 'tmpl' || a1 === 'template') {
      const t = cmdArgs.getRestArgsFrom(2).trim();
      if (!t) return replyDone(ctx, msg, `当前模板：${getTemplate(ctx)}`);
      setTemplate(ctx, t);
      if (canApplyGroupCard()) {
        try { applyCard(ctx, t); } catch (e) {}
      }
      return replyDone(ctx, msg, `已设置模板：${t}`);
    }

    const name = cmdArgs.getRestArgsFrom(1).trim();
    if (!name) return replyDone(ctx, msg, '用法：.snbrp <名字>');

    ctx.player.name = name;
    if (canApplyGroupCard()) {
      try { applyCard(ctx); } catch (e) {}
    }
    return replyDone(ctx, msg, `已将角色名改为「${name}」并同步名片。`);
  };

  ext.onCommandReceived = (ctx, msg, cmdArgs) => {
    if (!isAutoOn(ctx)) return;
    const command = cmdArgs.command || '';
    if (command === 'brpst' || command === 'brp' || command === 'st' || command === 'nn') {
      try { applyCard(ctx); } catch (e) {}
    }
  };

  ext.cmdMap.brp = cmdBrp;
  ext.cmdMap.brpst = cmdBrpst;
  ext.cmdMap.snbrp = cmdSnbrp;

  seal.ext.register(ext);
}
