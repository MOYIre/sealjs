// ==UserScript==
// @name        BRP制卡助手
// @author      Qwen
// @version     1.0.2
// @description 为 COC/BRP 提供 .brp / .brpst / .snbrp 命令，并实时同步群名片
// @timestamp   1779148800
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/BRP制卡助手.js
// ==/UserScript==

if (!seal.ext.find('BRP制卡助手')) {
  const ext = seal.ext.new('BRP制卡助手', 'Qwen', '1.0.2');

  const TEMPLATE_PREFIX = 'brp_auto_template:';
  const DEFAULT_TEMPLATE = '{$t玩家_RAW}';

  function getTemplateKey(ctx) {
    const uid = ctx && ctx.player && ctx.player.userId ? ctx.player.userId : 'default';
    return `${TEMPLATE_PREFIX}${uid}`;
  }

  function getTemplate(ctx) {
    const saved = ext.storageGet(getTemplateKey(ctx));
    return saved || DEFAULT_TEMPLATE;
  }

  function setTemplate(ctx, tmpl) {
    ext.storageSet(getTemplateKey(ctx), tmpl || DEFAULT_TEMPLATE);
  }

  function canApplyGroupCard() {
    return typeof seal.applyPlayerGroupCardByTemplate === 'function';
  }

  function applyRealtimeTemplate(ctx, tmpl) {
    const finalTemplate = tmpl || getTemplate(ctx);
    ctx.player.autoSetNameTemplate = finalTemplate;
    if (!canApplyGroupCard()) return ctx.player.name || '';
    return seal.applyPlayerGroupCardByTemplate(ctx, finalTemplate);
  }

  function buildProxyArgs(commandText) {
    const body = commandText.replace(/^\./, '');
    const parts = body.split(/\s+/).filter(Boolean);
    return {
      command: parts[0] || '',
      args: parts.slice(1),
      rawArgs: parts.slice(1).join(' '),
      kwargs: [],
      at: [],
      amIBeMentioned: false,
      amIBeMentionedFirst: false,
      cleanArgs: parts.slice(1).join(' '),
      getArgN(n) { return this.args[n - 1] || ''; },
      getRestArgsFrom(n) { return this.args.slice(Math.max(0, n - 1)).join(' '); },
      getKwarg() { return { name: '', valueExists: false, value: '', asBool: false }; },
      chopPrefixToArgsWith(...prefixes) {
        const first = this.getArgN(1);
        if (!first) return false;
        for (const prefix of prefixes) {
          if (first.startsWith(prefix)) {
            this.args[0] = first.slice(prefix.length);
            return true;
          }
        }
        return false;
      },
      eatPrefixWith(...prefixes) {
        const first = this.getArgN(1);
        if (!first) return ['', false];
        for (const prefix of prefixes) {
          if (first.startsWith(prefix)) {
            const val = `${first.slice(prefix.length)} ${this.args.slice(1).join(' ')}`.trim();
            return [val, true];
          }
        }
        return ['', false];
      },
      isArgEqual(n, ...s) { return s.includes(this.getArgN(n)); }
    };
  }

  function buildForwardContext(ctx, msg, commandText) {
    if (typeof seal.createTempCtx !== 'function' || typeof seal.newMessage !== 'function') {
      return null;
    }

    const targetMsg = seal.newMessage();
    targetMsg.message = commandText;
    targetMsg.messageType = msg.messageType;
    targetMsg.groupId = msg.groupId;
    targetMsg.guildId = msg.guildId;
    targetMsg.platform = msg.platform;
    targetMsg.time = Date.now();
    targetMsg.sender = msg.sender;
    targetMsg.rawId = msg.rawId;

    const tempCtx = seal.createTempCtx(ctx.endPoint, targetMsg);
    tempCtx.player = ctx.player;
    tempCtx.group = ctx.group;
    tempCtx.isPrivate = ctx.isPrivate;
    tempCtx.endPoint = ctx.endPoint;
    tempCtx.session = ctx.session;
    return { tempCtx, targetMsg, args: buildProxyArgs(commandText) };
  }

  function findBuiltinCmd(extName, cmdName) {
    const targetExt = seal.ext.find(extName);
    if (!targetExt || !targetExt.cmdMap) return null;
    return targetExt.cmdMap[cmdName] || null;
  }

  function forwardBuiltinCommand(ctx, msg, commandText, extName, cmdName) {
    const cmd = findBuiltinCmd(extName, cmdName);
    if (!cmd || typeof cmd.solve !== 'function') return null;
    const forwarded = buildForwardContext(ctx, msg, commandText);
    if (!forwarded) return null;
    return cmd.solve(forwarded.tempCtx, forwarded.targetMsg, forwarded.args);
  }

  function replyAndDone(ctx, msg, text) {
    seal.replyToSender(ctx, msg, text);
    return seal.ext.newCmdExecuteResult(true);
  }

  function syncGroupCardIfNeeded(ctx, msg) {
    const tmpl = (ctx.player && ctx.player.autoSetNameTemplate) || getTemplate(ctx);
    if (!tmpl || !canApplyGroupCard()) return;
    try {
      applyRealtimeTemplate(ctx, tmpl);
    } catch (e) {
      seal.replyToSender(ctx, msg, '已完成操作，但同步群名片失败，请检查骰子权限或平台支持');
    }
  }

  const cmdBrp = seal.ext.newCmdItemInfo();
  cmdBrp.name = 'brp';
  cmdBrp.help = '.brp[数字]\n等价于 .coc[数字] 的制卡命令';
  cmdBrp.solve = (ctx, msg, cmdArgs) => {
    const suffix = (cmdArgs.command || 'brp').slice(3);
    const rest = cmdArgs.getRestArgsFrom(1);
    const target = `.coc${suffix}${rest ? ` ${rest}` : ''}`;
    const result = forwardBuiltinCommand(ctx, msg, target, 'coc7', 'coc');
    if (!result) {
      return replyAndDone(ctx, msg, '未找到内建 .coc 命令，当前环境暂无法执行 .brp');
    }
    syncGroupCardIfNeeded(ctx, msg);
    return result;
  };

  const cmdBrpst = seal.ext.newCmdItemInfo();
  cmdBrpst.name = 'brpst';
  cmdBrpst.help = '.brpst ...\n等价于 .st ... 的录卡命令';
  cmdBrpst.solve = (ctx, msg, cmdArgs) => {
    const rest = cmdArgs.getRestArgsFrom(1);
    const target = `.st${rest ? ` ${rest}` : ''}`;
    const result = forwardBuiltinCommand(ctx, msg, target, 'coc7', 'st');
    if (!result) {
      return replyAndDone(ctx, msg, '未找到内建 .st 命令，当前环境暂无法执行 .brpst');
    }
    syncGroupCardIfNeeded(ctx, msg);
    return result;
  };

  const cmdSnbrp = seal.ext.newCmdItemInfo();
  cmdSnbrp.name = 'snbrp';
  cmdSnbrp.help = '.snbrp <名字>\n修改当前角色名，并像 sncoc 一样实时同步群名片\n.snbrp\n将群名片同步为当前角色名\n.snbrp tmpl <模板>\n设置实时同步使用的群名片模板';
  cmdSnbrp.solve = (ctx, msg, cmdArgs) => {
    const sub = cmdArgs.getArgN(1);
    if (!sub) {
      if (!canApplyGroupCard()) {
        return replyAndDone(ctx, msg, '当前环境不支持自动同步群名片');
      }
      const applied = applyRealtimeTemplate(ctx, (ctx.player && ctx.player.autoSetNameTemplate) || getTemplate(ctx));
      return replyAndDone(ctx, msg, `已同步群名片：${applied || ctx.player.name}`);
    }

    if (sub === 'help') {
      const ret = seal.ext.newCmdExecuteResult(true);
      ret.showHelp = true;
      return ret;
    }

    if (sub === 'tmpl' || sub === 'template') {
      const tmpl = cmdArgs.getRestArgsFrom(2).trim();
      if (!tmpl) {
        return replyAndDone(ctx, msg, `当前模板：${(ctx.player && ctx.player.autoSetNameTemplate) || getTemplate(ctx)}`);
      }
      setTemplate(ctx, tmpl);
      const applied = applyRealtimeTemplate(ctx, tmpl);
      return replyAndDone(ctx, msg, `已设置实时同步模板为：${tmpl}\n当前群名片：${applied || ctx.player.name}`);
    }

    const name = cmdArgs.getRestArgsFrom(1).trim();
    if (!name) {
      return replyAndDone(ctx, msg, '用法：.snbrp <名字>');
    }

    ctx.player.name = name;
    const applied = applyRealtimeTemplate(ctx, (ctx.player && ctx.player.autoSetNameTemplate) || getTemplate(ctx));
    return replyAndDone(ctx, msg, `已将当前角色名改为「${name}」并同步群名片${applied ? `：${applied}` : ''}`);
  };

  ext.onCommandReceived = (ctx, msg, cmdArgs) => {
    const command = cmdArgs.command || '';
    if (command === 'st' || command === 'nn' || command === 'pc' || command === 'coc' || command.startsWith('coc')) {
      syncGroupCardIfNeeded(ctx, msg);
    }
  };

  ext.cmdMap.brp = cmdBrp;
  ext.cmdMap.brpst = cmdBrpst;
  ext.cmdMap.snbrp = cmdSnbrp;

  seal.ext.register(ext);
}
