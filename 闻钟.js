// ==UserScript==
// @name        闻钟
// @author      铭茗
// @version     1.1.0
// @description 无需前缀监听触发词，支持文本与正则匹配，命中后引用原消息并@全体成员
// @timestamp   1781654400
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/闻钟.js
// ==/UserScript==

let ext = seal.ext.find('闻钟');
if (!ext) {
  ext = seal.ext.new('闻钟', '铭茗', '1.1.0');
  seal.ext.register(ext);
}

const STORAGE_KEY = 'wenzhong_rules_v1';
const DEFAULT_RULES = [
  { type: 'text', value: '开团' },
  { type: 'text', value: '集合' },
  { type: 'text', value: '全体集合' }
];

function normalizeRule(item) {
  if (!item || typeof item !== 'object') return null;
  const type = item.type === 'regex' ? 'regex' : 'text';
  const value = (item.value || '').toString().trim();
  if (!value) return null;
  return { type, value };
}

function loadRules() {
  try {
    const raw = ext.storageGet(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list)) {
      const normalized = list.map(normalizeRule).filter(Boolean);
      if (normalized.length) {
        const seen = new Set();
        return normalized.filter((item) => {
          const key = `${item.type}:${item.value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_RULES.map((item) => ({ ...item }));
}

function saveRules(list) {
  ext.storageSet(STORAGE_KEY, JSON.stringify(list));
}

function getRules() {
  return loadRules();
}

function quotePrefix(msg) {
  return msg && msg.rawId ? `[CQ:reply,id=${msg.rawId}]` : '';
}

function buildAtAllReply(msg, text) {
  return `${quotePrefix(msg)}[CQ:at,qq=all] ${text}`;
}

function formatRule(item) {
  return item.type === 'regex' ? `regex:${item.value}` : item.value;
}

function parseInputRule(mode, value) {
  const normalizedValue = (value || '').trim();
  if (!normalizedValue) return { error: '规则不能为空' };
  if (mode === 'regex') {
    try {
      new RegExp(normalizedValue);
    } catch (e) {
      return { error: `正则无效：${e.message}` };
    }
    return { rule: { type: 'regex', value: normalizedValue } };
  }
  return { rule: { type: 'text', value: normalizedValue } };
}

function matchRule(text, rules) {
  for (const rule of rules) {
    if (rule.type === 'regex') {
      try {
        if (new RegExp(rule.value).test(text)) {
          return rule;
        }
      } catch (e) {
        // ignore invalid saved rule
      }
      continue;
    }
    if (text.includes(rule.value)) {
      return rule;
    }
  }
  return null;
}

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '闻钟';
cmd.help = [
  '.闻钟 list // 查看规则',
  '.闻钟 add <触发词> // 添加文本触发词',
  '.闻钟 addre <正则> // 添加正则触发词',
  '.闻钟 del <触发词> // 删除文本触发词',
  '.闻钟 delre <正则> // 删除正则触发词',
  '.闻钟 reset // 恢复默认规则'
].join('\n');
cmd.solve = (ctx, msg, cmdArgs) => {
  const sub = (cmdArgs.getArgN(1) || 'list').trim();
  const value = cmdArgs.getRestArgsFrom(2).trim();
  const rules = getRules();

  if (sub === 'list') {
    seal.replyToSender(ctx, msg, `当前规则：${rules.map(formatRule).join(' / ')}`);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === 'add' || sub === 'addre') {
    const mode = sub === 'addre' ? 'regex' : 'text';
    const parsed = parseInputRule(mode, value);
    if (parsed.error) {
      seal.replyToSender(ctx, msg, parsed.error);
      return seal.ext.newCmdExecuteResult(true);
    }
    const rule = parsed.rule;
    const exists = rules.some((item) => item.type === rule.type && item.value === rule.value);
    if (exists) {
      seal.replyToSender(ctx, msg, `规则已存在：${formatRule(rule)}`);
      return seal.ext.newCmdExecuteResult(true);
    }
    rules.push(rule);
    saveRules(rules);
    seal.replyToSender(ctx, msg, `已添加规则：${formatRule(rule)}`);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === 'del' || sub === 'delre') {
    const mode = sub === 'delre' ? 'regex' : 'text';
    const parsed = parseInputRule(mode, value);
    if (parsed.error) {
      seal.replyToSender(ctx, msg, parsed.error);
      return seal.ext.newCmdExecuteResult(true);
    }
    const rule = parsed.rule;
    const next = rules.filter((item) => !(item.type === rule.type && item.value === rule.value));
    if (next.length === rules.length) {
      seal.replyToSender(ctx, msg, `未找到规则：${formatRule(rule)}`);
      return seal.ext.newCmdExecuteResult(true);
    }
    saveRules(next);
    seal.replyToSender(ctx, msg, `已删除规则：${formatRule(rule)}`);
    return seal.ext.newCmdExecuteResult(true);
  }

  if (sub === 'reset') {
    saveRules(DEFAULT_RULES.map((item) => ({ ...item })));
    seal.replyToSender(ctx, msg, `已恢复默认规则：${DEFAULT_RULES.map(formatRule).join(' / ')}`);
    return seal.ext.newCmdExecuteResult(true);
  }

  seal.replyToSender(ctx, msg, cmd.help);
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap[cmd.name] = cmd;

ext.onNotCommandReceived = (ctx, msg) => {
  if (!ctx || !msg || ctx.isPrivate) return;

  const text = (msg.message || '').trim();
  if (!text) return;
  if (/^\[CQ:reply,id=/.test(text)) return;

  const rule = matchRule(text, getRules());
  if (!rule) return;

  seal.replyToSender(
    ctx,
    msg,
    buildAtAllReply(msg, `检测到触发规则「${formatRule(rule)}」\n${text}`)
  );
};
