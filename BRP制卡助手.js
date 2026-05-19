// ==UserScript==
// @name        BRP制卡助手
// @author      铭茗
// @version     1.0.9
// @description BRP：.brp 制卡、.brpst 录卡、.snbrp 改名与自动名片
// @timestamp   1779148800
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/BRP制卡助手.js
// ==/UserScript==

if (!seal.ext.find('BRP制卡助手')) {
  const ext = seal.ext.new('BRP制卡助手', '铭茗', '1.0.9');

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

  function getIntInfo(ctx, key) {
    const ret = seal.vars.intGet(ctx, key);
    if (Array.isArray(ret)) {
      return { value: ret[0] || 0, exists: !!ret[1] };
    }
    return { value: 0, exists: false };
  }

  function getIntValue(ctx, key) {
    return getIntInfo(ctx, key).value;
  }

  function initNewCardState(ctx) {
    const hpMax = Math.floor((getIntValue(ctx, '体质') + getIntValue(ctx, '体型')) / 2);
    if (hpMax > 0) {
      seal.vars.intSet(ctx, '最大生命', hpMax);
      seal.vars.intSet(ctx, '生命', hpMax);
    }

    const ppMax = getIntValue(ctx, '意志');
    if (ppMax > 0) {
      seal.vars.intSet(ctx, '最大能量', ppMax);
      seal.vars.intSet(ctx, '能量', ppMax);
    }
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

  function adjustCurrentValue(ctx, valueKey, maxKey, delta) {
    const curInfo = getIntInfo(ctx, valueKey);
    const maxInfo = getIntInfo(ctx, maxKey);
    const base = curInfo.exists ? curInfo.value : maxInfo.value;
    let next = base + delta;
    if (maxInfo.exists && maxInfo.value > 0 && next > maxInfo.value) next = maxInfo.value;
    if (next < 0) next = 0;
    seal.vars.intSet(ctx, valueKey, next);
    return { before: base, after: next, max: maxInfo.value };
  }

  function getRuleKey(ctx) {
    return `brp_rule:${uid(ctx)}`;
  }

  function getRule(ctx) {
    return ext.storageGet(getRuleKey(ctx)) || 'brp';
  }

  function setRule(ctx, rule) {
    ext.storageSet(getRuleKey(ctx), rule || 'brp');
  }

  function isBrpRule(ctx) {
    return getRule(ctx) === 'brp';
  }

  function getRuleLabel(ctx) {
    const rule = getRule(ctx);
    if (rule === 'coc1') return 'COC1';
    if (rule === 'coc2') return 'COC2';
    if (rule === 'coc3') return 'COC3';
    return 'BRP';
  }

  function refreshGroupCard(ctx) {
    initNewCardState(ctx);
    if (!canApplyGroupCard()) return '';
    return applyCard(ctx);
  }

  function refreshCurrentCardForRule(ctx) {
    if (isBrpRule(ctx)) {
      initNewCardState(ctx);
    }
  }

  function buildRuleStateText(ctx) {
    return `当前房规：${getRuleLabel(ctx)}`;
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

  function displayWidth(text) {
    let width = 0;
    for (const ch of String(text)) {
      width += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1;
    }
    return width;
  }

  function padDisplay(text, size) {
    const s = String(text);
    const need = Math.max(0, size - displayWidth(s));
    return s + ' '.repeat(need);
  }

  function cardToText(card) {
    const n2 = (k) => String(card[k]).padStart(2, ' ');
    const cell = (label, value, width = 12) => padDisplay(`${label}:${value}`, width);
    const cell2 = (label, value, width = 14) => padDisplay(`${label}:${value}`, width);
    return [
      `${cell('力量', n2('力量'))}${cell('体质', n2('体质'))}${cell('体型', n2('体型'))}`,
      `${cell('智力', n2('智力'))}${cell('意志', n2('意志'))}${cell('敏捷', n2('敏捷'))}`,
      `${cell('外貌', n2('外貌'))}${cell('气力', n2('气力'))}${cell('耐力', n2('耐力'))}`,
      `${cell('灵感', n2('灵感'))}${cell('幸运', n2('幸运'))}${cell('灵巧', n2('灵巧'))}`,
      `${cell('魅力', n2('魅力'))}${cell2('生命', `${n2('生命')}/${n2('最大生命')}`)}${cell2('能量', `${n2('能量')}/${n2('最大能量')}`)}`
    ].join('\n');
  }

  function formatOneCard(ctx, card) {
    seal.vars.strSet(ctx, '$t制卡内容', cardToText(card));
    return cardToText(card);
  }

  function formatCards(ctx, cards) {
    seal.vars.strSet(ctx, '$t制卡结果文本', cards.map((c) => formatOneCard(ctx, c)).join(seal.formatTmpl(ctx, 'COC:制卡_分隔符')));
    seal.vars.strSet(ctx, '$t玩家', ctx.player && ctx.player.name ? ctx.player.name : '角色');
    return seal.formatTmpl(ctx, 'COC:制卡');
  }

  const cmdSetbrp = seal.ext.newCmdItemInfo();
  cmdSetbrp.name = 'setbrp';
  cmdSetbrp.help = '.setbrp\n切换到 BRP 房规';
  cmdSetbrp.solve = (ctx, msg) => {
    setRule(ctx, 'brp');
    return replyDone(ctx, msg, '已切换为 BRP 房规。');
  };
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

    seal.vars.strSet(ctx, '$t玩家', ctx.player && ctx.player.name ? ctx.player.name : '角色');
    const text = formatCards(ctx, cards);
    return replyDone(ctx, msg, text);
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

  const cmdStbrp = seal.ext.newCmdItemInfo();
  cmdStbrp.name = 'stbrp';
  cmdStbrp.help = '.stbrp hp +1 / .stbrp pp -1\n调整当前生命或能量';
  cmdStbrp.solve = (ctx, msg, cmdArgs) => {
    const attr = (cmdArgs.getArgN(1) || '').trim().toLowerCase();
    const deltaRaw = (cmdArgs.getArgN(2) || '').trim();
    const delta = parseInt(deltaRaw, 10);

    if (!attr || Number.isNaN(delta)) {
      return replyDone(ctx, msg, '用法：.stbrp hp +1 / .stbrp pp -1');
    }

    if (attr === 'hp' || attr === '生命') {
      const ret = adjustCurrentValue(ctx, '生命', '最大生命', delta);
      if (isAutoOn(ctx)) {
        try { applyCard(ctx); } catch (e) {}
      }
      return replyDone(ctx, msg, `生命 ${ret.before} -> ${ret.after}${ret.max > 0 ? ` / ${ret.max}` : ''}`);
    }

    if (attr === 'pp' || attr === '能量') {
      const ret = adjustCurrentValue(ctx, '能量', '最大能量', delta);
      if (isAutoOn(ctx)) {
        try { applyCard(ctx); } catch (e) {}
      }
      return replyDone(ctx, msg, `能量 ${ret.before} -> ${ret.after}${ret.max > 0 ? ` / ${ret.max}` : ''}`);
    }

    return replyDone(ctx, msg, '仅支持 hp / pp。');
  };

  const cmdSnbrp = seal.ext.newCmdItemInfo();
  cmdSnbrp.name = 'snbrp';
  cmdSnbrp.help = '.snbrp <名字>\n改角色名并同步群名片\n.snbrp\n立即同步群名片\n.snbrp auto / .snbrp auto off\n开启/关闭自动名片\n.snbrp tmpl <模板>\n设置名片模板';
  cmdSnbrp.solve = (ctx, msg, cmdArgs) => {
    const a1 = (cmdArgs.getArgN(1) || '').trim();

    if (!a1) {
      if (isBrpRule(ctx)) {
        initNewCardState(ctx);
      }
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
    initNewCardState(ctx);
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

  ext.cmdMap.setbrp = cmdSetbrp;
  ext.cmdMap.brp = cmdBrp;
  ext.cmdMap.brpst = cmdBrpst;
  ext.cmdMap.stbrp = cmdStbrp;
  ext.cmdMap.snbrp = cmdSnbrp;

  seal.ext.register(ext);
}
