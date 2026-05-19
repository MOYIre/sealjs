// ==UserScript==
// @name        BRP制卡助手
// @author      Qwen
// @version     1.0.0
// @description 为 COC/BRP 提供 .brp / .brpst / .snbrp 命令，并实时同步群名片
// @timestamp   1779148800
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/BRP制卡助手.js
// ==/UserScript==

if (!seal.ext.find('BRP制卡助手')) {
  const ext = seal.ext.new('BRP制卡助手', 'Qwen', '1.0.0');

  const STORAGE_TEMPLATE_KEY = 'brp_auto_template';
  const DEFAULT_TEMPLATE = '{$t玩家_RAW}';

  function getTemplate() {
    const saved = ext.storageGet(STORAGE_TEMPLATE_KEY);
    return saved || DEFAULT_TEMPLATE;
  }

  function setTemplate(tmpl) {
    ext.storageSet(STORAGE_TEMPLATE_KEY, tmpl || DEFAULT_TEMPLATE);
  }

  function setAutoTemplate(ctx, tmpl) {
    const finalTemplate = tmpl || getTemplate();
    ctx.player.autoSetNameTemplate = finalTemplate;
    return seal.applyPlayerGroupCardByTemplate(ctx, finalTemplate);
  }

  function forwardBuiltinCommand(ctx, msg, commandText) {
    const targetMsg = seal.newMessage();
    targetMsg.message = commandText;
    targetMsg.messageType = msg.messageType;
    targetMsg.groupId = msg.groupId;
    targetMsg.guildId = msg.guildId;
    targetMsg.platform = msg.platform;
    targetMsg.time = Date.now();
    targetMsg.sender = msg.sender;
    targetMsg.rawId = msg.rawId;

    const exts = seal.ext.getAll();
    for (const item of exts) {
      if (!item || !item.cmdMap) continue;
      const map = item.cmdMap;
      const cmdName = commandText.startsWith('.') ? commandText.slice(1).split(/\s+/)[0] : commandText.split(/\s+/)[0];
      const cmd = map[cmdName];
      if (cmd && typeof cmd.solve === 'function') {
        const tempCtx = seal.createTempCtx(ctx.endPoint, targetMsg);
        tempCtx.player = ctx.player;
        tempCtx.group = ctx.group;
        const args = {
          command: cmdName,
          args: commandText.replace(/^\./, '').split(/\s+/).slice(1),
          rawArgs: commandText.replace(/^\./, '').split(/\s+/).slice(1).join(' '),
          kwargs: [],
          at: [],
          amIBeMentioned: false,
          amIBeMentionedFirst: false,
          cleanArgs: commandText.replace(/^\./, '').split(/\s+/).slice(1).join(' '),
          getArgN(n) { return this.args[n - 1] || ''; },
          getRestArgsFrom(n) { return this.args.slice(Math.max(0, n - 1)).join(' '); },
          getKwarg() { return { name: '', valueExists: false, value: '', asBool: false }; },
          chopPrefixToArgsWith() { return false; },
          eatPrefixWith() { return ['', false]; },
          isArgEqual(n, ...s) { return s.includes(this.getArgN(n)); }
        };
        return cmd.solve(tempCtx, targetMsg, args);
      }
    }
    return null;
  }

  function replyAndDone(ctx, msg, text) {
    seal.replyToSender(ctx, msg, text);
    return seal.ext.newCmdExecuteResult(true);
  }

  const cmdBrp = seal.ext.newCmdItemInfo();
  cmdBrp.name = 'brp';
  cmdBrp.help = '.brp[数字]\n等价于 .coc[数字] 的制卡命令';
  cmdBrp.solve = (ctx, msg, cmdArgs) => {
    const suffix = (cmdArgs.command || 'brp').slice(3);
    const rest = cmdArgs.getRestArgsFrom(1);
    const target = `.coc${suffix}${rest ? ` ${rest}` : ''}`;
    const result = forwardBuiltinCommand(ctx, msg, target);
    if (!result) {
      return replyAndDone(ctx, msg, '未找到可转发的 .coc 命令，当前环境暂无法执行 .brp');
    }
    return seal.ext.newCmdExecuteResult(true);
  };

  const cmdBrpst = seal.ext.newCmdItemInfo();
  cmdBrpst.name = 'brpst';
  cmdBrpst.help = '.brpst ...\n等价于 .st ... 的录卡命令';
  cmdBrpst.solve = (ctx, msg, cmdArgs) => {
    const rest = cmdArgs.getRestArgsFrom(1);
    const target = `.st${rest ? ` ${rest}` : ''}`;
    const result = forwardBuiltinCommand(ctx, msg, target);
    if (!result) {
      return replyAndDone(ctx, msg, '未找到可转发的 .st 命令，当前环境暂无法执行 .brpst');
    }
    const tmpl = ctx.player.autoSetNameTemplate || getTemplate();
    try {
      seal.applyPlayerGroupCardByTemplate(ctx, tmpl);
    } catch (e) {}
    return seal.ext.newCmdExecuteResult(true);
  };

  const cmdSnbrp = seal.ext.newCmdItemInfo();
  cmdSnbrp.name = 'snbrp';
  cmdSnbrp.help = '.snbrp <名字>\n修改当前角色名，并像 sncoc 一样实时同步群名片\n.snbrp\n将群名片同步为当前角色名\n.snbrp tmpl <模板>\n设置实时同步使用的群名片模板';
  cmdSnbrp.solve = (ctx, msg, cmdArgs) => {
    const sub = cmdArgs.getArgN(1);
    if (!sub) {
      const applied = setAutoTemplate(ctx, ctx.player.autoSetNameTemplate || getTemplate());
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
        return replyAndDone(ctx, msg, `当前模板：${ctx.player.autoSetNameTemplate || getTemplate()}`);
      }
      setTemplate(tmpl);
      const applied = setAutoTemplate(ctx, tmpl);
      return replyAndDone(ctx, msg, `已设置实时同步模板为：${tmpl}\n当前群名片：${applied || ctx.player.name}`);
    }

    const name = cmdArgs.getRestArgsFrom(1).trim();
    if (!name) {
      return replyAndDone(ctx, msg, '用法：.snbrp <名字>');
    }

    ctx.player.name = name;
    const applied = setAutoTemplate(ctx, ctx.player.autoSetNameTemplate || getTemplate());
    return replyAndDone(ctx, msg, `已将当前角色名改为「${name}」并同步群名片${applied ? `：${applied}` : ''}`);
  };

  ext.onCommandReceived = (ctx, msg, cmdArgs) => {
    const command = cmdArgs.command || '';
    if (command === 'st' || command === 'nn' || command === 'pc' || command.startsWith('coc')) {
      const tmpl = ctx.player && ctx.player.autoSetNameTemplate;
      if (tmpl) {
        try {
          seal.applyPlayerGroupCardByTemplate(ctx, tmpl);
        } catch (e) {}
      }
    }
  };

  ext.cmdMap.brp = cmdBrp;
  ext.cmdMap.brpst = cmdBrpst;
  ext.cmdMap.snbrp = cmdSnbrp;

  seal.ext.register(ext);
}
