// ==UserScript==
// @name        万物有灵
// @author      铭茗
// @version     4.3.52
// @description 宠物核心：捕捉、培养、对战、育种、进化、仓库。如有问题请联系铭茗QQ:3029590078
// @timestamp   1777276347
// @license     Apache-2
// @updateUrl   https://fastly.jsdelivr.net/gh/MOYIre/sealjs@main/万物有灵.js
// ==/UserScript==
//如果你打开了代码就会看到我！有任何问题请及时拷打铭茗:3029590078，欢迎交流与讨论
let ext = seal.ext.find('万物有灵');
if (!ext) {
  ext = seal.ext.new('万物有灵', '铭茗', '4.3.52');
  seal.ext.register(ext);
}

/**
 * WebUI 上报模块
 * 支持数据同步到 WebUI 后端、Mod 安装管理
 */
const WebUIReporter = {
  config: {
    endpoint: '',
    token: '',
    enabled: false,
    reportInterval: 60000,
    patchCheckInterval: 600000,
    remoteAdminEnabled: false,
    remoteAdminAllowedTypes: ['UPDATE_MAP_TOPOLOGY'],
  },
  _queue: [],
  _timer: null,
  _installedMods: null,
  _lastPatchDigest: '',
  _lastPatchCheckAt: 0,
  _isSyncingCompensations: false,
  _compAcked: null,
  _adminCmdExecuted: null,

  init(options = {}) {
    this.config = { ...this.config, ...options };
    if (this.config.enabled && this.config.endpoint) {
      this._startPeriodicReport();
      this._loadInstalledMods();
      this._loadCompAcked();
      console.log('[WebUI Reporter] 已启用，端点:', this.config.endpoint);
    }
  },

  _loadInstalledMods() {
    try {
      const saved = ext.storageGet('webui_installed_mods');
      this._installedMods = saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('[WebUI Reporter] 加载已安装 Mod 失败:', e.message);
      this._installedMods = [];
    }
  },

  _saveInstalledMods() {
    try {
      ext.storageSet('webui_installed_mods', JSON.stringify(this._installedMods || []));
    } catch (e) {
      console.error('[WebUI Reporter] 保存已安装 Mod 失败:', e);
    }
  },

  _loadCompAcked() {
    if (this._compAcked) return this._compAcked;
    try {
      const saved = ext.storageGet('webui_comp_acked');
      const parsed = saved ? JSON.parse(saved) : {};
      this._compAcked = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      this._compAcked = {};
    }
    return this._compAcked;
  },

  _saveCompAcked() {
    try {
      ext.storageSet('webui_comp_acked', JSON.stringify(this._compAcked || {}));
      return true;
    } catch (e) {
      console.error('[WebUI Reporter] 保存补偿幂等缓存失败:', e);
      return false;
    }
  },

  _loadAdminCmdExecuted() {
    if (this._adminCmdExecuted) return this._adminCmdExecuted;
    try {
      const saved = ext.storageGet('webui_admin_cmd_executed');
      const parsed = saved ? JSON.parse(saved) : {};
      this._adminCmdExecuted = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      this._adminCmdExecuted = {};
    }
    return this._adminCmdExecuted;
  },

  _saveAdminCmdExecuted() {
    try {
      const entries = Object.entries(this._adminCmdExecuted || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 200);
      ext.storageSet('webui_admin_cmd_executed', JSON.stringify(Object.fromEntries(entries)));
      return true;
    } catch (e) {
      console.error('[WebUI Reporter] 保存管理指令防重放缓存失败:', e);
      return false;
    }
  },

  _markAdminCmdExecuted(cmdId) {
    const cache = this._loadAdminCmdExecuted();
    cache[cmdId] = Date.now();
    this._saveAdminCmdExecuted();
  },

  _isAdminCmdExecuted(cmdId) {
    const cache = this._loadAdminCmdExecuted();
    return Boolean(cache[cmdId]);
  },

  reportBattleLog(log) {
    if (!this.config.enabled || !this.config.endpoint) return;

    const lines = Array.isArray(log.logs)
      ? log.logs.filter(line => typeof line === 'string')
      : [];

    this._queue.push({
      type: 'battle_log',
      timestamp: Date.now(),
      data: {
        id: log.id || `battle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        zone: log.zone || '未知',
        actor: log.actor || '',
        target: log.target || '',
        result: log.result || '',
        turns: log.turns || 0,
        rounds: log.rounds || log.turns || 0,
        damage: log.damage || 0,
        rewards: log.rewards || [],
        tags: log.tags || [],
        logs: lines,
        logText: typeof log.logText === 'string' ? log.logText : lines.join('\n'),
      }
    });
    if (this._queue.length >= 50) void this._flush();  // 异步刷新，不阻塞
  },

  reportPlayerData(uid, summary) {
    if (!this.config.enabled || !this.config.endpoint) return;
    this._queue.push({
      type: 'player_data',
      timestamp: Date.now(),
      uid,
      data: summary
    });
  },

  reportGeneric(type, data, uid = '') {
    if (!this.config.enabled || !this.config.endpoint) return;
    this._queue.push({
      type,
      timestamp: Date.now(),
      uid,
      data
    });
  },

  buildPlayerSummary(uid, data) {
    const pets = Array.isArray(data?.pets) ? data.pets : [];
    const storage = Array.isArray(data?.storage) ? data.storage : [];
    const allPets = pets.concat(storage);
    const topPet = allPets.slice().sort((a, b) => {
      const bp = (b?.level || 1) * ((b?.atk || 0) + (b?.def || 0) + (b?.maxHp || b?.hp || 0));
      const ap = (a?.level || 1) * ((a?.atk || 0) + (a?.def || 0) + (a?.maxHp || a?.hp || 0));
      return bp - ap;
    })[0] || null;
    return {
      uid,
      name: (typeof DB !== 'undefined' && DB.getName ? DB.getName(uid) : '') || String(uid || '').replace('QQ:', ''),
      level: Number(data?.player?.level || 1),
      money: Number(data?.money || 0),
      petCount: allPets.length,
      guildId: data?.guild || '',
      riskScore: 0,
      player: data?.player || {},
      pets,
      storage,
      topPet: topPet ? {
        id: topPet.id || '',
        name: topPet.name || '',
        level: Number(topPet.level || 1),
        rarity: topPet.rarity || '',
        element: topPet.element || '',
        hp: Number(topPet.hp || 0),
        maxHp: Number(topPet.maxHp || topPet.hp || 0),
        atk: Number(topPet.atk || 0),
        def: Number(topPet.def || 0),
      } : null,
      updatedAt: Date.now(),
    };
  },

  reportPlayerSnapshot(uid, data) {
    this.reportPlayerData(uid, this.buildPlayerSummary(uid, data));
  },

  reportMapTopology() {
    if (!this.config.enabled || !this.config.endpoint) return;
    const mapTopology = { nodes: [], edges: [] };
    
    // 遍历 REGIONS 生成节点和物理连线
    Object.entries(REGIONS).forEach(([id, data]) => {
      mapTopology.nodes.push({
        id: `region_${id}`,
        type: 'region',
        label: data.name,
        position: { x: data.ui?.x || 0, y: data.ui?.y || 0 },
        data: data
      });
      
      (data.connections || []).forEach(targetId => {
        mapTopology.edges.push({
          id: `edge_${id}_${targetId}`,
          source: `region_${id}`,
          target: `region_${targetId}`,
          type: 'path'
        });
      });
    });

    // 遍历 TOWNS 生成节点和从属连线
    Object.entries(TOWNS).forEach(([id, data]) => {
      mapTopology.nodes.push({
        id: `town_${id}`,
        type: 'town',
        label: data.name,
        position: { x: data.ui?.x || 0, y: data.ui?.y || 0 },
        data: data
      });
      
      mapTopology.edges.push({
        id: `edge_${id}_${data.region}`,
        source: `town_${id}`,
        target: `region_${data.region}`,
        type: 'hierarchy' 
      });
    });

    this.reportGeneric('map_topology', mapTopology);
  },

  _loadAnnouncementSeen() {
    try {
      const saved = ext.storageGet('webui_announcement_seen');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  },

  _saveAnnouncementSeen(ids) {
    try {
      ext.storageSet('webui_announcement_seen', JSON.stringify(Array.isArray(ids) ? ids.slice(0, 100) : []));
      return true;
    } catch (e) {
      console.error('[WebUI Reporter] 保存公告已读缓存失败:', e);
      return false;
    }
  },

  async fetchAnnouncements() {
    if (!this.config.enabled || !this.config.endpoint) return [];
    try {
      const res = await fetch(`${this.config.endpoint}/api/announcement`, {
        headers: { 'Authorization': `Bearer ${this.config.token}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.data) ? data.data : [];
    } catch (e) {
      console.error('[WebUI Reporter] 拉取公告失败:', e);
      return [];
    }
  },

  formatAnnouncementList(list, onlyUnread = false) {
    const seen = new Set(this._loadAnnouncementSeen());
    const rows = (Array.isArray(list) ? list : [])
      .filter(item => item && typeof item === 'object')
      .filter(item => !onlyUnread || !seen.has(String(item.id || item.title || '')))
      .slice(0, 5);

    if (!rows.length) return onlyUnread ? '【WebUI公告】\n暂无未读公告' : '【WebUI公告】\n暂无公告';

    const lines = [onlyUnread ? '【WebUI未读公告】' : '【WebUI公告】', ''];
    for (const item of rows) {
      const badge = item.badge ? `【${item.badge}】` : '';
      const body = String(item.body || '').trim();
      lines.push(`${badge}${item.title || '未命名公告'}`);
      if (body) lines.push(body.length > 120 ? `${body.slice(0, 120)}...` : body);
      lines.push('');
    }
    lines.push('查看: .宠物 webui 公告（查看后自动标记已读）');
    lines.push('仅看未读: .宠物 webui 公告 未读');
    return lines.join('\n');
  },

  async syncAnnouncements(options = {}) {
    if (!this.config.enabled || !this.config.endpoint) return { total: 0, unread: [], announcements: [] };
    const announcements = await this.fetchAnnouncements();
    const seenIds = this._loadAnnouncementSeen();
    const seen = new Set(seenIds);
    const unread = announcements.filter(item => {
      const id = String(item?.id || item?.title || '');
      return id && !seen.has(id);
    });

    if (options.markRead) {
      const next = announcements
        .map(item => String(item?.id || item?.title || ''))
        .filter(Boolean)
        .concat(seenIds);
      this._saveAnnouncementSeen([...new Set(next)]);
    }

    if (announcements.length) {
      this.reportGeneric('announcement_read', {
        total: announcements.length,
        unread: unread.length,
        latestId: announcements[0]?.id || '',
        latestTitle: announcements[0]?.title || '',
      });
    }

    return { total: announcements.length, unread, announcements };
  },

  async _flush() {
    if (this._isFlushing || this._queue.length === 0) return;
    this._isFlushing = true;
    const batch = this._queue.splice(0, Math.min(this._queue.length, 100));
    try {
      // 兼容不支持 new URL() 的旧版引擎，直接通过简单正则验证 http(s)
      if (!/^https?:\/\//.test(this.config.endpoint)) {
        console.error('[WebUI Reporter] endpoint 格式无效，必须以 http:// 或 https:// 开头:', this.config.endpoint);
        // 端点无效时丢弃数据，避免队列无限增长
        return;
      }
      const res = await fetch(`${this.config.endpoint}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ batch, source: 'wanwu_plugin', version: '4.3.52' })
      });
      if (!res.ok) {
        console.error('[WebUI Reporter] 上报失败:', res.status);
        if (this._queue.length < 1000) this._queue.unshift(...batch);
      }
    } catch (e) {
      console.error('[WebUI Reporter] 上报异常:', e);
      if (this._queue.length < 1000) this._queue.unshift(...batch);
    } finally {
      this._isFlushing = false;
    }
  },

  _startPeriodicReport() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(async () => {
      if (this._queue.length > 0) {
        try {
          await this._flush();
        } catch (e) {
          console.error('[WebUI Reporter] 定时上报失败:', e);
        }
      }

      try {
        await this._autoSyncPatches();
      } catch (e) {
        console.error('[WebUI Reporter] 自动检查补丁失败:', e);
      }

      try {
        await this.syncCompensations();
      } catch (e) {
        console.error('[WebUI Reporter] 自动同步补偿失败:', e);
      }

      try {
        if (this.config.remoteAdminEnabled) {
          await this.syncAdminCommands();
        }
      } catch (e) {
        console.error('[WebUI Reporter] 自动同步管理指令失败:', e);
      }

      try {
        const ret = await this.syncAnnouncements();
        if (ret.unread.length) {
          console.log(`[WebUI Reporter] 有 ${ret.unread.length} 条未读公告，请使用 .宠物 webui 公告 查看`);
        }
      } catch (e) {
        console.error('[WebUI Reporter] 自动同步公告失败:', e);
      }

      // 定期上报地图拓扑（3分钟一次，或者按需）
      this._mapReportTicks = (this._mapReportTicks || 0) + 1;
      if (this._mapReportTicks >= 3) {
        this.reportMapTopology();
        this._mapReportTicks = 0;
      }
    }, this.config.reportInterval);
  },

  _buildPatchDigest(patches = []) {
    return patches
      .map((p) => `${p.id || ''}:${p.updatedAt || p.publishedAt || ''}:${p.status || ''}`)
      .sort()
      .join('|');
  },

  async _autoSyncPatches() {
    const now = Date.now();
    if (!this.config.enabled || !this.config.endpoint) return;
    if (now - this._lastPatchCheckAt < this.config.patchCheckInterval) return;
    this._lastPatchCheckAt = now;

    // 先走轻量 meta 比对，避免每次都拉取完整 payload
    const patchMeta = await this.fetchPatchMeta();
    const digest = this._buildPatchDigest(patchMeta);

    // 没有变化就不拉取完整补丁
    if (digest === this._lastPatchDigest) return;
    this._lastPatchDigest = digest;

    // 有变化才拉取完整补丁并应用
    const patches = await this.fetchPatches();

    if (!patches.length) {
      console.log('[WebUI Reporter] 补丁状态有变化，当前无生效补丁');
      return;
    }

    let applied = 0;
    for (const patch of patches) {
      const ok = this.applyPatch(patch);
      if (ok) applied++;
    }

    if (applied > 0) {
      console.log(`[WebUI Reporter] 自动应用补丁 ${applied}/${patches.length} 个`);
    }
  },

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  async fetchMods() {
    if (!this.config.enabled || !this.config.endpoint) return [];
    try {
      const res = await fetch(`${this.config.endpoint}/api/mods`, {
        headers: { 'Authorization': `Bearer ${this.config.token}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.mods || [];
    } catch (e) {
      console.error('[WebUI Reporter] 拉取 Mod 失败:', e);
      return [];
    }
  },

  async installMod(modId) {
    if (!this.config.enabled || !this.config.endpoint) return { ok: false, error: '未启用' };
    try {
      const res = await fetch(`${this.config.endpoint}/api/mods/${modId}`, {
        headers: { 'Authorization': `Bearer ${this.config.token}` }
      });
      if (!res.ok) return { ok: false, error: '获取失败' };
      const mod = await res.json();
      if (mod.type === 'script') {
        return { ok: false, error: '远程脚本 Mod 已禁用，请改用声明式配置/补丁' };
      }

      if (mod.type !== 'config') {
        return { ok: false, error: '不支持的 Mod 类型' };
      }

      if (!mod.configType && !mod.data) {
        return { ok: false, error: '配置 Mod 缺少声明式配置内容' };
      }

      if (!this._installedMods) this._loadInstalledMods();
      if (!this._installedMods.includes(modId)) {
        this._installedMods.push(modId);
        this._saveInstalledMods();
      }
      return { ok: true, name: mod.name };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  uninstallMod(modId) {
    if (!this._installedMods) this._loadInstalledMods();
    const idx = this._installedMods.indexOf(modId);
    if (idx > -1) {
      this._installedMods.splice(idx, 1);
      this._saveInstalledMods();
      return { ok: true, removed: true };
    }
    return { ok: true, removed: false };
  },

  getInstalledMods() {
    if (!this._installedMods) this._loadInstalledMods();
    return this._installedMods || [];
  },

  async reportModStatus(modId, action, success) {
    if (!this.config.enabled || !this.config.endpoint) return { ok: false, error: '未启用' };
    try {
      const res = await fetch(`${this.config.endpoint}/api/mods/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ modId, action, success, timestamp: Date.now() }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: !!data.success, error: data.error || '' };
    } catch (e) {
      console.error('[WebUI Reporter] 上报 Mod 状态失败:', e);
      return { ok: false, error: e.message };
    }
  },

  async fetchPatchMeta() {
    if (!this.config.enabled || !this.config.endpoint) return [];
    try {
      const res = await fetch(`${this.config.endpoint}/api/patch/meta`, {
        headers: { 'Authorization': `Bearer ${this.config.token}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    } catch (e) {
      return [];
    }
  },

  async fetchPatches() {
    if (!this.config.enabled || !this.config.endpoint) return [];
    try {
      const res = await fetch(`${this.config.endpoint}/api/patch`, {
        headers: { 'Authorization': `Bearer ${this.config.token}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).filter(p => p.status === '生效中');
    } catch (e) {
      return [];
    }
  },

  async fetchPendingCompensations(limit = 20) {
    if (!this.config.enabled || !this.config.endpoint) return [];
    try {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
      const res = await fetch(`${this.config.endpoint}/api/compensation/pending?limit=${safeLimit}`, {
        headers: { 'Authorization': `Bearer ${this.config.token}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.data) ? data.data : [];
    } catch (e) {
      console.error('[WebUI Reporter] 拉取补偿失败:', e);
      return [];
    }
  },

  async ackCompensation(idemKey, payload) {
    if (!this.config.enabled || !this.config.endpoint) return false;
    try {
      const res = await fetch(`${this.config.endpoint}/api/compensation/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ idemKey, ...payload }),
      });
      return res.ok;
    } catch (e) {
      console.error('[WebUI Reporter] 回执补偿失败:', e);
      return false;
    }
  },

  resolveCompensationTargets(item) {
    const channel = String(item?.channel || '').trim();
    const uid = String(item?.uid || '').trim();
    const explicit = Array.isArray(item?.targetUids)
      ? item.targetUids.map(x => String(x || '').trim()).filter(Boolean)
      : [];

    if (channel === 'all' || uid === '__all__') {
      try {
        return Object.keys(DB.getNameMap ? DB.getNameMap() : {}).filter(Boolean);
      } catch (e) {
        return [];
      }
    }

    if (channel === 'custom' && explicit.length) {
      return Array.from(new Set(explicit));
    }

    return uid ? [uid] : [];
  },

  applyCompensationToPlayer(item) {
    const uid = String(item?.uid || '').trim();
    if (!uid) {
      return { ok: false, error: 'uid 为空' };
    }

    const data = DB.get(uid);
    if (!data || typeof data !== 'object') {
      return { ok: false, error: '玩家数据不存在' };
    }

    const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};

    const goldRaw = payload.gold ?? payload.money ?? 0;
    const gold = Math.floor(Number(goldRaw || 0));
    if (Number.isFinite(gold) && gold !== 0) {
      data.money = Math.max(0, Number(data.money || 0) + gold);
      if (data.money > CONFIG.maxMoney) data.money = CONFIG.maxMoney;
    }

    const items = payload.items && typeof payload.items === 'object' ? payload.items : {};
    data.items = data.items || {};
    const appliedItems = {};
    for (const [name, countRaw] of Object.entries(items)) {
      const count = Math.floor(Number(countRaw || 0));
      if (!name || !Number.isFinite(count) || count <= 0) continue;
      data.items[name] = (data.items[name] || 0) + count;
      appliedItems[name] = count;
    }

    DB.save(uid, data);

    return {
      ok: true,
      result: {
        uid,
        gold: Number.isFinite(gold) ? gold : 0,
        items: appliedItems,
      },
    };
  },

  async syncCompensations() {
    if (this._isSyncingCompensations) {
      return { total: 0, success: 0, failed: 0, skipped: true };
    }

    this._isSyncingCompensations = true;
    try {
      const list = await this.fetchPendingCompensations(20);
      if (!list.length) return { total: 0, success: 0, failed: 0 };

      const ackedMap = this._loadCompAcked();
      let success = 0;
      let failed = 0;

      for (const item of list) {
        try {
          const idemKey = String(item.idemKey || '').trim();
          if (!idemKey) {
            failed++;
            continue;
          }

          if (ackedMap[idemKey]) {
            const ackOk = await this.ackCompensation(idemKey, {
              status: 'issued',
              ackBy: 'wanwu_plugin',
              ackResult: ackedMap[idemKey],
            });
            if (ackOk) {
              delete ackedMap[idemKey];
              if (!this._saveCompAcked()) {
                failed++;
                console.error('[WebUI Reporter] 清理补偿幂等缓存失败:', idemKey);
              } else {
                success++;
              }
            } else {
              failed++;
            }
            continue;
          }

          const targets = this.resolveCompensationTargets(item);
          if (!targets.length) {
            await this.ackCompensation(idemKey, {
              status: 'failed',
              ackBy: 'wanwu_plugin',
              error: '没有可发放的目标玩家',
            });
            failed++;
            continue;
          }

          const results = [];
          const errors = [];
          for (const targetUid of targets) {
            const ret = this.applyCompensationToPlayer({ ...item, uid: targetUid });
            if (ret.ok) results.push(ret.result);
            else errors.push({ uid: targetUid, error: ret.error || 'unknown_error' });
          }

          if (!results.length) {
            await this.ackCompensation(idemKey, {
              status: 'failed',
              ackBy: 'wanwu_plugin',
              error: errors.map(x => `${x.uid}:${x.error}`).join('; ') || 'unknown_error',
            });
            failed++;
            continue;
          }

          const result = {
            total: targets.length,
            success: results.length,
            failed: errors.length,
            items: results,
            errors,
          };

          ackedMap[idemKey] = result;
          if (!this._saveCompAcked()) {
            delete ackedMap[idemKey];
            failed++;
            console.error('[WebUI Reporter] 写入补偿幂等缓存失败，已阻断发放回执:', idemKey);
            continue;
          }

          const ackOk = await this.ackCompensation(idemKey, {
            status: 'issued',
            ackBy: 'wanwu_plugin',
            ackResult: result,
          });
          if (ackOk) {
            delete ackedMap[idemKey];
            if (!this._saveCompAcked()) {
              failed++;
              console.error('[WebUI Reporter] 清理补偿幂等缓存失败:', idemKey);
            } else {
              success++;
            }
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
          console.error('[WebUI Reporter] 单条补偿处理失败:', e);
        }
      }

      if (success > 0 || failed > 0) {
        console.log(`[WebUI Reporter] 补偿同步完成: 成功${success}, 失败${failed}`);
      }

      return { total: list.length, success, failed };
    } finally {
      this._isSyncingCompensations = false;
    }
  },

  async fetchPendingAdminCommands(limit = 20) {
    if (!this.config.enabled || !this.config.endpoint) return [];
    try {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
      const res = await fetch(`${this.config.endpoint}/api/admin-commands/pending?limit=${safeLimit}`, {
        headers: { 'Authorization': `Bearer ${this.config.token}` }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.data) ? data.data : [];
    } catch (e) {
      console.error('[WebUI Reporter] 拉取管理指令失败:', e);
      return [];
    }
  },

  async ackAdminCommand(cmdId, payload) {
    if (!this.config.enabled || !this.config.endpoint) return false;
    try {
      const res = await fetch(`${this.config.endpoint}/api/admin-commands/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ cmdId, ...payload }),
      });
      return res.ok;
    } catch (e) {
      console.error('[WebUI Reporter] 回执管理指令失败:', e);
      return false;
    }
  },

  _getRemoteAdminAllowedTypes() {
    const configured = this.config.remoteAdminAllowedTypes;
    const fallback = ['UPDATE_MAP_TOPOLOGY'];
    const list = Array.isArray(configured) ? configured : fallback;
    return new Set(list.filter((item) => typeof item === 'string' && item));
  },

  _isRemoteAdminTypeAllowed(type) {
    return this._getRemoteAdminAllowedTypes().has(type);
  },

  executeAdminCommand(cmd) {
    try {
      const type = cmd.cmdType;
      const payload = cmd.payload || {};

      if (!this._isRemoteAdminTypeAllowed(type)) {
        return { ok: false, error: `远程管理指令 ${type || 'UNKNOWN'} 未在本地白名单中启用` };
      }

      switch (type) {
        case 'UPDATE_PLAYER': {
          const uid = String(payload.uid || '').trim();
          if (!uid) return { ok: false, error: '缺少uid' };
          const data = DB.get(uid);
          if (!data) return { ok: false, error: '玩家不存在' };

          if (typeof payload.money === 'number') {
            data.money = Math.max(0, Math.min(CONFIG.maxMoney, payload.money));
          }
          if (payload.player && data.player) {
            if (typeof payload.player.level === 'number') data.player.level = payload.player.level;
            if (typeof payload.player.energy === 'number') data.player.energy = payload.player.energy;
          }
          if (payload.items && typeof payload.items === 'object') {
            data.items = data.items || {};
            for (const [itemName, count] of Object.entries(payload.items)) {
              if (count <= 0) delete data.items[itemName];
              else data.items[itemName] = count;
            }
          }
          DB.save(uid, data);
          return { ok: true, result: { uid, updated: true } };
        }
        case 'CONTROL_WORLD_BOSS': {
          const action = payload.action; // 'spawn', 'kill', 'setHp'
          if (action === 'spawn') {
            WorldBossManager.checkAndSpawn(true); // 强制刷新
            return { ok: true, result: { action: 'spawn', boss: WorldBossManager.load() } };
          } else if (action === 'kill') {
            const boss = WorldBossManager.load();
            if (boss) {
              boss.currentHp = 0;
              boss.closed = true;
              WorldBossManager.save();
              return { ok: true, result: { action: 'kill' } };
            }
            return { ok: false, error: '当前无世界Boss' };
          } else if (action === 'setHp' && typeof payload.hp === 'number') {
            const boss = WorldBossManager.load();
            if (boss && !boss.closed) {
              boss.currentHp = Math.max(0, Math.min(boss.maxHp, payload.hp));
              WorldBossManager.save();
              return { ok: true, result: { action: 'setHp', hp: boss.currentHp } };
            }
            return { ok: false, error: '当前无存活的世界Boss' };
          }
          return { ok: false, error: '未知Boss操作' };
        }
        case 'UPDATE_GUILD': {
          const guildName = payload.guildName;
          if (!guildName) return { ok: false, error: '缺少公会名' };
          GuildManager.load();
          const guild = GuildManager._guilds[guildName];
          if (!guild) return { ok: false, error: '公会不存在' };

          if (payload.action === 'disband') {
            delete GuildManager._guilds[guildName];
            GuildManager.save();
            return { ok: true, result: { action: 'disband', guildName } };
          }
          if (typeof payload.bank === 'number') guild.bank = Math.max(0, payload.bank);
          if (typeof payload.level === 'number') guild.level = Math.max(1, payload.level);
          GuildManager.save();
          return { ok: true, result: { action: 'update', guildName } };
        }
        case 'MANAGE_MARKET': {
          if (payload.action === 'delist' && payload.listingId) {
            const market = typeof loadMarket === 'function' ? loadMarket() : null;
            if (market && market.listings && market.listings[payload.listingId]) {
              delete market.listings[payload.listingId];
              if (typeof saveMarket === 'function') saveMarket();
              return { ok: true, result: { action: 'delist', listingId: payload.listingId } };
            }
            return { ok: false, error: '订单不存在' };
          }
          return { ok: false, error: '未知市场操作' };
        }
        case 'UPDATE_GLOBAL_CONFIG': {
          if (payload.config && typeof CONFIG !== 'undefined') {
            Object.assign(CONFIG, payload.config);
            return { ok: true, result: { updatedKeys: Object.keys(payload.config) } };
          }
          return { ok: false, error: '配置参数无效' };
        }
        case 'UPDATE_MAP_TOPOLOGY': {
          let updatedCount = 0;
          if (Array.isArray(payload.nodes)) {
            for (const node of payload.nodes) {
              if (!node.id || !node.position) continue;
              if (node.id.startsWith('region_')) {
                const id = node.id.replace('region_', '');
                if (REGIONS[id]) {
                  REGIONS[id].ui = REGIONS[id].ui || {};
                  REGIONS[id].ui.x = node.position.x;
                  REGIONS[id].ui.y = node.position.y;
                  if (node.data?.connections) REGIONS[id].connections = node.data.connections;
                  updatedCount++;
                }
              } else if (node.id.startsWith('town_')) {
                const id = node.id.replace('town_', '');
                if (TOWNS[id]) {
                  TOWNS[id].ui = TOWNS[id].ui || {};
                  TOWNS[id].ui.x = node.position.x;
                  TOWNS[id].ui.y = node.position.y;
                  updatedCount++;
                }
              }
            }
            // 立即广播新的地图拓扑
            this.reportMapTopology();
            return { ok: true, result: { action: 'update_map', updatedCount } };
          }
          return { ok: false, error: '缺少 nodes 数组' };
        }
        default:
          return { ok: false, error: '未知指令类型' };
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async syncAdminCommands() {
    if (!this.config.remoteAdminEnabled) {
      return { total: 0, success: 0, failed: 0, skipped: true, reason: '远程管理指令未启用' };
    }
    if (this._isSyncingCommands) return { total: 0, success: 0, failed: 0, skipped: true, reason: '正在同步中' };
    this._isSyncingCommands = true;
    try {
      const list = await this.fetchPendingAdminCommands(10);
      if (!list.length) return { total: 0, success: 0, failed: 0 };

      let success = 0;
      let failed = 0;

      for (const cmd of list) {
        try {
          const cmdId = String(cmd.id || '').trim();
          if (!cmdId) continue;
          if (this._isAdminCmdExecuted(cmdId)) {
            await this.ackAdminCommand(cmdId, {
              status: 'completed',
              result: { skipped: true, reason: '本地已执行，跳过重复指令' },
            });
            continue;
          }

          const ret = this.executeAdminCommand(cmd);
          if (ret.ok) this._markAdminCmdExecuted(cmdId);

          await this.ackAdminCommand(cmdId, {
            status: ret.ok ? 'completed' : 'failed',
            result: ret.ok ? ret.result : undefined,
            error: ret.ok ? undefined : ret.error,
          });

          if (ret.ok) success++;
          else failed++;
        } catch (e) {
          failed++;
          console.error('[WebUI Reporter] 单条指令处理失败:', e);
        }
      }

      if (success > 0 || failed > 0) {
        console.log(`[WebUI Reporter] 管理指令执行完成: 成功${success}, 失败${failed}`);
      }
      return { total: list.length, success, failed };
    } finally {
      this._isSyncingCommands = false;
    }
  },

  applyPatch(patch) {
    if (!patch || !patch.payload) return false;
    try {
      const payload = typeof patch.payload === 'string' ? JSON.parse(patch.payload) : patch.payload;

      // 安全检查：防止原型链污染
      const hasUnsafeKey = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        for (const key of Object.keys(obj)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
          if (hasUnsafeKey(obj[key])) return true;
        }
        return false;
      };
      if (hasUnsafeKey(payload)) {
        patch._lastError = '补丁包含非法字段';
        console.error('[WebUI Reporter] 补丁包含非法字段');
        return false;
      }

      switch (patch.scope) {
        case 'species':
          if (payload.species && typeof SPECIES !== 'undefined') Object.assign(SPECIES, payload.species);
          break;
        case 'skills':
          if (payload.skills && typeof SKILLS !== 'undefined') Object.assign(SKILLS, payload.skills);
          break;
        case 'items':
          if (payload.items && typeof ITEMS !== 'undefined') Object.assign(ITEMS, payload.items);
          break;
        case 'config':
          if (payload.config && typeof CONFIG !== 'undefined') Object.assign(CONFIG, payload.config);
          break;
        case 'shops': {
          const ok = typeof applyShopPatch === 'function' ? applyShopPatch(payload) : false;
          if (!ok) patch._lastError = typeof applyShopPatch === 'function' ? '商店补丁内容无效' : '当前插件缺少商店热更新处理器';
          return ok;
        }
        case 'encounters': {
          const ok = typeof applyEncounterPatch === 'function' ? applyEncounterPatch(payload) : false;
          if (!ok) patch._lastError = typeof applyEncounterPatch === 'function' ? '遭遇池补丁内容无效' : '当前插件缺少遭遇池热更新处理器';
          return ok;
        }
        case 'dungeons': {
          const ok = typeof applyDungeonPatch === 'function' ? applyDungeonPatch(payload) : false;
          if (!ok) patch._lastError = typeof applyDungeonPatch === 'function' ? '副本补丁内容无效' : '当前插件缺少副本热更新处理器';
          return ok;
        }
      }
      return true;
    } catch (e) {
      patch._lastError = e && e.message ? e.message : String(e);
      console.error('[WebUI Reporter] 应用补丁失败:', e);
      return false;
    }
  },

  getStatus() {
    return {
      enabled: this.config.enabled,
      endpoint: this.config.endpoint,
      queueSize: this._queue.length,
      installedMods: this.getInstalledMods().length,
      knownAnnouncements: this._loadAnnouncementSeen().length,
      remoteAdminEnabled: !!this.config.remoteAdminEnabled,
      remoteAdminAllowedTypes: Array.from(this._getRemoteAdminAllowedTypes()),
    };
  }
};

// 挂载到全局
if (typeof globalThis !== 'undefined') {
  globalThis.WebUIReporter = WebUIReporter;
}

// 从存储加载 WebUI 配置
try {
  const savedConfig = ext.storageGet('webui_config');
  if (savedConfig) {
    const cfg = JSON.parse(savedConfig);
    WebUIReporter.init(cfg);
  }
} catch (e) {
  console.log('[万物有灵] 加载 WebUI 配置失败:', e);
}

const CONFIG = {
  maxPets: 3,
  maxStorage: 15,
  maxSkills: 4,
  baseExpGain: 10,
  maxMoney: 999999999,  // 金币上限
  // 战斗相关
  battleLogLimit: 20,
  battleLogPvPLimit: 20,
  battleEnergyCost: 15,
  battleHpLoss: 10,
  // 斗殴相关
  fightLogLimit: 20,
};
const MAIN_SCHEMA_VERSION = 1;

// 游戏小贴士
const GAME_TIPS = [
  'ℑ 每日首次喂食可获得双倍好感度',
  'ℑ 宠物好感度达到100时可触发进化',
  'ℑ 不同性格会影响宠物的属性成长',
  'ℑ 天赋可以大幅提升宠物的战斗能力',
  'ℑ 稀有宠物有更高的基础属性',
  'ℑ 战斗时注意属性克制，可造成额外伤害',
  'ℑ 宠物血量越低，捕捉成功率越高',
  'ℑ 探险和打工可以获得技能书',
  'ℑ 训练师装备可以提升宠物属性',
  'ℑ 组队副本需要多人配合才能通关',
  'ℑ 世界Boss每天12:00、18:00、22:00刷新',
  'ℑ 神话宠物拥有专属技能',
  'ℑ 育种可以继承父母的优秀基因',
  'ℑ 宠物达到50级可挑战守护者',
  'ℑ 使用.宠物 help 查看完整命令列表',
];

// 随机获取一条tips
function getRandomTip() {
  return GAME_TIPS[Math.floor(Math.random() * GAME_TIPS.length)];
}

//   种族定义  
const SPECIES = {
  '猫': { elements: ['火', '水', '草', '电', '超能'], baseMod: { hp: 1, atk: 1.1, def: 0.9, energy: 1 } },
  '犬': { elements: ['火', '电', '岩石'], baseMod: { hp: 1.1, atk: 1, def: 1, energy: 0.9 } },
  '龙': { elements: ['火', '水', '超能'], baseMod: { hp: 1.2, atk: 1.2, def: 1, energy: 1.1 } },
  '蛇': { elements: ['水', '草', '超能'], baseMod: { hp: 0.9, atk: 1.1, def: 0.9, energy: 1.2 } },
  '鸟': { elements: ['火', '电', '草'], baseMod: { hp: 0.8, atk: 1.2, def: 0.8, energy: 1.3 } },
  '龟': { elements: ['水', '岩石'], baseMod: { hp: 1.3, atk: 0.8, def: 1.3, energy: 0.8 } },
  '熊': { elements: ['岩石', '草'], baseMod: { hp: 1.3, atk: 1.2, def: 1.1, energy: 0.7 } },
  '狐': { elements: ['火', '超能', '电'], baseMod: { hp: 0.9, atk: 1.1, def: 0.9, energy: 1.2 } },
  '兔': { elements: ['草', '电'], baseMod: { hp: 0.9, atk: 1, def: 0.8, energy: 1.3 } },
  '鼠': { elements: ['电', '草', '水'], baseMod: { hp: 0.8, atk: 1, def: 0.8, energy: 1.2 } },
  '狼': { elements: ['电', '岩石', '水'], baseMod: { hp: 1, atk: 1.2, def: 1, energy: 1 } },
  '鹿': { elements: ['草', '超能'], baseMod: { hp: 1, atk: 0.9, def: 0.9, energy: 1.2 } },
  '猿': { elements: ['岩石', '火'], baseMod: { hp: 1.1, atk: 1.3, def: 1, energy: 0.9 } },
  '螳螂': { elements: ['草', '电'], baseMod: { hp: 0.8, atk: 1.4, def: 0.8, energy: 1 } },
  '史莱姆': { elements: ['水', '草', '火'], baseMod: { hp: 1.2, atk: 0.7, def: 0.8, energy: 1 } },
  '哥布林': { elements: ['岩石', '草'], baseMod: { hp: 0.9, atk: 1.1, def: 0.9, energy: 1.1 } },
  '精灵': { elements: ['超能', '草', '水'], baseMod: { hp: 0.9, atk: 1, def: 0.9, energy: 1.3 } },
  '元素': { elements: ['火', '水', '电'], baseMod: { hp: 1, atk: 1.2, def: 0.9, energy: 1.2 } },
  '幽灵': { elements: ['超能'], baseMod: { hp: 0.8, atk: 1.1, def: 0.7, energy: 1.4 } },
  '恶魔': { elements: ['火', '超能'], baseMod: { hp: 1, atk: 1.3, def: 0.9, energy: 1 } },
  '魅魔': { elements: ['超能', '火'], baseMod: { hp: 0.9, atk: 1.1, def: 0.8, energy: 1.3 } },
  '鱼': { elements: ['水', '电'], baseMod: { hp: 0.9, atk: 1, def: 0.9, energy: 1.1 } },
  '蟹': { elements: ['水', '岩石'], baseMod: { hp: 1.1, atk: 1.1, def: 1.2, energy: 0.8 } },
  '蜘蛛': { elements: ['草', '超能'], baseMod: { hp: 0.8, atk: 1.3, def: 0.8, energy: 1 } },
  '蝎': { elements: ['岩石', '火'], baseMod: { hp: 0.9, atk: 1.3, def: 1, energy: 0.9 } },
  '蝙蝠': { elements: ['超能', '电'], baseMod: { hp: 0.8, atk: 1.1, def: 0.8, energy: 1.2 } },
  '鹰': { elements: ['电', '火'], baseMod: { hp: 0.8, atk: 1.3, def: 0.7, energy: 1.2 } },
  '虎': { elements: ['火', '岩石'], baseMod: { hp: 1.1, atk: 1.3, def: 1, energy: 0.9 } },
  '狮': { elements: ['火', '岩石'], baseMod: { hp: 1.1, atk: 1.2, def: 1, energy: 0.9 } },
  '豹': { elements: ['电', '草'], baseMod: { hp: 1, atk: 1.3, def: 0.9, energy: 1 } },
  '牛': { elements: ['岩石', '火'], baseMod: { hp: 1.3, atk: 1.1, def: 1.2, energy: 0.7 } },
  '马': { elements: ['电', '火'], baseMod: { hp: 1, atk: 1.1, def: 0.9, energy: 1.1 } },
  '羊': { elements: ['草', '超能'], baseMod: { hp: 1, atk: 0.8, def: 0.9, energy: 1.1 } },
  '猪': { elements: ['草', '岩石'], baseMod: { hp: 1.2, atk: 0.9, def: 1, energy: 0.9 } },
  '骷髅': { elements: ['超能', '岩石'], baseMod: { hp: 0.7, atk: 1.2, def: 0.8, energy: 1.1 } },
  '傀儡': { elements: ['岩石', '超能'], baseMod: { hp: 1.4, atk: 0.9, def: 1.4, energy: 0.6 } },
  // 新增物种 - 12个
  '鹤': { elements: ['水', '超能'], baseMod: { hp: 0.9, atk: 1, def: 0.9, energy: 1.3, spd: 1.1 } },
  '蛙': { elements: ['水', '草'], baseMod: { hp: 1.1, atk: 0.9, def: 0.9, energy: 1.1 } },
  '蜂': { elements: ['草', '电'], baseMod: { hp: 0.7, atk: 1.2, def: 0.7, energy: 1, spd: 1.3 } },
  '蛇颈龙': { elements: ['水'], baseMod: { hp: 1.3, atk: 1.1, def: 1.1, energy: 0.9 } },
  '翼龙': { elements: ['电', '火'], baseMod: { hp: 0.9, atk: 1.2, def: 0.8, energy: 1, spd: 1.2 } },
  '独角兽': { elements: ['超能'], baseMod: { hp: 1, atk: 1.1, def: 1, energy: 1.3 } },
  '九头蛇': { elements: ['水', '超能'], baseMod: { hp: 1.4, atk: 1.2, def: 1, energy: 1.1 } },
  '凤凰雏': { elements: ['火'], baseMod: { hp: 0.8, atk: 1.3, def: 0.7, energy: 1.4 } },
  '石像鬼': { elements: ['岩石'], baseMod: { hp: 1.2, atk: 1, def: 1.4, energy: 0.7 } },
  '树人': { elements: ['草'], baseMod: { hp: 1.4, atk: 0.8, def: 1.2, energy: 1 } },
  '美人鱼': { elements: ['水', '超能'], baseMod: { hp: 0.9, atk: 1, def: 0.9, energy: 1.4 } },
  '天使': { elements: ['超能'], baseMod: { hp: 1, atk: 1.1, def: 1, energy: 1.4 } },
};

//   进化系统
// 进化阶数: 1阶(初级) → 中阶(1.5) → 2阶(高级) → 3阶(终极)
// 分支进化: 根据属性/好感度等条件进化成不同形态
// 特殊进化: 好感度/时间/道具触发
const EVOLUTIONS = {
  '猫': [
    // 1阶进化
    { stage: 1, name: '灵猫', level: 12, req: { item: '进化石', count: 1 }, bonus: { atk: 12, spd: 8 } },
    // 中阶进化（分支）
    { stage: 1.5, name: '月影猫', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { atk: 18, energy: 15 }, branch: '月光' },
    { stage: 1.5, name: '烈焰猫', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 22, spd: 10 }, branch: '火焰' },
    { stage: 1.5, name: '暗影猫', level: 25, req: { item: '高级进化石', count: 1 }, condition: { affection: 80 }, bonus: { atk: 20, def: 12 }, branch: '暗影' },
    // 2阶进化
    { stage: 2, name: '九尾灵猫', level: 40, req: { item: '灵猫之魂', count: 1 }, bonus: { atk: 30, spd: 25, skill: '九尾幻术' }, from: '月影猫' },
    { stage: 2, name: '炎魔猫', level: 40, req: { item: '炎之精华', count: 1 }, bonus: { atk: 38, spd: 15, skill: '地狱烈焰' }, from: '烈焰猫' },
    { stage: 2, name: '幽冥猫', level: 40, req: { item: '暗之精华', count: 1 }, bonus: { atk: 32, def: 20, skill: '暗影吞噬' }, from: '暗影猫' },
    // 3阶进化（终极）
    { stage: 3, name: '神猫·九命', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '九命重生' }, from: '九尾灵猫' },
    { stage: 3, name: '炎帝·神猫', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '炎帝降临' }, from: '炎魔猫' },
    { stage: 3, name: '冥王·神猫', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '冥界之门' }, from: '幽冥猫' },
  ],
  '犬': [
    { stage: 1, name: '战犬', level: 12, req: { item: '进化石', count: 1 }, bonus: { hp: 18, atk: 10 } },
    { stage: 1.5, name: '狂战犬', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { hp: 25, atk: 18 }, branch: '狂暴' },
    { stage: 1.5, name: '圣光犬', level: 25, req: { item: '高级进化石', count: 1 }, condition: { affection: 80 }, bonus: { hp: 20, def: 15, energy: 15 }, branch: '圣光' },
    { stage: 1.5, name: '暗黑犬', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { atk: 22, spd: 12 }, branch: '黑暗' },
    { stage: 2, name: '地狱三头犬', level: 38, req: { item: '地狱火种', count: 1 }, bonus: { hp: 50, atk: 35, skill: '地狱之火' }, from: '狂战犬' },
    { stage: 2, name: '天界神犬', level: 38, req: { item: '圣光石', count: 1 }, bonus: { hp: 40, def: 30, skill: '神圣守护' }, from: '圣光犬' },
    { stage: 2, name: '冥界黑犬', level: 38, req: { item: '暗黑石', count: 1 }, bonus: { atk: 40, spd: 25, skill: '暗影撕咬' }, from: '暗黑犬' },
    { stage: 3, name: '地狱犬王', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '地狱咆哮' }, from: '地狱三头犬' },
    { stage: 3, name: '神圣犬神', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '神光普照' }, from: '天界神犬' },
    { stage: 3, name: '暗夜犬皇', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 53, skill: '暗夜降临' }, from: '冥界黑犬' },
  ],
  '龙': [
    { stage: 1, name: '幼龙', level: 15, req: { item: '进化石', count: 2 }, bonus: { atk: 15, def: 10, energy: 10 } },
    { stage: 1.5, name: '火龙', level: 30, req: { item: '龙之鳞', count: 2 }, condition: { element: '火' }, bonus: { atk: 28, def: 12 }, branch: '火焰' },
    { stage: 1.5, name: '冰龙', level: 30, req: { item: '龙之鳞', count: 2 }, condition: { element: '水' }, bonus: { hp: 30, def: 18 }, branch: '冰霜' },
    { stage: 1.5, name: '雷龙', level: 30, req: { item: '龙之鳞', count: 2 }, condition: { element: '电' }, bonus: { atk: 25, spd: 20 }, branch: '雷霆' },
    { stage: 1.5, name: '苍龙', level: 30, req: { item: '龙之鳞', count: 2 }, condition: { element: '草' }, bonus: { atk: 22, energy: 20 }, branch: '苍穹' },
    { stage: 2, name: '炎龙', level: 45, req: { item: '龙之心', count: 1 }, bonus: { atk: 45, def: 20, skill: '龙息烈焰' }, from: '火龙' },
    { stage: 2, name: '霜龙', level: 45, req: { item: '龙之心', count: 1 }, bonus: { hp: 60, def: 35, skill: '绝对零度' }, from: '冰龙' },
    { stage: 2, name: '雷龙王', level: 45, req: { item: '龙之心', count: 1 }, bonus: { atk: 40, spd: 30, skill: '雷霆万钧' }, from: '雷龙' },
    { stage: 2, name: '天龙', level: 45, req: { item: '龙之心', count: 1 }, bonus: { atk: 35, energy: 40, skill: '天翔' }, from: '苍龙' },
    { stage: 3, name: '神龙', level: 65, req: { item: '神话契约', count: 2 }, bonus: { all: 70, skill: '神龙降临' }, from: ['炎龙', '霜龙', '雷龙王', '天龙'] },
  ],
  '蛇': [
    { stage: 1, name: '大蛇', level: 10, req: { item: '进化石', count: 1 }, bonus: { hp: 22, def: 8 } },
    { stage: 1.5, name: '蟒蛇', level: 22, req: { item: '高级进化石', count: 1 }, bonus: { hp: 30, def: 15 }, branch: '力量' },
    { stage: 1.5, name: '毒蛇', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { atk: 25, spd: 15 }, branch: '毒液' },
    { stage: 2, name: '蛟龙', level: 35, req: { item: '龙之鳞', count: 1 }, bonus: { hp: 45, atk: 25, skill: '化龙' }, from: '蟒蛇' },
    { stage: 2, name: '毒龙', level: 35, req: { item: '毒龙之牙', count: 1 }, bonus: { atk: 35, spd: 20, skill: '剧毒之息' }, from: '毒蛇' },
    { stage: 3, name: '真·蛟龙', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 45, skill: '真龙觉醒' }, from: '蛟龙' },
    { stage: 3, name: '万毒龙王', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 48, skill: '毒龙领域' }, from: '毒龙' },
  ],
  '鸟': [
    { stage: 1, name: '灵鸟', level: 10, req: { item: '进化石', count: 1 }, bonus: { spd: 18, atk: 8 } },
    { stage: 1.5, name: '风鸟', level: 22, req: { item: '高级进化石', count: 1 }, bonus: { spd: 28, atk: 12 }, branch: '疾风' },
    { stage: 1.5, name: '火鸟', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 22, spd: 15 }, branch: '烈焰' },
    { stage: 2, name: '神鹰', level: 35, req: { item: '天空之羽', count: 3 }, bonus: { spd: 40, atk: 28, skill: '天翔' }, from: '风鸟' },
    { stage: 2, name: '凤凰', level: 35, req: { item: '不死鸟之羽', count: 1 }, bonus: { atk: 35, energy: 30, skill: '涅槃重生' }, from: '火鸟' },
    { stage: 3, name: '天神鹰', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 45, skill: '天神降临' }, from: '神鹰' },
    { stage: 3, name: '神凤', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '凤凰涅槃' }, from: '凤凰' },
  ],
  '龟': [
    { stage: 1, name: '玄龟', level: 12, req: { item: '进化石', count: 1 }, bonus: { hp: 28, def: 18 } },
    { stage: 1.5, name: '岩龟', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { hp: 40, def: 25 }, branch: '岩石' },
    { stage: 1.5, name: '水龟', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { hp: 35, def: 20, energy: 15 }, branch: '流水' },
    { stage: 2, name: '神龟', level: 40, req: { item: '玄武甲壳', count: 1 }, bonus: { hp: 70, def: 45, skill: '玄武之盾' }, from: '岩龟' },
    { stage: 2, name: '海龟王', level: 40, req: { item: '深海之珠', count: 1 }, bonus: { hp: 55, def: 35, energy: 30, skill: '海啸' }, from: '水龟' },
    { stage: 3, name: '玄武神', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 60, skill: '玄武降临' }, from: '神龟' },
    { stage: 3, name: '海神龟', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '海神庇护' }, from: '海龟王' },
  ],
  '熊': [
    { stage: 1, name: '巨熊', level: 15, req: { item: '进化石', count: 1 }, bonus: { hp: 22, atk: 18 } },
    { stage: 1.5, name: '棕熊', level: 28, req: { item: '高级进化石', count: 1 }, bonus: { hp: 35, atk: 22 }, branch: '力量' },
    { stage: 1.5, name: '冰熊', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { hp: 30, def: 20, atk: 18 }, branch: '冰霜' },
    { stage: 2, name: '暴熊', level: 42, req: { item: '熊王之爪', count: 1 }, bonus: { hp: 50, atk: 45, skill: '狂暴' }, from: '棕熊' },
    { stage: 2, name: '冰霜巨熊', level: 42, req: { item: '冰晶', count: 2 }, bonus: { hp: 60, def: 35, skill: '冰封' }, from: '冰熊' },
    { stage: 3, name: '熊王', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '熊王咆哮' }, from: '暴熊' },
    { stage: 3, name: '冰熊王', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '极寒领域' }, from: '冰霜巨熊' },
  ],
  '狐': [
    { stage: 1, name: '妖狐', level: 12, req: { item: '进化石', count: 1 }, bonus: { atk: 12, energy: 18 } },
    { stage: 1.5, name: '火狐', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 22, energy: 15 }, branch: '火焰' },
    { stage: 1.5, name: '冰狐', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { atk: 18, energy: 22, def: 10 }, branch: '冰霜' },
    { stage: 1.5, name: '幻狐', level: 25, req: { item: '高级进化石', count: 1 }, condition: { affection: 85 }, bonus: { atk: 20, energy: 25, skill: '幻术' }, branch: '幻影' },
    { stage: 2, name: '九尾妖狐', level: 40, req: { item: '狐火', count: 1 }, bonus: { atk: 35, energy: 45, skill: '魅惑' }, from: '火狐' },
    { stage: 2, name: '冰晶狐', level: 40, req: { item: '冰晶', count: 2 }, bonus: { atk: 30, energy: 50, skill: '冰封幻境' }, from: '冰狐' },
    { stage: 2, name: '幻灵狐', level: 40, req: { item: '幻灵珠', count: 1 }, bonus: { atk: 32, energy: 55, skill: '幻影分身' }, from: '幻狐' },
    { stage: 3, name: '九尾天狐', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '天狐降临' }, from: ['九尾妖狐', '冰晶狐', '幻灵狐'] },
  ],
  '狼': [
    { stage: 1, name: '狼王', level: 12, req: { item: '进化石', count: 1 }, bonus: { atk: 15, spd: 10 } },
    { stage: 1.5, name: '银狼', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { atk: 22, spd: 18 }, branch: '雷霆' },
    { stage: 1.5, name: '血狼', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 25, spd: 12 }, branch: '血月' },
    { stage: 1.5, name: '暗狼', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { atk: 20, spd: 15, def: 8 }, branch: '暗影' },
    { stage: 2, name: '雷狼', level: 38, req: { item: '雷狼之牙', count: 1 }, bonus: { atk: 38, spd: 30, skill: '雷霆突袭' }, from: '银狼' },
    { stage: 2, name: '血月狼王', level: 38, req: { item: '血月石', count: 1 }, bonus: { atk: 42, spd: 22, skill: '血月斩' }, from: '血狼' },
    { stage: 2, name: '暗影狼王', level: 38, req: { item: '暗影石', count: 1 }, bonus: { atk: 35, spd: 28, skill: '暗影突袭' }, from: '暗狼' },
    { stage: 3, name: '雷霆狼神', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '雷神降临' }, from: '雷狼' },
    { stage: 3, name: '血月狼神', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '血月降临' }, from: '血月狼王' },
    { stage: 3, name: '暗夜狼神', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '暗夜降临' }, from: '暗影狼王' },
  ],
  '鹰': [
    { stage: 1, name: '苍鹰', level: 12, req: { item: '进化石', count: 1 }, bonus: { atk: 18, spd: 12 } },
    { stage: 1.5, name: '风鹰', level: 25, req: { item: '高级进化石', count: 1 }, bonus: { atk: 22, spd: 22 }, branch: '疾风' },
    { stage: 1.5, name: '雷鹰', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { atk: 25, spd: 18 }, branch: '雷霆' },
    { stage: 2, name: '风暴鹰', level: 38, req: { item: '风暴之羽', count: 2 }, bonus: { atk: 38, spd: 40, skill: '风暴俯冲' }, from: '风鹰' },
    { stage: 2, name: '雷霆鹰', level: 38, req: { item: '雷羽', count: 2 }, bonus: { atk: 45, spd: 32, skill: '雷霆俯冲' }, from: '雷鹰' },
    { stage: 3, name: '风暴鹰王', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 48, skill: '风暴降临' }, from: '风暴鹰' },
    { stage: 3, name: '雷神鹰', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '雷神之翼' }, from: '雷霆鹰' },
  ],
  '虎': [
    { stage: 1, name: '猛虎', level: 15, req: { item: '进化石', count: 1 }, bonus: { atk: 22, def: 8 } },
    { stage: 1.5, name: '烈虎', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 30, def: 12 }, branch: '烈焰' },
    { stage: 1.5, name: '风虎', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { atk: 28, spd: 18 }, branch: '疾风' },
    { stage: 1.5, name: '白虎', level: 28, req: { item: '高级进化石', count: 1 }, condition: { affection: 90 }, bonus: { atk: 32, def: 15, skill: '白虎之威' }, branch: '神圣' },
    { stage: 2, name: '炎虎王', level: 42, req: { item: '炎虎之魂', count: 1 }, bonus: { atk: 50, def: 20, skill: '炎虎咆哮' }, from: '烈虎' },
    { stage: 2, name: '风雷虎', level: 42, req: { item: '风雷石', count: 1 }, bonus: { atk: 45, spd: 35, skill: '风雷斩' }, from: '风虎' },
    { stage: 2, name: '圣白虎', level: 42, req: { item: '圣光石', count: 1 }, bonus: { atk: 55, def: 30, skill: '白虎咆哮' }, from: '白虎' },
    { stage: 3, name: '炎帝虎', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '炎帝降临' }, from: '炎虎王' },
    { stage: 3, name: '风神虎', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '风神降临' }, from: '风雷虎' },
    { stage: 3, name: '白虎神', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 60, skill: '白虎降临' }, from: '圣白虎' },
  ],
  '狮': [
    { stage: 1, name: '雄狮', level: 15, req: { item: '进化石', count: 1 }, bonus: { hp: 12, atk: 20 } },
    { stage: 1.5, name: '金狮', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { hp: 18, atk: 28 }, branch: '雷霆' },
    { stage: 1.5, name: '炎狮', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { hp: 15, atk: 32 }, branch: '烈焰' },
    { stage: 1.5, name: '圣狮', level: 28, req: { item: '高级进化石', count: 1 }, condition: { affection: 85 }, bonus: { hp: 22, atk: 25, def: 12 }, branch: '神圣' },
    { stage: 2, name: '金毛狮王', level: 42, req: { item: '狮王之鬃', count: 1 }, bonus: { hp: 35, atk: 50, skill: '狮王怒吼' }, from: '金狮' },
    { stage: 2, name: '炎狮王', level: 42, req: { item: '炎狮之心', count: 1 }, bonus: { hp: 28, atk: 55, skill: '炎狮咆哮' }, from: '炎狮' },
    { stage: 2, name: '圣狮王', level: 42, req: { item: '圣光石', count: 1 }, bonus: { hp: 45, atk: 48, def: 25, skill: '神圣咆哮' }, from: '圣狮' },
    { stage: 3, name: '雷神狮王', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '雷神降临' }, from: '金毛狮王' },
    { stage: 3, name: '炎帝狮王', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '炎帝降临' }, from: '炎狮王' },
    { stage: 3, name: '神圣狮王', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 58, skill: '神圣降临' }, from: '圣狮王' },
  ],
  '精灵': [
    { stage: 1, name: '精灵使', level: 15, req: { item: '精灵之泪', count: 1 }, bonus: { energy: 25, atk: 12 } },
    { stage: 1.5, name: '火精灵', level: 28, req: { item: '精灵之心', count: 1 }, condition: { element: '火' }, bonus: { energy: 30, atk: 20 }, branch: '火焰' },
    { stage: 1.5, name: '水精灵', level: 28, req: { item: '精灵之心', count: 1 }, condition: { element: '水' }, bonus: { energy: 35, def: 12 }, branch: '流水' },
    { stage: 1.5, name: '风精灵', level: 28, req: { item: '精灵之心', count: 1 }, condition: { element: '电' }, bonus: { energy: 28, spd: 20 }, branch: '疾风' },
    { stage: 2, name: '精灵王', level: 45, req: { item: '精灵王冠', count: 1 }, bonus: { energy: 60, atk: 35, skill: '精灵祝福' }, from: ['火精灵', '水精灵', '风精灵'] },
    { stage: 3, name: '精灵神', level: 65, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '精灵神降临' }, from: '精灵王' },
  ],
  '恶魔': [
    { stage: 1, name: '小恶魔', level: 18, req: { item: '进化石', count: 1 }, bonus: { atk: 20, energy: 15 } },
    { stage: 1.5, name: '大恶魔', level: 32, req: { item: '恶魔之血', count: 1 }, bonus: { atk: 30, def: 15 }, branch: '力量' },
    { stage: 1.5, name: '暗黑恶魔', level: 32, req: { item: '恶魔之血', count: 1 }, condition: { element: '超能' }, bonus: { atk: 28, energy: 25 }, branch: '暗影' },
    { stage: 2, name: '魔王', level: 48, req: { item: '魔王之证', count: 1 }, bonus: { atk: 58, def: 35, skill: '魔王降临' }, from: '大恶魔' },
    { stage: 2, name: '暗夜魔王', level: 48, req: { item: '暗夜之心', count: 1 }, bonus: { atk: 52, energy: 50, skill: '暗夜降临' }, from: '暗黑恶魔' },
    { stage: 3, name: '魔王神', level: 68, req: { item: '神话契约', count: 1 }, bonus: { all: 60, skill: '魔王神降临' }, from: ['魔王', '暗夜魔王'] },
  ],
  '幽灵': [
    { stage: 1, name: '怨灵', level: 12, req: { item: '进化石', count: 1 }, bonus: { atk: 15, energy: 12 } },
    { stage: 1.5, name: '恶灵', level: 25, req: { item: '高级进化石', count: 1 }, bonus: { atk: 22, energy: 20 }, branch: '怨念' },
    { stage: 1.5, name: '幻灵', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { atk: 18, energy: 28, skill: '幻术' }, branch: '幻影' },
    { stage: 2, name: '死神', level: 40, req: { item: '死神之镰', count: 1 }, bonus: { atk: 45, energy: 40, skill: '死神之镰' }, from: '恶灵' },
    { stage: 2, name: '幻灵王', level: 40, req: { item: '幻灵珠', count: 1 }, bonus: { atk: 38, energy: 55, skill: '幻灵领域' }, from: '幻灵' },
    { stage: 3, name: '死神王', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '死神降临' }, from: '死神' },
    { stage: 3, name: '幻灵神', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '幻灵神降临' }, from: '幻灵王' },
  ],
  '骷髅': [
    { stage: 1, name: '骷髅战士', level: 12, req: { item: '进化石', count: 1 }, bonus: { atk: 12, def: 12 } },
    { stage: 1.5, name: '骷髅骑士', level: 25, req: { item: '高级进化石', count: 1 }, bonus: { atk: 20, def: 20 }, branch: '战斗' },
    { stage: 1.5, name: '骷髅法师', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { atk: 18, energy: 25, def: 12 }, branch: '魔法' },
    { stage: 2, name: '骷髅王', level: 40, req: { item: '骷髅王冠', count: 1 }, bonus: { atk: 38, def: 38, skill: '亡灵大军' }, from: '骷髅骑士' },
    { stage: 2, name: '骷髅大法师', level: 40, req: { item: '亡灵法典', count: 1 }, bonus: { atk: 32, energy: 50, def: 25, skill: '亡灵魔法' }, from: '骷髅法师' },
    { stage: 3, name: '亡灵王', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '亡灵降临' }, from: ['骷髅王', '骷髅大法师'] },
  ],
  '史莱姆': [
    { stage: 1, name: '大史莱姆', level: 8, req: { item: '进化石', count: 1 }, bonus: { hp: 25, def: 8 } },
    { stage: 1.5, name: '火史莱姆', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { hp: 30, atk: 15, def: 10 }, branch: '火焰' },
    { stage: 1.5, name: '水史莱姆', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { hp: 40, def: 15 }, branch: '流水' },
    { stage: 1.5, name: '毒史莱姆', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { hp: 28, atk: 12, def: 12 }, branch: '毒液' },
    { stage: 2, name: '史莱姆王', level: 32, req: { item: '史莱姆王冠', count: 1 }, bonus: { hp: 65, def: 35, skill: '分裂' }, from: ['火史莱姆', '水史莱姆', '毒史莱姆'] },
    { stage: 3, name: '史莱姆神', level: 52, req: { item: '神话契约', count: 1 }, bonus: { all: 45, skill: '史莱姆神降临' }, from: '史莱姆王' },
  ],
  '元素': [
    { stage: 1, name: '元素使', level: 15, req: { item: '元素核心', count: 1 }, bonus: { atk: 18, energy: 18 } },
    { stage: 1.5, name: '火元素', level: 28, req: { item: '元素之心', count: 1 }, condition: { element: '火' }, bonus: { atk: 28, energy: 22 }, branch: '火焰' },
    { stage: 1.5, name: '水元素', level: 28, req: { item: '元素之心', count: 1 }, condition: { element: '水' }, bonus: { atk: 22, energy: 30, def: 12 }, branch: '流水' },
    { stage: 1.5, name: '雷元素', level: 28, req: { item: '元素之心', count: 1 }, condition: { element: '电' }, bonus: { atk: 25, energy: 25, spd: 15 }, branch: '雷霆' },
    { stage: 2, name: '元素领主', level: 42, req: { item: '元素王冠', count: 1 }, bonus: { atk: 48, energy: 45, skill: '元素风暴' }, from: ['火元素', '水元素', '雷元素'] },
    { stage: 3, name: '元素神', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '元素神降临' }, from: '元素领主' },
  ],
  '魅魔': [
    { stage: 1, name: '夜魔', level: 15, req: { item: '进化石', count: 1 }, bonus: { atk: 18, energy: 20 } },
    { stage: 1.5, name: '魅魔', level: 28, req: { item: '高级进化石', count: 1 }, condition: { affection: 80 }, bonus: { atk: 25, energy: 35, skill: '魅惑' }, branch: '魅惑' },
    { stage: 1.5, name: '暗夜魔女', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { atk: 28, energy: 30, def: 10 }, branch: '暗影' },
    { stage: 2, name: '魅魔女王', level: 42, req: { item: '魅魔之冠', count: 1 }, bonus: { atk: 45, energy: 55, skill: '魅惑之眼' }, from: '魅魔' },
    { stage: 2, name: '暗夜女王', level: 42, req: { item: '暗夜之心', count: 1 }, bonus: { atk: 50, energy: 48, def: 18, skill: '暗夜领域' }, from: '暗夜魔女' },
    { stage: 3, name: '魅魔神', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '魅魔神降临' }, from: ['魅魔女王', '暗夜女王'] },
  ],
  '傀儡': [
    { stage: 1, name: '钢铁傀儡', level: 15, req: { item: '进化石', count: 1 }, bonus: { hp: 30, def: 22 } },
    { stage: 1.5, name: '重装傀儡', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { hp: 45, def: 35 }, branch: '重装' },
    { stage: 1.5, name: '魔法傀儡', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { hp: 35, def: 28, energy: 25 }, branch: '魔法' },
    { stage: 2, name: '战争傀儡', level: 42, req: { item: '战争核心', count: 1 }, bonus: { hp: 75, def: 55, skill: '钢铁之躯' }, from: '重装傀儡' },
    { stage: 2, name: '魔导傀儡', level: 42, req: { item: '魔导核心', count: 1 }, bonus: { hp: 55, def: 45, energy: 50, skill: '魔法护盾' }, from: '魔法傀儡' },
    { stage: 3, name: '傀儡王', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '傀儡王降临' }, from: ['战争傀儡', '魔导傀儡'] },
  ],
  // 新增物种进化链
  '兔': [
    { stage: 1, name: '灵兔', level: 10, req: { item: '进化石', count: 1 }, bonus: { spd: 20, def: 8 } },
    { stage: 1.5, name: '月兔', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { spd: 28, energy: 18 }, branch: '月光' },
    { stage: 1.5, name: '战兔', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { spd: 25, atk: 18 }, branch: '战斗' },
    { stage: 2, name: '玉兔', level: 35, req: { item: '月光石', count: 1 }, bonus: { spd: 40, energy: 35, skill: '月光斩' }, from: '月兔' },
    { stage: 2, name: '狂战兔', level: 35, req: { item: '战兔之魂', count: 1 }, bonus: { spd: 35, atk: 38, skill: '狂暴突袭' }, from: '战兔' },
    { stage: 3, name: '月神兔', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 48, skill: '月神降临' }, from: ['玉兔', '狂战兔'] },
  ],
  '鱼': [
    { stage: 1, name: '灵鱼', level: 10, req: { item: '进化石', count: 1 }, bonus: { hp: 18, energy: 15 } },
    { stage: 1.5, name: '飞鱼', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { spd: 25, atk: 15 }, branch: '疾风' },
    { stage: 1.5, name: '深海鱼', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { hp: 30, def: 15 }, branch: '深海' },
    { stage: 2, name: '龙鱼', level: 35, req: { item: '龙之鳞', count: 1 }, bonus: { hp: 45, atk: 25, skill: '龙鱼之舞' }, from: ['飞鱼', '深海鱼'] },
    { stage: 3, name: '海神鱼', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 45, skill: '海神降临' }, from: '龙鱼' },
  ],
  '虫': [
    { stage: 1, name: '大虫', level: 8, req: { item: '进化石', count: 1 }, bonus: { atk: 12, spd: 10 } },
    { stage: 1.5, name: '毒虫', level: 18, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { atk: 22, spd: 12 }, branch: '毒液' },
    { stage: 1.5, name: '甲虫', level: 18, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { atk: 18, def: 20, spd: 8 }, branch: '装甲' },
    { stage: 2, name: '虫王', level: 30, req: { item: '虫王之甲', count: 1 }, bonus: { atk: 35, def: 30, skill: '虫群召唤' }, from: ['毒虫', '甲虫'] },
    { stage: 3, name: '虫神', level: 50, req: { item: '神话契约', count: 1 }, bonus: { all: 42, skill: '虫神降临' }, from: '虫王' },
  ],
  // 补全进化链 - 鼠
  '鼠': [
    { stage: 1, name: '灵鼠', level: 8, req: { item: '进化石', count: 1 }, bonus: { spd: 22, atk: 8 } },
    { stage: 1.5, name: '银月鼠', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { spd: 30, energy: 18 }, branch: '月光' },
    { stage: 1.5, name: '紫电鼠', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { spd: 35, atk: 15 }, branch: '雷霆' },
    { stage: 2, name: '飞天鼠王', level: 35, req: { item: '风行之翼', count: 1 }, bonus: { spd: 55, atk: 32, skill: '风行术' }, from: ['银月鼠', '紫电鼠'] },
    { stage: 3, name: '鼠神·遁空', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '虚空遁形' }, from: '飞天鼠王' },
  ],
  // 补全进化链 - 鹿
  '鹿': [
    { stage: 1, name: '灵鹿', level: 10, req: { item: '进化石', count: 1 }, bonus: { hp: 18, energy: 15 } },
    { stage: 1.5, name: '森灵鹿', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { hp: 28, energy: 22, def: 10 }, branch: '森林' },
    { stage: 1.5, name: '月华鹿', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { hp: 25, energy: 30, skill: '月华' }, branch: '月光' },
    { stage: 2, name: '九色神鹿', level: 38, req: { item: '神鹿之角', count: 1 }, bonus: { hp: 55, energy: 50, skill: '九色光环' }, from: ['森灵鹿', '月华鹿'] },
    { stage: 3, name: '麒麟·瑞兽', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 58, skill: '麒麟祥瑞' }, from: '九色神鹿' },
  ],
  // 补全进化链 - 猿
  '猿': [
    { stage: 1, name: '灵猿', level: 12, req: { item: '进化石', count: 1 }, bonus: { atk: 18, hp: 12 } },
    { stage: 1.5, name: '烈焰猿', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 30, hp: 18 }, branch: '烈焰' },
    { stage: 1.5, name: '金刚猿', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { atk: 25, hp: 28, def: 15 }, branch: '金刚' },
    { stage: 2, name: '斗战猿王', level: 40, req: { item: '斗战之棒', count: 1 }, bonus: { atk: 55, hp: 45, skill: '斗战怒吼' }, from: ['烈焰猿', '金刚猿'] },
    { stage: 3, name: '齐天·大圣', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 65, skill: '齐天大圣' }, from: '斗战猿王' },
  ],
  // 补全进化链 - 螳螂
  '螳螂': [
    { stage: 1, name: '刀螂', level: 10, req: { item: '进化石', count: 1 }, bonus: { atk: 22, spd: 12 } },
    { stage: 1.5, name: '铁臂螂', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { atk: 35, spd: 15 }, branch: '钢铁' },
    { stage: 1.5, name: '碧影螂', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { atk: 30, spd: 22, skill: '影刃' }, branch: '幻影' },
    { stage: 2, name: '螳螂刀皇', level: 38, req: { item: '刀皇之刃', count: 1 }, bonus: { atk: 60, spd: 35, skill: '刀刃风暴' }, from: ['铁臂螂', '碧影螂'] },
    { stage: 3, name: '刀神·断空', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '断空斩' }, from: '螳螂刀皇' },
  ],
  // 补全进化链 - 哥布林
  '哥布林': [
    { stage: 1, name: '小妖', level: 8, req: { item: '进化石', count: 1 }, bonus: { atk: 12, spd: 10 } },
    { stage: 1.5, name: '狂战妖', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { atk: 25, def: 12 }, branch: '狂战' },
    { stage: 1.5, name: '暗法妖', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { atk: 20, energy: 25 }, branch: '暗法' },
    { stage: 2, name: '妖王·格罗姆', level: 35, req: { item: '妖王之证', count: 1 }, bonus: { atk: 45, energy: 35, skill: '妖王降临' }, from: ['狂战妖', '暗法妖'] },
    { stage: 3, name: '妖神·混沌', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '混沌降临' }, from: '妖王·格罗姆' },
  ],
  // 补全进化链 - 蟹
  '蟹': [
    { stage: 1, name: '灵蟹', level: 10, req: { item: '进化石', count: 1 }, bonus: { hp: 22, def: 18 } },
    { stage: 1.5, name: '炎甲蟹', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { hp: 30, def: 25, atk: 12 }, branch: '炎甲' },
    { stage: 1.5, name: '霜甲蟹', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { hp: 35, def: 28, skill: '冰甲' }, branch: '霜甲' },
    { stage: 2, name: '巨蟹将军', level: 38, req: { item: '将军之钳', count: 1 }, bonus: { hp: 65, def: 50, atk: 30, skill: '巨钳粉碎' }, from: ['炎甲蟹', '霜甲蟹'] },
    { stage: 3, name: '帝蟹·霸王', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 58, skill: '霸王之钳' }, from: '巨蟹将军' },
  ],
  // 补全进化链 - 蜘蛛
  '蜘蛛': [
    { stage: 1, name: '织灵', level: 10, req: { item: '进化石', count: 1 }, bonus: { atk: 15, energy: 15 } },
    { stage: 1.5, name: '毒织者', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { atk: 25, energy: 20, skill: '毒网' }, branch: '毒液' },
    { stage: 1.5, name: '幻织者', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { atk: 22, energy: 28, skill: '幻网' }, branch: '幻影' },
    { stage: 2, name: '蛛后·罗网', level: 38, req: { item: '蛛后之冠', count: 1 }, bonus: { atk: 48, energy: 45, skill: '死亡之网' }, from: ['毒织者', '幻织者'] },
    { stage: 3, name: '蛛神·千丝', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '千丝杀阵' }, from: '蛛后·罗网' },
  ],
  // 补全进化链 - 蝎
  '蝎': [
    { stage: 1, name: '灵蝎', level: 10, req: { item: '进化石', count: 1 }, bonus: { atk: 20, def: 10 } },
    { stage: 1.5, name: '赤炎蝎', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 32, def: 12 }, branch: '烈焰' },
    { stage: 1.5, name: '幽冥蝎', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { atk: 28, def: 18, skill: '冥毒' }, branch: '幽冥' },
    { stage: 2, name: '蝎王·毒煞', level: 38, req: { item: '蝎王之尾', count: 1 }, bonus: { atk: 55, def: 30, skill: '致命毒刺' }, from: ['赤炎蝎', '幽冥蝎'] },
    { stage: 3, name: '蝎神·冥杀', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '冥杀之刺' }, from: '蝎王·毒煞' },
  ],
  // 补全进化链 - 蝙蝠
  '蝙蝠': [
    { stage: 1, name: '夜蝠', level: 10, req: { item: '进化石', count: 1 }, bonus: { spd: 18, energy: 12 } },
    { stage: 1.5, name: '血翼蝠', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { spd: 25, atk: 18, skill: '吸血' }, branch: '血翼' },
    { stage: 1.5, name: '影翼蝠', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { spd: 30, energy: 20, skill: '暗影飞行' }, branch: '影翼' },
    { stage: 2, name: '吸血伯爵', level: 38, req: { item: '伯爵之血', count: 1 }, bonus: { spd: 45, atk: 40, skill: '血之盛宴' }, from: ['血翼蝠', '影翼蝠'] },
    { stage: 3, name: '夜王·永夜', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '永夜降临' }, from: '吸血伯爵' },
  ],
  // 补全进化链 - 豹
  '豹': [
    { stage: 1, name: '云豹', level: 10, req: { item: '进化石', count: 1 }, bonus: { spd: 20, atk: 12 } },
    { stage: 1.5, name: '烈风豹', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { spd: 32, atk: 18 }, branch: '疾风' },
    { stage: 1.5, name: '雷影豹', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { spd: 28, atk: 22, skill: '雷影' }, branch: '雷霆' },
    { stage: 2, name: '豹王·疾风', level: 38, req: { item: '豹王之爪', count: 1 }, bonus: { spd: 55, atk: 42, skill: '疾风突袭' }, from: ['烈风豹', '雷影豹'] },
    { stage: 3, name: '豹神·迅雷', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '迅雷不及掩耳' }, from: '豹王·疾风' },
  ],
  // 补全进化链 - 牛
  '牛': [
    { stage: 1, name: '灵牛', level: 12, req: { item: '进化石', count: 1 }, bonus: { hp: 25, atk: 15 } },
    { stage: 1.5, name: '炎角牛', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { hp: 35, atk: 22, def: 12 }, branch: '炎角' },
    { stage: 1.5, name: '玄甲牛', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { hp: 45, def: 25, atk: 12 }, branch: '玄甲' },
    { stage: 2, name: '牛魔·撼地', level: 40, req: { item: '牛魔之角', count: 1 }, bonus: { hp: 75, atk: 50, skill: '撼地冲撞' }, from: ['炎角牛', '玄甲牛'] },
    { stage: 3, name: '牛神·蛮荒', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 58, skill: '蛮荒之力' }, from: '牛魔·撼地' },
  ],
  // 补全进化链 - 马
  '马': [
    { stage: 1, name: '灵驹', level: 10, req: { item: '进化石', count: 1 }, bonus: { spd: 22, hp: 12 } },
    { stage: 1.5, name: '烈焰驹', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { spd: 30, atk: 18 }, branch: '烈焰' },
    { stage: 1.5, name: '闪电驹', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { spd: 35, energy: 15, skill: '闪电冲刺' }, branch: '雷霆' },
    { stage: 2, name: '天马·踏云', level: 38, req: { item: '天马之翼', count: 1 }, bonus: { spd: 60, atk: 35, skill: '踏云飞行' }, from: ['烈焰驹', '闪电驹'] },
    { stage: 3, name: '龙马·神行', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '神行千里' }, from: '天马·踏云' },
  ],
  // 补全进化链 - 羊
  '羊': [
    { stage: 1, name: '灵羊', level: 10, req: { item: '进化石', count: 1 }, bonus: { hp: 18, energy: 15 } },
    { stage: 1.5, name: '云羊', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { hp: 25, energy: 22, skill: '云雾' }, branch: '云端' },
    { stage: 1.5, name: '森羊', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { hp: 30, energy: 18, def: 10 }, branch: '森林' },
    { stage: 2, name: '神羊·祥瑞', level: 38, req: { item: '祥瑞之角', count: 1 }, bonus: { hp: 55, energy: 50, skill: '祥瑞之光' }, from: ['云羊', '森羊'] },
    { stage: 3, name: '神羊·瑞兽', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '瑞兽降临' }, from: '神羊·祥瑞' },
  ],
  // 补全进化链 - 猪
  '猪': [
    { stage: 1, name: '灵猪', level: 10, req: { item: '进化石', count: 1 }, bonus: { hp: 25, def: 10 } },
    { stage: 1.5, name: '野猪', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { hp: 35, atk: 18, def: 15 }, branch: '野性' },
    { stage: 1.5, name: '森猪', level: 22, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { hp: 40, def: 12, energy: 12 }, branch: '森林' },
    { stage: 2, name: '豪猪王', level: 38, req: { item: '豪猪之鬃', count: 1 }, bonus: { hp: 70, atk: 35, def: 30, skill: '尖刺防御' }, from: ['野猪', '森猪'] },
    { stage: 3, name: '猪神·蛮力', level: 58, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '蛮力冲撞' }, from: '豪猪王' },
  ],
  // 新增物种进化链 - 鹤
  '鹤': [
    { stage: 1, name: '灵鹤', level: 12, req: { item: '进化石', count: 1 }, bonus: { spd: 20, energy: 15 } },
    { stage: 1.5, name: '云鹤', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { spd: 28, energy: 22, skill: '云雾' }, branch: '云端' },
    { stage: 1.5, name: '丹顶鹤', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { spd: 25, energy: 25, def: 10 }, branch: '水韵' },
    { stage: 2, name: '仙鹤·凌云', level: 40, req: { item: '仙鹤之羽', count: 2 }, bonus: { spd: 50, energy: 45, skill: '凌云飞行' }, from: ['云鹤', '丹顶鹤'] },
    { stage: 3, name: '鹤神·九霄', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '九霄云外' }, from: '仙鹤·凌云' },
  ],
  // 新增物种进化链 - 蛙
  '蛙': [
    { stage: 1, name: '灵蛙', level: 8, req: { item: '进化石', count: 1 }, bonus: { hp: 18, atk: 10 } },
    { stage: 1.5, name: '毒蟾', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { hp: 25, atk: 18, skill: '毒液' }, branch: '毒液' },
    { stage: 1.5, name: '金蟾', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { hp: 30, energy: 20, skill: '金光' }, branch: '金光' },
    { stage: 2, name: '蛤蟆妖王', level: 35, req: { item: '妖王之珠', count: 1 }, bonus: { hp: 60, atk: 40, skill: '妖王之怒' }, from: ['毒蟾', '金蟾'] },
    { stage: 3, name: '金蟾·吞月', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 50, skill: '吞月之力' }, from: '蛤蟆妖王' },
  ],
  // 新增物种进化链 - 蜂
  '蜂': [
    { stage: 1, name: '灵蜂', level: 8, req: { item: '进化石', count: 1 }, bonus: { spd: 22, atk: 12 } },
    { stage: 1.5, name: '铁翼蜂', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { spd: 30, atk: 20, def: 8 }, branch: '铁翼' },
    { stage: 1.5, name: '毒针蜂', level: 20, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { spd: 28, atk: 25, skill: '毒针' }, branch: '毒针' },
    { stage: 2, name: '蜂后·万军', level: 35, req: { item: '蜂后之冠', count: 1 }, bonus: { spd: 45, atk: 50, skill: '蜂群召唤' }, from: ['铁翼蜂', '毒针蜂'] },
    { stage: 3, name: '蜂神·天灾', level: 55, req: { item: '神话契约', count: 1 }, bonus: { all: 52, skill: '天灾蜂群' }, from: '蜂后·万军' },
  ],
  // 新增物种进化链 - 蛇颈龙
  '蛇颈龙': [
    { stage: 1, name: '幼龙', level: 15, req: { item: '进化石', count: 2 }, bonus: { hp: 30, atk: 15, def: 12 } },
    { stage: 1.5, name: '沧龙', level: 30, req: { item: '龙之鳞', count: 2 }, condition: { element: '水' }, bonus: { hp: 50, atk: 28, def: 20 }, branch: '深海' },
    { stage: 1.5, name: '深渊龙', level: 30, req: { item: '龙之鳞', count: 2 }, bonus: { hp: 45, atk: 35, def: 15, skill: '深渊之力' }, branch: '深渊' },
    { stage: 2, name: '海龙·波塞冬', level: 45, req: { item: '海神之珠', count: 1 }, bonus: { hp: 80, atk: 55, skill: '海神之怒' }, from: ['沧龙', '深渊龙'] },
    { stage: 3, name: '龙神·沧海', level: 65, req: { item: '神话契约', count: 2 }, bonus: { all: 65, skill: '沧海龙神' }, from: '海龙·波塞冬' },
  ],
  // 新增物种进化链 - 翼龙
  '翼龙': [
    { stage: 1, name: '飞龙', level: 12, req: { item: '进化石', count: 1 }, bonus: { spd: 25, atk: 15 } },
    { stage: 1.5, name: '风神翼龙', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '电' }, bonus: { spd: 40, atk: 22, skill: '风神之翼' }, branch: '风神' },
    { stage: 1.5, name: '炎翼龙', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { spd: 35, atk: 30, skill: '炎翼' }, branch: '炎翼' },
    { stage: 2, name: '天空霸主', level: 40, req: { item: '天空之冠', count: 1 }, bonus: { spd: 60, atk: 50, skill: '天空霸权' }, from: ['风神翼龙', '炎翼龙'] },
    { stage: 3, name: '龙神·苍穹', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 58, skill: '苍穹龙神' }, from: '天空霸主' },
  ],
  // 新增物种进化链 - 独角兽
  '独角兽': [
    { stage: 1, name: '灵角兽', level: 15, req: { item: '进化石', count: 1 }, bonus: { energy: 25, atk: 12 } },
    { stage: 1.5, name: '月角兽', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { energy: 40, atk: 18, skill: '月光' }, branch: '月光' },
    { stage: 1.5, name: '圣角兽', level: 28, req: { item: '高级进化石', count: 1 }, condition: { affection: 85 }, bonus: { energy: 35, atk: 22, def: 15, skill: '圣光' }, branch: '圣光' },
    { stage: 2, name: '独角圣兽', level: 45, req: { item: '圣兽之角', count: 1 }, bonus: { energy: 70, atk: 45, skill: '圣兽降临' }, from: ['月角兽', '圣角兽'] },
    { stage: 3, name: '神兽·麒麟', level: 65, req: { item: '神话契约', count: 1 }, bonus: { all: 60, skill: '麒麟祥瑞' }, from: '独角圣兽' },
  ],
  // 新增物种进化链 - 九头蛇
  '九头蛇': [
    { stage: 1, name: '双头蛇', level: 18, req: { item: '进化石', count: 2 }, bonus: { hp: 35, atk: 20 } },
    { stage: 1.5, name: '五头蛇', level: 32, req: { item: '高级进化石', count: 2 }, condition: { element: '水' }, bonus: { hp: 55, atk: 35, def: 15 }, branch: '水蛇' },
    { stage: 1.5, name: '毒蛇皇', level: 32, req: { item: '高级进化石', count: 2 }, condition: { element: '超能' }, bonus: { hp: 50, atk: 40, skill: '剧毒' }, branch: '毒蛇' },
    { stage: 2, name: '九头蛇·海德拉', level: 50, req: { item: '九头之冠', count: 1 }, bonus: { hp: 100, atk: 65, skill: '九头攻击' }, from: ['五头蛇', '毒蛇皇'] },
    { stage: 3, name: '蛇神·九首', level: 70, req: { item: '神话契约', count: 2 }, bonus: { all: 70, skill: '九首神威' }, from: '九头蛇·海德拉' },
  ],
  // 新增物种进化链 - 凤凰雏
  '凤凰雏': [
    { stage: 1, name: '火雏', level: 15, req: { item: '进化石', count: 1 }, bonus: { atk: 20, energy: 18 } },
    { stage: 1.5, name: '炎凤', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '火' }, bonus: { atk: 38, energy: 28, skill: '炎凤之翼' }, branch: '炎凤' },
    { stage: 1.5, name: '冰凤', level: 28, req: { item: '高级进化石', count: 1 }, condition: { affection: 90 }, bonus: { atk: 32, energy: 35, def: 15, skill: '冰凤' }, branch: '冰凤' },
    { stage: 2, name: '凤凰·涅槃', level: 45, req: { item: '凤凰之羽', count: 3 }, bonus: { atk: 65, energy: 60, skill: '涅槃重生' }, from: ['炎凤', '冰凤'] },
    { stage: 3, name: '神凤·不死', level: 65, req: { item: '神话契约', count: 2 }, bonus: { all: 70, skill: '不死神凤' }, from: '凤凰·涅槃' },
  ],
  // 新增物种进化链 - 石像鬼
  '石像鬼': [
    { stage: 1, name: '石灵', level: 12, req: { item: '进化石', count: 1 }, bonus: { hp: 25, def: 20 } },
    { stage: 1.5, name: '守护石像', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '岩石' }, bonus: { hp: 45, def: 35, skill: '石像守护' }, branch: '守护' },
    { stage: 1.5, name: '恶魔石像', level: 25, req: { item: '高级进化石', count: 1 }, bonus: { hp: 40, def: 30, atk: 20, skill: '恶魔之怒' }, branch: '恶魔' },
    { stage: 2, name: '石像恶魔', level: 40, req: { item: '恶魔之石', count: 1 }, bonus: { hp: 80, def: 55, atk: 35, skill: '石像恶魔' }, from: ['守护石像', '恶魔石像'] },
    { stage: 3, name: '石神·泰坦', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 58, skill: '泰坦之力' }, from: '石像恶魔' },
  ],
  // 新增物种进化链 - 树人
  '树人': [
    { stage: 1, name: '树灵', level: 12, req: { item: '进化石', count: 1 }, bonus: { hp: 28, def: 12 } },
    { stage: 1.5, name: '古树精', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '草' }, bonus: { hp: 50, def: 25, energy: 20, skill: '自然之力' }, branch: '古树' },
    { stage: 1.5, name: '森之守卫', level: 25, req: { item: '高级进化石', count: 1 }, condition: { affection: 80 }, bonus: { hp: 45, def: 30, atk: 15, skill: '森林守护' }, branch: '守护' },
    { stage: 2, name: '世界树·尤格', level: 42, req: { item: '世界之种', count: 1 }, bonus: { hp: 100, def: 60, energy: 50, skill: '世界树庇护' }, from: ['古树精', '森之守卫'] },
    { stage: 3, name: '树神·生命', level: 62, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '生命之源' }, from: '世界树·尤格' },
  ],
  // 新增物种进化链 - 美人鱼
  '美人鱼': [
    { stage: 1, name: '人鱼', level: 12, req: { item: '进化石', count: 1 }, bonus: { energy: 22, hp: 15 } },
    { stage: 1.5, name: '海之姬', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '水' }, bonus: { energy: 38, hp: 25, skill: '海之歌声' }, branch: '海洋' },
    { stage: 1.5, name: '深渊人鱼', level: 25, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { energy: 35, atk: 20, skill: '深渊之歌' }, branch: '深渊' },
    { stage: 2, name: '美人鱼·塞壬', level: 40, req: { item: '塞壬之泪', count: 1 }, bonus: { energy: 70, atk: 40, skill: '塞壬之歌' }, from: ['海之姬', '深渊人鱼'] },
    { stage: 3, name: '海神·波涛', level: 60, req: { item: '神话契约', count: 1 }, bonus: { all: 55, skill: '海神之怒' }, from: '美人鱼·塞壬' },
  ],
  // 新增物种进化链 - 天使
  '天使': [
    { stage: 1, name: '天使', level: 15, req: { item: '进化石', count: 1 }, bonus: { energy: 25, hp: 12 } },
    { stage: 1.5, name: '炽天使', level: 28, req: { item: '高级进化石', count: 1 }, condition: { element: '超能' }, bonus: { energy: 45, atk: 20, skill: '炽天使之光' }, branch: '炽热' },
    { stage: 1.5, name: '暗天使', level: 28, req: { item: '高级进化石', count: 1 }, condition: { affection: 85 }, bonus: { energy: 40, atk: 25, def: 12, skill: '暗天使之翼' }, branch: '暗影' },
    { stage: 2, name: '大天使·米迦勒', level: 45, req: { item: '天使之羽', count: 3 }, bonus: { energy: 80, atk: 50, skill: '神圣审判' }, from: ['炽天使', '暗天使'] },
    { stage: 3, name: '天使长·神座', level: 65, req: { item: '神话契约', count: 2 }, bonus: { all: 68, skill: '神座降临' }, from: '大天使·米迦勒' },
  ],
};

//   装备系统  
const EQUIPMENT_POOL = {
  '武器': [
    { name: '铁剑', rarity: '普通', bonus: { atk: 5 } },
    { name: '精钢剑', rarity: '稀有', bonus: { atk: 12 } },
    { name: '龙牙剑', rarity: '史诗', bonus: { atk: 25, spd: 5 } },
    { name: '圣剑·屠龙', rarity: '传说', bonus: { atk: 50, spd: 15 }, skill: '屠龙斩' },
    { name: '法杖', rarity: '普通', bonus: { energy: 10 } },
    { name: '元素法杖', rarity: '稀有', bonus: { energy: 25 } },
    { name: '大贤者法杖', rarity: '史诗', bonus: { energy: 45, atk: 10 } },
    { name: '创世法杖', rarity: '传说', bonus: { energy: 80, atk: 25 }, skill: '创世魔法' },
  ],
  '护甲': [
    { name: '皮甲', rarity: '普通', bonus: { hp: 15, def: 3 } },
    { name: '锁子甲', rarity: '稀有', bonus: { hp: 30, def: 8 } },
    { name: '龙鳞甲', rarity: '史诗', bonus: { hp: 60, def: 20 } },
    { name: '圣铠·不朽', rarity: '传说', bonus: { hp: 120, def: 40 }, skill: '不朽之躯' },
    { name: '法袍', rarity: '普通', bonus: { def: 2, energy: 8 } },
    { name: '贤者长袍', rarity: '史诗', bonus: { def: 12, energy: 40 } },
  ],
  '饰品': [
    { name: '铜戒指', rarity: '普通', bonus: { atk: 2, def: 2 } },
    { name: '银戒指', rarity: '稀有', bonus: { atk: 5, def: 5, spd: 3 } },
    { name: '龙晶戒指', rarity: '史诗', bonus: { atk: 12, def: 12, spd: 8 } },
    { name: '神之戒', rarity: '传说', bonus: { atk: 25, def: 25, spd: 20 }, skill: '神之祝福' },
    { name: '灵石项链', rarity: '稀有', bonus: { hp: 25, energy: 15 } },
    { name: '龙心项链', rarity: '史诗', bonus: { hp: 50, energy: 30, atk: 10 } },
  ],
  '护符': [
    { name: '护身符', rarity: '普通', bonus: { hp: 5, def: 2 } },
    { name: '幸运符', rarity: '稀有', bonus: { hp: 10, def: 5, spd: 5 } },
    { name: '生命护符', rarity: '史诗', bonus: { hp: 40, def: 15 } },
    { name: '不死护符', rarity: '传说', bonus: { hp: 80, def: 30 }, skill: '不死之身' },
  ],
};

// 生成随机装备
function generateEquipment(type = null, forceRarity = null) {
  const types = Object.keys(EQUIPMENT_POOL);
  const equipType = type || types[Math.floor(Math.random() * types.length)];
  const pool = EQUIPMENT_POOL[equipType];

  // 确定稀有度
  let rarity = forceRarity;
  if (!rarity) {
    const roll = Math.random() * 100;
    if (roll < 3) rarity = '传说';
    else if (roll < 15) rarity = '史诗';
    else if (roll < 40) rarity = '稀有';
    else rarity = '普通';
  }

  // 从对应稀有度中随机选择
  let candidates = pool.filter(e => e.rarity === rarity);
  if (candidates.length === 0) {
    // 降级为普通稀有度
    candidates = pool.filter(e => e.rarity === '普通');
    if (candidates.length === 0) {
      // 该类型没有任何装备，返回null
      return null;
    }
  }

  const equip = candidates[Math.floor(Math.random() * candidates.length)];
  return { type: equipType, ...equip, id: DB.genId() };
}

//   图鉴系统  
const PokedexManager = {
  // 获取玩家图鉴
  getPokedex(data) {
    if (!data.pokedex) data.pokedex = { discovered: {}, collected: {} };
    return data.pokedex;
  },

  // 发现物种
  discover(data, species, rarity) {
    const pokedex = this.getPokedex(data);
    if (!pokedex.discovered[species]) {
      pokedex.discovered[species] = { firstSeen: Date.now(), rarity, count: 0 };
    }
    pokedex.discovered[species].count++;
  },

  // 收集物种
  collect(data, species) {
    const pokedex = this.getPokedex(data);
    if (!pokedex.collected[species]) pokedex.collected[species] = 0;
    pokedex.collected[species]++;
  },

  // 获取图鉴完成度
  getCompletion(data) {
    const pokedex = this.getPokedex(data);
    const totalSpecies = Object.keys(SPECIES).length;
    const discovered = Object.keys(pokedex.discovered).length;
    const percent = totalSpecies > 0 ? Math.floor(discovered / totalSpecies * 100) : 0;
    return { discovered, total: totalSpecies, percent };
  },

  // 获取图鉴列表
  getList(data) {
    const pokedex = this.getPokedex(data);
    const lines = ['【宠物图鉴】'];
    for (const [species, info] of Object.entries(SPECIES)) {
      const discovered = pokedex.discovered[species];
      const status = discovered ? `★${discovered.count}只` : '?未发现';
      lines.push(`${species}: ${status}`);
    }
    const completion = this.getCompletion(data);
    lines.push(`\n完成度: ${completion.discovered}/${completion.total} (${completion.percent}%)`);
    return lines.join('\n');
  },
};

//   排行榜系统  
const LeaderboardManager = {
  // 计算宠物潜能 (v3.6.10 统一公式)
  calcPower(pet) {
    // 使用与PetFactory.power相同的公式，加上稀有度倍率
    let power = Math.floor((pet.atk * 1.5 + pet.def + pet.maxHp * 0.5 + pet.maxEnergy * 0.3) * (1 + pet.level * 0.1));
    if (pet.rarity === '稀有') power *= 1.2;
    if (pet.rarity === '超稀有') power *= 1.5;
    if (pet.rarity === '传说') power *= 2;
    if (pet.rarity === '神话') power *= 3;
    return Math.floor(power);
  },

  // 获取排行榜
  getRanking(allData, type = 'power') {
    const entries = [];
    for (const [uid, data] of Object.entries(allData)) {
      if (!data.pets || data.pets.length === 0) continue;
      const topPet = data.pets.reduce((a, b) => this.calcPower(a) > this.calcPower(b) ? a : b);
      entries.push({
        uid,
        name: data.name || uid,
        topPet: topPet.name,
        topPower: this.calcPower(topPet),
        petCount: data.pets.length,
        maxLevel: Math.max(...data.pets.map(p => p.level || 1)),
        money: data.money || 0,
      });
    }

    // 排序
    if (type === 'power') entries.sort((a, b) => b.topPower - a.topPower);
    else if (type === 'level') entries.sort((a, b) => b.maxLevel - a.maxLevel);
    else if (type === 'count') entries.sort((a, b) => b.petCount - a.petCount);
    else if (type === 'money') entries.sort((a, b) => b.money - a.money);

    return entries.slice(0, 10);
  },

  // 格式化排行榜
  formatRanking(allData, type = 'power') {
    const ranking = this.getRanking(allData, type);
    const titles = { power: '潜能榜', level: '等级榜', count: '收集榜', money: '财富榜' };
    const lines = [`【${titles[type]}】`];
    ranking.forEach((e, i) => {
      const medal = i === 0 ? '★' : i === 1 ? '☆' : i === 2 ? '○' : `${i + 1}.`;
      if (type === 'power') lines.push(`${medal} ${e.name} - ${e.topPet} 潜能${e.topPower}`);
      else if (type === 'level') lines.push(`${medal} ${e.name} - 最高Lv.${e.maxLevel}`);
      else if (type === 'count') lines.push(`${medal} ${e.name} - ${e.petCount}只宠物`);
      else if (type === 'money') lines.push(`${medal} ${e.name} - ${e.money}金币`);
    });
    return lines.join('\n');
  },
};

//   公会系统
const GUILD_LEVELS = {
  1: { exp: 200, limit: 10 },
  2: { exp: 400, limit: 12 },
  3: { exp: 700, limit: 15 },
  4: { exp: 1100, limit: 18 },
  5: { exp: 1600, limit: 20 },
  6: { exp: 2300, limit: 22 },
  7: { exp: 3100, limit: 24 },
  8: { exp: 4200, limit: 26 },
  9: { exp: 5500, limit: 28 },
  10: { exp: 0, limit: 30 },
};

const GUILD_SHOP = {
  '宠物口粮': { cost: 30, item: '宠物粮', count: 3, limit: 5, minLevel: 1 },
  '捉宠符咒': { cost: 50, item: '捉宠符咒', count: 2, limit: 3, minLevel: 1 },
  '进化石': { cost: 120, item: '进化石', count: 1, limit: 2, minLevel: 2 },
  '高级进化石': { cost: 260, item: '高级进化石', count: 1, limit: 1, minLevel: 4 },
  '天赋果实': { cost: 360, item: '天赋果实', count: 1, limit: 1, minLevel: 5 },
  '神话契约碎片': { cost: 500, item: '神话契约碎片', count: 1, limit: 1, minLevel: 7 },
};

const GUILD_SKILLS = {
  '富足': { name: '富足', max: 5, baseCost: 1200, desc: '签到金币每级+5' },
  '勤勉': { name: '勤勉', max: 5, baseCost: 1500, desc: '签到贡献每级+1' },
  '猎手': { name: '猎手', max: 5, baseCost: 1800, desc: '公会Boss伤害每级+2%' },
  '训练': { name: '训练', max: 5, baseCost: 1600, desc: '公会Boss参与奖励每级+2%' },
};

const GUILD_TASKS = {
  daily: {
    'daily_checkin': { name: '每日同心', desc: '公会成员累计签到', target: 5, action: 'checkIn', exp: 50, bank: 100, contribution: 5 },
    'daily_donate': { name: '每日捐献', desc: '公会累计捐献金币', target: 2000, action: 'donate', exp: 40, bank: 120, contribution: 5 },
    'daily_boss': { name: '首领试炼', desc: '累计挑战公会Boss', target: 3, action: 'bossAttack', exp: 60, bank: 150, contribution: 8 },
    'daily_storage': { name: '物资互助', desc: '累计存入仓库道具', target: 3, action: 'storageDeposit', exp: 30, bank: 80, contribution: 4, userLimit: 1 },
    'daily_shop': { name: '公会流通', desc: '累计兑换公会商店', target: 2, action: 'shopBuy', exp: 30, bank: 80, contribution: 4 },
  },
  weekly: {
    'weekly_checkin': { name: '七日协作', desc: '本周累计签到', target: 20, action: 'checkIn', exp: 180, bank: 500, contribution: 15 },
    'weekly_donate': { name: '共建资金', desc: '本周累计捐献金币', target: 15000, action: 'donate', exp: 220, bank: 800, contribution: 18 },
    'weekly_boss': { name: '讨伐演练', desc: '本周累计挑战公会Boss', target: 15, action: 'bossAttack', exp: 260, bank: 900, contribution: 20 },
    'weekly_storage': { name: '物资储备', desc: '本周累计存入仓库道具', target: 10, action: 'storageDeposit', exp: 140, bank: 450, contribution: 12, userLimit: 3 },
  },
};

const GUILD_BOSS_CONFIG = {
  energyCost: 20,
  dailyChallengeLimit: 3,
  minDamageRateForParticipate: 0.005,
  minDamageRateForRank: 0.03,
  difficulties: {
    '简单': { name: '简单', hpRate: 0.6, atkRate: 0.8, rewardRate: 0.7, unlock: 1 },
    '普通': { name: '普通', hpRate: 1, atkRate: 1, rewardRate: 1, unlock: 1 },
    '困难': { name: '困难', hpRate: 1.8, atkRate: 1.25, rewardRate: 1.35, unlock: 3 },
    '噩梦': { name: '噩梦', hpRate: 3, atkRate: 1.6, rewardRate: 1.8, unlock: 5 },
  },
  phases: [
    { name: '稳固', minRate: 0.7, damageTakenRate: 1, skillRateAdd: 0 },
    { name: '压迫', minRate: 0.3, damageTakenRate: 0.9, skillRateAdd: 0.1 },
    { name: '狂暴', minRate: 0, damageTakenRate: 0.85, skillRateAdd: 0.2 },
  ],
  skills: {
    '厚甲': { name: '厚甲', desc: '触发时本次受到伤害降低25%' },
    '狂怒': { name: '狂怒', desc: '触发时本次反击额外消耗5精力' },
    '诅咒': { name: '诅咒', desc: '触发时本次最终伤害降低15%' },
    '破绽': { name: '破绽', desc: '触发时本次最终伤害提高20%' },
    '护盾': { name: '护盾', desc: '触发时生成少量护盾' },
  },
  participateReward: {
    '简单': { money: 20, contribution: 2 },
    '普通': { money: 30, contribution: 3 },
    '困难': { money: 40, contribution: 4 },
    '噩梦': { money: 55, contribution: 5 },
  },
  killReward: {
    '简单': { money: 60, contribution: 5, guildExp: 30, guildBank: 60 },
    '普通': { money: 100, contribution: 8, guildExp: 50, guildBank: 100 },
    '困难': { money: 150, contribution: 12, guildExp: 80, guildBank: 150 },
    '噩梦': { money: 220, contribution: 18, guildExp: 120, guildBank: 220 },
  },
  rankReward: [
    { rank: 1, money: 80, contribution: 8, dropRateAdd: 0.2 },
    { rank: 2, money: 50, contribution: 5, dropRateAdd: 0.1 },
    { rank: 3, money: 30, contribution: 3, dropRateAdd: 0.05 },
  ],
  historyLimit: 10,
};

function guildDateKey(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function guildWeekKey(ts = Date.now()) {
  const d = new Date(ts);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

const GuildManager = {
  _guilds: null,

  load() {
    if (this._guilds) return this._guilds;
    try {
      const saved = ext.storageGet('guilds');
      this._guilds = saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('[公会] 数据加载失败:', e.message);
      this._guilds = {};
    }

    for (const [guildName, guild] of Object.entries(this._guilds)) {
      if (!guild || typeof guild !== 'object') continue;
      this.normalizeGuild(guild, guildName);
    }

    return this._guilds;
  },

  save() {
    ext.storageSet('guilds', JSON.stringify(this._guilds || {}));
    if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
      WebUIReporter.reportGeneric('guild_snapshot', { guilds: this._guilds || {} });
    }
  },

  get guilds() { return this.load(); },

  getMemberLimit(guild) {
    const lv = Math.max(1, Math.min(10, guild.level || 1));
    return GUILD_LEVELS[lv]?.limit || 30;
  },

  getMemberName(uid) {
    return DB.getName(uid) || String(uid || '').replace('QQ:', '') || '未知';
  },

  isManager(guild, uid) {
    return guild && (guild.leader === uid || (guild.officers || []).includes(uid));
  },

  getMember(guild, uid) {
    if (!guild || !uid) return null;
    guild.memberData = guild.memberData || {};
    if (!guild.memberData[uid]) {
      guild.memberData[uid] = {
        role: guild.leader === uid ? 'leader' : ((guild.officers || []).includes(uid) ? 'officer' : 'member'),
        joinAt: Date.now(),
        contribution: 0,
        totalContribution: 0,
        lastCheckIn: '',
        donatedDate: '',
        donatedToday: 0,
        shop: {},
        bossDate: '',
        bossAttempts: 0,
      };
    }
    return guild.memberData[uid];
  },

  normalizeGuild(guild, guildName) {
    guild.name = guild.name || guildName;
    guild.members = Array.isArray(guild.members) ? [...new Set(guild.members.filter(Boolean))] : [];
    guild.level = Math.max(1, Math.min(10, guild.level || 1));
    guild.exp = guild.exp || 0;
    guild.bank = guild.bank || 0;
    guild.createdAt = guild.createdAt || Date.now();
    guild.notice = guild.notice || '';
    guild.officers = Array.isArray(guild.officers) ? guild.officers.filter(uid => guild.members.includes(uid)) : [];
    guild.memberData = guild.memberData || {};
    guild.daily = guild.daily || { date: guildDateKey(), checkIns: 0 };
    if (guild.daily.date !== guildDateKey()) guild.daily = { date: guildDateKey(), checkIns: 0, checkInUsers: {}, donated: {}, shop: {}, bossAttempts: {} };
    guild.daily.checkInUsers = guild.daily.checkInUsers || {};
    guild.daily.donated = guild.daily.donated || {};
    guild.daily.shop = guild.daily.shop || {};
    guild.daily.bossAttempts = guild.daily.bossAttempts || {};
    this.normalizeTasks(guild);
    guild.logs = Array.isArray(guild.logs) ? guild.logs.slice(-20) : [];
    guild.storage = guild.storage || {};
    guild.skills = guild.skills || {};
    guild.shopDate = guild.shopDate || guildDateKey();
    guild.boss = guild.boss || null;
    guild.bossHistory = Array.isArray(guild.bossHistory) ? guild.bossHistory.slice(-GUILD_BOSS_CONFIG.historyLimit) : [];
    guild.bossDifficulty = guild.bossDifficulty || '普通';
    if (!guild.leader || (guild.members.length > 0 && !guild.members.includes(guild.leader))) guild.leader = guild.members[0] || '';
    for (const uid of guild.members) this.getMember(guild, uid);
    for (const uid of Object.keys(guild.memberData)) {
      if (!guild.members.includes(uid)) delete guild.memberData[uid];
    }
    if (guild.leader && guild.memberData[guild.leader]) guild.memberData[guild.leader].role = 'leader';
    for (const uid of guild.officers) if (guild.memberData[uid] && uid !== guild.leader) guild.memberData[uid].role = 'officer';
    return guild;
  },

  addLog(guild, text) {
    guild.logs = guild.logs || [];
    guild.logs.push(`${new Date().toLocaleString()} ${text}`);
    if (guild.logs.length > 20) guild.logs = guild.logs.slice(-20);
  },

  normalizeTasks(guild) {
    const today = guildDateKey();
    const week = guildWeekKey();
    guild.tasks = guild.tasks || {};
    if (!guild.tasks.daily || guild.tasks.daily.date !== today) {
      guild.tasks.daily = { date: today, progress: {}, claimed: {}, contributors: {}, userProgress: {} };
    }
    if (!guild.tasks.weekly || guild.tasks.weekly.week !== week) {
      guild.tasks.weekly = { week, progress: {}, claimed: {}, contributors: {}, userProgress: {} };
    }
    guild.tasks.daily.progress = guild.tasks.daily.progress || {};
    guild.tasks.daily.claimed = guild.tasks.daily.claimed || {};
    guild.tasks.daily.contributors = guild.tasks.daily.contributors || {};
    guild.tasks.daily.userProgress = guild.tasks.daily.userProgress || {};
    guild.tasks.weekly.progress = guild.tasks.weekly.progress || {};
    guild.tasks.weekly.claimed = guild.tasks.weekly.claimed || {};
    guild.tasks.weekly.contributors = guild.tasks.weekly.contributors || {};
    guild.tasks.weekly.userProgress = guild.tasks.weekly.userProgress || {};
  },

  addTaskProgress(guild, action, uid, amount = 1) {
    this.normalizeTasks(guild);
    const n = Math.max(1, Math.floor(Number(amount) || 1));
    for (const period of ['daily', 'weekly']) {
      const defs = GUILD_TASKS[period] || {};
      const state = guild.tasks[period];
      for (const [id, task] of Object.entries(defs)) {
        if (task.action !== action) continue;
        let add = n;
        if (task.userLimit) {
          state.userProgress[id] = state.userProgress[id] || {};
          const used = state.userProgress[id][uid] || 0;
          add = Math.min(add, Math.max(0, task.userLimit - used));
          if (add <= 0) continue;
          state.userProgress[id][uid] = used + add;
        }
        state.progress[id] = Math.min(task.target, (state.progress[id] || 0) + add);
        state.contributors[id] = state.contributors[id] || {};
        state.contributors[id][uid] = true;
      }
    }
  },

  claimTask(uid, data, period, taskId) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    let periodKey = period === 'weekly' || period === '周常' || period === '每周' ? 'weekly' : 'daily';
    let id = taskId;
    if (!id && GUILD_TASKS.daily[period]) {
      periodKey = 'daily';
      id = period;
    } else if (!id && GUILD_TASKS.weekly[period]) {
      periodKey = 'weekly';
      id = period;
    }
    const defs = GUILD_TASKS[periodKey] || {};
    const task = defs[id];
    if (!task) return { success: false, msg: `任务不存在，可用: ${Object.keys(defs).join('、')}` };
    this.normalizeTasks(guild);
    const state = guild.tasks[periodKey];
    const progress = state.progress[id] || 0;
    if (progress < task.target) return { success: false, msg: `任务未完成：${progress}/${task.target}` };
    if (state.claimed[id]) return { success: false, msg: '该任务奖励已领取' };
    const contributors = Object.keys(state.contributors[id] || {}).filter(memberId => guild.members.includes(memberId));
    if (contributors.length === 0) contributors.push(uid);
    const eachContribution = Math.max(1, Math.floor(task.contribution / Math.max(1, contributors.length)));
    for (const memberId of contributors) {
      const member = this.getMember(guild, memberId);
      member.contribution = (member.contribution || 0) + eachContribution;
      member.totalContribution = (member.totalContribution || 0) + eachContribution;
    }
    guild.exp += task.exp;
    guild.bank += task.bank;
    state.claimed[id] = uid;
    const ups = this.checkLevelUp(guild);
    this.addLog(guild, `${this.getMemberName(uid)} 领取${periodKey === 'daily' ? '每日' : '每周'}任务【${task.name}】奖励`);
    this.save();
    return { success: true, msg: `任务奖励领取成功：公会经验+${task.exp}，资金+${task.bank}\n参与成员贡献+${eachContribution}${ups.length ? `\n公会升级到 Lv.${guild.level}！` : ''}` };
  },

  formatTasks(uid, data, period = 'daily') {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const periodKey = period === 'weekly' || period === '周常' || period === '每周' ? 'weekly' : 'daily';
    this.normalizeTasks(guild);
    const defs = GUILD_TASKS[periodKey] || {};
    const state = guild.tasks[periodKey];
    const title = periodKey === 'daily' ? `每日任务 ${state.date}` : `每周任务 ${state.week}`;
    const lines = [`【公会${title}】`];
    for (const [id, task] of Object.entries(defs)) {
      const progress = Math.min(task.target, state.progress[id] || 0);
      const done = progress >= task.target;
      const claimed = state.claimed[id] ? '已领' : (done ? '可领' : '未完成');
      lines.push(`${task.name}(${id}) ${progress}/${task.target} ${claimed}\n- ${task.desc}；奖励: 经验${task.exp}/资金${task.bank}/贡献${task.contribution}`);
    }
    lines.push(`领取: .宠物公会 任务 领取 ${periodKey === 'daily' ? 'daily' : 'weekly'} <任务ID>`);
    this.save();
    return lines.join('\n');
  },

  checkLevelUp(guild) {
    const ups = [];
    while (guild.level < 10) {
      const need = GUILD_LEVELS[guild.level]?.exp || 0;
      if (!need || guild.exp < need) break;
      guild.exp -= need;
      guild.level++;
      ups.push(guild.level);
      this.addLog(guild, `公会升级到 Lv.${guild.level}`);
    }
    return ups;
  },

  ensureGuildFromUser(uid, data) {
    this.load();
    const guildName = (data && data.guild || '').trim();
    if (!guildName) return null;
    let guild = this._guilds[guildName];
    if (!guild) {
      guild = this.rebuildGuildFromUsers(guildName, uid, data).guild;
      return guild;
    }
    this.normalizeGuild(guild, guildName);
    if (!guild.members.includes(uid)) {
      if (guild.members.length >= this.getMemberLimit(guild)) return guild;
      guild.members.push(uid);
    }
    this.getMember(guild, uid);
    if (!guild.leader || !guild.members.includes(guild.leader)) guild.leader = guild.members[0];
    this.save();
    return guild;
  },

  rebuildGuildFromUsers(name, fallbackUid = '', fallbackData = null) {
    this.load();
    const guildName = (name || '').trim();
    if (!guildName) return { success: false, msg: '请输入公会名称', guild: null };

    const members = [];
    try {
      const savedNameMap = ext.storageGet('nameMap_global');
      const nameMap = savedNameMap ? JSON.parse(savedNameMap) : {};
      for (const uid of Object.keys(nameMap)) {
        const raw = ext.storageGet('u_' + uid);
        if (!raw) continue;
        const userData = JSON.parse(raw);
        if (userData && userData.guild === guildName) members.push(uid);
      }
    } catch (e) {
      console.warn('[公会] 从玩家数据恢复公会失败:', e.message);
    }

    if (fallbackUid && fallbackData && fallbackData.guild === guildName) members.push(fallbackUid);
    const uniqueMembers = [...new Set(members.filter(Boolean))];
    const oldGuild = this._guilds[guildName] || {};
    const guild = this._guilds[guildName] = this.normalizeGuild({
      ...oldGuild,
      name: oldGuild.name || guildName,
      leader: uniqueMembers.includes(oldGuild.leader) ? oldGuild.leader : (uniqueMembers[0] || fallbackUid || ''),
      members: uniqueMembers,
      level: oldGuild.level || 1,
      exp: oldGuild.exp || 0,
      bank: oldGuild.bank || 0,
    }, guildName);
    this.save();
    return { success: true, msg: `已从玩家存档恢复公会【${guildName}】，成员${guild.members.length}/${this.getMemberLimit(guild)}`, guild };
  },

  createGuild(uid, data, name) {
    this.load();
    const guildName = (name || '').trim();
    if (!guildName) return { success: false, msg: '请输入公会名称' };
    if (guildName.length < 2 || guildName.length > 12) return { success: false, msg: '公会名称需为2-12个字符' };
    if (data.money < 5000) return { success: false, msg: '创建公会需要5000金币' };
    if (data.guild) {
      this.ensureGuildFromUser(uid, data);
      return { success: false, msg: '你已加入公会' };
    }
    if (this._guilds[guildName]) return { success: false, msg: '公会名已存在' };
    data.money -= 5000;
    this._guilds[guildName] = this.normalizeGuild({ name: guildName, leader: uid, members: [uid], level: 1, exp: 0, bank: 0 }, guildName);
    data.guild = guildName;
    this.addLog(this._guilds[guildName], `${this.getMemberName(uid)} 创建公会`);
    this.save();
    return { success: true, msg: `公会【${guildName}】创建成功！` };
  },

  joinGuild(uid, data, name) {
    this.load();
    const guildName = (name || '').trim();
    if (!guildName) return { success: false, msg: '请输入公会名称' };
    if (data.guild) {
      this.ensureGuildFromUser(uid, data);
      return { success: false, msg: '你已加入公会' };
    }
    const guild = this._guilds[guildName];
    if (!guild) return { success: false, msg: '公会不存在' };
    this.normalizeGuild(guild, guildName);
    if (guild.members.length >= this.getMemberLimit(guild)) return { success: false, msg: '公会成员已满' };
    guild.members.push(uid);
    data.guild = guildName;
    this.getMember(guild, uid);
    this.addLog(guild, `${this.getMemberName(uid)} 加入公会`);
    this.save();
    return { success: true, msg: `成功加入公会【${guildName}】` };
  },

  leaveGuild(uid, data) {
    this.load();
    if (!data.guild) return { success: false, msg: '你未加入公会' };
    const guildName = data.guild;
    const guild = this._guilds[guildName];
    if (guild) {
      this.normalizeGuild(guild, guildName);
      guild.members = guild.members.filter(m => m !== uid);
      guild.officers = (guild.officers || []).filter(m => m !== uid);
      delete guild.memberData[uid];
      if (guild.leader === uid && guild.members.length > 0) guild.leader = guild.members[0];
      if (guild.members.length === 0) delete this._guilds[guildName];
      else this.addLog(guild, `${this.getMemberName(uid)} 退出公会`);
    }
    delete data.guild;
    data.guildLeaveAt = Date.now();
    this.save();
    return { success: true, msg: '已退出公会' };
  },

  getGuildInfo(uid, data) {
    this.load();
    if (!data.guild) return '你未加入公会';
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const leaderName = this.getMemberName(guild.leader);
    const lvConf = GUILD_LEVELS[guild.level] || GUILD_LEVELS[10];
    const expText = guild.level >= 10 ? 'MAX' : `${guild.exp}/${lvConf.exp}`;
    const notice = guild.notice ? `\n公告: ${guild.notice}` : '';
    return `【${guild.name}】Lv.${guild.level}\n会长: ${leaderName}\n成员: ${guild.members.length}/${this.getMemberLimit(guild)}\n经验: ${expText}\n资金: ${guild.bank}\n今日签到: ${guild.daily.checkIns || 0}${notice}`;
  },

  formatMembers(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const lines = [`【${guild.name}成员】`];
    guild.members.slice(0, 20).forEach((mid, i) => {
      const m = this.getMember(guild, mid);
      const role = mid === guild.leader ? '会长' : ((guild.officers || []).includes(mid) ? '副会长' : '成员');
      const checked = m.lastCheckIn === guildDateKey() ? '✓' : '-';
      lines.push(`${i + 1}. ${this.getMemberName(mid)} ${role} 贡献:${m.contribution || 0}/${m.totalContribution || 0} 签到:${checked}`);
    });
    if (guild.members.length > 20) lines.push(`...其余${guild.members.length - 20}人未显示`);
    return lines.join('\n');
  },

  checkIn(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    const member = this.getMember(guild, uid);
    const today = guildDateKey();
    if (member.lastCheckIn === today || guild.daily.checkInUsers[uid]) return { success: false, msg: '今天已经签到过了' };
    const richLv = guild.skills['富足'] || 0;
    const diligentLv = guild.skills['勤勉'] || 0;
    const money = 100 + (guild.level || 1) * 10 + richLv * 5;
    const contribution = 10 + diligentLv;
    member.lastCheckIn = today;
    guild.daily.checkInUsers[uid] = true;
    member.contribution += contribution;
    member.totalContribution += contribution;
    guild.exp += 10;
    guild.bank += 20;
    guild.daily.checkIns = (guild.daily.checkIns || 0) + 1;
    this.addTaskProgress(guild, 'checkIn', uid, 1);
    data.money = Math.min(CONFIG.maxMoney, (data.money || 0) + money);
    const ups = this.checkLevelUp(guild);
    this.addLog(guild, `${this.getMemberName(uid)} 签到，贡献+${contribution}`);
    this.save();
    return { success: true, msg: `签到成功！获得${money}金币，贡献+${contribution}\n公会经验+10，资金+20${ups.length ? `\n公会升级到 Lv.${guild.level}！` : ''}` };
  },

  donate(uid, data, amount) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return { success: false, msg: '请输入正确的捐献金币数量' };
    if ((data.money || 0) < n) return { success: false, msg: '金币不足' };
    const member = this.getMember(guild, uid);
    const today = guildDateKey();
    if (member.donatedDate !== today) { member.donatedDate = today; member.donatedToday = 0; }
    const donatedToday = Math.max(member.donatedToday || 0, guild.daily.donated[uid] || 0);
    const remain = Math.max(0, 5000 - donatedToday);
    if (remain <= 0) return { success: false, msg: '今日捐献已达上限5000金币' };
    const real = Math.min(n, remain);
    const contribution = Math.floor(real / 100);
    data.money -= real;
    member.donatedToday = donatedToday + real;
    guild.daily.donated[uid] = member.donatedToday;
    member.contribution += contribution;
    member.totalContribution += contribution;
    guild.bank += real;
    guild.exp += contribution;
    this.addTaskProgress(guild, 'donate', uid, real);
    const ups = this.checkLevelUp(guild);
    this.addLog(guild, `${this.getMemberName(uid)} 捐献${real}金币`);
    this.save();
    return { success: true, msg: `捐献成功：${real}金币\n贡献+${contribution}，公会资金+${real}，经验+${contribution}${real < n ? '\n已按今日上限截断' : ''}${ups.length ? `\n公会升级到 Lv.${guild.level}！` : ''}` };
  },

  setNotice(uid, data, text) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (!this.isManager(guild, uid)) return { success: false, msg: '只有会长/副会长可以修改公告' };
    const notice = (text || '').trim();
    if (!notice) return { success: false, msg: '请输入公告内容' };
    if (notice.length > 80) return { success: false, msg: '公告不能超过80字' };
    guild.notice = notice;
    this.addLog(guild, `${this.getMemberName(uid)} 修改公告`);
    this.save();
    return { success: true, msg: `公告已更新：${notice}` };
  },

  transfer(uid, data, targetUid) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (guild.leader !== uid) return { success: false, msg: '只有会长可以转让' };
    if (!targetUid || !guild.members.includes(targetUid)) return { success: false, msg: '目标不是本公会成员' };
    guild.leader = targetUid;
    guild.officers = (guild.officers || []).filter(id => id !== targetUid);
    this.getMember(guild, uid).role = 'member';
    this.getMember(guild, targetUid).role = 'leader';
    this.addLog(guild, `会长转让给 ${this.getMemberName(targetUid)}`);
    this.save();
    return { success: true, msg: `已将会长转让给 ${this.getMemberName(targetUid)}` };
  },

  appoint(uid, data, targetUid, appoint = true) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (guild.leader !== uid) return { success: false, msg: '只有会长可以任免副会长' };
    if (!targetUid || !guild.members.includes(targetUid)) return { success: false, msg: '目标不是本公会成员' };
    if (targetUid === guild.leader) return { success: false, msg: '会长无需任命' };
    guild.officers = guild.officers || [];
    if (appoint && !guild.officers.includes(targetUid)) guild.officers.push(targetUid);
    if (!appoint) guild.officers = guild.officers.filter(id => id !== targetUid);
    this.getMember(guild, targetUid).role = appoint ? 'officer' : 'member';
    this.addLog(guild, `${this.getMemberName(uid)} ${appoint ? '任命' : '取消'} ${this.getMemberName(targetUid)} 副会长`);
    this.save();
    return { success: true, msg: `${appoint ? '已任命' : '已取消'} ${this.getMemberName(targetUid)} ${appoint ? '为副会长' : '的副会长'}` };
  },

  kick(uid, data, targetUid) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (!this.isManager(guild, uid)) return { success: false, msg: '只有会长/副会长可以踢人' };
    if (!targetUid || !guild.members.includes(targetUid)) return { success: false, msg: '目标不是本公会成员' };
    if (targetUid === guild.leader) return { success: false, msg: '不能踢出会长' };
    if ((guild.officers || []).includes(targetUid) && guild.leader !== uid) return { success: false, msg: '副会长不能踢出副会长' };
    guild.members = guild.members.filter(id => id !== targetUid);
    guild.officers = (guild.officers || []).filter(id => id !== targetUid);
    delete guild.memberData[targetUid];
    const targetData = DB.get(targetUid);
    if (targetData.guild === guild.name) { delete targetData.guild; targetData.guildLeaveAt = Date.now(); DB.save(targetUid, targetData); }
    this.addLog(guild, `${this.getMemberName(uid)} 踢出 ${this.getMemberName(targetUid)}`);
    this.save();
    return { success: true, msg: `已踢出 ${this.getMemberName(targetUid)}` };
  },

  formatLogs(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    return ['【公会日志】', ...(guild.logs || []).slice(-10)].join('\n');
  },

  formatShop(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const member = this.getMember(guild, uid);
    const lines = [`【公会商店】你的贡献: ${member.contribution || 0}`];
    for (const [name, item] of Object.entries(GUILD_SHOP)) {
      const bought = guild.daily.shop?.[uid]?.[name] || member.shop?.[guildDateKey()]?.[name] || 0;
      const locked = guild.level < item.minLevel ? ` Lv.${item.minLevel}解锁` : '';
      lines.push(`${name} - ${item.cost}贡献 (${item.item}x${item.count}) 限购${bought}/${item.limit}${locked}`);
    }
    lines.push('.宠物公会 兑换 <商品名>');
    return lines.join('\n');
  },

  buyShop(uid, data, name) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    const item = GUILD_SHOP[name];
    if (!item) return { success: false, msg: `商品不存在，可用: ${Object.keys(GUILD_SHOP).join('、')}` };
    if (guild.level < item.minLevel) return { success: false, msg: `需要公会Lv.${item.minLevel}` };
    const member = this.getMember(guild, uid);
    const today = guildDateKey();
    member.shop = member.shop || {};
    member.shop[today] = member.shop[today] || {};
    guild.daily.shop[uid] = guild.daily.shop[uid] || {};
    const bought = guild.daily.shop[uid][name] || member.shop[today][name] || 0;
    if (bought >= item.limit) return { success: false, msg: '今日已达限购' };
    if ((member.contribution || 0) < item.cost) return { success: false, msg: '贡献不足' };
    member.contribution -= item.cost;
    member.shop[today][name] = bought + 1;
    guild.daily.shop[uid][name] = bought + 1;
    data.items = data.items || {};
    data.items[item.item] = (data.items[item.item] || 0) + item.count;
    this.addTaskProgress(guild, 'shopBuy', uid, 1);
    this.addLog(guild, `${this.getMemberName(uid)} 兑换 ${name}`);
    this.save();
    return { success: true, msg: `兑换成功：${item.item}x${item.count}，消耗${item.cost}贡献` };
  },

  storageDeposit(uid, data, itemName, count) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    const rawCount = count === undefined || count === '' ? 1 : Number(count);
    if (!Number.isSafeInteger(rawCount) || rawCount <= 0) return { success: false, msg: '请输入正确的数量' };
    const n = rawCount;
    data.items = data.items || {};
    if (!itemName || (data.items[itemName] || 0) < n) return { success: false, msg: '道具不足' };
    data.items[itemName] -= n;
    if (data.items[itemName] <= 0) delete data.items[itemName];
    guild.storage[itemName] = (guild.storage[itemName] || 0) + n;
    this.addTaskProgress(guild, 'storageDeposit', uid, n);
    this.addLog(guild, `${this.getMemberName(uid)} 存入 ${itemName}x${n}`);
    this.save();
    return { success: true, msg: `已存入公会仓库：${itemName}x${n}` };
  },

  storageWithdraw(uid, data, itemName, count) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (!this.isManager(guild, uid)) return { success: false, msg: '只有会长/副会长可以取出仓库道具' };
    const rawCount = count === undefined || count === '' ? 1 : Number(count);
    if (!Number.isSafeInteger(rawCount) || rawCount <= 0) return { success: false, msg: '请输入正确的数量' };
    const n = rawCount;
    if (!itemName || (guild.storage[itemName] || 0) < n) return { success: false, msg: '仓库道具不足' };
    guild.storage[itemName] -= n;
    if (guild.storage[itemName] <= 0) delete guild.storage[itemName];
    data.items = data.items || {};
    data.items[itemName] = (data.items[itemName] || 0) + n;
    this.addLog(guild, `${this.getMemberName(uid)} 取出 ${itemName}x${n}`);
    this.save();
    return { success: true, msg: `已取出：${itemName}x${n}` };
  },

  formatStorage(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const entries = Object.entries(guild.storage || {});
    if (entries.length === 0) return '【公会仓库】空空如也\n.宠物公会 仓库 存入 <道具> [数量]';
    return ['【公会仓库】', ...entries.map(([k, v]) => `${k} x${v}`), '\n存入: .宠物公会 仓库 存入 <道具> [数量]', '取出: .宠物公会 仓库 取出 <道具> [数量]'].join('\n');
  },

  formatSkills(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const lines = [`【公会技能】资金:${guild.bank}`];
    for (const [name, cfg] of Object.entries(GUILD_SKILLS)) {
      const lv = guild.skills[name] || 0;
      const cost = cfg.baseCost * (lv + 1);
      lines.push(`${name} Lv.${lv}/${cfg.max} - ${cfg.desc}${lv < cfg.max ? `，升级需${cost}资金` : ''}`);
    }
    lines.push('.宠物公会 技能 升级 <技能名>');
    return lines.join('\n');
  },

  upgradeSkill(uid, data, name) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (guild.leader !== uid) return { success: false, msg: '只有会长可以升级公会技能' };
    const cfg = GUILD_SKILLS[name];
    if (!cfg) return { success: false, msg: `技能不存在，可用: ${Object.keys(GUILD_SKILLS).join('、')}` };
    const lv = guild.skills[name] || 0;
    if (lv >= cfg.max) return { success: false, msg: '技能已满级' };
    const cost = cfg.baseCost * (lv + 1);
    if ((guild.bank || 0) < cost) return { success: false, msg: `公会资金不足，需要${cost}` };
    guild.bank -= cost;
    guild.skills[name] = lv + 1;
    this.addLog(guild, `升级技能 ${name} 到 Lv.${lv + 1}`);
    this.save();
    return { success: true, msg: `公会技能【${name}】升级到 Lv.${lv + 1}` };
  },

  getBoss(guild) {
    const today = guildDateKey();
    if (!guild.boss || guild.boss.date !== today) {
      const lv = guild.level || 1;
      const difficultyName = guild.bossDifficulty || '普通';
      const difficulty = GUILD_BOSS_CONFIG.difficulties[difficultyName] || GUILD_BOSS_CONFIG.difficulties['普通'];
      const maxHp = Math.floor((3000 + lv * 1200 + guild.members.length * 300) * difficulty.hpRate);
      const skills = Object.keys(GUILD_BOSS_CONFIG.skills);
      const bossSkill = skills[(lv + guild.members.length + today.length) % skills.length];
      guild.boss = {
        date: today,
        name: `公会守卫兽·Lv${lv}`,
        difficulty: difficulty.name,
        skill: bossSkill,
        phase: '稳固',
        shield: 0,
        skillUses: {},
        maxHp,
        hp: maxHp,
        atk: Math.floor((80 + lv * 15) * difficulty.atkRate),
        def: Math.floor((20 + lv * 5) * difficulty.atkRate),
        damage: {},
        participants: {},
        rewards: {},
        killed: false,
        startedAt: Date.now(),
      };
    }
    guild.boss.damage = guild.boss.damage || {};
    guild.boss.participants = guild.boss.participants || {};
    guild.boss.rewards = guild.boss.rewards || {};
    guild.boss.skillUses = guild.boss.skillUses || {};
    guild.boss.difficulty = guild.boss.difficulty || guild.bossDifficulty || '普通';
    guild.boss.skill = guild.boss.skill || '厚甲';
    guild.boss.shield = guild.boss.shield || 0;
    if ((guild.boss.killed || guild.boss.hp <= 0) && guild.boss.rewardSettled === undefined) guild.boss.rewardSettled = true;
    return guild.boss;
  },

  getBossPhase(boss) {
    const rate = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    return GUILD_BOSS_CONFIG.phases.find(p => rate >= p.minRate) || GUILD_BOSS_CONFIG.phases[GUILD_BOSS_CONFIG.phases.length - 1];
  },

  getBossDropPool(guild, difficultyName, rankBonus = 0) {
    const bossLevel = (guild.level || 1) * 5 + (difficultyName === '噩梦' ? 20 : difficultyName === '困难' ? 12 : difficultyName === '普通' ? 5 : 0);
    const pools = bossLevel >= 41
      ? ['高级进化石', '天赋果实', '神话契约碎片', '进化石']
      : bossLevel >= 21
        ? ['进化石', '高级进化石', '天赋果实', '宠物粮']
        : ['宠物粮', '进化石', '捉宠符咒'];
    const rareRate = Math.min(0.35, 0.12 + rankBonus + (difficultyName === '噩梦' ? 0.08 : difficultyName === '困难' ? 0.04 : 0));
    if (Math.random() > rareRate) return null;
    return pools[Math.floor(Math.random() * pools.length)];
  },

  setBossDifficulty(uid, data, difficultyName) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (!this.isManager(guild, uid)) return { success: false, msg: '只有会长/副会长可设置Boss难度' };
    const difficulty = GUILD_BOSS_CONFIG.difficulties[difficultyName];
    if (!difficulty) return { success: false, msg: `可选难度: ${Object.keys(GUILD_BOSS_CONFIG.difficulties).join('、')}` };
    if ((guild.level || 1) < difficulty.unlock) return { success: false, msg: `${difficulty.name}难度需要公会Lv.${difficulty.unlock}` };
    const boss = this.getBoss(guild);
    if (boss.date === guildDateKey() && (Object.keys(boss.damage || {}).length > 0 || boss.killed)) return { success: false, msg: '今日Boss已开始或已结算，不能修改难度' };
    guild.bossDifficulty = difficulty.name;
    guild.boss = null;
    this.addLog(guild, `${this.getMemberName(uid)} 设置今日Boss难度为${difficulty.name}`);
    this.save();
    return { success: true, msg: `公会Boss难度已设置为【${difficulty.name}】` };
  },

  grantBossReward(guild, boss, uid, data, reward, rankBonus = null) {
    const member = this.getMember(guild, uid);
    const rewardRate = 1 + ((guild.skills['训练'] || 0) * 0.02);
    const money = Math.floor((reward.money + (rankBonus?.money || 0)) * rewardRate);
    const contribution = reward.contribution + (rankBonus?.contribution || 0);
    data.money = Math.min(CONFIG.maxMoney, (data.money || 0) + money);
    member.contribution = (member.contribution || 0) + contribution;
    member.totalContribution = (member.totalContribution || 0) + contribution;
    const item = this.getBossDropPool(guild, boss.difficulty, rankBonus?.dropRateAdd || 0);
    if (item) {
      data.items = data.items || {};
      data.items[item] = (data.items[item] || 0) + 1;
    }
    boss.rewards[uid] = true;
    return { money, contribution, item };
  },

  settleBossRewards(guild, boss, killerUid, killerData) {
    if (boss.rewardSettled) return { lines: [], exp: 0, bank: 0 };
    const difficulty = boss.difficulty || '普通';
    const killReward = GUILD_BOSS_CONFIG.killReward[difficulty] || GUILD_BOSS_CONFIG.killReward['普通'];
    const participateReward = GUILD_BOSS_CONFIG.participateReward[difficulty] || GUILD_BOSS_CONFIG.participateReward['普通'];
    const eligibleDamage = Math.max(1, Math.floor(boss.maxHp * GUILD_BOSS_CONFIG.minDamageRateForParticipate));
    const rankDamage = Math.max(1, Math.floor(boss.maxHp * GUILD_BOSS_CONFIG.minDamageRateForRank));
    const rank = Object.entries(boss.damage || {}).sort((a, b) => b[1] - a[1]);
    const rewardLines = [];
    for (const [id, damage] of rank) {
      if (damage < eligibleDamage) continue;
      const playerData = id === killerUid ? killerData : DB.get(id);
      if (!playerData) continue;
      const rankIndex = rank.findIndex(([rankId]) => rankId === id);
      const rankReward = rankIndex >= 0 && rankIndex < 3 && damage >= rankDamage ? GUILD_BOSS_CONFIG.rankReward[rankIndex] : null;
      const result = this.grantBossReward(guild, boss, id, playerData, killReward, rankReward);
      DB.save(id, playerData);
      rewardLines.push(`${this.getMemberName(id)} 获得${result.money}金币、贡献+${result.contribution}${result.item ? `、${result.item}x1` : ''}`);
    }
    if (rewardLines.length === 0) {
      const result = this.grantBossReward(guild, boss, killerUid, killerData, participateReward, null);
      rewardLines.push(`${this.getMemberName(killerUid)} 获得${result.money}金币、贡献+${result.contribution}${result.item ? `、${result.item}x1` : ''}`);
    }
    guild.exp += killReward.guildExp;
    guild.bank += killReward.guildBank;
    boss.rewardSettled = true;
    this.checkLevelUp(guild);
    return { lines: rewardLines, exp: killReward.guildExp, bank: killReward.guildBank };
  },

  recordBossHistory(guild, boss) {
    const rank = Object.entries(boss.damage || {}).sort((a, b) => b[1] - a[1]);
    const top3 = rank.slice(0, 3).map(([id, damage]) => ({ id, name: this.getMemberName(id), damage, rate: boss.maxHp ? Math.floor(damage / boss.maxHp * 1000) / 10 : 0 }));
    const mvp = top3[0];
    guild.bossHistory = guild.bossHistory || [];
    guild.bossHistory.push({
      date: boss.date,
      name: boss.name,
      difficulty: boss.difficulty || '普通',
      skill: boss.skill || '厚甲',
      killed: !!boss.killed,
      totalDamage: rank.reduce((sum, [, damage]) => sum + damage, 0),
      maxHp: boss.maxHp,
      participants: rank.length,
      mvpName: mvp?.name || '无',
      mvpDamage: mvp?.damage || 0,
      top3,
    });
    guild.bossHistory = guild.bossHistory.slice(-GUILD_BOSS_CONFIG.historyLimit);
  },

  formatBoss(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const boss = this.getBoss(guild);
    const phase = this.getBossPhase(boss);
    const skill = GUILD_BOSS_CONFIG.skills[boss.skill] || GUILD_BOSS_CONFIG.skills['厚甲'];
    const status = boss.killed || boss.hp <= 0 ? '今日已击败' : `HP: ${boss.hp}/${boss.maxHp}${boss.shield ? ` 护盾:${boss.shield}` : ''}`;
    const lines = [
      `【公会Boss】${boss.name}`,
      `难度:${boss.difficulty || '普通'} 阶段:${phase.name} 技能:${skill.name}`,
      skill.desc,
      status,
      `.宠物公会 Boss 攻击 <宠物编号>`,
      '.宠物公会 Boss 排行',
      '.宠物公会 Boss 难度 <简单/普通/困难/噩梦>',
      '.宠物公会 Boss 历史',
    ];
    this.save();
    return lines.join('\n');
  },

  attackBoss(uid, data, pet) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return { success: false, msg: '你未加入公会' };
    if (!pet) return { success: false, msg: '请指定宠物编号' };
    if (pet.hp <= 0) return { success: false, msg: '宠物已阵亡' };
    if ((pet.energy || 0) < GUILD_BOSS_CONFIG.energyCost) return { success: false, msg: `宠物精力不足(需要${GUILD_BOSS_CONFIG.energyCost})` };
    const member = this.getMember(guild, uid);
    const today = guildDateKey();
    if (member.bossDate !== today) { member.bossDate = today; member.bossAttempts = 0; }
    const attempts = Math.max(member.bossAttempts || 0, guild.daily.bossAttempts[uid] || 0);
    if (attempts >= GUILD_BOSS_CONFIG.dailyChallengeLimit) return { success: false, msg: '今日公会Boss挑战次数已用完' };
    const boss = this.getBoss(guild);
    if (boss.hp <= 0 || boss.killed) return { success: false, msg: '今日公会Boss已被击败' };
    member.bossAttempts = attempts + 1;
    guild.daily.bossAttempts[uid] = member.bossAttempts;
    this.addTaskProgress(guild, 'bossAttack', uid, 1);
    pet.energy -= GUILD_BOSS_CONFIG.energyCost;

    const phase = this.getBossPhase(boss);
    boss.phase = phase.name;
    const skillBoost = 1 + ((guild.skills['猎手'] || 0) * 0.02);
    let damage = Math.max(1, Math.floor(((pet.atk || 10) * 3 + (pet.level || 1) * 8 - boss.def + Math.floor(Math.random() * 50)) * skillBoost * phase.damageTakenRate));
    const skillRate = 0.2 + phase.skillRateAdd;
    const effects = [];
    if (Math.random() < skillRate) {
      if (boss.skill === '厚甲') {
        damage = Math.max(1, Math.floor(damage * 0.75));
        effects.push('厚甲减免了部分伤害');
      } else if (boss.skill === '诅咒') {
        damage = Math.max(1, Math.floor(damage * 0.85));
        effects.push('诅咒压低了本次伤害');
      } else if (boss.skill === '破绽') {
        damage = Math.max(1, Math.floor(damage * 1.2));
        effects.push('Boss露出破绽，伤害提高');
      } else if (boss.skill === '护盾' && (boss.skillUses.shield || 0) < 3) {
        const shield = Math.max(1, Math.floor(boss.maxHp * 0.03));
        boss.shield = (boss.shield || 0) + shield;
        boss.skillUses.shield = (boss.skillUses.shield || 0) + 1;
        effects.push(`Boss召唤护盾+${shield}`);
      } else if (boss.skill === '狂怒' && (boss.skillUses.rage || 0) < 2) {
        const extraCost = Math.min(5, pet.energy || 0);
        pet.energy -= extraCost;
        boss.skillUses.rage = (boss.skillUses.rage || 0) + 1;
        effects.push(`狂怒额外消耗${extraCost}精力`);
      }
    }

    let shieldDamage = 0;
    if ((boss.shield || 0) > 0) {
      shieldDamage = Math.min(boss.shield, damage);
      boss.shield -= shieldDamage;
      damage -= shieldDamage;
    }
    boss.hp = Math.max(0, boss.hp - damage);
    const totalDamage = damage + shieldDamage;
    boss.damage[uid] = (boss.damage[uid] || 0) + totalDamage;
    boss.participants[uid] = true;
    const counter = Math.max(1, boss.atk - (pet.def || 0) + Math.floor(Math.random() * 20));
    pet.hp = Math.max(1, (pet.hp || 1) - counter);
    let msg = `阶段【${phase.name}】造成${totalDamage}伤害${shieldDamage ? `(护盾吸收${shieldDamage})` : ''}，Boss HP:${boss.hp}/${boss.maxHp}\n${pet.name}受到${counter}反击伤害`;
    if (effects.length) msg += `\n${effects.join('\n')}`;
    if (boss.hp <= 0) {
      boss.killed = true;
      const settled = this.settleBossRewards(guild, boss, uid, data);
      this.recordBossHistory(guild, boss);
      const rank = Object.entries(boss.damage || {}).sort((a, b) => b[1] - a[1]);
      const mvp = rank[0];
      this.addLog(guild, `击败${boss.difficulty || '普通'}公会Boss，MVP:${mvp ? this.getMemberName(mvp[0]) : '无'}`);
      msg += `\n【击杀公告】${guild.name}击败了${boss.difficulty || '普通'}难度${boss.name}！`;
      if (mvp) msg += `\nMVP:${this.getMemberName(mvp[0])} ${mvp[1]}伤害`;
      msg += `\n公会获得经验+${settled.exp}、资金+${settled.bank}`;
      if (settled.lines.length) msg += `\n【奖励】\n${settled.lines.join('\n')}`;
    }
    this.save();
    return { success: true, msg };
  },

  formatBossRank(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const boss = this.getBoss(guild);
    const rank = Object.entries(boss.damage || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (rank.length === 0) return '暂无公会Boss伤害记录';
    const rankDamage = Math.max(1, Math.floor(boss.maxHp * GUILD_BOSS_CONFIG.minDamageRateForRank));
    return ['【公会Boss伤害排行】', ...rank.map(([id, dmg], i) => {
      const reward = i < 3 && dmg >= rankDamage ? ' 排名奖励' : '';
      const rate = boss.maxHp ? Math.floor(dmg / boss.maxHp * 1000) / 10 : 0;
      return `${i + 1}. ${this.getMemberName(id)} - ${dmg}(${rate}%)${reward}`;
    })].join('\n');
  },

  formatBossHistory(uid, data) {
    const guild = this.ensureGuildFromUser(uid, data);
    if (!guild) return '你未加入公会';
    const history = (guild.bossHistory || []).slice(-5).reverse();
    if (history.length === 0) return '暂无公会Boss历史记录';
    return ['【公会Boss历史】', ...history.map(h => {
      const result = h.killed ? '已击败' : '未击败';
      const top = (h.top3 || []).map((r, i) => `${i + 1}.${r.name}${r.damage}`).join(' / ') || '无';
      return `${h.date} ${h.difficulty || '普通'} ${h.name}(${h.skill || '无'}) ${result}\n参战:${h.participants} 总伤害:${h.totalDamage}/${h.maxHp} MVP:${h.mvpName} ${h.mvpDamage}\n前三:${top}`;
    })].join('\n');
  },
};

//   组队系统
const TeamManager = {
  _teams: null,

  load() {
    if (this._teams) return this._teams;
    try {
      const saved = ext.storageGet('teams');
      this._teams = saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('[组队] 数据加载失败:', e.message);
      this._teams = {};
    }

    // 兼容旧档：补齐成员与时间字段，避免空字段导致链路异常
    for (const [id, team] of Object.entries(this._teams)) {
      if (!team || typeof team !== 'object') {
        delete this._teams[id];
        continue;
      }
      team.id = team.id || id;
      team.members = Array.isArray(team.members) ? team.members.filter(m => m && m.uid) : [];
      team.members.forEach(m => {
        m.name = m.name || DB.getName(m.uid) || m.uid || '玩家';
        m.petIdx = Math.max(0, Number(m.petIdx) || 0);
      });
      if (!team.leader && team.members.length > 0) {
        team.leader = team.members[0].uid;
      }
      if (!team.leaderName && team.leader) {
        const leader = team.members.find(m => m.uid === team.leader);
        team.leaderName = leader?.name || DB.getName(team.leader) || team.leader || '玩家';
      }
      team.status = team.status || 'recruiting';
      team.createdAt = team.createdAt || Date.now();
      team.updatedAt = team.updatedAt || team.createdAt;
    }

    return this._teams;
  },

  save() {
    ext.storageSet('teams', JSON.stringify(this._teams || {}));
  },

  get teams() { return this.load(); },

  // 创建队伍
  createTeam(leaderUid, leaderName, dungeonName, difficulty = '普通') {
    this.load();
    const oldTeam = this.getUserTeam(leaderUid);
    if (oldTeam) {
      return { success: false, msg: '你已在队伍中，不能重复创建' };
    }
    const teamId = 'team_' + Date.now();
    this._teams[teamId] = {
      id: teamId,
      leader: leaderUid,
      leaderName: leaderName,
      dungeon: dungeonName,
      difficulty,
      members: [{ uid: leaderUid, name: leaderName, petIdx: 0 }],
      status: 'recruiting', // recruiting, fighting, completed
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.save();
    return { success: true, teamId, msg: `队伍创建成功！\n副本: ${dungeonName} [${difficulty}]\n.宠物 组队 加入 @${leaderName} 加入队伍` };
  },

  // 加入队伍
  joinTeam(teamId, uid, name) {
    this.load();
    const team = this._teams[teamId];
    if (!team) return { success: false, msg: '队伍不存在' };
    if (team.status !== 'recruiting') return { success: false, msg: '队伍已开始战斗' };
    if (team.members.length >= 4) return { success: false, msg: '队伍已满(最多4人)' };

    const currentTeam = this.getUserTeam(uid);
    if (currentTeam) {
      if (currentTeam.id === teamId) {
        return { success: false, msg: '你已在队伍中' };
      }
      return { success: false, msg: `你已在其他队伍中(${currentTeam.dungeon})` };
    }

    if (team.members.find(m => m.uid === uid)) return { success: false, msg: '你已在队伍中' };

    team.members.push({ uid, name, petIdx: 0 });
    team.updatedAt = Date.now();
    this.save();
    return { success: true, msg: `成功加入队伍！当前成员: ${team.members.length}/4` };
  },

  // 退出队伍
  leaveTeam(teamId, uid) {
    this.load();
    const team = this._teams[teamId];
    if (!team) return { success: false, msg: '队伍不存在' };

    const idx = team.members.findIndex(m => m.uid === uid);
    if (idx === -1) return { success: false, msg: '你不在队伍中' };

    team.members.splice(idx, 1);

    // 如果队长退出，转让队长
    if (team.leader === uid && team.members.length > 0) {
      team.leader = team.members[0].uid;
      team.leaderName = team.members[0].name;
    }

    // 如果队伍空了，删除队伍
    if (team.members.length === 0) {
      delete this._teams[teamId];
    } else {
      team.updatedAt = Date.now();
    }
    this.save();
    return { success: true, msg: '已退出队伍' };
  },

  // 设置出战宠物
  setPet(teamId, uid, petIdx) {
    this.load();
    const team = this._teams[teamId];
    if (!team) return { success: false, msg: '队伍不存在' };

    const member = team.members.find(m => m.uid === uid);
    if (!member) return { success: false, msg: '你不在队伍中' };

    member.petIdx = petIdx;
    team.updatedAt = Date.now();
    this.save();
    return { success: true, msg: `已设置第${petIdx + 1}只宠物出战` };
  },
  // 获取招募中的队伍列表
  getRecruitingTeams(dungeonName = null) {
    this.load();
    const now = Date.now();
    const list = [];
    for (const [id, team] of Object.entries(this._teams)) {
      const lastActiveAt = team.updatedAt || team.createdAt || 0;
      // 清理超过30分钟的队伍
      if (now - lastActiveAt > 1800000) {
        delete this._teams[id];
        continue;
      }
      if (team.status === 'recruiting') {
        if (!dungeonName || team.dungeon === dungeonName) {
          list.push(team);
        }
      }
    }
    this.save();
    return list;
  },

  // 开始战斗
  startBattle(teamId, leaderUid) {
    this.load();
    const team = this._teams[teamId];
    if (!team) return { success: false, msg: '队伍不存在' };
    if (team.leader !== leaderUid) return { success: false, msg: '只有队长可以开始战斗' };
    if (team.members.length < 1) return { success: false, msg: '至少需要1人' };
    if (team.status !== 'recruiting') return { success: false, msg: '队伍状态异常' };

    team.status = 'fighting';
    team.updatedAt = Date.now();
    this.save();
    return { success: true, msg: '战斗开始！' };
  },
  // 获取用户所在队伍
  getUserTeam(uid, includeCompleted = false) {
    this.load();
    for (const team of Object.values(this._teams)) {
      if (!includeCompleted && team.status === 'completed') continue;
      if (team.members.find(m => m.uid === uid)) {
        return team;
      }
    }
    return null;
  },

  // 删除队伍
  deleteTeam(teamId) {
    this.load();
    delete this._teams[teamId];
    this.save();
  },

  completeTeam(teamId) {
    this.load();
    const team = this._teams[teamId];
    if (!team) return;
    team.status = 'completed';
    team.updatedAt = Date.now();
    this.save();
  },

  // 清理过期队伍（30分钟未活动）
  cleanExpiredTeams() {
    this.load();
    const now = Date.now();
    const expireTime = 30 * 60 * 1000; // 30分钟
    let cleaned = 0;
    for (const [id, team] of Object.entries(this._teams)) {
      const lastActiveAt = team.updatedAt || team.createdAt || 0;
      if (now - lastActiveAt > expireTime || team.status === 'completed') {
        delete this._teams[id];
        cleaned++;
      }
    }
    if (cleaned > 0) this.save();
    return cleaned;
  },
};

//   副本系统
const DUNGEON_DIFFICULTIES = {
  '普通': { hp: 1, atk: 1, def: 1, reward: 1, energyCost: 20 },
  '困难': { hp: 1.35, atk: 1.25, def: 1.2, reward: 1.4, energyCost: 30 },
  '噩梦': { hp: 1.8, atk: 1.55, def: 1.45, reward: 1.9, energyCost: 45 },
};

const DUNGEONS = {
  '迷雾深渊': { boss: '深渊领主', bossHp: 500, bossAtk: 80, bossDef: 30, rewards: { money: [100, 300], items: ['进化石'] } },
  '熔岩地狱': { boss: '炎魔', bossHp: 1000, bossAtk: 150, bossDef: 50, rewards: { money: [300, 600], items: ['龙之鳞'] } },
  '冰霜王座': { boss: '冰霜巨龙', bossHp: 2000, bossAtk: 200, bossDef: 80, rewards: { money: [500, 1000], items: ['龙之心'] } },
  '虚空裂隙': { boss: '虚空主宰', bossHp: 5000, bossAtk: 400, bossDef: 150, rewards: { money: [1000, 3000], items: ['神话召唤石'] } },
  '森林回廊': { boss: '古树守卫', bossHp: 650, bossAtk: 95, bossDef: 38, rewards: { money: [180, 360], items: ['进化石', '宠物粮'] } },
  '沙海遗墓': { boss: '黄沙咒灵', bossHp: 1200, bossAtk: 170, bossDef: 60, rewards: { money: [320, 680], items: ['高级进化石', '仙人掌汁'] } },
  '雷鸣穹顶': { boss: '雷霆巨像', bossHp: 2600, bossAtk: 260, bossDef: 95, rewards: { money: [650, 1350], items: ['天赋果实', '山泉茶'] } },
  '星辉神殿': { boss: '星辉圣兽', bossHp: 6200, bossAtk: 460, bossDef: 180, rewards: { money: [1400, 3600], items: ['神话召唤石', '星辉圣代', '龙之心'] } },
};

//   世界Boss系统
const WorldBossManager = {
  _boss: null,
  
  // 刷新时间点（小时）: 每天12点、18点、22点可能刷新
  SPAWN_HOURS: [12, 18, 22],
  // 刷新概率: 20%
  SPAWN_CHANCE: 0.2,

  load() {
    if (this._boss) return this._boss;
    try {
      const saved = ext.storageGet('worldBoss');
      this._boss = saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn('[世界Boss] 数据加载失败:', e.message);
      this._boss = null;
    }
    return this._boss;
  },

  save() {
    if (this._boss) {
      ext.storageSet('worldBoss', JSON.stringify(this._boss));
    } else {
      ext.storageSet('worldBoss', '');
    }
    if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
      WebUIReporter.reportGeneric('world_boss', this._boss || { closed: true, currentHp: 0, maxHp: 0, updatedAt: Date.now() });
    }
  },

  // 检查并自动刷新世界Boss
  checkAndSpawn() {
    this.load();
    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toDateString();
    
    // 检查是否在刷新时间点
    const shouldCheck = this.SPAWN_HOURS.includes(currentHour);
    
    // 如果当前有Boss，直接返回
    if (this._boss) {
      return { spawned: false, boss: this._boss };
    }
    
    // 检查是否已经尝试过这个时间点
    const lastAttemptKey = `${today}_${currentHour}`;
    const lastAttempt = ext.storageGet('worldBoss_attempt');
    
    if (shouldCheck && lastAttempt !== lastAttemptKey) {
      // 记录本次尝试
      ext.storageSet('worldBoss_attempt', lastAttemptKey);
      
      // 检查是否有玩家超过30级（通过遍历所有用户数据）
      let hasHighLevelPlayer = false;
      try {
        const nameMap = ext.storageGet('nameMap_global');
        if (nameMap) {
          const users = JSON.parse(nameMap);
          for (const uid of Object.keys(users)) {
            const userData = ext.storageGet('u_' + uid);
            if (userData) {
              const data = JSON.parse(userData);
              // 检查训练师等级或宠物等级
              if ((data.player && data.player.level >= 30) || 
                  (data.pets && data.pets.some(p => p.level >= 30))) {
                hasHighLevelPlayer = true;
                break;
              }
            }
          }
        }
      } catch (e) {
        // 如果检查失败，默认允许刷新
        hasHighLevelPlayer = true;
      }
      
      // 只有有玩家超过30级才进行概率判定
      if (hasHighLevelPlayer && Math.random() < this.SPAWN_CHANCE) {
        // 生成新的世界Boss
        const bosses = [
          { name: '世界之树·尤格德拉', hp: 50000, atk: 500, def: 200 },
          { name: '混沌巨兽·利维坦', hp: 80000, atk: 600, def: 250 },
          { name: '灭世魔龙·尼德霍格', hp: 100000, atk: 800, def: 300 },
        ];
        const boss = bosses[Math.floor(Math.random() * bosses.length)];
        this._boss = {
          ...boss,
          maxHp: boss.hp,
          currentHp: boss.hp,
          spawnTime: Date.now(),
          spawnDate: today,
          spawnHour: currentHour,
          damageDealt: {},
          attempts: {},
          rewardedUsers: {},
          killers: [],
        };
        this.save();
        return { spawned: true, boss: this._boss };
      }
    }
    
    return { spawned: false, boss: null };
  },

  // 获取下次刷新时间
  getNextSpawnTime() {
    const now = new Date();
    const currentHour = now.getHours();
    
    for (const hour of this.SPAWN_HOURS) {
      if (hour > currentHour) {
        return `今天 ${hour}:00`;
      }
    }
    return `明天 ${this.SPAWN_HOURS[0]}:00`;
  },

  // 攻击世界Boss
  attackBoss(uid, name, pet) {
    this.load();
    if (!this._boss) return { success: false, msg: '当前没有世界Boss' };
    this._boss.damageDealt = this._boss.damageDealt || {};
    this._boss.attempts = this._boss.attempts || {};
    this._boss.rewardedUsers = this._boss.rewardedUsers || {};
    const attempts = this._boss.attempts[uid] || 0;
    if (attempts >= 3) return { success: false, msg: '本轮世界Boss挑战次数已用完' };
    if (!pet || pet.hp <= 0) return { success: false, msg: '宠物已阵亡' };
    if ((pet.energy || 0) < 20) return { success: false, msg: '宠物精力不足(需要20)' };
    pet.energy -= 20;
    const baseDamage = (pet.atk || 10) * 2 + Math.floor(Math.random() * Math.max(1, pet.atk || 10));
    const defense = this._boss.def || 0;
    const damage = Math.min(this._boss.currentHp, Math.max(1, baseDamage - defense + Math.floor(Math.random() * 50)));
    this._boss.attempts[uid] = attempts + 1;
    this.save();
    return this.applyDamage(uid, name, damage, pet);
  },

  applyDamage(uid, name, damage, pet = null) {
    this.load();
    if (!this._boss) return { success: false, msg: '当前没有世界Boss' };
    if (this._boss.settled) return { success: false, msg: '世界Boss已结算' };
    this._boss.damageDealt = this._boss.damageDealt || {};
    this._boss.killers = this._boss.killers || [];
    const applied = Math.min(Math.max(0, Math.floor(damage || 0)), this._boss.currentHp || 0);
    this._boss.currentHp = Math.max(0, (this._boss.currentHp || 0) - applied);
    this._boss.damageDealt[uid] = (this._boss.damageDealt[uid] || 0) + applied;
    const result = { success: true, damage: applied, currentHp: this._boss.currentHp, maxHp: this._boss.maxHp };
    const counterDamage = pet ? Math.floor((this._boss.atk || 0) * 0.3) : 0;
    if (pet && counterDamage > 0) pet.hp = Math.max(0, (pet.hp || 0) - counterDamage);
    result.counterDamage = counterDamage;
    if (this._boss.currentHp <= 0) {
      result.killed = true;
      result.rewards = this.settleRewards(uid, name);
    }
    this.save();
    return result;
  },

  canChallenge(uid) {
    this.load();
    if (!this._boss) return { success: false, msg: '当前没有世界Boss' };
    if (this._boss.settled) return { success: false, msg: '世界Boss已结算' };
    this._boss.attempts = this._boss.attempts || {};
    if ((this._boss.attempts[uid] || 0) >= 3) return { success: false, msg: '本轮世界Boss挑战次数已用完' };
    return { success: true };
  },

  consumeAttempt(uid) {
    this.load();
    if (!this._boss) return { success: false, msg: '当前没有世界Boss' };
    this._boss.attempts = this._boss.attempts || {};
    if ((this._boss.attempts[uid] || 0) >= 3) return { success: false, msg: '本轮世界Boss挑战次数已用完' };
    this._boss.attempts[uid] = (this._boss.attempts[uid] || 0) + 1;
    this.save();
    return { success: true };
  },

  applyTeamDamage(damageByUid, members, killerUid, killerName) {
    this.load();
    if (!this._boss) return { success: false, msg: '当前没有世界Boss' };
    if (this._boss.settled) return { success: false, msg: '世界Boss已结算' };
    this._boss.damageDealt = this._boss.damageDealt || {};
    const totalDamage = Object.values(damageByUid || {}).reduce((sum, n) => sum + Math.max(0, Math.floor(n || 0)), 0);
    const appliedTotal = Math.min(totalDamage, this._boss.currentHp || 0);
    let remain = appliedTotal;
    const entries = Object.entries(damageByUid || {}).filter(([, n]) => n > 0);
    for (let i = 0; i < entries.length; i++) {
      const [id, dmg] = entries[i];
      const applied = i === entries.length - 1 ? remain : Math.min(remain, Math.floor(appliedTotal * dmg / Math.max(1, totalDamage)));
      remain -= applied;
      this._boss.damageDealt[id] = (this._boss.damageDealt[id] || 0) + Math.max(0, applied);
    }
    this._boss.currentHp = Math.max(0, (this._boss.currentHp || 0) - appliedTotal);
    const result = { success: true, damage: appliedTotal, currentHp: this._boss.currentHp, maxHp: this._boss.maxHp };
    if (this._boss.currentHp <= 0) {
      result.killed = true;
      result.rewards = this.settleRewards(killerUid, killerName);
    }
    this.save();
    return result;
  },

  settleRewards(killerUid, killerName) {
    if (!this._boss || this._boss.settled) return [];
    this._boss.settled = true;
    this._boss.killers = this._boss.killers || [];
    this._boss.killers.push({ uid: killerUid, name: killerName });
    const rank = Object.entries(this._boss.damageDealt || {}).sort((a, b) => b[1] - a[1]);
    const eligible = Math.max(1, Math.floor((this._boss.maxHp || 1) * 0.01));
    const rewards = [];
    for (const [id, dmg] of rank) {
      if (dmg < eligible || this._boss.rewardedUsers?.[id]) continue;
      const playerData = DB.get(id);
      const isMvp = id === rank[0]?.[0];
      const money = 1500 + Math.floor(Math.random() * 1500) + (isMvp ? 800 : 0);
      const pool = isMvp ? ['神话召唤石', '龙之心', '天赋果实'] : ['进化石', '高级进化石', '天赋果实'];
      const item = pool[Math.floor(Math.random() * pool.length)];
      playerData.money = Math.min(CONFIG.maxMoney, (playerData.money || 0) + money);
      playerData.items = playerData.items || {};
      playerData.items[item] = (playerData.items[item] || 0) + 1;
      DB.save(id, playerData);
      this._boss.rewardedUsers = this._boss.rewardedUsers || {};
      this._boss.rewardedUsers[id] = true;
      rewards.push({ uid: id, name: DB.getName(id) || id.replace('QQ:', ''), money, item, damage: dmg });
    }
    this._boss = null;
    return rewards;
  },

  // 计算奖励
  calculateRewards(uid, name) {
    const baseReward = {
      money: 2000 + Math.floor(Math.random() * 3000),
      items: ['神话召唤石', '龙之心', '天赋果实'],
    };
    return baseReward;
  },

  // 获取世界Boss状态
  getStatus() {
    this.load();
    if (!this._boss) return null;
    return {
      name: this._boss.name,
      hp: this._boss.currentHp,
      maxHp: this._boss.maxHp,
      percent: Math.floor(this._boss.currentHp / this._boss.maxHp * 100),
      spawnTime: this._boss.spawnTime,
    };
  },

  // 获取伤害排行
  getDamageRank() {
    this.load();
    if (!this._boss) return [];
    return Object.entries(this._boss.damageDealt)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([uid, damage], idx) => ({ rank: idx + 1, uid, damage }));
  },
};

//   繁殖优化
const BreedManager = {
  breed(data, pet1Idx, pet2Idx) {
    // 索引有效性检查
    if (pet1Idx < 1 || pet2Idx < 1 || pet1Idx > data.pets.length || pet2Idx > data.pets.length) {
      return { success: false, msg: '宠物编号无效' };
    }
    const p1 = data.pets[pet1Idx - 1];
    const p2 = data.pets[pet2Idx - 1];
    if (!p1 || !p2) return { success: false, msg: '宠物不存在' };
    if (p1.id === p2.id) return { success: false, msg: '不能和自己育种' };
    if (p1.energy < 30 || p2.energy < 30) return { success: false, msg: '精力不足(需要30)' };

    // 检查宠物上限
    const totalPets = data.pets.length + (data.storage || []).length;
    if (totalPets >= CONFIG.maxPets + CONFIG.maxStorage) {
      return { success: false, msg: `宠物已满(${CONFIG.maxPets + CONFIG.maxStorage}只上限)` };
    }

    // 进化后无法育种
    if (p1.evolved || p2.evolved) return { success: false, msg: '进化后的宠物无法育种' };

    // 检查育种次数
    const breedCount1 = p1.breedCount || 0;
    const breedCount2 = p2.breedCount || 0;
    const needCard1 = breedCount1 >= 1;
    const needCard2 = breedCount2 >= 1;

    if (needCard1 && !data.items['计划生育卡']) return { success: false, msg: `${p1.name}已育种${breedCount1}次，需要计划生育卡` };
    if (needCard2 && !data.items['计划生育卡']) return { success: false, msg: `${p2.name}已育种${breedCount2}次，需要计划生育卡` };

    const hasTwinPotion = data.items['多胞胎药水'] > 0;
    const isTwin = hasTwinPotion || Math.random() < 0.08;
    const babyCount = isTwin ? 2 : 1;

    if (data.pets.length + babyCount > CONFIG.maxPets && (data.storage || []).length + babyCount > CONFIG.maxStorage) {
      return { success: false, msg: `宠物和仓库空间不足，无法容纳${babyCount}只幼崽` };
    }

    // 消耗道具与精力
    if (needCard1 || needCard2) {
      data.items['计划生育卡']--;
      if (data.items['计划生育卡'] <= 0) delete data.items['计划生育卡'];
    }
    if (hasTwinPotion) {
      data.items['多胞胎药水']--;
      if (data.items['多胞胎药水'] <= 0) delete data.items['多胞胎药水'];
    }
    p1.energy -= 30;
    p2.energy -= 30;
    p1.breedCount = breedCount1 + 1;
    p2.breedCount = breedCount2 + 1;
    p1.canBreed = p1.breedCount < 1;
    p2.canBreed = p2.breedCount < 1;

    const babies = [];
    for (let i = 0; i < babyCount; i++) {
      const child = PetFactory.create();
      if (Math.random() < 0.5) child.species = p1.species;
      else child.species = p2.species;
      if (Math.random() < 0.1) {
        const speciesKeys = Object.keys(SPECIES);
        child.species = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
      }

      child.maxHp = Math.floor((p1.maxHp + p2.maxHp) / 2 * (0.9 + Math.random() * 0.2));
      child.atk = Math.floor((p1.atk + p2.atk) / 2 * (0.9 + Math.random() * 0.2));
      child.def = Math.floor((p1.def + p2.def) / 2 * (0.9 + Math.random() * 0.2));
      child.spd = Math.floor((p1.spd + p2.spd) / 2 * (0.9 + Math.random() * 0.2));
      child.hp = child.maxHp;

      const allSkills = [...(p1.skills || []), ...(p2.skills || [])];
      child.skills = allSkills.filter(() => Math.random() < 0.3).slice(0, 4);
      if (child.skills.length === 0) child.skills = ['冲撞'];
      child.nature = Math.random() < 0.5 ? p1.nature : p2.nature;
      if ((p1.talent || p2.talent) && Math.random() < 0.35) child.talent = Math.random() < 0.5 ? p1.talent : p2.talent;

      const mutation = Math.random() < 0.05;
      if (mutation) {
        const stats = ['atk', 'def', 'spd', 'maxHp'];
        const stat = stats[Math.floor(Math.random() * stats.length)];
        child[stat] = Math.floor(child[stat] * 1.3);
        if (stat === 'maxHp') child.hp = child.maxHp;
      }

      child.parents = [
        { id: p1.id, name: p1.name, species: p1.species },
        { id: p2.id, name: p2.name, species: p2.species },
      ];
      child.generation = Math.max(p1.generation || 1, p2.generation || 1) + 1;

      if (data.pets.length < CONFIG.maxPets) {
        data.pets.push(child);
      } else {
        data.storage = data.storage || [];
        data.storage.push(child);
      }
      babies.push(child);
    }

    return { success: true, msg: `繁殖成功！获得${babies.map(b => b.name).join('、')}`, child: babies[0], babies };
  },
};

//   孤品宠物（全服唯一）  
const LEGENDARY_PETS = {
  '烛龙·衔烛': {
    id: 'candle_dragon', name: '烛龙·衔烛',
    desc: '钟山之神，睁眼为昼，闭眼为夜，吹气为冬，呼气为夏',
    element: '超能', baseStats: { hp: 500, atk: 200, def: 150, energy: 300, spd: 180 },
    skills: ['昼夜轮转', '时光凝滞', '钟山之息', '天地初开'],
    passive: '烛照九阴：所有伤害+50%，受到伤害-30%',
    spawnCondition: { region: '遗迹', weather: '流星雨', time: '夜晚', playerLevel: 50 },
    catchRate: 0.01, reward: { money: 10000, item: '烛龙之鳞' }, captured: false, capturedBy: null,
  },
  '混沌·帝江': {
    id: 'chaos_dijiang', name: '混沌·帝江',
    desc: '上古四凶之一，状如黄囊，赤如丹火，六足四翼，浑敦无面目',
    element: '火', baseStats: { hp: 600, atk: 180, def: 180, energy: 250, spd: 150 },
    skills: ['混沌初开', '虚空吞噬', '四翼遮天', '浑敦之怒'],
    passive: '混沌体质：每回合恢复5%生命，免疫控制',
    spawnCondition: { region: '洞穴', weather: '暴风', time: '夜晚', playerLevel: 45 },
    catchRate: 0.02, reward: { money: 8000, item: '混沌之核' }, captured: false, capturedBy: null,
  },
  '朱雀·陵光': {
    id: 'vermilion_bird', name: '朱雀·陵光',
    desc: '南方之神，四灵之一，浴火而生，不死不灭',
    element: '火', baseStats: { hp: 400, atk: 220, def: 120, energy: 350, spd: 200 },
    skills: ['涅槃重生', '九天烈焰', '朱雀之翼', '南明离火'],
    passive: '涅槃：战斗中首次死亡时复活并恢复50%生命',
    spawnCondition: { region: '火山', weather: '晴天', time: '白天', playerLevel: 40 },
    catchRate: 0.03, reward: { money: 6000, item: '朱雀之羽' }, captured: false, capturedBy: null,
  },
  '玄武·执明': {
    id: 'black_tortoise', name: '玄武·执明',
    desc: '北方之神，四灵之一，龟蛇合体，镇守冥海',
    element: '超能', baseStats: { hp: 550, atk: 190, def: 160, energy: 280, spd: 160 },
    skills: ['冥海深渊', '龟蛇双形', '北冥之寒', '玄武甲盾'],
    passive: '冥海领域：战斗开始时削弱敌人20%全属性',
    spawnCondition: { region: '海洋', weather: '雨天', time: '夜晚', playerLevel: 42 },
    catchRate: 0.025, reward: { money: 7000, item: '玄武之甲' }, captured: false, capturedBy: null,
  },
  '雷兽·夔牛': {
    id: 'thunder_beast', name: '雷兽·夔牛',
    desc: '东海流波之兽，其声如雷，黄帝得之以其皮为鼓，声闻五百里',
    element: '电', baseStats: { hp: 450, atk: 240, def: 100, energy: 300, spd: 250 },
    skills: ['夔牛震鼓', '雷霆万钧', '流波之怒', '天雷劫'],
    passive: '雷霆之力：速度+100%，电系技能伤害+80%',
    spawnCondition: { region: '山脉', weather: '暴风', time: '傍晚', playerLevel: 38 },
    catchRate: 0.035, reward: { money: 5500, item: '夔牛之鼓' }, captured: false, capturedBy: null,
  },
  '建木·通天': {
    id: 'world_tree', name: '建木·通天',
    desc: '众帝上下之梯，天地之枢纽，百仞无枝，日中无影',
    element: '草', baseStats: { hp: 800, atk: 100, def: 250, energy: 400, spd: 80 },
    skills: ['生命绽放', '天地枢纽', '建木之根', '通天庇护'],
    passive: '生命之源：每回合恢复10%生命，草系技能效果+100%',
    spawnCondition: { region: '森林', weather: '雨天', time: '早晨', playerLevel: 35 },
    catchRate: 0.04, reward: { money: 5000, item: '建木之种' }, captured: false, capturedBy: null,
  },
  '白泽·通灵': {
    id: 'bai_ze', name: '白泽·通灵',
    desc: '知天下鬼神万物状貌，能言人语，达于万物之情',
    element: '超能', baseStats: { hp: 380, atk: 180, def: 140, energy: 400, spd: 220 },
    skills: ['万物皆知', '预言天机', '白泽图鉴', '神识洞察'],
    passive: '全知全能：战斗开始时显示敌人弱点，暴击率+50%',
    spawnCondition: { region: '草原', weather: '晴天', time: '白天', playerLevel: 36 },
    catchRate: 0.038, reward: { money: 5200, item: '白泽图鉴' }, captured: false, capturedBy: null,
  },
  '鲲鹏·扶摇': {
    id: 'kun_peng', name: '鲲鹏·扶摇',
    desc: '北冥有鱼，其名为鲲，化而为鸟，其名为鹏，扶摇直上九万里',
    element: '水', baseStats: { hp: 480, atk: 210, def: 130, energy: 320, spd: 230 },
    skills: ['扶摇直上', '北冥之水', '鲲鹏变化', '九万里风'],
    passive: '变化之道：每3回合随机切换鲲形态(防御+50%)或鹏形态(攻击+50%)',
    spawnCondition: { region: '海洋', weather: '暴风', time: '傍晚', playerLevel: 44 },
    catchRate: 0.022, reward: { money: 7500, item: '鲲鹏之羽' }, captured: false, capturedBy: null,
  },
};

// 神话宠物状态管理器
const LegendaryManager = {
  _state: null,

  load() {
    if (this._state) return this._state;
    try {
      const saved = ext.storageGet('legendary_state');
      this._state = saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('[孤品宠物] 数据加载失败:', e.message);
      this._state = {};
    }
    return this._state;
  },

  save() {
    ext.storageSet('legendary_state', JSON.stringify(this._state));
  },

  isCaptured(name) {
    this.load();
    return this._state[name]?.captured || false;
  },

  setCaptured(name, uid) {
    this.load();
    this._state[name] = { captured: true, capturedBy: uid, time: Date.now() };
    this.save();
  },

  getCapturedBy(name) {
    this.load();
    return this._state[name]?.capturedBy || null;
  },

  canSpawn(name) {
    return !this.isCaptured(name);
  },
};

// 孤品宠物特殊技能
const LEGENDARY_SKILLS = {
  // 烛龙
  '昼夜轮转': { power: 200, cost: 80, acc: 100, desc: '逆转昼夜，造成时空伤害', effect: 'time_reverse' },
  '时光凝滞': { power: 180, cost: 60, acc: 95, desc: '凝滞时光，无视防御', effect: 'ignore_def' },
  '钟山之息': { power: 150, cost: 40, acc: 100, desc: '钟山神龙的吐息', effect: 'crit' },
  '天地初开': { power: 220, cost: 100, acc: 90, desc: '重现天地初开之威', effect: 'world_create' },
  // 混沌帝江
  '混沌初开': { power: 190, cost: 70, acc: 95, desc: '混沌之力吞噬敌人', effect: 'drain' },
  '虚空吞噬': { power: 170, cost: 50, acc: 100, desc: '来自虚空的吞噬', effect: 'pierce' },
  '四翼遮天': { power: 200, cost: 90, acc: 85, desc: '四翼遮蔽天日', effect: 'darkness' },
  '浑敦之怒': { power: 250, cost: 120, acc: 80, desc: '浑敦无面之怒', effect: 'execute' },
  // 朱雀
  '涅槃重生': { power: 0, cost: 100, acc: 100, desc: '浴火重生', effect: 'revive' },
  '九天烈焰': { power: 180, cost: 70, acc: 95, desc: '九天之火焚烧一切', effect: 'burn' },
  '朱雀之翼': { power: 140, cost: 35, acc: 100, desc: '朱雀展翅', effect: 'speed_up' },
  '南明离火': { power: 160, cost: 55, acc: 100, desc: '南明离火，焚尽万物', effect: 'holy_fire' },
  // 玄武
  '冥海深渊': { power: 150, cost: 45, acc: 100, desc: '冥海之力侵蚀敌人', effect: 'fear' },
  '龟蛇双形': { power: 170, cost: 60, acc: 95, desc: '龟蛇合击', effect: 'dual_strike' },
  '北冥之寒': { power: 130, cost: 40, acc: 100, desc: '北冥寒气冻结敌人', effect: 'freeze' },
  '玄武甲盾': { power: 0, cost: 80, acc: 100, desc: '玄武护盾', effect: 'shield' },
  // 夔牛
  '夔牛震鼓': { power: 190, cost: 75, acc: 95, desc: '夔牛鼓声震天', effect: 'stun' },
  '雷霆万钧': { power: 160, cost: 50, acc: 100, desc: '雷霆一击', effect: 'thunder' },
  '流波之怒': { power: 140, cost: 40, acc: 100, desc: '东海流波之怒', effect: 'wave' },
  '天雷劫': { power: 230, cost: 100, acc: 85, desc: '引动天雷劫', effect: 'execute' },
  // 建木
  '生命绽放': { power: 100, cost: 60, acc: 100, desc: '绽放生命之花', effect: 'heal_all' },
  '天地枢纽': { power: 180, cost: 70, acc: 95, desc: '天地之力', effect: 'nature' },
  '建木之根': { power: 120, cost: 35, acc: 100, desc: '建木根须缠绕', effect: 'root' },
  '通天庇护': { power: 0, cost: 80, acc: 100, desc: '通天之树庇护', effect: 'shield' },
  // 白泽
  '万物皆知': { power: 160, cost: 50, acc: 100, desc: '洞察万物弱点', effect: 'weakness' },
  '预言天机': { power: 140, cost: 45, acc: 100, desc: '预知未来', effect: 'predict' },
  '白泽图鉴': { power: 180, cost: 65, acc: 95, desc: '召唤图鉴之力', effect: 'summon' },
  '神识洞察': { power: 200, cost: 80, acc: 90, desc: '神识攻击', effect: 'psychic' },
  // 鲲鹏
  '扶摇直上': { power: 170, cost: 55, acc: 100, desc: '扶摇九万里', effect: 'ascend' },
  '北冥之水': { power: 150, cost: 45, acc: 100, desc: '北冥海水', effect: 'flood' },
  '鲲鹏变化': { power: 0, cost: 60, acc: 100, desc: '鲲鹏形态切换', effect: 'transform' },
  '九万里风': { power: 190, cost: 75, acc: 95, desc: '乘风九万里', effect: 'wind' },
};

//   世界系统  
// 地区定义
const REGIONS = {
  '森林': {
    name: '迷雾森林',
    desc: '古老的森林，充满神秘气息',
    species: ['猫', '狐', '兔', '鹿', '狼', '熊', '螳螂', '蜘蛛', '精灵', '史莱姆'],
    dayOnly: false,
    nightOnly: false,
    weatherMod: { '雨天': 1.2, '晴天': 1 },
    ui: { x: 400, y: 300, icon: 'tree' },
    connections: ['草原', '山脉', '洞穴'],
  },
  '火山': {
    name: '熔岩火山',
    desc: '炽热的火山地带',
    species: ['龙', '狐', '恶魔', '魅魔', '元素', '蝎', '虎', '狮'],
    dayOnly: false,
    nightOnly: false,
    weatherMod: { '晴天': 1.3, '雨天': 0.7 },
    ui: { x: 700, y: 150, icon: 'volcano' },
    connections: ['山脉', '沙漠'],
  },
  '海洋': {
    name: '蔚蓝海域',
    desc: '广阔的海洋世界',
    species: ['鱼', '蟹', '龙', '蛇', '史莱姆', '精灵', '龟'],
    dayOnly: false,
    nightOnly: false,
    weatherMod: { '雨天': 1.3, '暴风': 1.1 },
    ui: { x: 150, y: 500, icon: 'water' },
    connections: ['草原', '遗迹'],
  },
  '沙漠': {
    name: '死亡沙漠',
    desc: '荒芜的沙漠，生存艰难',
    species: ['蝎', '蛇', '狼', '骷髅', '傀儡', '幽灵'],
    dayOnly: false,
    nightOnly: true, // 夜晚更活跃
    weatherMod: { '晴天': 1.2, '沙暴': 1.5 },
    ui: { x: 750, y: 400, icon: 'sun' },
    connections: ['遗迹', '火山'],
  },
  '山脉': {
    name: '龙脊山脉',
    desc: '险峻的高山',
    species: ['鹰', '龙', '狼', '猿', '傀儡', '虎', '狮', '牛', '马'],
    dayOnly: false,
    nightOnly: false,
    weatherMod: { '暴风': 1.2, '晴天': 1 },
    ui: { x: 550, y: 150, icon: 'mountain' },
    connections: ['森林', '火山'],
  },
  '洞穴': {
    name: '幽暗洞穴',
    desc: '黑暗的地下世界',
    species: ['蝙蝠', '蜘蛛', '蝎', '幽灵', '骷髅', '蛇', '史莱姆'],
    dayOnly: false,
    nightOnly: false,
    weatherMod: {},
    ui: { x: 550, y: 350, icon: 'moon' },
    connections: ['森林', '遗迹'],
  },
  '草原': {
    name: '风之草原',
    desc: '宁静的草原地带',
    species: ['马', '羊', '牛', '猪', '兔', '鹿', '猫', '犬', '豹'],
    dayOnly: false,
    nightOnly: false,
    weatherMod: { '晴天': 1.2, '雨天': 0.9 },
    ui: { x: 250, y: 250, icon: 'leaf' },
    connections: ['森林', '海洋'],
  },
  '遗迹': {
    name: '古代遗迹',
    desc: '神秘的古代文明遗址',
    species: ['骷髅', '幽灵', '傀儡', '元素', '精灵', '魅魔', '恶魔'],
    dayOnly: false,
    nightOnly: true,
    weatherMod: { '晴天': 0.8, '雨天': 1.1 },
    ui: { x: 450, y: 550, icon: 'star' },
    connections: ['海洋', '洞穴', '沙漠'],
  },
};

// 天气系统
const WEATHERS = {
  '晴天': { effect: '正常', battleMod: {} },
  '雨天': { effect: '水系增强', battleMod: { '水': 1.1, '火': 0.9 } },
  '暴风': { effect: '速度降低', battleMod: { spdMod: 0.9 } },
  '沙暴': { effect: '岩石系增强', battleMod: { '岩石': 1.1 } },
  '大雾': { effect: '命中率降低', battleMod: { accMod: 0.85 } },
  '流星雨': { effect: '超能系增强', battleMod: { '超能': 1.2 } },
};

// 性格系统
const NATURES = {
  '勇敢': { desc: '攻击+20%，速度-15%', atkMod: 1.20, spdMod: 0.85 },
  '胆小': { desc: '速度+25%，攻击-15%', spdMod: 1.25, atkMod: 0.85 },
  '固执': { desc: '攻击+15%，防御-10%', atkMod: 1.15, defMod: 0.90 },
  '温顺': { desc: '防御+20%，攻击-15%', defMod: 1.20, atkMod: 0.85 },
  '浮躁': { desc: '全属性+5%', atkMod: 1.05, defMod: 1.05, spdMod: 1.05, hpMod: 1.05 },
  '孤僻': { desc: '攻击+18%，好感度获取-30%', atkMod: 1.18, affectionMod: 0.7 },
  '调皮': { desc: '速度+15%，防御-12%', spdMod: 1.15, defMod: 0.88 },
  '认真': { desc: '经验获取+30%', expMod: 1.30 },
  '保守': { desc: '防御+18%，速度-12%', defMod: 1.18, spdMod: 0.88 },
  '急躁': { desc: '速度+30%，防御-20%', spdMod: 1.30, defMod: 0.80 },
  '冷静': { desc: '技能消耗精力-25%', energyCostMod: 0.75 },
  '狂暴': { desc: '攻击+25%，生命上限-15%', atkMod: 1.25, hpMod: 0.85 },
  '坚韧': { desc: '生命+20%，攻击-10%', hpMod: 1.20, atkMod: 0.90 },
  '机智': { desc: '战斗金币+35%', goldMod: 1.35 },
  '慵懒': { desc: '精力恢复速度+100%', energyRegenMod: 2.0 },
  '狡猾': { desc: '暴击率+15%，攻击-10%', critMod: 0.15, atkMod: 0.90 },
};

// 天赋系统
const TALENTS = {
  '强健': { desc: '生命上限+15%', hpMod: 1.15 },
  '锋利': { desc: '攻击+15%', atkMod: 1.15 },
  '坚硬': { desc: '防御+15%', defMod: 1.15 },
  '敏捷': { desc: '速度+15%', spdMod: 1.15 },
  '活力': { desc: '精力上限+30%', energyMod: 1.30 },
  '幸运': { desc: '战斗金币+25%，暴击率+5%', goldMod: 1.25, critMod: 0.05 },
  '猎人': { desc: '战斗经验+40%', expMod: 1.40 },
  '适应': { desc: '无天气惩罚，全属性+5%', weatherImmune: true, allMod: 1.05 },
  '血脉': { desc: '育种时属性继承+30%', breedMod: 1.3 },
  '坚韧': { desc: '血量低于30%时攻击+30%', lowHpAtkBoost: 0.30 },
  '暴怒': { desc: '暴击伤害+50%', critDmgMod: 1.5 },
  '闪避': { desc: '有10%概率闪避攻击', dodgeMod: 0.10 },
  '吸血': { desc: '攻击回复10%伤害值的生命', lifesteal: 0.10 },
  '破甲': { desc: '无视15%防御', armorPen: 0.15 },
};

//   生态系统  
// 食物链关系（克制关系）
const FOOD_CHAIN = {
  // 捕食者 -> 猎物列表（对猎物伤害+20%）
  '虎': ['鹿', '兔', '羊', '猪'],
  '狮': ['鹿', '兔', '羊', '猪', '马'],
  '狼': ['兔', '鹿', '羊', '鼠'],
  '鹰': ['兔', '鼠', '蛇', '鱼'],
  '蛇': ['鼠', '兔', '鸟'],
  '猫': ['鼠', '鸟'],
  '狐': ['兔', '鼠', '鸟'],
  '螳螂': ['鼠'],
  '蜘蛛': ['鼠', '蝙蝠'],
  '蝎': ['鼠', '蜘蛛'],
  '蝙蝠': ['鼠'],
  '龙': ['蛇', '鹿', '鸟', '鱼', '熊'],
  '恶魔': ['精灵', '天使', '幽灵', '骷髅', '傀儡'],
};

// 栖息地偏好（某些种族在特定地区出现率更高）
const HABITAT_BONUS = {
  '森林': { '猫': 2, '狐': 2, '兔': 1.5, '鹿': 2, '狼': 1.5, '熊': 2, '螳螂': 1.5, '蜘蛛': 1.5, '精灵': 2 },
  '火山': { '龙': 2, '狐': 1.5, '恶魔': 2, '魅魔': 1.5, '元素': 2, '蝎': 1.5, '虎': 1.5, '狮': 1.5 },
  '海洋': { '鱼': 2.5, '蟹': 2, '龙': 1.5, '蛇': 1.5, '史莱姆': 1.5, '精灵': 1.5, '龟': 2 },
  '沙漠': { '蝎': 2.5, '蛇': 2, '狼': 1.5, '骷髅': 2, '傀儡': 2, '幽灵': 1.5 },
  '山脉': { '鹰': 2.5, '龙': 2, '狼': 1.5, '猿': 2, '傀儡': 1.5, '虎': 1.5, '狮': 1.5, '牛': 1.5, '马': 1.5 },
  '洞穴': { '蝙蝠': 2.5, '蜘蛛': 2, '蝎': 1.5, '幽灵': 2, '骷髅': 1.5, '蛇': 1.5, '史莱姆': 1.5 },
  '草原': { '马': 2.5, '羊': 2, '牛': 2, '猪': 1.5, '兔': 2, '鹿': 1.5, '猫': 1.5, '犬': 1.5, '豹': 2 },
  '遗迹': { '骷髅': 2.5, '幽灵': 2, '傀儡': 2, '元素': 1.5, '精灵': 1.5, '魅魔': 1.5, '恶魔': 1.5 },
};

//   随机事件系统  
const EVENTS = {
  // 探索事件
  explore: [
    { id: 'treasure', name: '发现宝箱', chance: 0.05, desc: '你发现了一个古老的宝箱！', reward: { money: [50, 200], items: ['捉宠符咒', '经验药水'] } },
    { id: 'rare_pet', name: '稀有宠物', chance: 0.03, desc: '一只稀有的宠物出现了！', effect: 'rarityBoost' },
    { id: 'merchant', name: '神秘商人', chance: 0.04, desc: '一位神秘商人向你兜售商品...', effect: 'merchant' },
    { id: 'trap', name: '陷阱', chance: 0.08, desc: '你踩到了陷阱！', penalty: { hp: [5, 15] } },
    { id: 'healing_spring', name: '治愈之泉', chance: 0.06, desc: '你发现了一处治愈之泉！', reward: { hp: 'full', energy: 'full' } },
    { id: 'lost', name: '迷路', chance: 0.1, desc: '你在探索中迷路了...', effect: 'lost' },
    { id: 'battle', name: '野生宠物袭击', chance: 0.15, desc: '一只野生宠物突然袭击了你！', effect: 'ambush' },
    { id: 'fruit', name: '发现野果', chance: 0.12, desc: '你发现了一些野果！', reward: { food: ['面包', '烤肉'] } },
    { id: 'ancient_ruin', name: '古代遗迹', chance: 0.04, desc: '你发现了一处古代遗迹...', effect: 'ancient' },
    { id: 'friendly_pet', name: '友善的宠物', chance: 0.08, desc: '一只友善的宠物靠近了你', reward: { affection: [5, 15] } },
  ],
  // 天气事件
  weather: {
    '流星雨': [
      { id: 'meteor_treasure', name: '流星坠落', chance: 0.01, desc: '一颗流星坠落在你附近！', reward: { items: ['传说之证'], money: [100, 500] } },
    ],
    '暴风': [
      { id: 'wind_item', name: '风中宝物', chance: 0.08, desc: '风把一件物品吹到了你面前', reward: { items: ['加速卡', '全速卡'] } },
    ],
    '雨天': [
      { id: 'rain_heal', name: '雨露滋养', chance: 0.1, desc: '雨水滋润了你的宠物', reward: { hp: [10, 20], energy: [10, 20] } },
    ],
  },
};

// 事件管理器
const EventManager = {
  // 触发探索事件
  triggerExploreEvent(regionId, pet) {
    const events = EVENTS.explore;
    const roll = Math.random();
    let cumulative = 0;

    for (const event of events) {
      cumulative += event.chance;
      if (roll < cumulative) {
        return this.executeEvent(event, regionId, pet);
      }
    }
    return null; // 没有事件触发
  },

  // 触发天气事件
  triggerWeatherEvent(weather, pet) {
    const events = EVENTS.weather[weather];
    if (!events) return null;

    const roll = Math.random();
    let cumulative = 0;

    for (const event of events) {
      cumulative += event.chance;
      if (roll < cumulative) {
        return this.executeEvent(event, null, pet);
      }
    }
    return null;
  },

  // 执行事件
  executeEvent(event, regionId, pet) {
    const result = {
      id: event.id,
      name: event.name,
      desc: event.desc,
      rewards: [],
      penalties: [],
    };

    // 处理奖励
    if (event.reward) {
      if (event.reward.money) {
        const [min, max] = event.reward.money;
        const amount = Math.floor(Math.random() * (max - min + 1)) + min;
        result.rewards.push(`金币+${amount}`);
        result.money = amount;
      }
      if (event.reward.items) {
        const item = event.reward.items[Math.floor(Math.random() * event.reward.items.length)];
        result.rewards.push(`获得道具: ${item}`);
        result.item = item;
      }
      if (event.reward.food) {
        const food = event.reward.food[Math.floor(Math.random() * event.reward.food.length)];
        result.rewards.push(`获得食物: ${food}`);
        result.food = food;
      }
      if (event.reward.hp === 'full' && pet) {
        result.rewards.push('生命完全恢复');
        result.hpFull = true;
      } else if (event.reward.hp && pet) {
        const [min, max] = event.reward.hp;
        const amount = Math.floor(Math.random() * (max - min + 1)) + min;
        result.rewards.push(`生命+${amount}`);
        result.hp = amount;
      }
      if (event.reward.energy === 'full' && pet) {
        result.rewards.push('精力完全恢复');
        result.energyFull = true;
      } else if (event.reward.energy && pet) {
        const [min, max] = event.reward.energy;
        const amount = Math.floor(Math.random() * (max - min + 1)) + min;
        result.rewards.push(`精力+${amount}`);
        result.energy = amount;
      }
      if (event.reward.affection && pet) {
        const [min, max] = event.reward.affection;
        const amount = Math.floor(Math.random() * (max - min + 1)) + min;
        result.rewards.push(`好感度+${amount}`);
        result.affection = amount;
      }
    }

    // 处理惩罚
    if (event.penalty) {
      if (event.penalty.hp && pet) {
        const [min, max] = event.penalty.hp;
        const amount = Math.floor(Math.random() * (max - min + 1)) + min;
        result.penalties.push(`生命-${amount}`);
        result.damage = amount;
      }
    }

    // 特殊效果
    if (event.effect) {
      result.specialEffect = event.effect;
    }

    return result;
  },

  // 格式化事件结果
  formatEventResult(event) {
    if (!event) return '';
    const lines = [`【随机事件】${event.name}`, event.desc];
    if (event.rewards.length > 0) lines.push('获得: ' + event.rewards.join(', '));
    if (event.penalties.length > 0) lines.push('损失: ' + event.penalties.join(', '));
    return lines.join('\n');
  },
};

//   社会系统  
// 城镇定义
const TOWNS = {
  'forest_village': { name: '翠林村', region: '森林', desc: '隐藏在茂密森林中的宁静村落', npcs: ['elder', 'herbalist', 'hunter'], ui: { x: 400, y: 350, icon: 'home' } },
  'volcano_fortress': { name: '炎焰堡', region: '火山', desc: '建立在火山脚下的坚固堡垒', npcs: ['blacksmith', 'warrior', 'merchant'], ui: { x: 750, y: 100, icon: 'castle' } },
  'ocean_port': { name: '碧波港', region: '海洋', desc: '繁忙的海港城市，商船云集', npcs: ['captain', 'fisherman', 'trader'], ui: { x: 100, y: 550, icon: 'anchor' } },
  'desert_oasis': { name: '绿洲镇', region: '沙漠', desc: '沙漠中唯一的绿洲', npcs: ['nomad', 'sage', 'merchant'], ui: { x: 800, y: 450, icon: 'palm-tree' } },
  'mountain_city': { name: '云端城', region: '山脉', desc: '高耸入云的山城', npcs: ['eagle_master', 'monk', 'trader'], ui: { x: 500, y: 100, icon: 'cloud' } },
  'cave_hideout': { name: '暗影洞窟', region: '洞穴', desc: '神秘地下组织的据点', npcs: ['shadow_dealer', 'rogue', 'mystic'], ui: { x: 600, y: 380, icon: 'skull' } },
  'grassland_camp': { name: '游牧营', region: '草原', desc: '游牧民族的临时营地', npcs: ['chieftain', 'beast_tamer', 'scout'], ui: { x: 200, y: 200, icon: 'tent' } },
  'ruin_tower': { name: '遗迹塔', region: '遗迹', desc: '古代文明残留的神秘高塔', npcs: ['archaeologist', 'wizard', 'guardian'], ui: { x: 500, y: 600, icon: 'monument' } },
};

const CITY_FOOD_SHOPS = {
  'forest_village': ['面包', '苹果', '蜂蜜', '香草沙拉'],
  'volcano_fortress': ['烤肉', '牛排', '火山辣肉', '龙息盛宴'],
  'ocean_port': ['鱼干', '海鲜大餐', '冰镇果盘', '山泉茶'],
  'desert_oasis': ['仙人掌汁', '炭烤玉米', '能量棒'],
  'mountain_city': ['牛奶', '山泉茶', '坚果'],
  'cave_hideout': ['咖啡', '暗影菌汤', '治疗药'],
  'grassland_camp': ['宠物粮', '游牧拼盘', '鸡蛋'],
  'ruin_tower': ['遗迹秘果', '星辉圣代', '生命药剂', '精力药剂'],
};

const NPC_SELLS_FOOD = {
  'herbalist': ['生命药剂', '精力药剂'],
  'merchant': ['宠物粮'],
  'fisherman': ['面包', '烤肉', '海鲜大餐'],
  'eagle_master': ['山泉茶'],
  'shadow_dealer': ['暗影菌汤'],
  'beast_tamer': ['宠物粮', '游牧拼盘'],
  'wizard': ['遗迹秘果', '星辉圣代'],
};

const SHOP_RUNTIME = {
  basicFoods: ['面包', '苹果', '鸡蛋', '牛奶', '鱼干', '蜂蜜', '药水', '治疗药', '宠物粮'],
  cityFoods: CITY_FOOD_SHOPS,
  npcFoods: NPC_SELLS_FOOD,
  npcSellOverrides: {},
};

function cloneList(value) {
  return Array.isArray(value) ? [...value] : [];
}

function getBasicShopFoods() {
  return cloneList(SHOP_RUNTIME.basicFoods);
}

function getCityFoodShop(townId) {
  return cloneList((SHOP_RUNTIME.cityFoods || {})[townId]);
}

function getNpcFoodShop(npcId) {
  return cloneList((SHOP_RUNTIME.npcFoods || {})[npcId]);
}

function getNpcSellList(npcId) {
  const override = (SHOP_RUNTIME.npcSellOverrides || {})[npcId];
  if (Array.isArray(override)) return cloneList(override);
  const npc = NPCS[npcId];
  return cloneList(npc?.sells);
}

function applyKeyedListPatch(target, entries = {}) {
  for (const [key, value] of Object.entries(entries || {})) {
    if (value === null) delete target[key];
    else if (Array.isArray(value)) target[key] = [...new Set(value.filter(v => typeof v === 'string' && v))];
  }
}

function toPatchNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeFoodDefinition(value) {
  if (!value || typeof value !== 'object') return null;
  const food = {};
  for (const key of ['hp', 'atk', 'def', 'energy', 'cost']) {
    const n = toPatchNumber(value[key]);
    if (n !== null) food[key] = n;
  }
  if (Array.isArray(value.affection)) {
    const min = toPatchNumber(value.affection[0]);
    const max = toPatchNumber(value.affection[1]);
    if (min !== null && max !== null) food.affection = [min, max];
  }
  return Object.keys(food).length ? food : null;
}

function sanitizeItemEffect(value) {
  if (!value || typeof value !== 'object') return null;
  const action = typeof value.action === 'string' ? value.action : '';
  const allowedActions = ['addExp', 'healPet', 'restoreEnergy', 'addMoney', 'addFood', 'addItem', 'teleport', 'expandStorage', 'resetSkills', 'revivePet', 'buff', 'chance', 'resource', 'custom'];
  if (!allowedActions.includes(action)) return null;
  const effect = { action };
  for (const key of ['amount', 'count', 'duration', 'rate']) {
    const n = toPatchNumber(value[key]);
    if (n !== null) effect[key] = n;
  }
  for (const key of ['food', 'item', 'town', 'key', 'target', 'resource', 'operation', 'handler']) {
    if (typeof value[key] === 'string') effect[key] = value[key];
  }
  if (value.value && typeof value.value === 'object' && !Array.isArray(value.value)) effect.value = value.value;
  if (value.params && typeof value.params === 'object' && !Array.isArray(value.params)) effect.params = value.params;
  if (Array.isArray(value.success)) effect.success = value.success.map(sanitizeItemEffect).filter(Boolean);
  if (Array.isArray(value.failure)) effect.failure = value.failure.map(sanitizeItemEffect).filter(Boolean);
  return effect;
}

function sanitizeItemCondition(value) {
  if (!value || typeof value !== 'object') return null;
  const type = typeof value.type === 'string' ? value.type : '';
  const allowedTypes = ['minPlayerLevel', 'minPetLevel', 'hasItem', 'hasFood', 'minMoney', 'guildRole', 'cooldown', 'custom'];
  if (!allowedTypes.includes(type)) return null;
  const condition = { type };
  for (const key of ['value', 'count', 'duration']) {
    const n = toPatchNumber(value[key]);
    if (n !== null) condition[key] = n;
  }
  for (const key of ['item', 'food', 'role', 'key', 'handler']) {
    if (typeof value[key] === 'string') condition[key] = value[key];
  }
  if (value.params && typeof value.params === 'object' && !Array.isArray(value.params)) condition.params = value.params;
  return condition;
}

function sanitizeItemDefinition(value) {
  if (!value || typeof value !== 'object') return null;
  const item = {};
  const cost = toPatchNumber(value.cost);
  if (cost !== null) item.cost = cost;
  if (typeof value.desc === 'string') item.desc = value.desc;
  if (typeof value.type === 'string') item.type = value.type;
  const effect = sanitizeItemEffect(value.effect);
  if (effect) item.effect = effect;
  if (Array.isArray(value.effects)) item.effects = value.effects.map(sanitizeItemEffect).filter(Boolean);
  if (Array.isArray(value.conditions)) item.conditions = value.conditions.map(sanitizeItemCondition).filter(Boolean);
  return Object.keys(item).length ? item : null;
}

function applyDefinitionPatch(target, entries = {}, sanitizer) {
  for (const [name, value] of Object.entries(entries || {})) {
    if (!name || typeof name !== 'string') continue;
    if (value === null) {
      delete target[name];
      continue;
    }
    const sanitized = sanitizer(value);
    if (sanitized) target[name] = { ...(target[name] || {}), ...sanitized };
  }
}

function applyShopPatch(payload = {}) {
  const shopPayload = payload.shops || payload;
  if (!shopPayload || typeof shopPayload !== 'object') return false;

  if (Array.isArray(shopPayload.basicFoods)) {
    SHOP_RUNTIME.basicFoods = [...new Set(shopPayload.basicFoods.filter(v => typeof v === 'string' && v))];
  }
  if (shopPayload.cityFoods && typeof shopPayload.cityFoods === 'object') {
    applyKeyedListPatch(SHOP_RUNTIME.cityFoods, shopPayload.cityFoods);
  }
  if (shopPayload.npcFoods && typeof shopPayload.npcFoods === 'object') {
    applyKeyedListPatch(SHOP_RUNTIME.npcFoods, shopPayload.npcFoods);
  }
  if (shopPayload.npcSells && typeof shopPayload.npcSells === 'object') {
    applyKeyedListPatch(SHOP_RUNTIME.npcSellOverrides, shopPayload.npcSells);
  }
  if (shopPayload.foods && typeof shopPayload.foods === 'object' && typeof FOODS !== 'undefined') {
    applyDefinitionPatch(FOODS, shopPayload.foods, sanitizeFoodDefinition);
  }
  if (shopPayload.items && typeof shopPayload.items === 'object' && typeof ITEMS !== 'undefined') {
    applyDefinitionPatch(ITEMS, shopPayload.items, sanitizeItemDefinition);
  }
  return true;
}

// 遭遇池热更新注册表
const ENCOUNTER_RUNTIME = {
  // 地区物种覆盖：{ '森林': ['猫', '狐', ...], ... }
  regionSpecies: {},
  // 稀有度权重覆盖
  rarityWeights: null,
};

function getRegionSpecies(regionId) {
  if (ENCOUNTER_RUNTIME.regionSpecies[regionId]) {
    return [...ENCOUNTER_RUNTIME.regionSpecies[regionId]];
  }
  const region = REGIONS[regionId];
  return region?.species ? [...region.species] : [];
}

function getRarityWeights() {
  if (ENCOUNTER_RUNTIME.rarityWeights) {
    return { ...ENCOUNTER_RUNTIME.rarityWeights };
  }
  return { ...RARITY_WEIGHTS };
}

function applyEncounterPatch(payload = {}) {
  const encPayload = payload.encounters || payload;
  if (!encPayload || typeof encPayload !== 'object') return false;

  // 更新地区物种
  if (encPayload.regionSpecies && typeof encPayload.regionSpecies === 'object') {
    for (const [regionId, species] of Object.entries(encPayload.regionSpecies)) {
      if (species === null) {
        delete ENCOUNTER_RUNTIME.regionSpecies[regionId];
      } else if (Array.isArray(species)) {
        ENCOUNTER_RUNTIME.regionSpecies[regionId] = [...new Set(species.filter(v => typeof v === 'string' && v))];
      }
    }
  }

  // 更新稀有度权重
  if (encPayload.rarityWeights && typeof encPayload.rarityWeights === 'object') {
    const weights = {};
    for (const [rarity, weight] of Object.entries(encPayload.rarityWeights)) {
      if (typeof weight === 'number' && weight >= 0) {
        weights[rarity] = weight;
      }
    }
    if (Object.keys(weights).length > 0) {
      ENCOUNTER_RUNTIME.rarityWeights = weights;
    }
  }

  return true;
}

// 副本热更新注册表
const DUNGEON_RUNTIME = {
  // 副本配置覆盖：{ '迷雾深渊': { boss: '新Boss', bossHp: 600, ... }, ... }
  dungeons: {},
};

function getDungeonConfig(dungeonName) {
  if (DUNGEON_RUNTIME.dungeons[dungeonName]) {
    return { ...DUNGEON_RUNTIME.dungeons[dungeonName] };
  }
  return DUNGEONS[dungeonName] ? { ...DUNGEONS[dungeonName] } : null;
}

function applyDungeonPatch(payload = {}) {
  const dungeonPayload = payload.dungeons || payload;
  if (!dungeonPayload || typeof dungeonPayload !== 'object') return false;

  for (const [name, config] of Object.entries(dungeonPayload)) {
    if (config === null) {
      delete DUNGEON_RUNTIME.dungeons[name];
    } else if (typeof config === 'object') {
      DUNGEON_RUNTIME.dungeons[name] = config;
    }
  }

  return true;
}

// NPC定义
const NPCS = {
  'elder': { name: '村长', desc: '年迈的村长，知晓许多秘密', type: 'quest' },
  'herbalist': { name: '草药师', desc: '精通草药的医师', type: 'shop', sells: ['经验药水', '生命药剂', '精力药剂'] },
  'hunter': { name: '猎人', desc: '经验丰富的猎人', type: 'quest' },
  'blacksmith': { name: '铁匠', desc: '技艺精湛的铁匠', type: 'shop', sells: ['力量卷轴', '防御卷轴'] },
  'warrior': { name: '战士', desc: '身经百战的战士', type: 'quest' },
  'merchant': { name: '商人', desc: '四处经商的商人', type: 'shop', sells: ['捉宠符咒', '宠物粮'] },
  'captain': { name: '船长', desc: '经验丰富的船长', type: 'quest' },
  'fisherman': { name: '渔夫', desc: '以捕鱼为生', type: 'shop', sells: ['面包', '烤肉', '海鲜大餐'] },
  'trader': { name: '贸易商', desc: '经营各种商品', type: 'shop', sells: ['经验药水', '技能书'] },
  'nomad': { name: '游牧者', desc: '沙漠中的旅人', type: 'quest' },
  'sage': { name: '智者', desc: '博学多识的智者', type: 'quest' },
  'eagle_master': { name: '鹰师', desc: '驯鹰高手', type: 'shop', sells: ['加速卡', '全速卡'] },
  'monk': { name: '僧侣', desc: '修行的僧侣', type: 'quest' },
  'shadow_dealer': { name: '暗影商人', desc: '神秘的地下商人', type: 'shop', sells: ['神秘蛋', '诅咒道具'] },
  'rogue': { name: '盗贼', desc: '神秘的盗贼', type: 'quest' },
  'mystic': { name: '神秘学家', desc: '研究神秘力量', type: 'quest' },
  'chieftain': { name: '酋长', desc: '部落的首领', type: 'quest' },
  'beast_tamer': { name: '驯兽师', desc: '精通驯兽', type: 'shop', sells: ['捉宠符咒', '天赋果实'] },
  'scout': { name: '斥候', desc: '机敏的斥候', type: 'quest' },
  'archaeologist': { name: '考古学家', desc: '研究古代遗迹', type: 'quest' },
  'wizard': { name: '巫师', desc: '掌握魔法力量', type: 'shop', sells: ['技能书', '高级技能书'] },
  'guardian': { name: '守护者', desc: '遗迹的守护者', type: 'quest' },
};

// 任务定义
const QUESTS = {
  daily: [
    { id: 'daily_catch', name: '日常捕捉', desc: '捕捉3只野生宠物', target: 3, type: 'catch', reward: { money: 100, exp: 50 } },
    { id: 'daily_battle', name: '日常战斗', desc: '进行5次战斗', target: 5, type: 'battle', reward: { money: 80, exp: 30 } },
    { id: 'daily_feed', name: '日常喂食', desc: '喂食宠物3次', target: 3, type: 'feed', reward: { money: 50, item: '宠物粮' } },
    { id: 'daily_explore', name: '日常探索', desc: '在不同地区探索2次', target: 2, type: 'explore', reward: { money: 60, item: '经验药水' } },
  ],
  main: [
    { id: 'main_1', name: '初识世界', desc: '获得你的第一只宠物', target: 1, type: 'pet_count', reward: { money: 200, item: '捉宠符咒' } },
    { id: 'main_2', name: '成长之路', desc: '将一只宠物升到10级', target: 10, type: 'pet_level', reward: { money: 500, item: '技能书' } },
    { id: 'main_3', name: '收集大师', desc: '拥有5只不同的宠物', target: 5, type: 'pet_count', reward: { money: 1000, item: '传说之证' } },
    { id: 'main_4', name: '精英训练师', desc: '将一只宠物升到30级', target: 30, type: 'pet_level', reward: { money: 2000, item: '天赋果实' } },
    { id: 'main_5', name: '传说之路', desc: '获得一只传说品质的宠物', target: 1, type: 'legendary_pet', reward: { money: 5000, item: '神秘蛋' } },
  ],
};

// 任务管理器
const QuestManager = {
  initPlayerQuests(data) {
    if (!data.quests) data.quests = { daily: {}, main: {}, lastDailyReset: 0 };
    this.checkDailyReset(data);
  },

  resolveQuest(questRef) {
    const ref = (questRef || '').trim();
    if (!ref) return null;

    const all = [...QUESTS.daily, ...QUESTS.main];

    // 优先按任务ID精确匹配
    let quest = all.find(q => q.id === ref);
    if (quest) return quest;

    // 其次按任务名精确匹配
    quest = all.find(q => q.name === ref);
    if (quest) return quest;

    // 最后按任务名模糊匹配（仅唯一命中时生效）
    const fuzzy = all.filter(q => q.name.includes(ref));
    if (fuzzy.length === 1) return fuzzy[0];

    return null;
  },

  checkDailyReset(data) {
    const today = new Date().setHours(0, 0, 0, 0);
    if (data.quests.lastDailyReset < today) {
      data.quests.daily = {};
      data.quests.lastDailyReset = today;
      data.feedTracker = {};
      data.feedDaily = { date: today, firstBonusClaimed: false };
    }
    if (!data.feedTracker) data.feedTracker = {};
    if (!data.feedDaily || data.feedDaily.date !== today) {
      data.feedDaily = { date: today, firstBonusClaimed: false };
    }
  },

  acceptQuest(data, questRef) {
    const quest = this.resolveQuest(questRef);
    if (!quest) return { success: false, msg: '任务不存在' };
    const questId = quest.id;
    const type = QUESTS.daily.includes(quest) ? 'daily' : 'main';
    if (data.quests[type][questId]) return { success: false, msg: '已接受该任务' };
    data.quests[type][questId] = { progress: 0, completed: false, claimed: false };
    return { success: true, msg: `已接受任务: ${quest.name}` };
  },

  updateProgress(data, type, amount = 1) {
    this.initPlayerQuests(data);
    this.checkDailyReset(data);
    const allQuests = [...QUESTS.daily, ...QUESTS.main];
    let updated = [];
    for (const quest of allQuests) {
      if (quest.type !== type) continue;
      const questType = QUESTS.daily.includes(quest) ? 'daily' : 'main';
      const progress = data.quests[questType][quest.id];
      if (progress && !progress.completed) {
        progress.progress = Math.min(progress.progress + amount, quest.target);
        if (progress.progress >= quest.target) progress.completed = true;
        updated.push(quest.name);
      }
    }
    return updated;
  },

  claimReward(data, questRef) {
    const quest = this.resolveQuest(questRef);
    if (!quest) return { success: false, msg: '任务不存在' };
    const questId = quest.id;
    const type = QUESTS.daily.includes(quest) ? 'daily' : 'main';
    const progress = data.quests[type][questId];
    if (!progress) return { success: false, msg: '未接受该任务' };
    if (!progress.completed) return { success: false, msg: '任务未完成' };
    if (progress.claimed) return { success: false, msg: '已领取奖励' };
    progress.claimed = true;

    const rewards = [];
    if (quest.reward.money) { data.money += quest.reward.money; rewards.push(`金币+${quest.reward.money}`); }
    if (quest.reward.exp) {
      const pet = data.pets.find(p => p.id === data.activePet);
      if (pet) { pet.exp = (pet.exp || 0) + quest.reward.exp; rewards.push(`经验+${quest.reward.exp}`); }
    }
    if (quest.reward.item) {
      data.items = data.items || {};
      data.items[quest.reward.item] = (data.items[quest.reward.item] || 0) + 1;
      rewards.push(`${quest.reward.item}+1`);
    }
    return { success: true, msg: `任务完成！获得: ${rewards.join(', ')}` };
  },

  getQuestList(data, type = 'all') {
    this.initPlayerQuests(data);
    const lines = [];
    const showQuests = (quests, questType) => {
      for (const q of quests) {
        const p = data.quests[questType][q.id];
        const status = !p ? '×未接受' : p.claimed ? '✓已领取' : p.completed ? '★可领取' : `○${p.progress}/${q.target}`;
        lines.push(`${q.name}: ${q.desc} [${status}]`);
      }
    };
    if (type === 'all' || type === 'daily') { lines.push('【每日任务】'); showQuests(QUESTS.daily, 'daily'); }
    if (type === 'all' || type === 'main') { lines.push('\n【主线任务】'); showQuests(QUESTS.main, 'main'); }
    return lines.join('\n');
  },
};

// 世界状态管理
const WorldManager = {
  // 获取当前时段
  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return '早晨';
    if (hour >= 12 && hour < 18) return '白天';
    if (hour >= 18 && hour < 22) return '傍晚';
    return '夜晚';
  },

  isNight() {
    const hour = new Date().getHours();
    return hour < 6 || hour >= 20;
  },

  // 获取/生成天气（每小时变化）
  getWeather(region) {
    const hour = new Date().getHours();
    const weatherKeys = Object.keys(WEATHERS);
    // 基于小时和区域生成伪随机天气
    const seed = hour + (region ? region.length : 0);
    const idx = seed % weatherKeys.length;
    return weatherKeys[idx];
  },

  // 获取当前可探索的地区
  getAvailableRegions() {
    const time = this.getTimeOfDay();
    const isNight = this.isNight();
    return Object.entries(REGIONS).filter(([_, r]) => {
      if (r.nightOnly && !isNight) return false;
      if (r.dayOnly && isNight) return false;
      return true;
    }).map(([id, r]) => ({ id, ...r }));
  },

  // 获取地区可出现的物种
  getRegionSpecies(regionId) {
    const region = REGIONS[regionId];
    if (!region) return Object.keys(SPECIES);
    return region.species;
  },

  // 格式化世界状态
  formatWorldStatus(regionId) {
    const time = this.getTimeOfDay();
    const weather = this.getWeather(regionId);
    const weatherData = WEATHERS[weather];
    const region = regionId ? REGIONS[regionId] : null;

    const lines = [`【世界状态】`, `时间: ${time}`, `天气: ${weather}(${weatherData.effect})`];
    if (region) {
      lines.push(`地区: ${region.name}`);
      lines.push(`描述: ${region.desc}`);
    }
    return lines.join('\n');
  },
};

//   宠物名字库  
const PET_NAMES = {
  '火': ['炎', '焰', '烈', '灼', '赤', '红', '焚', '烬', '煌', '炽', '炎龙', '烈焰', '火舞', '赤焰'],
  '水': ['沧', '澜', '涟', '漪', '渊', '深', '清', '澈', '蓝', '波', '沧澜', '水月', '碧波', '深蓝'],
  '草': ['翠', '森', '叶', '芽', '藤', '蔓', '荣', '华', '青', '苍', '翠叶', '森灵', '青藤', '苍翠'],
  '电': ['雷', '电', '闪', '光', '紫', '金', '迅', '疾', '煌', '耀', '雷电', '闪电', '紫电', '疾风'],
  '岩石': ['岩', '石', '山', '岳', '峰', '崖', '坚', '磐', '地', '岩山', '石岳', '磐石', '巨岩'],
  '超能': ['幻', '灵', '梦', '虚', '冥', '幽', '玄', '秘', '影', '念', '幻灵', '梦境', '幽影', '玄冥'],
};

const NAME_SUFFIX = ['丸', '子', '酱', '儿', '灵', '兽', '君', '姬', '王', '皇', '神', '仙', '蛋', '宝', '球', ''];

//   基础属性
const BASE_STATS = {
  '普通': { hp: 25, atk: 18, def: 15, energy: 25, spd: 100 },
  '稀有': { hp: 38, atk: 30, def: 25, energy: 35, spd: 110 },
  '超稀有': { hp: 50, atk: 42, def: 38, energy: 48, spd: 120 },
  '传说': { hp: 65, atk: 55, def: 50, energy: 60, spd: 130 },
  '神话': { hp: 90, atk: 80, def: 75, energy: 85, spd: 150 },
  '异变': { hp: 45, atk: 40, def: 35, energy: 40, spd: 120 }, // 异变宠物随机属性
};

const ELEMENT_ADV = { '火': '草', '水': '火', '草': '水', '电': '水', '岩石': '电', '超能': '岩石' };
const RARITY_WEIGHTS = { '普通': 69.9, '稀有': 25, '超稀有': 4.5, '传说': 0.5, '神话': 0.05 };
const RARITY_MARK = { '普通': '☆', '稀有': '★', '超稀有': '★★', '传说': '★★★', '神话': '★★★★', '异变': '✦' };
const ELEMENT_MARK = { '火': '[火]', '水': '[水]', '草': '[草]', '电': '[电]', '岩石': '[岩]', '超能': '[灵]' };

const FOODS = {
  '面包': { hp: 5, atk: 0, def: 0, energy: 10, cost: 10, affection: [3, 4] },
  '烤肉': { hp: 15, atk: 2, def: 2, energy: 20, cost: 30, affection: [5, 6] },
  '咖啡': { hp: 0, atk: 0, def: 0, energy: 50, cost: 80, affection: [2, 3] },
  '药水': { hp: 50, atk: 0, def: 0, energy: 0, cost: 40, affection: [2, 3] },
  '牛奶': { hp: 10, atk: 0, def: 2, energy: 15, cost: 15, affection: [4, 5] },
  '鸡蛋': { hp: 8, atk: 1, def: 1, energy: 12, cost: 12, affection: [4, 5] },
  '苹果': { hp: 5, atk: 0, def: 0, energy: 20, cost: 25, affection: [3, 4] },
  '鱼干': { hp: 12, atk: 1, def: 1, energy: 15, cost: 18, affection: [4, 5] },
  '蜂蜜': { hp: 15, atk: 0, def: 0, energy: 30, cost: 25, affection: [5, 6] },
  '蘑菇': { hp: 0, atk: 3, def: 0, energy: 10, cost: 20, affection: [3, 4] },
  '坚果': { hp: 0, atk: 0, def: 5, energy: 5, cost: 15, affection: [3, 4] },
  '牛排': { hp: 25, atk: 3, def: 3, energy: 30, cost: 50, affection: [6, 8] },
  '能量棒': { hp: 0, atk: 0, def: 0, energy: 80, cost: 180, affection: [2, 3] },
  '治疗药': { hp: 80, atk: 0, def: 0, energy: 0, cost: 60, affection: [1, 2] },
  '宠物粮': { hp: 12, atk: 0, def: 0, energy: 18, cost: 16, affection: [4, 5] },
  '生命药剂': { hp: 120, atk: 0, def: 0, energy: 0, cost: 90, affection: [2, 3] },
  '精力药剂': { hp: 0, atk: 0, def: 0, energy: 120, cost: 300, affection: [2, 3] },
  '海鲜大餐': { hp: 30, atk: 2, def: 2, energy: 40, cost: 65, affection: [6, 8] },
  '香草沙拉': { hp: 18, atk: 0, def: 1, energy: 28, cost: 28, affection: [5, 6] },
  '炭烤玉米': { hp: 10, atk: 1, def: 1, energy: 22, cost: 20, affection: [4, 5] },
  '火山辣肉': { hp: 20, atk: 4, def: 1, energy: 25, cost: 55, affection: [5, 7] },
  '冰镇果盘': { hp: 14, atk: 0, def: 0, energy: 45, cost: 32, affection: [5, 6] },
  '仙人掌汁': { hp: 8, atk: 0, def: 2, energy: 35, cost: 26, affection: [4, 5] },
  '山泉茶': { hp: 12, atk: 0, def: 1, energy: 38, cost: 30, affection: [4, 6] },
  '暗影菌汤': { hp: 16, atk: 2, def: 2, energy: 30, cost: 42, affection: [5, 6] },
  '游牧拼盘': { hp: 22, atk: 2, def: 3, energy: 24, cost: 48, affection: [5, 7] },
  '遗迹秘果': { hp: 18, atk: 3, def: 1, energy: 36, cost: 58, affection: [6, 8] },
  '星辉圣代': { hp: 20, atk: 2, def: 2, energy: 50, cost: 88, affection: [7, 9] },
  '龙息盛宴': { hp: 35, atk: 5, def: 4, energy: 45, cost: 128, affection: [8, 10] },
};

const SKILLS = {
  // 基础技能
  '冲撞': { power: 40, acc: 95, cost: 0, desc: '基础技能，无消耗' },
  '抓击': { power: 45, acc: 100, cost: 5, desc: '稳定的物理攻击' },

  // 元素技能 - 初级
  '烈焰': { power: 55, acc: 95, cost: 8, element: '火', desc: '火焰攻击' },
  '火焰术': { power: 50, acc: 95, cost: 8, element: '火', desc: '基础火焰术' },
  '激流': { power: 55, acc: 95, cost: 8, element: '水', desc: '水流攻击' },
  '水弹': { power: 50, acc: 95, cost: 8, element: '水', desc: '基础水弹' },
  '荆棘': { power: 55, acc: 95, cost: 8, element: '草', desc: '荆棘缠绕' },
  '藤鞭': { power: 50, acc: 95, cost: 8, element: '草', desc: '基础藤鞭攻击' },
  '雷击': { power: 55, acc: 95, cost: 8, element: '电', desc: '雷电攻击' },
  '闪电': { power: 50, acc: 95, cost: 8, element: '电', desc: '基础闪电' },
  '落石': { power: 60, acc: 90, cost: 10, element: '岩石', desc: '岩石砸击' },
  '猛击': { power: 55, acc: 95, cost: 8, element: '岩石', desc: '基础岩石攻击' },
  '念力': { power: 50, acc: 100, cost: 10, element: '超能', desc: '精神攻击，必中' },

  // 元素技能 - 中级
  '炎爆': { power: 85, acc: 85, cost: 18, element: '火', desc: '强力火焰' },
  '洪流': { power: 85, acc: 85, cost: 18, element: '水', desc: '强力水流' },
  '森葬': { power: 90, acc: 80, cost: 22, element: '草', desc: '森林埋葬' },
  '雷暴': { power: 95, acc: 80, cost: 22, element: '电', desc: '雷电风暴' },
  '地裂': { power: 100, acc: 75, cost: 25, element: '岩石', desc: '大地裂变' },
  '精神冲击': { power: 80, acc: 90, cost: 18, element: '超能', desc: '精神冲击' },

  // 元素技能 - 高级
  '地狱火': { power: 120, acc: 70, cost: 35, element: '火', desc: '地狱烈焰' },
  '海啸': { power: 120, acc: 70, cost: 35, element: '水', desc: '海啸冲击' },
  '自然之怒': { power: 130, acc: 65, cost: 40, element: '草', desc: '自然愤怒' },
  '神雷': { power: 125, acc: 70, cost: 38, element: '电', desc: '神之雷霆' },
  '陨石': { power: 140, acc: 60, cost: 45, element: '岩石', desc: '陨石坠落' },
  '念动力场': { power: 110, acc: 85, cost: 30, element: '超能', desc: '念动力场' },

  // 功能技能
  '蓄力': { power: 0, acc: 100, cost: 5, effect: 'charge', desc: '下回合伤害x1.5' },
  '护盾': { power: 0, acc: 100, cost: 0, effect: 'defend', desc: '本回合伤害减半' },
  '治愈': { power: 0, acc: 100, cost: 20, effect: 'heal', healRate: 0.15, element: '超能', desc: '恢复15%生命' },
  '灵击': { power: 35, acc: 95, cost: 8, desc: '凝聚灵气发出攻击' },
  '灵刃': { power: 45, acc: 90, cost: 12, desc: '凝聚灵刃斩击敌人' },
  '吸血': { power: 50, acc: 90, cost: 15, effect: 'lifesteal', lifestealRate: 0.5, desc: '攻击并回复50%伤害' },

  // 治愈系技能
  '祈祷': { power: 0, acc: 100, cost: 8, effect: 'heal', healRate: 0.08, element: '超能', desc: '虔诚祈祷，恢复8%生命' },
  '治愈波': { power: 0, acc: 100, cost: 15, effect: 'heal', healRate: 0.2, element: '超能', desc: '治愈波动，恢复20%生命' },
  '圣光术': { power: 0, acc: 100, cost: 22, effect: 'heal', healRate: 0.25, element: '超能', desc: '圣光治愈，恢复25%生命' },
  '生命之息': { power: 0, acc: 100, cost: 18, effect: 'regen', regenRate: 0.1, element: '草', desc: '每回合恢复10%生命，持续3回合' },
  '自然祝福': { power: 0, acc: 100, cost: 25, effect: 'heal', healRate: 0.35, element: '草', desc: '自然之力，恢复35%生命' },
  '天使之吻': { power: 0, acc: 100, cost: 30, effect: 'heal', healRate: 0.4, element: '超能', desc: '天使的祝福，恢复40%生命' },
  '圣灵守护': { power: 0, acc: 100, cost: 35, effect: 'shield', shieldCount: 2, element: '超能', desc: '获得2层护盾' },
  '生命绽放': { power: 0, acc: 100, cost: 45, effect: 'heal', healRate: 0.5, element: '草', desc: '生命绽放，恢复50%生命' },
  '奇迹之光': { power: 0, acc: 100, cost: 50, effect: 'miracle', element: '超能', desc: '恢复60%生命，解除所有负面状态' },

  // 新增技能 - 连击/状态技能
  '连击': { power: 40, acc: 90, cost: 12, desc: '连续攻击2次', hits: 2 },
  '三连斩': { power: 35, acc: 85, cost: 18, desc: '连续攻击3次', hits: 3 },
  '毒雾': { power: 30, acc: 95, cost: 15, effect: 'poison', desc: '附加中毒效果' },
  '麻痹爪': { power: 50, acc: 85, cost: 12, effect: 'paralyze', desc: '30%麻痹敌人' },
  '冰冻吐息': { power: 70, acc: 85, cost: 20, element: '水', effect: 'freeze', desc: '20%冻结敌人' },
  '烈焰风暴': { power: 90, acc: 80, cost: 28, element: '火', desc: '火属性AOE' },
  '雷霆万钧': { power: 100, acc: 75, cost: 35, element: '电', desc: '无视防御20%' },
  '治愈之光': { power: 0, acc: 100, cost: 25, effect: 'heal', healRate: 0.3, element: '超能', desc: '恢复30%生命' },
  '铁壁': { power: 0, acc: 100, cost: 10, effect: 'defend', desc: '防御+50%持续3回合' },
  '狂暴': { power: 0, acc: 100, cost: 15, effect: 'berserk', desc: '攻击+30%，防御-20%' },

  // 终极技能
  '究极爆破': { power: 150, acc: 65, cost: 50, desc: '究极攻击技能' },
  '灭世龙息': { power: 180, acc: 60, cost: 60, element: '火', desc: '龙族专属，无视防御' },
  '凤凰涅槃': { power: 0, acc: 100, cost: 0, effect: 'revive', desc: '死亡时复活' },
  '九尾魅惑': { power: 80, acc: 90, cost: 30, element: '超能', effect: 'charm', desc: '混乱敌人' },
  '白虎之威': { power: 100, acc: 85, cost: 35, desc: '白虎专属，攻击提升' },
  '玄武之盾': { power: 0, acc: 100, cost: 20, effect: 'shield', desc: '获得护盾' },
  '朱雀之焰': { power: 120, acc: 80, cost: 40, element: '火', desc: '朱雀专属，灼烧敌人' },
  '青龙之怒': { power: 130, acc: 75, cost: 45, element: '电', desc: '青龙专属，雷击敌人' },

  // 神话技能
  '神龙降临': { power: 200, acc: 70, cost: 80, desc: '神龙专属终极技' },
  '不死神凤': { power: 0, acc: 100, cost: 0, effect: 'immortal', desc: '不死之身' },
  '九首神威': { power: 180, acc: 75, cost: 70, desc: '九头蛇专属，九头齐攻' },
  '泰坦之力': { power: 160, acc: 80, cost: 55, desc: '石像鬼专属，巨力一击' },
  '生命之源': { power: 0, acc: 100, cost: 40, effect: 'heal', healRate: 0.5, element: '草', desc: '恢复50%生命' },
  '海神之怒': { power: 140, acc: 80, cost: 45, element: '水', desc: '海神专属，海啸攻击' },
  '神座降临': { power: 220, acc: 65, cost: 90, element: '超能', desc: '天使专属，神圣审判' },

  // 守护者Boss技能
  '守护之击': { power: 80, acc: 95, cost: 15, desc: '守护者的强力一击' },
  '神圣护盾': { power: 0, acc: 100, cost: 25, effect: 'shield', desc: '守护者召唤神圣护盾' },
  '终极审判': { power: 150, acc: 75, cost: 50, element: '超能', desc: '守护者的终极审判' },
};

// 元素对应的初始技能
const INITIAL_SKILLS = {
  '火': '烈焰',
  '水': '激流',
  '草': '荆棘',
  '电': '雷击',
  '岩石': '落石',
  '超能': '念力',
};

//   道具定义  
const ITEMS = {
  // 捉宠相关
  '捉宠符咒': { cost: 50, desc: '捉宠必备道具，无符咒只能获得经验', type: 'catch' },
  '幸运符': { cost: 2000, desc: '下次捉宠稀有度提升一档', type: 'luck' },
  '传说之证': { cost: 10000, desc: '下次捉宠必定为传说品质', type: 'luck' },

  // 育种相关
  '计划生育卡': { cost: 1000, desc: '允许宠物额外育种一次（最多3胎）', type: 'breed' },
  '多胞胎药水': { cost: 800, desc: '下次育种必定生出双胞胎', type: 'breed' },

  // 加速相关
  '加速卡': { cost: 500, desc: '立即完成一个打工或探险任务', type: 'speed' },
  '全速卡': { cost: 1200, desc: '立即完成所有打工和探险任务', type: 'speed' },

  // 属性相关
  '洗点药水': { cost: 300, desc: '重置一只宠物的技能点', type: 'skill' },
  '经验药水': { cost: 200, desc: '宠物获得100经验', type: 'exp' },
  '大经验药水': { cost: 500, desc: '宠物获得300经验', type: 'exp' },

  // 复活相关
  '复活药': { cost: 1000, desc: '复活一只死亡的宠物', type: 'revive' },

  // 其他
  '扩容卡': { cost: 5000, desc: '仓库容量+5', type: 'misc' },
};

//   玩家系统  
// 玩家装备
const PLAYER_EQUIPMENT = {
  weapon: {
    '木剑': { rarity: '普通', str: 2, desc: '简单的木剑' },
    '铁剑': { rarity: '稀有', str: 5, agi: 2, desc: '坚固的铁剑' },
    '精钢剑': { rarity: '史诗', str: 10, agi: 5, desc: '精钢锻造' },
    '传说之剑': { rarity: '传说', str: 20, agi: 10, int: 5, desc: '传说中的神剑' },
  },
  armor: {
    '布衣': { rarity: '普通', vit: 2, desc: '简单的布衣' },
    '皮甲': { rarity: '稀有', vit: 5, agi: 2, desc: '轻便的皮甲' },
    '锁子甲': { rarity: '史诗', vit: 10, str: 3, desc: '坚固的锁子甲' },
    '龙鳞甲': { rarity: '传说', vit: 20, str: 5, agi: 5, desc: '龙鳞制成的护甲' },
  },
  accessory: {
    '力量戒指': { rarity: '稀有', str: 5, desc: '增加力量' },
    '智慧项链': { rarity: '稀有', int: 5, desc: '增加智力' },
    '敏捷护符': { rarity: '稀有', agi: 5, desc: '增加敏捷' },
    '生命宝石': { rarity: '史诗', vit: 10, desc: '增加体质' },
    '全能徽章': { rarity: '传说', str: 8, agi: 8, int: 8, vit: 8, desc: '全面提升' },
  },
};

// 玩家技能书
const PLAYER_SKILL_BOOKS = {
  '驯兽术': { desc: '宠物经验+10%', passive: 'expBoost', value: 0.1, rarity: '稀有' },
  '战斗直觉': { desc: '宠物暴击率+5%', passive: 'critBoost', value: 0.05, rarity: '稀有' },
  '元素亲和': { desc: '元素克制伤害+10%', passive: 'elementBoost', value: 0.1, rarity: '稀有' },
  '生命链接': { desc: '战斗中宠物每回合恢复2%生命', passive: 'hpRegen', value: 0.02, rarity: '史诗' },
  '能量涌动': { desc: '宠物精力消耗-10%', passive: 'energySave', value: 0.1, rarity: '史诗' },
  '捕捉大师': { desc: '捕捉成功率+10%', passive: 'catchBoost', value: 0.1, rarity: '史诗' },
  '传说驯兽师': { desc: '传说宠物出现率+50%', passive: 'legendBoost', value: 0.5, rarity: '传说' },
  '神话契约': { desc: '神话宠物捕捉率+5%', passive: 'mythCatch', value: 0.05, rarity: '传说' },
};

// 玩家升级经验表
const PLAYER_EXP_TABLE = [0, 100, 250, 500, 800, 1200, 1800, 2500, 3500, 5000];

const DB = {
  migrate(data) {
    if (!data || typeof data !== 'object') return data;
    if (!data.schemaVersion) data.schemaVersion = 1;
    return data;
  },
  get(userId) {
    const defaultData = {
      schemaVersion: MAIN_SCHEMA_VERSION,
      pets: [], storage: [], money: 100, food: { '面包': 5 }, items: { '捉宠符咒': 5 }, maxStorage: 15,
      feedTracker: {},
      feedDaily: { date: 0, firstBonusClaimed: false },
      // 玩家属性
      player: {
        level: 1, exp: 0,
        str: 10, agi: 10, int: 10, vit: 10,  // 力量/敏捷/智力/体质
        energy: 100, maxEnergy: 100,  // 玩家精力
        equipment: { weapon: null, armor: null, accessory: null },
        skills: [],
        dailyTrain: 0, lastTrainDate: '',
      },
      playerItems: {},  // 玩家装备和技能书
      currentTown: '',
      currentShopNpc: '',
    };
    try {
      const d = ext.storageGet('u_' + userId);
      if (!d) return defaultData;

      const data = this.migrate(JSON.parse(d));

      // 兼容旧数据：检查是否原本没有storage字段
      const hadStorage = 'storage' in data;
      data.pets = data.pets || [];
      data.storage = data.storage || [];
      data.money = data.money || 100;
      data.food = data.food || { '面包': 5 };
      data.items = data.items || {};
      data.maxStorage = data.maxStorage || 15;
      data.feedTracker = data.feedTracker || {};
      data.feedDaily = data.feedDaily || { date: 0, firstBonusClaimed: false };
      data.currentTown = data.currentTown || '';
      data.currentShopNpc = data.currentShopNpc || '';

      // 如果是旧数据格式且pets超过上限，移入仓库
      if (!hadStorage && data.pets.length > CONFIG.maxPets) {
        data.storage = data.pets.splice(CONFIG.maxPets);
      }

      // 为旧宠物补齐必要字段
      for (const pet of data.pets) {
        if (!pet.id) pet.id = DB.genId();
        if (!pet.gender) pet.gender = Math.random() < 0.5 ? '♂' : '♀';
        if (!pet.parents) pet.parents = null;
        pet.breedCount = pet.breedCount ?? 0;
        pet.canBreed = pet.canBreed ?? (pet.breedCount < 1);
        // 更新旧宠物的初始技能
        if (pet.skills && pet.skills[0] === '冲撞' && INITIAL_SKILLS[pet.element]) {
          pet.skills[0] = INITIAL_SKILLS[pet.element];
        }
      }
      for (const pet of data.storage) {
        if (!pet.id) pet.id = DB.genId();
        if (!pet.gender) pet.gender = Math.random() < 0.5 ? '♂' : '♀';
        if (!pet.parents) pet.parents = null;
        pet.breedCount = pet.breedCount ?? 0;
        pet.canBreed = pet.canBreed ?? (pet.breedCount < 1);
        // 更新旧宠物的初始技能
        if (pet.skills && pet.skills[0] === '冲撞' && INITIAL_SKILLS[pet.element]) {
          pet.skills[0] = INITIAL_SKILLS[pet.element];
        }
      }

      // 玩家属性兼容
      if (!data.player) {
        data.player = {
          level: 1, exp: 0,
          str: 10, agi: 10, int: 10, vit: 10,
          energy: 100, maxEnergy: 100,
          equipment: { weapon: null, armor: null, accessory: null },
          skills: [],
          dailyTrain: 0, lastTrainDate: '',
        };
      }
      // 确保所有字段存在 (v3.6.11 使用??避免0值问题)
      data.player.level = data.player.level ?? 1;
      data.player.exp = data.player.exp ?? 0;
      data.player.str = data.player.str ?? 10;
      data.player.agi = data.player.agi ?? 10;
      data.player.int = data.player.int ?? 10;
      data.player.vit = data.player.vit ?? 10;
      data.player.energy = data.player.energy ?? 100;
      data.player.maxEnergy = data.player.maxEnergy ?? 100;
      data.player.equipment = data.player.equipment ?? { weapon: null, armor: null, accessory: null };
      data.player.skills = data.player.skills ?? [];
      data.player.dailyTrain = data.player.dailyTrain ?? 0;
      data.player.lastTrainDate = data.player.lastTrainDate ?? '';
      data.playerItems = data.playerItems ?? {};

      let energyRecovered = false;
      const now = Date.now();
      const lastCheck = data.lastEnergyCheck || data.lastActiveTime || 0;
      const hoursPassed = lastCheck > 0 ? (now - lastCheck) / 3600000 : 0;
      if (hoursPassed >= 0.1) { // 至少6分钟才恢复
        const recoverRate = 0.2; // 每小时恢复20%

        // 恢复所有宠物精力
        for (const pet of data.pets) {
          pet.maxEnergy = pet.maxEnergy ?? pet.energy ?? 100;
          pet.energy = pet.energy ?? pet.maxEnergy;
          if (pet.energy < pet.maxEnergy) {
            // 慵懒性格：精力恢复速度+100%
            const petRecoverRate = pet.nature === '慵懒' ? recoverRate * (NATURES['慵懒'].energyRegenMod || 2.0) : recoverRate;
            const beforeEnergy = pet.energy;
            pet.energy = Math.min(pet.maxEnergy, pet.energy + Math.floor(pet.maxEnergy * hoursPassed * petRecoverRate));
            if (pet.energy !== beforeEnergy) energyRecovered = true;
          }
        }
        for (const pet of data.storage || []) {
          pet.maxEnergy = pet.maxEnergy ?? pet.energy ?? 100;
          pet.energy = pet.energy ?? pet.maxEnergy;
          if (pet.energy < pet.maxEnergy) {
            // 慵懒性格：精力恢复速度+100%
            const petRecoverRate = pet.nature === '慵懒' ? recoverRate * (NATURES['慵懒'].energyRegenMod || 2.0) : recoverRate;
            const beforeEnergy = pet.energy;
            pet.energy = Math.min(pet.maxEnergy, pet.energy + Math.floor(pet.maxEnergy * hoursPassed * petRecoverRate));
            if (pet.energy !== beforeEnergy) energyRecovered = true;
          }
        }

        // 恢复玩家精力
        if (data.player.energy < data.player.maxEnergy) {
          const beforeEnergy = data.player.energy;
          data.player.energy = Math.min(data.player.maxEnergy, data.player.energy + Math.floor(data.player.maxEnergy * hoursPassed * recoverRate));
          if (data.player.energy !== beforeEnergy) energyRecovered = true;
        }

        data.lastEnergyCheck = now;
      } else if (!data.lastEnergyCheck) {
        data.lastEnergyCheck = now;
      }

      if (energyRecovered || !d.includes('"lastEnergyCheck"')) {
        ext.storageSet('u_' + userId, JSON.stringify(data));
      }

      return data;
    } catch (e) {
      console.log('[万物有灵] 数据解析失败:', e);
      return defaultData;
    }
  },
  save(userId, data) {
    try {
      // 金币上限检查
      data.schemaVersion = MAIN_SCHEMA_VERSION;
      if (data.money && data.money > CONFIG.maxMoney) {
        data.money = CONFIG.maxMoney;
      }
      ext.storageSet('u_' + userId, JSON.stringify(data));
      if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
        WebUIReporter.reportPlayerSnapshot(userId, data);
      }
    } catch (e) {
      console.log('[万物有灵] 数据保存失败:', e);
    }
  },
  genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  // 全局用户昵称映射
  _nameMap: null,
  getNameMap() {
    if (!this._nameMap) {
      try {
        const saved = ext.storageGet('nameMap_global');
        this._nameMap = saved ? JSON.parse(saved) : {};
      } catch (e) {
        this._nameMap = {};
      }
    }
    return this._nameMap;
  },
  setName(userId, name) {
    const map = this.getNameMap();
    if (name && name !== userId.replace('QQ:', '')) {
      map[userId] = name;
      try {
        ext.storageSet('nameMap_global', JSON.stringify(map));
      } catch (e) {}
    }
  },
  getName(userId) {
    const map = this.getNameMap();
    return map[userId] || null;
  },
};

const PetFactory = {
  randomRarity(boost = 0, forceLegend = false, legendBoost = 0, forceMyth = false) {
    if (forceMyth) return '神话';
    if (forceLegend) return '传说';

    const rand = Math.random() * 100;
    let threshold = 0;
    let result = '普通';

    // 使用热更新注册表的权重
    const weights = getRarityWeights();
    if (legendBoost > 0) {
      weights['传说'] = (weights['传说'] || 0) * (1 + legendBoost);
      weights['神话'] = (weights['神话'] || 0) * (1 + legendBoost);
    }

    for (const [rarity, weight] of Object.entries(weights)) {
      threshold += weight;
      if (rand < threshold) {
        result = rarity;
        break;
      }
    }

    // 应用稀有度提升
    if (boost > 0) {
      const rarityOrder = ['普通', '稀有', '超稀有', '传说', '神话'];
      const idx = rarityOrder.indexOf(result);
      const newIdx = Math.min(idx + boost, rarityOrder.length - 1);
      result = rarityOrder[newIdx];
    }

    return result;
  },

  generateName(element) {
    const prefixes = PET_NAMES[element] || PET_NAMES['火'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = NAME_SUFFIX[Math.floor(Math.random() * NAME_SUFFIX.length)];
    return prefix + (Math.random() > 0.5 ? suffix : '');
  },

  create(rarityBoost = 0, forceLegend = false, customName = null, regionId = null, legendBoost = 0) {
    const rarity = this.randomRarity(rarityBoost, forceLegend, legendBoost);

    // 根据地区选择物种（使用热更新注册表）
    let species;
    if (regionId) {
      const regionSpecies = getRegionSpecies(regionId);
      if (regionSpecies.length > 0) {
        species = regionSpecies[Math.floor(Math.random() * regionSpecies.length)];
      }
    }
    if (!species) {
      const speciesKeys = Object.keys(SPECIES);
      species = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
    }

    const speciesData = SPECIES[species];
    const element = speciesData.elements[Math.floor(Math.random() * speciesData.elements.length)];
    const base = BASE_STATS[rarity];
    const v = 0.9 + Math.random() * 0.2;

    // 随机性格
    const natureKeys = Object.keys(NATURES);
    const nature = natureKeys[Math.floor(Math.random() * natureKeys.length)];
    const natureData = NATURES[nature];

    // 随机天赋（10%概率）
    let talent = null;
    if (Math.random() < 0.1) {
      const talentKeys = Object.keys(TALENTS);
      talent = talentKeys[Math.floor(Math.random() * talentKeys.length)];
    }

    // 应用性格修正
    let maxHp = Math.floor(base.hp * speciesData.baseMod.hp * v);
    let atk = Math.floor(base.atk * speciesData.baseMod.atk * v);
    let def = Math.floor(base.def * speciesData.baseMod.def * v);
    let spd = Math.floor(base.spd * v);
    let maxEnergy = Math.floor(base.energy * speciesData.baseMod.energy * v);

    // 应用性格修正
    if (natureData.hpMod) maxHp = Math.floor(maxHp * natureData.hpMod);
    if (natureData.atkMod) atk = Math.floor(atk * natureData.atkMod);
    if (natureData.defMod) def = Math.floor(def * natureData.defMod);
    if (natureData.spdMod) spd = Math.floor(spd * natureData.spdMod);

    // 应用天赋修正
    if (talent) {
      const talentData = TALENTS[talent];
      // 适应天赋：全属性+5%
      if (talentData.allMod) {
        maxHp = Math.floor(maxHp * talentData.allMod);
        atk = Math.floor(atk * talentData.allMod);
        def = Math.floor(def * talentData.allMod);
        spd = Math.floor(spd * talentData.allMod);
        maxEnergy = Math.floor(maxEnergy * talentData.allMod);
      }
      if (talentData.hpMod) maxHp = Math.floor(maxHp * talentData.hpMod);
      if (talentData.atkMod) atk = Math.floor(atk * talentData.atkMod);
      if (talentData.defMod) def = Math.floor(def * talentData.defMod);
      if (talentData.spdMod) spd = Math.floor(spd * talentData.spdMod);
      if (talentData.energyMod) maxEnergy = Math.floor(maxEnergy * talentData.energyMod);
    }

    // 基础宠物对象
    const pet = {
      id: DB.genId(),
      name: customName || this.generateName(element),
      species,
      element,
      rarity,
      gender: Math.random() < 0.5 ? '♂' : '♀',
      nature,
      talent,
      affection: 50, // 初始好感度
      level: 1,
      exp: 0,
      maxHp, hp: maxHp,
      atk,
      def,
      spd,
      maxEnergy, energy: maxEnergy,
      sp: 0,
      skills: [INITIAL_SKILLS[element] || '冲撞'],
      evolved: false,
      retired: false,
      battles: 0,
      maxBattles: null,
      canBreed: true,
      parents: null,
    };

    // 根据稀有度添加额外技能
    const skillPool = Object.keys(SKILLS);
    const addRandomSkills = (count) => {
      for (let i = 0; i < count; i++) {
        const newSkill = skillPool[Math.floor(Math.random() * skillPool.length)];
        if (!pet.skills.includes(newSkill) && pet.skills.length < 4) {
          pet.skills.push(newSkill);
        }
      }
    };

    switch (rarity) {
      case '普通':
        addRandomSkills(Math.random() < 0.3 ? 1 : 0); // 30%概率获得1个额外技能
        break;
      case '稀有':
        addRandomSkills(Math.random() < 0.5 ? 1 : 0); // 50%概率获得1个额外技能
        break;
      case '超稀有':
        addRandomSkills(1 + (Math.random() < 0.3 ? 1 : 0)); // 1-2个额外技能
        break;
      case '传说':
        addRandomSkills(2 + (Math.random() < 0.5 ? 1 : 0)); // 2-3个额外技能
        break;
      case '神话':
        addRandomSkills(2 + (Math.random() < 0.5 ? 1 : 0)); // 2-3个额外技能
        // 神话必定获得一个神话技能
        const mythSkills = ['神龙降临', '不死神凤', '九首神威', '泰坦之力', '生命之源', '海神之怒', '神座降临'];
        const mythSkill = mythSkills[Math.floor(Math.random() * mythSkills.length)];
        if (!pet.skills.includes(mythSkill)) pet.skills.push(mythSkill);
        break;
    }

    // 自然变异系统（0.5%概率触发变异）
    if (Math.random() < 0.005) {
      pet.rarity = '异变';
      pet.mutation = true;
      // 随机变异类型
      const mutationTypes = ['属性变异', '技能变异', '元素变异', '双元素变异'];
      const mutationType = mutationTypes[Math.floor(Math.random() * mutationTypes.length)];
      pet.mutationType = mutationType;

      switch (mutationType) {
        case '属性变异':
          // 随机大幅提升或降低某项属性
          const attrBoost = Math.random() < 0.5 ? 1.5 : 0.5;
          const attrs = ['maxHp', 'atk', 'def', 'spd', 'maxEnergy'];
          const attr = attrs[Math.floor(Math.random() * attrs.length)];
          pet[attr] = Math.floor(pet[attr] * attrBoost);
          if (attr === 'maxHp') pet.hp = pet.maxHp;
          if (attr === 'maxEnergy') pet.energy = pet.maxEnergy;
          break;
        case '技能变异':
          // 获得稀有技能
          const rareSkills = ['究极爆破', '灭世龙息', '凤凰涅槃', '九尾魅惑', '白虎之威'];
          const skill = rareSkills[Math.floor(Math.random() * rareSkills.length)];
          if (!pet.skills.includes(skill)) pet.skills.push(skill);
          break;
        case '元素变异':
          // 改变元素属性
          const elements = ['火', '水', '草', '电', '岩石', '超能'];
          pet.element = elements[Math.floor(Math.random() * elements.length)];
          break;
        case '双元素变异':
          // 获得双元素
          pet.element2 = ['火', '水', '草', '电', '岩石', '超能'].filter(e => e !== pet.element)[Math.floor(Math.random() * 5)];
          break;
      }
    }

    return pet;
  },

  power(pet) {
    return Math.floor((pet.atk * 1.5 + pet.def + pet.maxHp * 0.5 + pet.maxEnergy * 0.3) * (1 + pet.level * 0.1));
  },

  bar(current, max, len = 10) {
    const filled = Math.floor((current / max) * len);
    return '█'.repeat(filled) + '░'.repeat(len - filled);
  },

  info(pet, idx = null) {
    const e = ELEMENT_MARK[pet.element] || '';
    const r = RARITY_MARK[pet.rarity] || '';
    const g = pet.gender || '?';
    const n = pet.nature || '浮躁';
    const natureData = NATURES[n] || {};
    const header = idx !== null ? `【${idx + 1}. ${pet.name} ${g}】` : `【${pet.name} ${g}】`;
    const status = pet.retired ? '已退休' : (pet.evolved ? '已进化' : '正常');
    const affection = pet.affection || 50;
    // 好感度进度条：5格，每格20点
    const filled = Math.floor(affection / 20);
    const affectionBar = '▰'.repeat(filled) + '▱'.repeat(5 - filled);

    let text = `${header} ${r}${e}\n` +
      `──────────────\n` +
      `种族: ${pet.species} | 等级: Lv.${pet.level} (${pet.exp}/${pet.level * 100})\n` +
      `状态: ${status} | 潜能: ${this.power(pet)} | 技能点: ${pet.sp}\n` +
      `好感: ${affectionBar} (${affection})\n` +
      `生命: ${this.bar(pet.hp, pet.maxHp)} ${pet.hp}/${pet.maxHp}\n` +
      `精力: ${this.bar(pet.energy, pet.maxEnergy)} ${pet.energy}/${pet.maxEnergy}\n` +
      `──────────────\n` +
      `攻击: ${pet.atk} | 防御: ${pet.def} | 速度: ${pet.spd || 100}\n` +
      `性格: ${n}${natureData.desc ? ` (${natureData.desc})` : ''}`;
    if (pet.talent) {
      const talentData = TALENTS[pet.talent];
      text += `\n天赋: ${pet.talent}${talentData ? ` (${talentData.desc})` : ''}`;
    }
    text += `\n技能: ${pet.skills.join('、')}`;
    if (pet.evolved) text += `\n剩余对战: ${pet.maxBattles - pet.battles}次`;
    if (pet.parents && pet.parents.length === 2) {
      text += `\n父母: ${pet.parents[0].name}(${pet.parents[0].species}) × ${pet.parents[1].name}(${pet.parents[1].species})`;
    }
    return text;
  },

  // 获取可学习的技能列表
  getLearnableSkills(pet) {
    return Object.entries(SKILLS)
      .filter(([name, sk]) => sk.element === pet.element && !pet.skills.includes(name))
      .map(([name]) => name);
  },

  // 学习技能（不检查sp，由调用方负责）
  learnSkill(pet, skillName) {
    if (pet.skills.includes(skillName)) return { success: false, error: '已学会该技能' };
    const sk = SKILLS[skillName];
    if (!sk || sk.element !== pet.element) return { success: false, error: '无法学习该技能' };
    pet.skills.push(skillName);
    return { success: true, skill: skillName };
  },

  // 随机学习一个技能（消耗sp）
  learnRandomSkill(pet) {
    if (pet.skills.length >= CONFIG.maxSkills) return { success: false, error: '技能已满' };
    if (pet.sp < 1) return { success: false, error: '技能点不足' };
    const candidates = this.getLearnableSkills(pet);
    if (candidates.length === 0) return { success: false, error: '没有可学习的技能' };
    const skill = candidates[Math.floor(Math.random() * candidates.length)];
    pet.skills.push(skill);
    pet.sp--;
    return { success: true, skill };
  },

  // 获取最强宠物
  getStrongestPet(petList) {
    if (!petList || !petList.length) return null;
    return petList.reduce((best, pet) => {
      const power = (pet.atk || 0) + (pet.def || 0) + (pet.maxHp || 0);
      const bestPower = (best.atk || 0) + (best.def || 0) + (best.maxHp || 0);
      return power > bestPower ? pet : best;
    }, petList[0]);
  },
};

//   玩家肉身属性 (v3.6.9 削弱)
const PLAYER_BASE = { hp: 35, atk: 18, def: 12, energy: 80, spd: 80 };

// 玩家战斗技能 (v3.6.9 仙侠风)
const PLAYER_SKILLS = ['灵击', '灵刃', '护盾'];

const Battle = {
  applyMythicTurnStart(unit, opponent, logs) {
    if (!unit || unit.rarity !== '神话') return;
    unit.mythicTurnCount = (unit.mythicTurnCount || 0) + 1;

    switch (unit.name) {
      case '烛龙·衔烛': {
        const phase = Math.floor((unit.mythicTurnCount - 1) / 2) % 2 === 0 ? '昼' : '夜';
        unit.dayNightPhase = phase;
        logs.push(`【昼夜轮转】${unit.name} 进入${phase}之相`);
        break;
      }
      case '混沌·帝江': {
        const modes = ['暴烈', '迅捷', '坚守'];
        unit.chaosMode = modes[Math.floor(Math.random() * modes.length)];
        logs.push(`【混沌涌动】${unit.name} 获得${unit.chaosMode}波动`);
        break;
      }
      case '鲲鹏·扶摇': {
        if ((unit.energy || 0) >= 70) {
          unit.kunpengAwakened = true;
          logs.push(`【扶摇九万里】${unit.name} 扶摇而起，速度大增！`);
        } else {
          unit.kunpengAwakened = false;
        }
        break;
      }
    }

    if (unit.name === '建木·通天' && !unit.jianmuCritBroken) {
      unit.jianmuStacks = Math.min(4, (unit.jianmuStacks || 0) + 1);
      logs.push(`【生生不息】${unit.name} 积累生息 ${unit.jianmuStacks} 层`);
    }
    unit.jianmuCritBroken = false;

    if (unit.name === '鲲鹏·扶摇') {
      unit.kunpengConsecutive = unit.kunpengAwakened ? (unit.kunpengConsecutive || 0) + 1 : 0;
    }
  },

  applyMythicPreAttack(attacker, defender, skillName, skillData, logs) {
    if (!attacker || attacker.rarity !== '神话') return { damageMod: 1, speedMod: 1, extraCrit: 0, bonusDamage: 0 };

    let damageMod = 1;
    let speedMod = 1;
    let extraCrit = 0;
    let bonusDamage = 0;

    switch (attacker.name) {
      case '烛龙·衔烛':
        if (attacker.dayNightPhase === '昼') {
          damageMod *= 1.18;
          extraCrit += 0.10;
        } else if (attacker.dayNightPhase === '夜') {
          speedMod *= 0.9;
        }
        break;
      case '混沌·帝江':
        if (attacker.chaosMode === '暴烈') damageMod *= 1.25;
        if (attacker.chaosMode === '迅捷') speedMod *= 1.25;
        break;
      case '雷兽·夔牛':
        if ((attacker.spd || 0) > (defender?.spd || 0)) {
          damageMod *= 1.12;
          defender.thunderMark = 1;
          defender.slowed = Math.max(defender.slowed || 0, 1);
          logs.push(`【惊雷先声】${defender.name} 被感电并减速！`);
        }
        break;
      case '白泽·通灵':
        if ((defender?.poisoned || 0) > 0 || (defender?.confused || 0) > 0 || (defender?.stunned || 0) > 0 || (defender?.frozen || 0) > 0 || (defender?.webbed || 0) > 0 || (defender?.slowed || 0) > 0) {
          attacker.baiZeStacks = Math.min(3, (attacker.baiZeStacks || 0) + 1);
          damageMod *= 1 + attacker.baiZeStacks * 0.06;
          logs.push(`【洞见天机】${attacker.name} 洞悉破绽，伤害提升${attacker.baiZeStacks * 6}%`);
        }
        break;
      case '鲲鹏·扶摇':
        if (attacker.kunpengAwakened) {
          const decay = (attacker.kunpengConsecutive || 0) >= 2 ? 0.7 : 1;
          speedMod *= 1 + 0.2 * decay;
          if ((defender?.hp || 0) > (defender?.maxHp || 1) * 0.5) damageMod *= 1 + 0.18 * decay;
          else extraCrit += 0.15 * decay;
        }
        break;
      case '朱雀·陵光':
        if ((attacker.suzakuNirvana || 0) > 0) {
          damageMod *= 1.2;
          speedMod *= 1.15;
          logs.push(`【焚羽重明】${attacker.name} 处于重明状态，伤害与速度提升！`);
        }
        break;
    }

    return { damageMod, speedMod, extraCrit, bonusDamage };
  },

  applyMythicPostAttack(attacker, defender, damage, logs) {
    if (!attacker || attacker.rarity !== '神话') return;

    switch (attacker.name) {
      case '混沌·帝江':
        if (attacker.chaosMode === '迅捷') {
          attacker.energy = Math.min(attacker.maxEnergy || 100, (attacker.energy || 0) + 15);
          logs.push(`【混沌涌动】${attacker.name} 回复15点精力`);
        }
        break;
      case '白泽·通灵':
        if ((attacker.baiZeStacks || 0) >= 3 && defender) {
          defender.energy = Math.max(0, (defender.energy || 0) - 15);
          attacker.baiZeStacks = 0;
          logs.push(`【洞见天机】${attacker.name} 识破天机，削减${defender.name} 15点精力`);
        }
        break;
      case '鲲鹏·扶摇':
        if (attacker.kunpengAwakened) {
          attacker.energy = Math.max(0, (attacker.energy || 0) - 10);
          attacker.kunpengAwakened = false;
          logs.push(`【扶摇九万里】${attacker.name} 额外消耗10点精力`);
        }
        break;
    }
  },

  applyMythicOnDamage(defender, attacker, damage, logs) {
    if (!defender || defender.rarity !== '神话') return damage;

    let finalDamage = damage;
    switch (defender.name) {
      case '烛龙·衔烛':
        if (defender.dayNightPhase === '夜') finalDamage = Math.floor(finalDamage * 0.82);
        break;
      case '玄武·执明':
        if (damage >= Math.floor((defender.maxHp || 1) * 0.12)) {
          defender.xuanwuStacks = Math.min(3, (defender.xuanwuStacks || 0) + 1);
          logs.push(`【龟蛇镇守】${defender.name} 累积镇守 ${defender.xuanwuStacks} 层`);
        }
        finalDamage = Math.floor(finalDamage * (1 - (defender.xuanwuStacks || 0) * 0.08));
        break;
      case '建木·通天':
        break;
      case '朱雀·陵光':
        if (!defender.suzakuNirvanaUsed && (defender.hp || 0) > 0) {
          const threshold = Math.floor((defender.maxHp || 1) * 0.3);
          const afterHp = Math.max(0, (defender.hp || 0) - finalDamage);
          if (afterHp > 0 && afterHp <= threshold) {
            defender.suzakuNirvanaUsed = true;
            defender.suzakuNirvana = 2;
            const heal = Math.floor((defender.maxHp || 100) * 0.2);
            defender.hp = Math.min(defender.maxHp || 100, afterHp + heal);
            logs.push(`【焚羽重明】${defender.name} 浴火涅槃，恢复${heal}生命并进入重明状态！`);
            return 0;
          }
        }
        break;
    }
    return Math.max(1, finalDamage);
  },

  applyMythicTurnEnd(unit, opponent, logs) {
    if (!unit || unit.rarity !== '神话' || (unit.hp || 0) <= 0) return;

    switch (unit.name) {
      case '烛龙·衔烛':
        if (unit.dayNightPhase === '夜') {
          const heal = Math.floor((unit.maxHp || 100) * 0.03);
          unit.hp = Math.min(unit.maxHp || 100, unit.hp + heal);
          logs.push(`【昼夜轮转】${unit.name} 在夜相中恢复${heal}生命`);
        }
        break;
      case '建木·通天': {
        const heal = Math.floor((unit.maxHp || 100) * (0.025 * (unit.jianmuStacks || 0)));
        unit.hp = Math.min(unit.maxHp || 100, unit.hp + heal);
        unit.energy = Math.min(unit.maxEnergy || 100, (unit.energy || 0) + (unit.jianmuStacks || 0) * 5);
        if ((unit.jianmuStacks || 0) > 0) logs.push(`【生生不息】${unit.name} 恢复${heal}生命并回复${(unit.jianmuStacks || 0) * 5}精力`);
        break;
      }
      case '玄武·执明': {
        const heal = Math.floor((unit.maxHp || 100) * 0.02 * (unit.xuanwuStacks || 0));
        if (heal > 0) {
          unit.hp = Math.min(unit.maxHp || 100, unit.hp + heal);
          logs.push(`【龟蛇镇守】${unit.name} 恢复${heal}生命`);
        }
        break;
      }
      case '朱雀·陵光':
        if ((unit.suzakuNirvana || 0) > 0) {
          unit.suzakuNirvana--;
          if (unit.suzakuNirvana === 0) {
            logs.push(`【焚羽重明】${unit.name} 的重明状态结束了`);
          }
        }
        break;
    }
  },
  calcDmg(atk, def, skill, atkLv, atkEle, defEle, atkSpecies = null, defSpecies = null, playerBuffs = null, attacker = null) {
    const sk = SKILLS[skill] || SKILLS['冲撞'];

    // 新伤害公式：平衡攻击、技能、等级、防御 (v3.6.10 优化)
    // 目标：普通战斗4-6回合，克制战斗2-4回合
    const levelBonus = 1 + Math.min(atkLv * 0.02, 0.8); // 等级加成上限80%
    const effectiveDef = Math.max(0, def); // 防御值下限为0，避免负数导致伤害异常
    const defReduction = 100 / (100 + effectiveDef * 0.5); // 降低防御收益，系数0.8->0.5

    let dmg = (atk * 0.45 + sk.power * 0.55) * levelBonus * defReduction; // ATK权重提高到45%

    // 破甲天赋
    if (attacker?.talent === '破甲') {
      const armorPen = TALENTS['破甲'].armorPen;
      dmg *= (1 + armorPen);
    }

    // 元素克制：提高到1.5倍
    if (atkEle && defEle && ELEMENT_ADV[atkEle] === defEle) {
      dmg *= 1.5;
      if (playerBuffs?.elementBoost) dmg *= (1 + playerBuffs.elementBoost);
    }

    // 被克制：受到额外伤害
    if (atkEle && defEle && ELEMENT_ADV[defEle] === atkEle) {
      dmg *= 0.75; // 被克制时伤害降低25%
    }

    // 食物链克制（捕食者对猎物伤害+20%）
    if (atkSpecies && defSpecies && FOOD_CHAIN[atkSpecies]) {
      if (FOOD_CHAIN[atkSpecies].includes(defSpecies)) {
        dmg *= 1.2;
      }
    }

    // 玩家技能：战斗直觉（暴击率+5%）
    if (playerBuffs?.critBoost && Math.random() < playerBuffs.critBoost) {
      // 暴怒天赋：暴击伤害+50%
      const critMult = attacker?.talent === '暴怒' ? 2.0 : 1.5;
      dmg *= critMult;
    }

    // 幸运天赋：暴击率+5%
    if (attacker?.talent === '幸运' && Math.random() < TALENTS['幸运'].critMod) {
      dmg *= 1.5;
    }

    // 狡猾性格：暴击率+15%
    if (attacker?.nature === '狡猾' && Math.random() < NATURES['狡猾'].critMod) {
      dmg *= 1.5;
    }

    // 坚韧天赋：血量低于30%时攻击+30%
    if (attacker?.talent === '坚韧' && attacker.hp && attacker.maxHp) {
      if (attacker.hp / attacker.maxHp < 0.3) {
        dmg *= 1.3;
      }
    }

    return Math.max(1, Math.floor(dmg));
  },

  attack(a, d, logs, isPlayer = false) {
    try {
      // 闪避天赋：防御方有概率闪避攻击
      if (d.talent === '闪避' && Math.random() < (TALENTS['闪避'].dodgeMod || 0.1)) {
        logs.push(`[闪避天赋] ${d.name} 灵巧闪避了攻击！`);
        return;
      }

      // 鸟类特性：防御方有10%概率闪避攻击
      if (d.species === '鸟' && Math.random() < 0.1) {
        logs.push(`[鸟类特性] ${d.name} 灵巧闪避了攻击！`);
        return;
      }

      // 鹿类特性：防御方有15%概率闪避攻击
      if (d.species === '鹿' && Math.random() < 0.15) {
        logs.push(`[鹿类特性] ${d.name} 灵巧闪避了攻击！`);
        return;
      }

      // 鱼类特性：防御方有5%概率闪避攻击
      if (d.species === '鱼' && Math.random() < 0.05) {
        logs.push(`[鱼类特性] ${d.name} 灵巧闪避了攻击！`);
        return;
      }

      // 幽灵特性：防御方有10%概率闪避攻击
      if (d.species === '幽灵' && Math.random() < 0.1) {
        logs.push(`[幽灵特性] ${d.name} 虚化闪避了攻击！`);
        return;
      }

      const usable = (a.skills || ['冲撞']).filter(s => (SKILLS[s]?.cost || 0) <= (a.energy || 0));
      const skill = usable.length > 0 && Math.random() > 0.3 ? usable[Math.floor(Math.random() * usable.length)] : '冲撞';
      const sk = SKILLS[skill] || SKILLS['冲撞'];
      const mythicPre = this.applyMythicPreAttack(a, d, skill, sk, logs);
      if (Math.random() * 100 > (sk.acc || 95)) {
        logs.push(`${a.name} 使用 ${skill}，但打偏了！`);
        return;
      }

      // 能量涌动：减少精力消耗
      let energyCost = sk.cost || 0;
      if (a.playerBuffs?.energySave) energyCost = Math.floor(energyCost * (1 - a.playerBuffs.energySave));
      // 冷静性格：技能消耗精力-25%
      if (a.nature === '冷静') energyCost = Math.floor(energyCost * (NATURES['冷静'].energyCostMod || 0.75));
      a.energy = Math.max(0, (a.energy || 0) - energyCost);

      // 处理特殊效果
      if (sk.effect === 'defend') {
        // 防御：本回合受到伤害减半
        a.isDefending = true;
        logs.push(`${a.name} 使用 ${skill}，进入防御姿态！`);
        return;
      }

      if (sk.effect === 'heal') {
        // 治愈：恢复生命
        const healRate = sk.healRate || 0.25;
        const healAmount = Math.floor((a.maxHp || 100) * healRate);
        a.hp = Math.min(a.maxHp || 100, (a.hp || 0) + healAmount);
        logs.push(`${a.name} 使用 ${skill}，恢复 ${healAmount} 生命！`);
        return;
      }

      if (sk.effect === 'regen') {
        // 再生：持续恢复生命
        a.regen = 3; // 持续3回合
        a.regenRate = sk.regenRate || 0.1;
        logs.push(`${a.name} 使用 ${skill}，获得生命恢复效果！每回合恢复${Math.floor((a.regenRate || 0.1) * 100)}%生命，持续3回合`);
        return;
      }

      if (sk.effect === 'miracle') {
        // 奇迹：恢复生命+解除所有负面状态
        const healAmount = Math.floor((a.maxHp || 100) * 0.6);
        a.hp = Math.min(a.maxHp || 100, (a.hp || 0) + healAmount);
        // 解除所有负面状态
        a.poisoned = 0;
        a.scorpioPoison = 0;
        a.confused = 0;
        a.stunned = 0;
        a.frozen = 0;
        a.webbed = 0;
        a.slowed = 0;
        logs.push(`${a.name} 使用 ${skill}，奇迹降临！恢复 ${healAmount} 生命，净化所有负面状态！`);
        return;
      }

      if (sk.effect === 'charge') {
        // 蓄力：下回合伤害提升
        a.isCharging = true;
        logs.push(`${a.name} 使用 ${skill}，正在蓄力！`);
        return;
      }

      if (sk.effect === 'berserk') {
        // 狂暴：攻击+30%，防御-20%（持续到战斗结束）
        a.berserkAtk = (a.berserkAtk || 0) + 0.3;
        a.berserkDef = (a.berserkDef || 0) + 0.2;
        logs.push(`${a.name} 使用 ${skill}，进入狂暴状态！攻击+30%，防御-20%`);
        return;
      }

      if (sk.effect === 'shield') {
        // 护盾：获得护盾，抵挡一次致命攻击
        a.shield = (a.shield || 0) + (sk.shieldCount || 1);
        logs.push(`${a.name} 使用 ${skill}，获得护盾！可抵挡${sk.shieldCount || 1}次致命攻击`);
        return;
      }

      // 普通攻击
      let dmg = this.calcDmg(a.atk || 10, d.def || 10, skill, a.level || 1, a.element, d.element, a.species, d.species, a.playerBuffs, a);
      dmg = Math.floor(dmg * (mythicPre.damageMod || 1));

      // 狂暴状态加成
      if (a.berserkAtk) {
        dmg = Math.floor(dmg * (1 + a.berserkAtk));
      }

      // 物种特性动作系统
      if (a.species) {
        switch (a.species) {
          case '猫':
            // 猫科：10%概率闪避攻击并反击
            if (Math.random() < 0.1) {
              dmg = Math.floor(dmg * 1.3);
              logs.push(`[猫科特性] ${a.name} 灵巧反击！伤害+30%`);
            }
            break;
          case '犬':
            // 犬科：血量低于50%时攻击+20%
            if (a.maxHp && a.hp / a.maxHp < 0.5) {
              dmg = Math.floor(dmg * 1.2);
              logs.push(`[犬科特性] ${a.name} 激怒！攻击+20%`);
            }
            break;
          case '龙':
            // 龙族：对所有元素技能伤害+10%
            if (sk.element) {
              dmg = Math.floor(dmg * 1.1);
              logs.push(`[龙族特性] ${a.name} 龙威！元素伤害+10%`);
            }
            break;
          case '蛇':
            // 蛇类：15%概率使敌人中毒
            if (Math.random() < 0.15) {
              d.poisoned = 3; // 中毒3回合
              logs.push(`[蛇类特性] ${a.name} 注入毒液！敌人中毒3回合`);
            }
            break;
          case '鸟':
            // 鸟类：闪避率+10%（在防御方检查时生效）
            // 此处不处理，移到防御方检查
            break;
          case '龟':
            // 龟类：受到伤害减少15%（反弹在防御方触发）
            break;
          case '熊':
            // 熊类：血量低于30%时攻击+40%
            if (a.maxHp && a.hp / a.maxHp < 0.3) {
              dmg = Math.floor(dmg * 1.4);
              logs.push(`[熊类特性] ${a.name} 狂暴！攻击+40%`);
            }
            break;
          case '狐':
            // 狐狸：15%概率使敌人混乱
            if (Math.random() < 0.15) {
              d.confused = 2;
              logs.push(`[狐类特性] ${a.name} 魅惑！敌人混乱2回合`);
            }
            break;
          case '狼':
            // 狼类：对血量低于50%的敌人伤害+25%
            if (d.maxHp && d.hp / d.maxHp < 0.5) {
              dmg = Math.floor(dmg * 1.25);
              logs.push(`[狼类特性] ${a.name} 狩猎本能！伤害+25%`);
            }
            break;
          case '虎':
            // 虎类：15%概率造成1.8倍伤害
            if (Math.random() < 0.15) {
              dmg = Math.floor(dmg * 1.8);
              logs.push(`[虎类特性] ${a.name} 猛虎下山！重创敌人！`);
            }
            break;
          case '狮':
            // 狮类：首击伤害+30%（使用 a._turn 存储回合数）
            if (a._turn === 1) {
              dmg = Math.floor(dmg * 1.3);
              logs.push(`[狮类特性] ${a.name} 狮王威压！首击+30%`);
            }
            break;
          case '鼠':
            // 鼠类：20%概率偷取敌人能量
            if (Math.random() < 0.2 && d.energy) {
              const steal = Math.min(20, d.energy);
              d.energy -= steal;
              a.energy = Math.min(a.maxEnergy, a.energy + steal);
              logs.push(`[鼠类特性] ${a.name} 偷取${steal}能量！`);
            }
            break;
          case '兔':
            // 兔类：每回合有15%概率获得额外行动
            if (Math.random() < 0.15) {
              a.extraAction = true;
              logs.push(`[兔类特性] ${a.name} 疾速！获得额外行动机会`);
            }
            break;
          case '蛙':
            // 蛙类：水属性技能伤害+20%，有20%概率使敌人减速
            if (sk.element === '水') {
              dmg = Math.floor(dmg * 1.2);
              logs.push(`[蛙类特性] ${a.name} 水之亲和！伤害+20%`);
            }
            if (Math.random() < 0.2) {
              d.slowed = 2;
              logs.push(`[蛙类特性] 敌人被减速！`);
            }
            break;
          case '蜂':
            // 蜂类：连续攻击时伤害递增
            if (a.lastAttacked === d.name) {
              a.beeCombo = (a.beeCombo || 0) + 1;
              dmg = Math.floor(dmg * (1 + a.beeCombo * 0.1));
              logs.push(`[蜂类特性] 连击${a.beeCombo}次！伤害+${a.beeCombo * 10}%`);
            }
            break;
          case '蜘蛛':
            // 蜘蛛：10%概率使敌人无法行动1回合
            if (Math.random() < 0.1) {
              d.webbed = 1;
              logs.push(`[蜘蛛特性] ${a.name} 蛛网束缚！敌人无法行动1回合`);
            }
            break;
          case '蝙蝠':
            // 蝙蝠：夜间战斗伤害+20%，吸血效果+30%
            if (sk.effect === 'lifesteal') {
              dmg = Math.floor(dmg * 1.3);
              logs.push(`[蝙蝠特性] ${a.name} 吸血强化！`);
            }
            break;
          case '蝎':
            // 蝎类：攻击附带毒素，每回合造成持续伤害
            if (!d.scorpioPoison) {
              d.scorpioPoison = 3;
              logs.push(`[蝎类特性] ${a.name} 注入蝎毒！持续伤害3回合`);
            }
            break;
          // 新增物种特性
          case '鹤':
            // 鹤类：攻击有15%概率使敌人减速，对水属性伤害+15%
            if (Math.random() < 0.15) {
              d.slowed = 2;
              logs.push(`[鹤类特性] ${a.name} 优雅之舞！敌人减速2回合`);
            }
            if (d.element === '水') dmg = Math.floor(dmg * 1.15);
            break;
          case '蛇颈龙':
            // 蛇颈龙：水属性伤害+20%（防御加成在防御方触发）
            if (sk.element === '水') dmg = Math.floor(dmg * 1.2);
            break;
          case '翼龙':
            // 翼龙：速度+20%，首回合伤害+25%
            if (a._turn === 1) {
              dmg = Math.floor(dmg * 1.25);
              logs.push(`[翼龙特性] ${a.name} 俯冲攻击！首回合伤害+25%`);
            }
            break;
          case '独角兽':
            // 独角兽：攻击有20%概率治愈自己10%生命
            if (Math.random() < 0.2 && a.maxHp) {
              const heal = Math.floor(a.maxHp * 0.1);
              a.hp = Math.min(a.maxHp, a.hp + heal);
              logs.push(`[独角兽特性] ${a.name} 治愈之角！恢复${heal}生命`);
            }
            break;
          case '九头蛇':
            // 九头蛇：每次攻击有20%概率追加一次40%伤害
            if (Math.random() < 0.2) {
              const extraDmg = Math.floor(dmg * 0.4);
              d.hp = Math.max(0, (d.hp || 0) - extraDmg);
              logs.push(`[九头蛇特性] ${a.name} 多头攻击！追加${extraDmg}伤害`);
            }
            break;
          case '凤凰雏':
            // 凤凰雏：火属性伤害+25%（复活在防御方触发）
            if (sk.element === '火') dmg = Math.floor(dmg * 1.25);
            break;
          case '石像鬼':
            // 石像鬼：受到伤害减少10%（减伤和反弹在防御方触发）
            break;
          case '树人':
            // 树人：每回合恢复5%生命，草属性伤害+15%
            if (a.maxHp) {
              const regen = Math.floor(a.maxHp * 0.05);
              a.hp = Math.min(a.maxHp, a.hp + regen);
            }
            if (sk.element === '草') dmg = Math.floor(dmg * 1.15);
            break;
          case '美人鱼':
            // 美人鱼：水属性伤害+20%，攻击有15%概率使敌人混乱
            if (sk.element === '水') dmg = Math.floor(dmg * 1.2);
            if (Math.random() < 0.15) {
              d.confused = 2;
              logs.push(`[美人鱼特性] ${a.name} 魅惑之歌！敌人混乱`);
            }
            break;
          case '天使':
            // 天使：攻击有15%概率造成神圣伤害（无视防御）
            if (Math.random() < 0.15) {
              dmg = Math.floor(dmg * 1.3);
              logs.push(`[天使特性] ${a.name} 神圣审判！伤害+30%`);
            }
            break;
          // 补全其他已有物种特性
          case '豹':
            // 豹类：速度+25%，对血量低于30%的敌人伤害+20%
            if (d.maxHp && d.hp / d.maxHp < 0.3) {
              dmg = Math.floor(dmg * 1.2);
              logs.push(`[豹类特性] ${a.name} 狩猎本能！伤害+20%`);
            }
            break;
          case '牛':
            // 牛类：生命+15%，攻击有10%概率眩晕敌人1回合
            if (Math.random() < 0.1) {
              d.stunned = 1;
              logs.push(`[牛类特性] ${a.name} 蛮力冲撞！敌人眩晕`);
            }
            break;
          case '马':
            // 马类：首回合先手（在ATB系统中实现）
            break;
          case '羊':
            // 羊类：被攻击时有20%概率使攻击者减速
            // (在防御时生效)
            break;
          case '猪':
            // 猪类：生命+20%，攻击有10%概率造成双倍伤害
            if (Math.random() < 0.1) {
              dmg *= 2;
              logs.push(`[猪类特性] ${a.name} 蛮力暴击！双倍伤害`);
            }
            break;
          case '鹰':
            // 鹰类：对飞行/鸟类伤害+30%，暴击率+10%
            if (Math.random() < 0.1) {
              dmg = Math.floor(dmg * 1.5);
              logs.push(`[鹰类特性] ${a.name} 锐利鹰眼！暴击`);
            }
            break;
          case '鹿':
            // 鹿类：闪避率+15%（在防御方检查时生效）
            break;
          case '猿':
            // 猿类：攻击+15%，连续攻击同一目标伤害递增
            if (a.lastTarget === d.name) {
              a.comboCount = (a.comboCount || 0) + 1;
              dmg = Math.floor(dmg * (1 + a.comboCount * 0.1));
              logs.push(`[猿类特性] 连击${a.comboCount}次！`);
            }
            a.lastTarget = d.name;
            break;
          case '螳螂':
            // 螳螂：15%概率造成1.8倍伤害
            if (Math.random() < 0.15) {
              dmg = Math.floor(dmg * 1.8);
              logs.push(`[螳螂特性] ${a.name} 刀刃重击！`);
            }
            break;
          case '哥布林':
            // 哥布林：攻击有15%概率偷取敌人10能量
            if (Math.random() < 0.15 && d.energy) {
              const stolen = Math.min(10, d.energy);
              d.energy -= stolen;
              a.energy = Math.min(a.maxEnergy || 100, (a.energy || 0) + stolen);
              logs.push(`[哥布林特性] ${a.name} 贪婪偷窃！偷取${stolen}能量`);
            }
            break;
          case '蟹':
            // 蟹类：受到伤害减少10%（在防御方触发）
            break;
          case '鱼':
            // 鱼类：水属性伤害+15%，闪避率+5%
            if (sk.element === '水') dmg = Math.floor(dmg * 1.15);
            break;
          // 补全剩余物种特性
          case '史莱姆':
            // 史莱姆：受到伤害减少10%（分裂在防御方触发）
            break;
          case '精灵':
            // 精灵：魔法伤害+20%，每回合恢复3%能量
            if (sk.element && sk.element !== '无') dmg = Math.floor(dmg * 1.2);
            if (a.maxEnergy) a.energy = Math.min(a.maxEnergy, (a.energy || 0) + Math.floor(a.maxEnergy * 0.03));
            break;
          case '元素':
            // 元素：根据属性获得加成，全属性技能伤害+15%
            dmg = Math.floor(dmg * 1.15);
            break;
          case '幽灵':
            // 幽灵：闪避率+10%，攻击有15%概率使敌人混乱
            if (Math.random() < 0.15) {
              d.confused = 2;
              logs.push(`[幽灵特性] ${a.name} 魂魄侵蚀！敌人混乱`);
            }
            break;
          case '恶魔':
            // 恶魔：攻击+15%，但受到神圣伤害+20%
            dmg = Math.floor(dmg * 1.15);
            break;
          case '魅魔':
            // 魅魔：攻击有20%概率使敌人混乱
            if (Math.random() < 0.2) {
              d.confused = 2;
              logs.push(`[魅魔特性] ${a.name} 魅惑之吻！敌人混乱`);
            }
            break;
          case '骷髅':
            // 骷髅：攻击+10%，死亡时有15%概率复活20%生命
            dmg = Math.floor(dmg * 1.1);
            break;
          case '傀儡':
            // 傀儡：防御+15%，受到伤害减少10%
            // 减伤在防御方触发
            break;
        }
      }

      // 记录攻击目标供蜂类/猿类特性使用
      a.lastAttacked = d.name;

      // 蓄力加成
      if (a.isCharging) {
        dmg = Math.floor(dmg * 1.5);
        a.isCharging = false;
      }

      // 狂暴状态防御惩罚：攻击方狂暴时受到更多伤害
      if (a.berserkDef && a.isPlayer) {
        // 狂暴状态的攻击方受到反弹伤害增加
      }

      // 狂暴状态防御惩罚：防御方狂暴时受到更多伤害
      if (d.berserkDef) {
        dmg = Math.floor(dmg * (1 + d.berserkDef));
      }

      // 蛇颈龙特性：生命低于50%时受到伤害减少20%
      if (d.species === '蛇颈龙' && d.maxHp && d.hp / d.maxHp < 0.5) {
        dmg = Math.floor(dmg * 0.8);
        logs.push(`[蛇颈龙特性] ${d.name} 深海守护！伤害-20%`);
      }

      // 蟹类特性：受到伤害减少10%
      if (d.species === '蟹') {
        dmg = Math.floor(dmg * 0.9);
      }

      // 龟类特性：受到伤害减少15%，20%概率反弹10%伤害
      if (d.species === '龟') {
        dmg = Math.floor(dmg * 0.85);
        if (Math.random() < 0.2) {
          const reflect = Math.floor(dmg * 0.1);
          a.hp = Math.max(0, (a.hp || 0) - reflect);
          logs.push(`[龟类特性] ${d.name} 坚壳反弹${reflect}伤害！`);
        }
      }

      // 傀儡特性：受到伤害减少10%
      if (d.species === '傀儡') {
        dmg = Math.floor(dmg * 0.9);
      }

      // 史莱姆特性：受到伤害减少10%
      if (d.species === '史莱姆') {
        dmg = Math.floor(dmg * 0.9);
      }

      // 石像鬼特性：受到伤害减少10%
      if (d.species === '石像鬼') {
        dmg = Math.floor(dmg * 0.9);
      }

      // 史莱姆特性：死亡时有10%概率分裂重生
      if (d.species === '史莱姆' && !d.hasRevived && d.hp <= 0 && Math.random() < 0.1) {
        d.hp = Math.floor((d.maxHp || 100) * 0.3);
        d.hasRevived = true;
        logs.push(`[史莱姆特性] ${d.name} 分裂重生！恢复30%生命`);
      }

      // 骷髅特性：死亡时有15%概率复活20%生命
      if (d.species === '骷髅' && !d.hasRevived && d.hp <= 0 && Math.random() < 0.15) {
        d.hp = Math.floor((d.maxHp || 100) * 0.2);
        d.hasRevived = true;
        logs.push(`[骷髅特性] ${d.name} 死亡复生！恢复20%生命`);
      }

      let mythicDamageBonus = 0;
      if (a.thunderMark) {
        mythicDamageBonus += Math.floor((a.atk || 10) * 0.35);
        logs.push(`【感电】${a.name} 因感电额外承受 ${mythicDamageBonus} 伤害`);
        a.thunderMark = 0;
      }

      // 检查对方是否在防御
      if (d.isDefending) {
        dmg = Math.floor(dmg * 0.5);
        d.isDefending = false;
      }

      dmg = this.applyMythicOnDamage(d, a, dmg, logs);
      d.hp = Math.max(0, (d.hp || 0) - dmg - mythicDamageBonus);
      // 技能效果：攻击后附加状态
      if (sk.effect === 'poison' && Math.random() < (sk.effectChance || 0.3)) {
        d.poisoned = sk.effectDuration || 3;
        logs.push(`[技能效果] ${d.name} 中毒了！持续${sk.effectDuration || 3}回合`);
      }
      if (sk.effect === 'paralyze' && Math.random() < (sk.effectChance || 0.3)) {
        d.stunned = 1;
        logs.push(`[技能效果] ${d.name} 被麻痹了！`);
      }
      if (sk.effect === 'freeze' && Math.random() < (sk.effectChance || 0.2)) {
        d.frozen = sk.effectDuration || 2;
        logs.push(`[技能效果] ${d.name} 被冻结了！持续${sk.effectDuration || 2}回合`);
      }
      if (sk.effect === 'charm' && Math.random() < (sk.effectChance || 0.25)) {
        d.confused = sk.effectDuration || 2;
        logs.push(`[技能效果] ${d.name} 被魅惑了！`);
      }

      // 防御方特性（被攻击时触发）
      // 羊类特性：被攻击时有20%概率使攻击者减速
      if (d.species === '羊' && Math.random() < 0.2) {
        a.slowed = 2;
        logs.push(`[羊类特性] ${d.name} 的反击！攻击者被减速2回合`);
      }

      // 石像鬼特性：被攻击时有15%概率反弹20%伤害
      if (d.species === '石像鬼' && Math.random() < 0.15) {
        const reflect = Math.floor(dmg * 0.2);
        a.hp = Math.max(0, (a.hp || 0) - reflect);
        logs.push(`[石像鬼特性] ${d.name} 石皮反弹${reflect}伤害！`);
      }

      // 凤凰雏特性：死亡时有20%概率复活30%生命
      if (d.species === '凤凰雏' && !d.hasRevived && d.hp <= 0 && Math.random() < 0.2) {
        d.hp = Math.floor((d.maxHp || 100) * 0.3);
        d.hasRevived = true;
        logs.push(`[凤凰雏特性] ${d.name} 涅槃重生！恢复30%生命`);
      }

      // 护盾机制：抵挡致命攻击
      if (d.shield && d.shield > 0 && d.hp <= 0) {
        d.shield--;
        d.hp = Math.floor((d.maxHp || 100) * 0.3);
        logs.push(`【护盾】${d.name} 抵挡了致命一击！护盾剩余 ${d.shield} 次`);
      }

      // 神话护盾机制
      if (d.mythicShield && d.mythicShield > 0 && d.hp <= 0) {
        d.mythicShield--;
        d.hp = Math.floor(d.maxHp * 0.3); // 恢复30%生命
        logs.push(`【神话护盾】${d.name} 抵挡了致命一击！护盾剩余 ${d.mythicShield} 次`);
      }

      // 生命链接：每回合恢复生命
      if (a.playerBuffs?.hpRegen && a.maxHp) {
        const regen = Math.floor(a.maxHp * a.playerBuffs.hpRegen);
        a.hp = Math.min(a.maxHp, a.hp + regen);
        logs.push(`[生命链接] 恢复 ${regen} 生命`);
      }

      // 吸血效果
      if (sk.effect === 'lifesteal') {
        const healAmount = Math.floor(dmg * (sk.lifestealRate || 0.5));
        a.hp = Math.min(a.maxHp || 100, (a.hp || 0) + healAmount);
        logs.push(`${a.name} 吸取了 ${healAmount} 生命！`);
      }

      // 吸血天赋：攻击回复10%伤害值的生命
      if (a.talent === '吸血') {
        const lifestealAmount = Math.floor(dmg * (TALENTS['吸血'].lifesteal || 0.1));
        a.hp = Math.min(a.maxHp || 100, (a.hp || 0) + lifestealAmount);
        logs.push(`[吸血天赋] ${a.name} 回复了 ${lifestealAmount} 生命！`);
      }

      // 显示克制信息
      let advText = '';
      if (a.element && d.element && ELEMENT_ADV[a.element] === d.element) advText += '（元素克制！）';
      if (a.species && d.species && FOOD_CHAIN[a.species]) {
        if (FOOD_CHAIN[a.species].includes(d.species) || FOOD_CHAIN[a.species].includes('几乎所有生物')) {
          advText += '（捕食克制！）';
        }
      }
      logs.push(`${a.name} 使用 ${skill}，造成 ${dmg} 伤害${advText}`);

      // 连击技能：额外攻击次数
      const hits = sk.hits || 1;
      if (hits > 1) {
        for (let i = 1; i < hits; i++) {
          const extraDmg = Math.floor(dmg * (sk.hitDmgRate || 0.5));
          d.hp = Math.max(0, (d.hp || 0) - extraDmg);
          logs.push(`[连击${i + 1}] ${a.name} 追加 ${extraDmg} 伤害！`);
          if (d.hp <= 0) break;
        }
      }
    } catch (e) {
      logs.push(`${a.name} 攻击时发生错误`);
      console.log('[万物有灵] attack错误:', e);
    }
  },

  run(p1, p2, p1Ally = null, p2Ally = null) {
    // p1: 主战斗单位, p2: 敌方, p1Ally: p1的盟友（玩家）, p2Ally: p2的盟友
    const logs = [];
    try {
      let turn = 1;

      // Boss/传说/神话特殊机制
      const isBoss = p2.rarity === '传说' || p2.rarity === '神话' || p2.isBoss;
      const isMyth = p2.rarity === '神话';

      // Boss增益
      if (isBoss) {
        p2.maxHp = Math.floor(p2.maxHp * 1.5);
        p2.hp = p2.maxHp;
        p2.atk = Math.floor(p2.atk * 1.3);
        p2.def = Math.floor(p2.def * 1.2);
        logs.push(`【Boss战】遭遇强力敌人 ${p2.name}！属性大幅提升！`);
      }

      // 神话级特殊机制
      if (isMyth) {
        p2.mythicShield = 3; // 神话护盾：可以抵挡3次致命攻击
        logs.push(`【神话降临】${p2.name} 拥有不死护盾！`);
      }

    // ATB行动条系统
    const ACTION_THRESHOLD = 100;
    const safeSpeed = (v) => {
      v = Number(v);
      return Number.isFinite(v) && v > 0 ? v : 1;
    };
    // 马类首回合先手：初始行动值+50
    let atb1 = p1.species === '马' ? 50 : 0;
    let atb2 = p2.species === '马' ? 50 : 0;
    let atb1Ally = p1Ally?.species === '马' ? 50 : 0;
    let atb2Ally = p2Ally?.species === '马' ? 50 : 0;
    const spd1 = safeSpeed(p1.spd || 100);
    const spd2 = safeSpeed(p2.spd || 100);
    const spd1Ally = p1Ally ? safeSpeed(p1Ally.spd || 100) : 0;
    const spd2Ally = p2Ally ? safeSpeed(p2Ally.spd || 100) : 0;

    const getAllActionOrder = () => {
      // 累积行动值（减速效果减少50%行动值）
      const getSpd = (unit, baseSpd) => {
        const spd = safeSpeed(baseSpd);
        if (unit.slowed && unit.slowed > 0) return Math.max(1, Math.floor(spd * 0.5));
        return spd;
      };
      atb1 += getSpd(p1, spd1);
      atb2 += getSpd(p2, spd2);
      if (p1Ally) atb1Ally += getSpd(p1Ally, spd1Ally);
      if (p2Ally) atb2Ally += getSpd(p2Ally, spd2Ally);

      const actions = [];

      // 收集所有可以行动的单位
      if (atb1 >= ACTION_THRESHOLD && (p1.hp || 0) > 0) {
        actions.push({ unit: p1, atbKey: 'atb1', atbVal: atb1, team: 1 });
      }
      if (atb2 >= ACTION_THRESHOLD && (p2.hp || 0) > 0) {
        actions.push({ unit: p2, atbKey: 'atb2', atbVal: atb2, team: 2 });
      }
      if (p1Ally && atb1Ally >= ACTION_THRESHOLD && (p1Ally.hp || 0) > 0) {
        actions.push({ unit: p1Ally, atbKey: 'atb1Ally', atbVal: atb1Ally, team: 1 });
      }
      if (p2Ally && atb2Ally >= ACTION_THRESHOLD && (p2Ally.hp || 0) > 0) {
        actions.push({ unit: p2Ally, atbKey: 'atb2Ally', atbVal: atb2Ally, team: 2 });
      }

      // 按速度排序（速度快的先行动）
      actions.sort((a, b) => (b.unit.spd || 100) - (a.unit.spd || 100));

      return actions;
    };

    // 判断战斗是否结束
    const isBattleEnd = () => {
      const p1Alive = (p1.hp || 0) > 0;
      const p1AllyAlive = p1Ally ? (p1Ally.hp || 0) > 0 : false;
      const p2Alive = (p2.hp || 0) > 0;
      const p2AllyAlive = p2Ally ? (p2Ally.hp || 0) > 0 : false;

      // team1全灭或team2全灭
      const team1Alive = p1Alive || p1AllyAlive;
      const team2Alive = p2Alive || p2AllyAlive;

      if (!team2Alive) return { ended: true, playerWin: true };
      if (!team1Alive) return { ended: true, playerWin: false };
      return { ended: false };
    };

    let safety = 0;
    while (turn <= 20 && safety++ < 200) {
      const actions = getAllActionOrder();
      if (actions.length === 0) {
        logs.push(`\n--- 第${turn}回合 ---`);
        logs.push('[系统] 本回合无人可行动');
        turn++;
        continue;
      }

      logs.push(`\n--- 第${turn}回合 ---`);

      for (const action of actions) {
        // 检查战斗是否已结束
        const status = isBattleEnd();
        if (status.ended) break;

        const attacker = action.unit;
        // 选择目标：攻击对方队伍中存活的单位
        let defender;
        if (action.team === 1) {
          // team1攻击team2
          defender = (p2.hp || 0) > 0 ? p2 : p2Ally;
        } else {
          // team2攻击team1
          defender = (p1.hp || 0) > 0 ? p1 : p1Ally;
        }

        if (!defender || (defender.hp || 0) <= 0) continue;

        logs.push(`${attacker.name}(${Math.round(action.atbVal)}) 行动`);

        // 设置回合数供物种特性使用
        attacker._turn = turn;
        this.applyMythicTurnStart(attacker, defender, logs);

        // 处理状态效果
        // 眩晕状态：无法行动
        if (attacker.stunned && attacker.stunned > 0) {
          logs.push(`[眩晕] ${attacker.name} 处于眩晕状态，无法行动！`);
          attacker.stunned--;
          continue;
        }

        // 冻结状态：无法行动
        if (attacker.frozen && attacker.frozen > 0) {
          logs.push(`[冻结] ${attacker.name} 被冰冻，无法行动！`);
          attacker.frozen--;
          continue;
        }

        // 束缚状态：无法行动
        if (attacker.webbed && attacker.webbed > 0) {
          logs.push(`[束缚] ${attacker.name} 被蛛网束缚，无法行动！`);
          attacker.webbed--;
          continue;
        }

        // 混乱状态：50%概率攻击自己
        if (attacker.confused && attacker.confused > 0) {
          attacker.confused--;
          if (Math.random() < 0.5) {
            logs.push(`[混乱] ${attacker.name} 陷入混乱，攻击了自己！`);
            const selfDmg = Math.floor((attacker.atk || 10) * 0.5);
            attacker.hp = Math.max(0, attacker.hp - selfDmg);
            continue;
          }
        }

        // 消耗行动值
        if (action.atbKey === 'atb1') atb1 -= ACTION_THRESHOLD;
        else if (action.atbKey === 'atb2') atb2 -= ACTION_THRESHOLD;
        else if (action.atbKey === 'atb1Ally') atb1Ally -= ACTION_THRESHOLD;
        else if (action.atbKey === 'atb2Ally') atb2Ally -= ACTION_THRESHOLD;

        this.attack(attacker, defender, logs, attacker.isPlayer);
        this.applyMythicPostAttack(attacker, defender, 0, logs);

        // 兔类额外行动
        if (attacker.extraAction) {
          logs.push(`[额外行动] ${attacker.name} 再次行动！`);
          attacker.extraAction = false;
          this.attack(attacker, defender, logs, attacker.isPlayer);
        }

        // 减速状态递减
        if (attacker.slowed && attacker.slowed > 0) attacker.slowed--;

        // 检查战斗是否结束
        const afterStatus = isBattleEnd();
        if (afterStatus.ended) break;
      }

      const finalStatus = isBattleEnd();
      if (finalStatus.ended) break;

      // 回合结束时处理持续伤害和恢复
      const processDot = (unit, name) => {
        if (!unit || (unit.hp || 0) <= 0) return;
        // 中毒伤害
        if (unit.poisoned && unit.poisoned > 0) {
          const poisonDmg = Math.floor((unit.maxHp || 100) * 0.05);
          unit.hp = Math.max(0, unit.hp - poisonDmg);
          logs.push(`[中毒] ${name} 受到 ${poisonDmg} 毒素伤害！`);
          unit.poisoned--;
        }
        // 蝎毒伤害
        if (unit.scorpioPoison && unit.scorpioPoison > 0) {
          const scorpioDmg = Math.floor((unit.maxHp || 100) * 0.08);
          unit.hp = Math.max(0, unit.hp - scorpioDmg);
          logs.push(`[蝎毒] ${name} 受到 ${scorpioDmg} 蝎毒伤害！`);
          unit.scorpioPoison--;
        }
        // 再生效果：每回合恢复生命
        if (unit.regen && unit.regen > 0) {
          const regenRate = unit.regenRate || 0.1;
          const regenAmount = Math.floor((unit.maxHp || 100) * regenRate);
          unit.hp = Math.min(unit.maxHp || 100, unit.hp + regenAmount);
          logs.push(`[再生] ${name} 恢复 ${regenAmount} 生命！`);
          unit.regen--;
        }
      };
      processDot(p1, p1.name);
      processDot(p2, p2.name);
      if (p1Ally) processDot(p1Ally, p1Ally.name);
      if (p2Ally) processDot(p2Ally, p2Ally.name);
      this.applyMythicTurnEnd(p1, p2, logs);
      this.applyMythicTurnEnd(p2, p1, logs);
      if (p1Ally) this.applyMythicTurnEnd(p1Ally, p2, logs);
      if (p2Ally) this.applyMythicTurnEnd(p2Ally, p1, logs);

      turn++;
    }

    const status = isBattleEnd();
    const p1Alive = (p1.hp || 0) > 0;
    const p1AllyAlive = p1Ally ? (p1Ally.hp || 0) > 0 : false;
    const p2Alive = (p2.hp || 0) > 0;
    const p2AllyAlive = p2Ally ? (p2Ally.hp || 0) > 0 : false;

    // 所有人都死亡时判定为平局
    const allDead = !p1Alive && !p1AllyAlive && !p2Alive && !p2AllyAlive;

    return {
      winner: allDead ? null : (status.playerWin ? (p1Alive ? p1 : p1Ally) : (p2Alive ? p2 : p2Ally)),
      loser: allDead ? null : (status.playerWin ? (p2Alive ? p2 : p2Ally) : (p1Alive ? p1 : p1Ally)),
      draw: allDead,
      logs,
      player1Fighter: p1Ally,
      player2Fighter: p2Ally,
    };
    } catch (e) {
      logs.push('战斗发生错误');
      console.log('[万物有灵] Battle.run错误:', e);
      return { winner: null, loser: null, draw: true, logs };
    }
  },
};

function pushCompactBattleLogs(logs, fightLogs, maxFightLogs = CONFIG.fightLogLimit) {
  if (!Array.isArray(fightLogs) || fightLogs.length === 0) return;
  if (fightLogs.length <= maxFightLogs) {
    logs.push(...fightLogs);
    return;
  }

  const turnStarts = [];
  fightLogs.forEach((log, i) => {
    if (typeof log === 'string' && log.includes('--- 第') && log.includes('回合 ---')) {
      turnStarts.push(i);
    }
  });

  if (turnStarts.length <= 2) {
    logs.push(...fightLogs.slice(0, 6));
    logs.push('\n...（战斗太激烈，省略部分回合）...\n');
    logs.push(...fightLogs.slice(-6));
    return;
  }

  const headTurnEnd = turnStarts[2];
  const tailTurnStart = turnStarts[turnStarts.length - 2];
  logs.push(...fightLogs.slice(0, headTurnEnd));
  logs.push('\n...（战斗太激烈，省略中间回合）...\n');
  logs.push(...fightLogs.slice(tailTurnStart));
}

//   命令处理
function grantPetExp(pet, exp) {
  pet.exp = (pet.exp || 0) + exp;
  let leveledUp = false;
  while (pet.exp >= pet.level * 100) {
    pet.exp -= pet.level * 100;
    pet.level++;
    pet.maxHp += 5;
    pet.hp = Math.min((pet.hp || 0) + 5, pet.maxHp);
    pet.atk += 2;
    pet.def += 2;
    leveledUp = true;
  }
  return leveledUp;
}

function checkItemConditions(conditions, context) {
  if (!Array.isArray(conditions) || !conditions.length) return { ok: true };
  const { data, petIdx, getPet, uid, itemName } = context;
  for (const condition of conditions) {
    if (!condition || typeof condition !== 'object') continue;
    const value = Math.max(0, Math.floor(Number(condition.value || 0)));
    const count = Math.max(1, Math.floor(Number(condition.count || 1)));
    switch (condition.type) {
      case 'minPlayerLevel':
        if ((data.player?.level || 1) < value) return { ok: false, msg: `玩家等级不足，需要 Lv.${value}` };
        break;
      case 'minPetLevel': {
        const pet = getPet(petIdx);
        if (!pet) return { ok: false, msg: '请指定正确的宠物编号' };
        if ((pet.level || 1) < value) return { ok: false, msg: `宠物等级不足，需要 Lv.${value}` };
        break;
      }
      case 'hasItem':
        if (!condition.item || (data.items[condition.item] || 0) < count) return { ok: false, msg: `缺少道具 ${condition.item || ''} x${count}` };
        break;
      case 'hasFood':
        if (!condition.food || (data.food[condition.food] || 0) < count) return { ok: false, msg: `缺少食物 ${condition.food || ''} x${count}` };
        break;
      case 'minMoney':
        if ((data.money || 0) < value) return { ok: false, msg: `金币不足，需要 ${value}` };
        break;
      case 'guildRole': {
        if (!data.guild) return { ok: false, msg: '你未加入公会' };
        GuildManager.load();
        const guild = GuildManager._guilds[data.guild];
        if (!guild) return { ok: false, msg: '公会不存在' };
        const member = GuildManager.getMember(guild, uid);
        if (!member) return { ok: false, msg: '你不是公会成员' };
        const role = condition.role || 'member';
        if (role === 'leader' && member.role !== 'leader') return { ok: false, msg: '需要会长身份' };
        if (role === 'officer' && member.role !== 'leader' && member.role !== 'officer') return { ok: false, msg: '需要会长或副会长身份' };
        break;
      }
      case 'cooldown': {
        const key = condition.key || itemName || 'default';
        const duration = Math.max(0, Math.floor(Number(condition.duration || 0)));
        if (duration > 0) {
          data.cooldowns = data.cooldowns || {};
          const now = Date.now();
          const lastUse = data.cooldowns[key] || 0;
          if (lastUse && now - lastUse < duration * 1000) {
            const remaining = Math.ceil((duration * 1000 - (now - lastUse)) / 1000);
            return { ok: false, msg: `冷却中，还需 ${remaining} 秒` };
          }
        }
        break;
      }
      case 'custom':
        return { ok: false, msg: `自定义条件 ${condition.handler || 'unknown'} 暂未实现` };
      default:
        return { ok: false, msg: `${condition.type || '未知'} 条件暂未支持` };
    }
  }
  return { ok: true };
}

function executeItemEffect(effect, context) {
  if (!effect || typeof effect !== 'object') return { ok: false, msg: '该道具没有可执行效果' };
  const { data, petIdx, getPet } = context;
  const amount = Math.max(0, Math.floor(Number(effect.amount || 0)));
  const count = Math.max(1, Math.floor(Number(effect.count || 1)));
  switch (effect.action) {
    case 'addExp': {
      const pet = getPet(petIdx);
      if (!pet) return { ok: false, msg: '请指定正确的宠物编号' };
      const exp = amount || 100;
      const leveledUp = grantPetExp(pet, exp);
      return { ok: true, pet, msg: leveledUp ? `${pet.name} 获得 ${exp} 经验并升级到 Lv.${pet.level}！` : `${pet.name} 获得 ${exp} 经验 (${pet.exp}/${pet.level * 100})` };
    }
    case 'healPet': {
      const pet = getPet(petIdx);
      if (!pet) return { ok: false, msg: '请指定正确的宠物编号' };
      const heal = amount || pet.maxHp;
      pet.hp = Math.min(pet.maxHp, Math.max(0, pet.hp || 0) + heal);
      return { ok: true, pet, msg: `${pet.name} 恢复 ${heal} 生命，当前 ${pet.hp}/${pet.maxHp}` };
    }
    case 'restoreEnergy': {
      const pet = getPet(petIdx);
      if (!pet) return { ok: false, msg: '请指定正确的宠物编号' };
      const energy = amount || pet.maxEnergy;
      pet.energy = Math.min(pet.maxEnergy, Math.max(0, pet.energy || 0) + energy);
      return { ok: true, pet, msg: `${pet.name} 恢复 ${energy} 精力，当前 ${pet.energy}/${pet.maxEnergy}` };
    }
    case 'revivePet': {
      const pet = getPet(petIdx);
      if (!pet) return { ok: false, msg: '请指定正确的宠物编号' };
      if (pet.hp > 0) return { ok: false, msg: `${pet.name} 还活着，不需要复活` };
      pet.hp = pet.maxHp;
      pet.energy = pet.maxEnergy;
      return { ok: true, pet, msg: `${pet.name} 已复活！生命和精力已恢复` };
    }
    case 'resetSkills': {
      const pet = getPet(petIdx);
      if (!pet) return { ok: false, msg: '请指定正确的宠物编号' };
      const oldSp = pet.sp || 0;
      pet.sp = oldSp + (pet.skills ? pet.skills.length : 1);
      pet.skills = ['冲撞'];
      return { ok: true, pet, msg: `${pet.name} 的技能已重置，恢复了 ${pet.sp - oldSp} 技能点` };
    }
    case 'addMoney':
      data.money = Math.min(CONFIG.maxMoney, (data.money || 0) + amount);
      return { ok: true, msg: `获得 ${amount} 金币，当前金币 ${data.money}` };
    case 'addFood':
      if (!effect.food || !FOODS[effect.food]) return { ok: false, msg: '食物效果配置无效' };
      data.food[effect.food] = (data.food[effect.food] || 0) + count;
      return { ok: true, msg: `获得 ${effect.food} x${count}` };
    case 'addItem':
      if (!effect.item || !ITEMS[effect.item]) return { ok: false, msg: '道具效果配置无效' };
      data.items[effect.item] = (data.items[effect.item] || 0) + count;
      return { ok: true, msg: `获得 ${effect.item} x${count}` };
    case 'teleport': {
      const townId = effect.town;
      if (!townId || !TOWNS[townId]) return { ok: false, msg: '城镇效果配置无效' };
      data.currentTown = townId;
      data.currentShopNpc = '';
      return { ok: true, msg: `已抵达 ${TOWNS[townId].name}` };
    }
    case 'expandStorage':
      data.maxStorage = (data.maxStorage || 15) + (amount || 5);
      return { ok: true, msg: `仓库容量已扩展！当前容量: ${data.maxStorage}` };
    case 'buff': {
      const key = effect.key || 'default';
      const duration = Math.max(0, Math.floor(Number(effect.duration || 3600)));
      const value = effect.value || {};
      data.buffs = data.buffs || {};
      const now = Date.now();
      data.buffs[key] = {
        ...value,
        expiresAt: now + duration * 1000,
        createdAt: now
      };
      const buffDesc = Object.entries(value).map(([k, v]) => `${k}:${v}`).join(', ') || '无效果';
      return { ok: true, msg: `获得 Buff [${key}]：${buffDesc}，持续 ${duration} 秒` };
    }
    case 'chance': {
      const rate = Math.max(0, Math.min(1, Number(effect.rate || 0.5)));
      const success = Math.random() < rate;
      const effects = success ? effect.success : effect.failure;
      if (!Array.isArray(effects) || !effects.length) {
        return { ok: true, msg: success ? '触发成功，但无后续效果' : '触发失败' };
      }
      const messages = [];
      for (const subEffect of effects) {
        const result = executeItemEffect(subEffect, context);
        if (!result.ok) return result;
        if (result.msg) messages.push(result.msg);
      }
      return { ok: true, msg: messages.join('\n') || (success ? '触发成功' : '触发失败') };
    }
    case 'resource': {
      const resource = effect.resource || 'money';
      const operation = effect.operation || 'add';
      const target = effect.target || 'user';
      const resAmount = amount || 0;
      if (target === 'guild') {
        if (!data.guild) return { ok: false, msg: '你未加入公会' };
        GuildManager.load();
        const guild = GuildManager._guilds[data.guild];
        if (!guild) return { ok: false, msg: '公会不存在' };
        if (resource === 'bank' || resource === '资金') {
          if (operation === 'add') guild.bank = (guild.bank || 0) + resAmount;
          else if (operation === 'subtract') guild.bank = Math.max(0, (guild.bank || 0) - resAmount);
          GuildManager.save();
          return { ok: true, msg: `公会资金${operation === 'add' ? '+' : '-'}${resAmount}，当前 ${guild.bank}` };
        }
        return { ok: false, msg: `公会资源 ${resource} 暂不支持` };
      }
      switch (resource) {
        case 'money':
        case '金币':
          if (operation === 'add') data.money = Math.min(CONFIG.maxMoney, (data.money || 0) + resAmount);
          else if (operation === 'subtract') data.money = Math.max(0, (data.money || 0) - resAmount);
          return { ok: true, msg: `金币${operation === 'add' ? '+' : '-'}${resAmount}，当前 ${data.money}` };
        case 'exp':
        case '经验':
          data.player = data.player || {};
          data.player.totalExp = (data.player.totalExp || 0) + resAmount;
          return { ok: true, msg: `获得经验 +${resAmount}` };
        default:
          return { ok: false, msg: `资源 ${resource} 暂不支持` };
      }
    }
    case 'custom': {
      const handler = effect.handler || 'default';
      const params = effect.params || {};
      WanwuYouling.emit('customItemEffect', { uid, handler, params, effect, data, context });
      return { ok: true, msg: `自定义效果 [${handler}] 已触发，请检查是否有扩展模块处理` };
    }
    default:
      return { ok: false, msg: '未知道具效果' };
  }
}

function applyCustomItemEffect(item, context) {
  const conditionResult = checkItemConditions(item.conditions, context);
  if (!conditionResult.ok) return conditionResult;

  const effects = Array.isArray(item.effects) && item.effects.length ? item.effects : (item.effect ? [item.effect] : []);
  if (!effects.length) return { ok: false, msg: '该道具没有可执行效果' };

  const messages = [];
  let lastPet = null;
  for (const effect of effects) {
    const result = executeItemEffect(effect, context);
    if (!result.ok) return result;
    if (result.msg) messages.push(result.msg);
    if (result.pet) lastPet = result.pet;
  }
  context.useItem();
  context.save();
  WanwuYouling.emit('useItem', { uid: context.uid, item: context.itemName, pet: lastPet, effects });
  return { ok: true, pet: lastPet, msg: messages.join('\n') || '道具已使用' };
}

const cmd = seal.ext.newCmdItemInfo();
cmd.name = '宠物';
cmd.help = `【万物有灵】宠物养成对战系统
.宠物 help 基础 - 基础命令
.宠物 help 战斗 - 战斗相关
.宠物 help 管理 - 宠物管理
.宠物 help 商店 - 商店道具
.宠物 help 世界 - 世界探索
.宠物 help 训练师 - 训练师系统
.宠物 help 进阶 - 进阶功能
.宠物 help 组队 - 组队副本
.宠物 help 世界Boss - 世界Boss
.宠物 help 社交 - 社交系统
.宠物 help 万象篇 - 万象篇扩展
.宠物 help mod - Mod帮助`;
cmd.allowDelegate = true;  // 允许@其他人（用于PVP等命令）

const HELP_PAGES = {
  基础: `【基础命令】
.宠物 - 查看状态
.宠物 列表 - 查看队伍
.宠物 仓库 - 查看仓库
.宠物 信息 <编号> - 宠物详情
.宠物 背包 - 查看背包`,

  战斗: `【战斗命令】
.宠物 捉宠 [编号] [地区] - 捕捉野外宠物
.宠物 对战 <编号> @人 - PVP对战
.宠物 喂食 <编号|全部> <食物> [数量] - 喂食恢复
.宠物 学习 <编号> - 学习技能

【精力自动恢复】
宠物和训练师精力每小时自动恢复10%`,

  管理: `【管理命令】
.宠物 存入 <编号> - 存入仓库
.宠物 取出 <编号> - 取出队伍
.宠物 改名 <编号> <名字> - 改名
.宠物 育种 <编号> <编号> - 育种繁殖(需异性)
.宠物 繁殖 - 查看育种状态/领取幼崽
.宠物 进化 <编号> - 进化升级/预览
.宠物 进化 <编号> <选择> - 分支进化选择
.宠物 出售 <编号> - 卖给保护机构`,

  商店: `【商店命令】
.宠物 商店 - 查看商店
.宠物 购买 <物品> [数量] - 购买
.宠物 道具 - 查看道具
.宠物 使用 <道具> [编号] - 使用道具`,

  世界: `【世界命令】
.宠物 世界 - 查看世界状态
.宠物 探索 <地区> - 探索地区
.宠物 地区 - 查看可探索地区`,

  训练师: `【训练师系统】
.宠物 训练师 - 查看训练师信息
.宠物 装备玩家 [装备名] - 装备训练师装备
.宠物 学习技能 [技能名] - 学习训练师技能书

【训练师属性效果】
力量: 宠物攻击加成
敏捷: 宠物速度加成
智力: 宠物精力加成
体质: 宠物生命加成

【训练师装备/技能书】战斗胜利有几率掉落`,

  进阶: `【进阶命令】
.宠物 装备 - 查看装备背包(战斗掉落)
.宠物 装备 <编号> <宠物编号> - 给宠物穿装备
.宠物 图鉴 - 查看图鉴收集进度
.宠物 排行 - 查看排行榜
.宠物 副本 [副本名] [难度] [宠物编号] - 挑战副本Boss
.宠物 神话 - 查看神话宠物

【副本系统】
迷雾深渊 - 深渊领主 HP:500
熔岩地狱 - 炎魔 HP:1000
冰霜王座 - 冰霜巨龙 HP:2000
虚空裂隙 - 虚空主宰 HP:5000
森林回廊 - 古树守卫 HP:650
沙海遗墓 - 黄沙咒灵 HP:1200
雷鸣穹顶 - 雷霆巨像 HP:2600
星辉神殿 - 星辉圣兽 HP:6200

【副本难度】
普通 / 困难 / 噩梦`,

  进化: `【进化系统】
.宠物 进化 <编号> - 查看进化预览/进化
.宠物 进化 <编号> <选择> - 分支进化选择

【进化阶数】
1阶(初级) → 中阶(1.5) → 2阶(高级) → 3阶(终极)

【分支进化】
同一物种根据条件进化成不同形态
- 属性条件: 火/水/电等属性
- 好感度条件: 好感度达到要求

【进化条件】
- 等级要求
- 特定道具(进化石/高级进化石等)
- 特殊条件(属性/好感度)

【进化道具获取】
进化石: 副本掉落、商店购买
高级进化石: 高级副本掉落
特殊道具: 世界Boss、活动奖励`,

  组队: `【组队系统】
.宠物 组队 - 查看队伍状态/招募列表
.宠物 组队 创建 <副本名/世界Boss> [难度] - 创建队伍
.宠物 组队 加入 @队长 - 加入队伍
.宠物 组队 设宠 <编号> - 设置出战宠物
.宠物 组队 开始 - 开始战斗(队长)
.宠物 组队 退出 - 退出队伍

【组队规则】
最多4人组队
队伍成员共享奖励
队长负责开始战斗
未设置宠物默认使用最强宠物

【可挑战目标】
迷雾深渊/熔岩地狱/冰霜王座/虚空裂隙
森林回廊/沙海遗墓/雷鸣穹顶/星辉神殿
世界Boss(需Boss存在时)
难度支持: 普通 / 困难 / 噩梦`,

  世界Boss: `【世界Boss系统】
.宠物 世界Boss - 查看Boss状态
.宠物 世界Boss 攻击 <宠物编号> - 攻击Boss
.宠物 世界Boss 排行 - 查看伤害排行

【世界Boss刷新规则】
刷新时间: 每天 12:00、18:00、22:00
刷新条件: 有玩家达到30级（训练师或宠物）
刷新概率: 20%（大部分时候不会出现）

【世界Boss】
世界之树·尤格德拉 HP:50000
混沌巨兽·利维坦 HP:80000
灭世魔龙·尼德霍格 HP:100000

全服玩家共同挑战，击杀者获得丰厚奖励！`,

  万象篇: `【万象篇扩展】(需安装万象篇Mod)

【市场交易】
.宠物 市场 - 查看在售宠物
.宠物 挂售 <编号> <价格> - 挂售宠物
.宠物 购买宠物 <编号> - 购买宠物
.宠物 机构 - 生灵保护机构
.宠物 领养 <编号> - 领养被出售的宠物

【宠物装备】(商店购买)
.宠物 宠物装备商店 - 查看装备商店
.宠物 购买宠物装备 <名称> - 购买装备
.宠物 宠物装备背包 - 查看已有装备
.宠物 穿戴装备 <宠物编号> <装备名> - 穿戴

【宠物技能书】(探险/打工获得)
.宠物 宠物技能书 - 查看技能书
.宠物 宠物学习技能 <宠物编号> <技能书名> - 学习

【派遣任务】
.宠物 探险 <宠物编号> <区域> - 派宠物探险
.宠物 探险状态 - 查看探险进度
.宠物 打工 <宠物编号> <类型> - 派宠物打工
.宠物 打工状态 - 查看打工进度

【数据统计】
.宠物 竞技场 - 查看竞技场积分
.宠物 成就 - 查看已解锁成就
.宠物 成就列表 - 查看全部成就
.宠物 捕捉统计 - 查看捕捉记录
.宠物 季节 - 查看当前季节`,

  社交: `【社交命令】
.宠物 城镇 - 进入城镇
.宠物 NPC - 与NPC交互
.宠物 任务 - 查看任务列表
.宠物 公会 - 公会系统`,

  mod: `【Mod命令】
.宠物 mod - 查看已安装Mod
.宠物 mod <名称> - 查看Mod详情
.宠物 mod 列表 - 查看WebUI可用Mod
.宠物 mod 安装 <名称> - 从WebUI安装Mod
.宠物 mod 卸载 <名称> - 卸载Mod`,

  webui: `【WebUI命令】
.宠物 webui - 查看WebUI状态
.宠物 webui 验证 <验证码> - 完成WebUI注册验证
.宠物 webui 公告 - 查看公告（普通用户可用）
.宠物 webui 配置 <端点> <Token> - 配置WebUI（骰主）
.宠物 webui 启用 - 启用WebUI上报（骰主）
.宠物 webui 禁用 - 禁用WebUI上报（骰主）
.宠物 webui 同步 - 立即同步数据（骰主）
.宠物 webui 补丁 - 拉取并应用补丁（骰主）
.宠物 webui 补偿 - 立即拉取并发放补偿（骰主）
.宠物 webui 远程管理 启用/禁用 - 控制 WebUI 管理指令自动执行（骰主）`,
};

cmd.solve = async (ctx, msg, argv) => {
  const uid = msg.sender.userId;
  const data = DB.get(uid);

  // 存储用户昵称到全局映射（用于PVP显示）
  const myName = (ctx.player && ctx.player.name) || (msg.sender && msg.sender.nickname);
  if (myName) {
    DB.setName(uid, myName);
  }

  // 清除代骰提示（PVP等命令不需要显示"由xxx代骰"）
  if (ctx.delegateText !== undefined) {
    ctx.delegateText = '';
  }

  // 检查是否是别名命令（如 .宠物对战 而不是 .宠物 对战）
  const commandName = argv.command || '';
  let rawArgs = argv.rawArgs || '';
  let actionFromCmd = '';

  // 如果命令是 "宠物xxx" 格式，提取 xxx 作为 action
  if (commandName.startsWith('宠物') && commandName !== '宠物') {
    actionFromCmd = commandName.substring(2); // 提取 "对战"、"捉宠" 等
  }

  const args = rawArgs.trim().split(/\s+/).filter(x => x);
  const action = actionFromCmd || args[0] || '';
  const actionArgs = actionFromCmd ? args : args.slice(1);
  const p1 = actionArgs[0] || '';
  const p2 = actionFromCmd ? actionArgs.slice(1).join(' ') : actionArgs.slice(1).join(' ') || '';
  const p3 = actionArgs[2] || '';

  // 从 argv.atInfo 获取@用户（SealDice已解析好）
  const atInfo = argv.atInfo || argv.at || [];
  let atUserId = atInfo.length > 0 ? atInfo[0].userId : null;

  // 如果没有 atInfo，尝试从原始消息或参数解析
  if (!atUserId) {
    // 尝试从整个原始参数中匹配
    const fullText = rawArgs || '';
    // 尝试匹配 [CQ:at,qq=123456] 格式
    const cqMatch = fullText.match(/\[CQ:at,qq=(\d+)\]/);
    if (cqMatch) {
      atUserId = 'QQ:' + cqMatch[1];
    }
    // 尝试匹配纯数字QQ号（5位以上）
    if (!atUserId) {
      const numMatch = fullText.match(/\b(\d{5,})\b/);
      if (numMatch) {
        atUserId = 'QQ:' + numMatch[1];
      }
    }
  }

  console.log('[万物有灵] 命令解析:', JSON.stringify({ action, p1, p2, commandName }), 'atUserId:', atUserId, 'atInfo:', JSON.stringify(atInfo));

  // 触发命令事件，用于通知系统
  WanwuYouling.emit('command', { uid, ctx, msg, action });

  const reply = (text) => seal.replyToSender(ctx, msg, text);
  const save = () => { try { DB.save(uid, data); } catch (e) { console.log('[万物有灵] 保存失败:', e); } };
  const applyBattleInjuryCap = (pet, battleHp) => {
    if (!pet) return;
    const maxLoss = Math.max(1, Math.floor((pet.maxHp || 0) * 0.1));
    const minHpAfterBattle = Math.max(0, (pet.maxHp || 0) - maxLoss);
    pet.hp = Math.max(minHpAfterBattle, Math.max(0, battleHp));
  };

  // 获取宠物：1-3号队伍，4-18号仓库
  const getPet = (idx) => {
    const num = parseInt(idx);
    if (isNaN(num) || num < 1) return null;
    if (num <= 3) {
      // 队伍宠物
      if (num > data.pets.length) return null;
      return data.pets[num - 1];
    } else {
      // 仓库宠物
      const storageIdx = num - 4;
      const storage = data.storage || [];
      if (storageIdx < 0 || storageIdx >= storage.length) return null;
      return storage[storageIdx];
    }
  };

  // 获取宠物并返回位置信息
  const getPetWithLocation = (idx) => {
    const num = parseInt(idx);
    if (isNaN(num) || num < 1) return null;
    if (num <= 3) {
      if (num > data.pets.length) return null;
      return { pet: data.pets[num - 1], isTeam: true, idx: num - 1 };
    } else {
      const storageIdx = num - 4;
      const storage = data.storage || [];
      if (storageIdx < 0 || storageIdx >= storage.length) return null;
      return { pet: storage[storageIdx], isTeam: false, idx: storageIdx };
    }
  };

  // 移除宠物（根据编号自动判断队伍/仓库）
  const removePet = (idx) => {
    const num = parseInt(idx);
    if (isNaN(num) || num < 1) return null;
    if (num <= 3) {
      if (num > data.pets.length) return null;
      return data.pets.splice(num - 1, 1)[0];
    } else {
      const storageIdx = num - 4;
      const storage = data.storage || [];
      if (storageIdx < 0 || storageIdx >= storage.length) return null;
      return storage.splice(storageIdx, 1)[0];
    }
  };

  if (action === 'help') {
    const page = p1 || '';
    if (page) {
      // 先检查内置帮助
      if (HELP_PAGES[page]) {
        let help = HELP_PAGES[page];
        const extHelp = WanwuYouling.getExtHelp(page);
        if (extHelp) help += '\n' + extHelp;
        reply(help);
      } else {
        // 检查是否有Mod注册了这个分类
        const extHelp = WanwuYouling.getExtHelp(page);
        if (extHelp) {
          reply(`【${page}】\n${extHelp}`);
        } else {
          reply(`未找到帮助页面: ${page}\n使用 .宠物 help 查看所有帮助分类`);
        }
      }
    } else {
      // 显示主帮助和Mod分类
      let help = cmd.help;
      const categories = WanwuYouling.getExtCategories();
      if (categories.length > 0) {
        help += '\n\n【Mod扩展分类】';
        categories.forEach(cat => {
          // 过滤掉已在HELP_PAGES中的分类
          if (!HELP_PAGES[cat]) {
            help += `\n.宠物 help ${cat} - ${cat}相关`;
          }
        });
      }
      reply(help);
    }
    return seal.ext.newCmdExecuteResult(true);
  }

  if (action === '捉宠' || action === '斗殴') {
    // 新手福利：第一次捉宠送一只普通宠物
    if ((!data.pets || data.pets.length === 0) && !data.firstPetClaimed) {
      data.firstPetClaimed = true;
      // 随机选择种族和元素
      const speciesKeys = Object.keys(SPECIES);
      const species = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
      const speciesData = SPECIES[species];
      const element = speciesData.elements[Math.floor(Math.random() * speciesData.elements.length)];
      // 使用游戏内名字生成风格
      const name = PetFactory.generateName(element);
      // 基础属性（普通品质）
      const base = BASE_STATS['普通'];
      const v = 0.9 + Math.random() * 0.2;
      const newPet = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name,
        species: species,
        element: element,
        rarity: '普通',
        gender: Math.random() < 0.5 ? '♂' : '♀',
        nature: Object.keys(NATURES)[Math.floor(Math.random() * Object.keys(NATURES).length)],
        level: 1,
        exp: 0,
        hp: Math.floor(base.hp * speciesData.baseMod.hp * v),
        maxHp: Math.floor(base.hp * speciesData.baseMod.hp * v),
        atk: Math.floor(base.atk * speciesData.baseMod.atk * v),
        def: Math.floor(base.def * speciesData.baseMod.def * v),
        spd: Math.floor(base.spd * v),
        energy: Math.floor(base.energy * speciesData.baseMod.energy * v),
        maxEnergy: Math.floor(base.energy * speciesData.baseMod.energy * v),
        sp: 0,
        affection: 50,
        skills: [],
        items: [],
        evolved: false,
        retired: false,
      };
      data.pets = [newPet];
      save();
      reply(`【新手礼物】\n你获得了一只${name}！\n[普通]${name} ${element}属性\n\n现在你可以开始冒险了！\n.宠物 查看你的宠物`);
      return seal.ext.newCmdExecuteResult(true);
    }
    
    // 解析参数：可能是 [宠物编号] [地区] 或 [地区]
    let regionId = null;
    let petIdx = null;

    // 检查p1是否是地区名
    if (p1 && REGIONS[p1]) {
      regionId = p1;
    } else if (p1 && !isNaN(parseInt(p1))) {
      petIdx = p1;
      if (p2 && REGIONS[p2]) regionId = p2;
    } else if (p1) {
      // 可能是地区名的模糊匹配
      const matchedRegion = Object.keys(REGIONS).find(r => r.includes(p1) || p1.includes(r));
      if (matchedRegion) regionId = matchedRegion;
    }

    // 检查是否有捉宠符咒
    const hasCharm = data.items['捉宠符咒'] > 0;

    // 检查幸运道具
    let rarityBoost = 0; // 稀有度提升档数
    let forceLegend = false; // 强制传说

    if (data.items['传说之证'] > 0) {
      forceLegend = true;
      data.items['传说之证']--;
      if (data.items['传说之证'] <= 0) delete data.items['传说之证'];
    } else if (data.items['幸运符'] > 0) {
      rarityBoost = 1;
      data.items['幸运符']--;
      if (data.items['幸运符'] <= 0) delete data.items['幸运符'];
    }

    // 获取天气效果
    const weather = WorldManager.getWeather(regionId);
    const weatherData = WEATHERS[weather] || { battleMod: {} };
    const timeOfDay = WorldManager.getTimeOfDay();

    // 检查孤品宠物出现条件
    let legendaryPet = null;
    const playerMaxLevel = data.pets.length > 0 ? Math.max(...data.pets.map(p => p.level || 1)) : 0;

    for (const [name, legend] of Object.entries(LEGENDARY_PETS)) {
      if (!LegendaryManager.canSpawn(name)) continue; // 已被捕获

      const cond = legend.spawnCondition;
      const regionMatch = !regionId || REGIONS[regionId]?.name?.includes(cond.region) || cond.region === regionId;
      const weatherMatch = weather === cond.weather;
      const timeMatch = timeOfDay === cond.time;
      const levelMatch = playerMaxLevel >= cond.playerLevel;

      // 所有条件满足时，有极小概率出现孤品宠物
      if (regionMatch && weatherMatch && timeMatch && levelMatch) {
        // 基础出现概率 0.5%，可被道具提升
        const spawnChance = 0.005 + (data.items['神话召唤石'] || 0) * 0.01;
        if (Math.random() < spawnChance) {
          legendaryPet = { ...legend, name };
          break;
        }
      }
    }

    let wildPet;
    if (legendaryPet) {
      // 生成孤品宠物
      wildPet = {
        id: DB.genId(),
        name: legendaryPet.name,
        species: legendaryPet.name.split('·')[0],
        element: legendaryPet.element,
        rarity: '神话',
        level: Math.max(50, playerMaxLevel + 10),
        maxHp: legendaryPet.baseStats.hp,
        hp: legendaryPet.baseStats.hp,
        atk: legendaryPet.baseStats.atk,
        def: legendaryPet.baseStats.def,
        maxEnergy: legendaryPet.baseStats.energy,
        energy: legendaryPet.baseStats.energy,
        spd: legendaryPet.baseStats.spd,
        skills: legendaryPet.skills,
        passive: legendaryPet.passive,
        exp: 0,
        nature: '神话',
        talent: '神之眷顾',
        affection: 100,
        isLegendary: true,
        legendaryId: legendaryPet.id,
        catchRate: legendaryPet.catchRate,
        reward: legendaryPet.reward,
      };
    } else {
      // 传说驯兽师：传说宠物出现率+50%
      const legendBoost = data.player.skills?.includes('传说驯兽师') ? 0.5 : 0;
      wildPet = PetFactory.create(rarityBoost, forceLegend, null, regionId, legendBoost);
    }

    // 野生宠物等级：基于玩家最高等级宠物，或随机1-5级
    if (!wildPet.isLegendary) {
      const minLevel = Math.max(1, playerMaxLevel - 2);
      const maxLevel = Math.max(5, playerMaxLevel + 2);
      wildPet.level = Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel;
      // 根据等级提升属性 (v4.3.8: 分段成长曲线)
      for (let i = 1; i < wildPet.level; i++) {
        if (i < 5) {
          // 1-5级：正常成长（新手友好）
          wildPet.maxHp += 8;
          wildPet.atk += 3;
          wildPet.def += 3;
        } else if (i < 30) {
          // 6-30级：中等成长
          wildPet.maxHp += 14;
          wildPet.atk += 6;
          wildPet.def += 4;
        } else {
          // 31级以上：高难度成长
          wildPet.maxHp += 22;
          wildPet.atk += 10;
          wildPet.def += 7;
        }
        wildPet.hp = wildPet.maxHp;
      }
    }
    wildPet.exp = 0;

    let fighter;
    let playerFighter = null;  // 玩家战斗单位
    let fighterInfo;
    let isPlayerFight = true;

    // 计算玩家战斗属性
    const player = data.player;
    const equipBonus = { str: 0, agi: 0, int: 0, vit: 0 };
    for (const slot of Object.values(player.equipment || {})) {
      if (slot) {
        for (const attr of ['str', 'agi', 'int', 'vit']) {
          if (slot[attr]) equipBonus[attr] += slot[attr];
        }
      }
    }
    const totalStr = player.str + equipBonus.str;
    const totalAgi = player.agi + equipBonus.agi;
    const totalInt = player.int + equipBonus.int;
    const totalVit = player.vit + equipBonus.vit;

    // 玩家战斗属性（基于训练师属性 + 等级成长）(v3.6.10 削弱向)
    const pLevel = player.level || 1;
    const playerCombatAttrs = {
      hp: PLAYER_BASE.hp + totalVit * 3 + (pLevel - 1) * 9,
      atk: PLAYER_BASE.atk + totalStr * 1 + (pLevel - 1) * 3.5,
      def: PLAYER_BASE.def + totalVit * 0.5 + (pLevel - 1) * 2,
      spd: PLAYER_BASE.spd + totalAgi * 0.5 + (pLevel - 1) * 1,
      energy: player.energy || 100,
    };

    // 应用玩家技能被动效果
    const playerSkills = player.skills || [];
    const playerBuffs = {};
    if (playerSkills.includes('战斗直觉')) playerBuffs.critBoost = 0.05;
    if (playerSkills.includes('元素亲和')) playerBuffs.elementBoost = 0.1;
    if (playerSkills.includes('生命链接')) playerBuffs.hpRegen = 0.02;
    if (playerSkills.includes('能量涌动')) playerBuffs.energySave = 0.1;

    // 判断出战方式
    if (petIdx && petIdx !== '肉身') {
      // 指定宠物出战 - 双人战斗模式
      const pet = getPet(petIdx);
      if (!pet) return reply('请指定正确的宠物编号');
      if (pet.hp <= 0) return reply('宠物生命值不足，请先喂食恢复');
      if (pet.energy < 20) return reply('宠物精力不足，请稍后再试(精力每小时自动恢复10%)');

      // 宠物战斗单位 (v3.6.10 添加训练师属性加成)
      fighter = JSON.parse(JSON.stringify(pet));
      fighter.playerBuffs = playerBuffs;
      fighter.maxHp = fighter.maxHp || fighter.hp;
      fighter.maxEnergy = fighter.maxEnergy || fighter.energy;

      // 应用训练师属性加成
      const strBonus = 1 + Math.max(0, totalStr - 10) * 0.005;
      const agiBonus = 1 + Math.max(0, totalAgi - 10) * 0.005;
      const intBonus = 1 + Math.max(0, totalInt - 10) * 0.005;
      const vitBonus = 1 + Math.max(0, totalVit - 10) * 0.005;
      fighter.atk = Math.floor(fighter.atk * strBonus);
      fighter.spd = Math.floor(fighter.spd * agiBonus);
      fighter.maxEnergy = Math.floor(fighter.maxEnergy * intBonus);
      fighter.maxHp = Math.floor(fighter.maxHp * vitBonus);
      fighter.hp = fighter.maxHp;

      // 玩家战斗单位
      playerFighter = {
        name: myName || '你',
        hp: playerCombatAttrs.hp,
        maxHp: playerCombatAttrs.hp,
        atk: playerCombatAttrs.atk,
        def: playerCombatAttrs.def,
        spd: playerCombatAttrs.spd,
        energy: playerCombatAttrs.energy,
        maxEnergy: playerCombatAttrs.energy,
        skills: PLAYER_SKILLS,
        element: null,
        level: player.level,
        isPlayer: true,
        playerBuffs: playerBuffs,
      };

      fighterInfo = `【双人出战】${pet.name} + ${myName || '你'}`;
      isPlayerFight = false;
    } else if (data.pets.length > 0 && (!petIdx || petIdx === '肉身')) {
      // 有宠物但选择肉身，提示可选
      fighterInfo = `【肉身出战】(你有${data.pets.length}只宠物，可指定编号让宠物出战)`;
      fighter = {
        name: myName || '你',
        hp: playerCombatAttrs.hp,
        maxHp: playerCombatAttrs.hp,
        atk: playerCombatAttrs.atk,
        def: playerCombatAttrs.def,
        spd: playerCombatAttrs.spd,
        energy: playerCombatAttrs.energy,
        maxEnergy: playerCombatAttrs.energy,
        skills: PLAYER_SKILLS,
        element: null,
        level: player.level,
        isPlayer: true,
        playerBuffs: playerBuffs,
      };
    } else {
      // 没有宠物，肉身出战
      fighterInfo = `【肉身出战】`;
      fighter = {
        name: myName || '你',
        hp: playerCombatAttrs.hp,
        maxHp: playerCombatAttrs.hp,
        atk: playerCombatAttrs.atk,
        def: playerCombatAttrs.def,
        spd: playerCombatAttrs.spd,
        energy: playerCombatAttrs.energy,
        maxEnergy: playerCombatAttrs.energy,
        skills: PLAYER_SKILLS,
        element: null,
        level: player.level,
        isPlayer: true,
        playerBuffs: playerBuffs,
      };
    }

    // 触发随机事件
    let eventResult = null;
    if (regionId) {
      eventResult = EventManager.triggerExploreEvent(regionId, isPlayerFight ? null : fighter);
    }
    // 触发天气事件
    const weatherEvent = EventManager.triggerWeatherEvent(weather, isPlayerFight ? null : fighter);
    if (weatherEvent) eventResult = weatherEvent;

    try {
      let captureSuccess = false;  // 在 try 块开头声明

      // 如果事件有特殊效果，处理它们
      if (eventResult) {
        if (eventResult.specialEffect === 'ambush') {
          // 被偷袭，敌人先手
          wildPet.ambush = true;
        }
        if (eventResult.specialEffect === 'rarityBoost') {
          // 稀有宠物出现
          const rarityOrder = ['普通', '稀有', '超稀有', '传说', '神话'];
          const idx = rarityOrder.indexOf(wildPet.rarity);
          if (idx < rarityOrder.length - 1) {
            wildPet.rarity = rarityOrder[idx + 1];
          }
        }
        if (eventResult.specialEffect === 'lost') {
          // 迷路，战斗后额外消耗精力
          fighter.energy = Math.max(0, (fighter.energy || 0) - 10);
        }
        // 应用事件奖励
        if (eventResult.money) data.money += eventResult.money;
        if (eventResult.item) data.items[eventResult.item] = (data.items[eventResult.item] || 0) + 1;
        if (eventResult.food) data.food[eventResult.food] = (data.food[eventResult.food] || 0) + 1;
        if (eventResult.hp && !isPlayerFight) fighter.hp = Math.min(fighter.maxHp, fighter.hp + eventResult.hp);
        if (eventResult.hpFull && !isPlayerFight) fighter.hp = fighter.maxHp;
        if (eventResult.energy && !isPlayerFight) fighter.energy = Math.min(fighter.maxEnergy, fighter.energy + eventResult.energy);
        if (eventResult.energyFull && !isPlayerFight) fighter.energy = fighter.maxEnergy;
        if (eventResult.damage && !isPlayerFight) fighter.hp = Math.max(0, fighter.hp - eventResult.damage);
        // 应用好感度奖励
        if (eventResult.affection && !isPlayerFight) {
          fighter.affection = Math.min(100, (fighter.affection || 50) + eventResult.affection);
        }
      }

      const result = Battle.run(fighter, wildPet, playerFighter);
      // 添加地区和天气信息
      const regionInfo = regionId ? ` [${REGIONS[regionId].name}]` : '';
      const weatherInfo = ` 天气:${weather}`;
      const logs = [fighterInfo, ''];

      // 显示随机事件
      if (eventResult) {
        logs.push(EventManager.formatEventResult(eventResult), '');
      }

      logs.push(`遭遇 ${RARITY_MARK[wildPet.rarity]}${ELEMENT_MARK[wildPet.element]} ${wildPet.name}(${wildPet.species}) Lv.${wildPet.level}${regionInfo}${weatherInfo}`);

      const maxFightLogs = CONFIG.fightLogLimit - 3;
      pushCompactBattleLogs(logs, result.logs, maxFightLogs);

      if (result.draw) {
        logs.push(`\n[平局] ${fighter.name}和 ${wildPet.name} 同归于尽，它逃跑了...`);
        if (!isPlayerFight) {
          const pet = getPet(p1);
          applyBattleInjuryCap(pet, fighter.hp);
          pet.energy = Math.max(0, pet.energy - 15);
          save();
        }
      } else if (result.winner === fighter) {
        logs.push(`\n[胜利] ${fighter.name}战胜了 ${wildPet.name}！`);

        // 计算经验和金币奖励
        let expGain = 20 + Math.floor(Math.random() * 20) + wildPet.level * 5;
        let goldGain = 10 + Math.floor(Math.random() * 20) + wildPet.level * 3;

        // 机智性格：战斗金币+35%
        const battlePet = getPet(petIdx);
        if (battlePet && battlePet.nature === '机智') {
          goldGain = Math.floor(goldGain * (NATURES['机智'].goldMod || 1.35));
        }

        // 统一处理经验和金币奖励
        data.money = (data.money || 0) + goldGain;
        
        // 给出战宠物加经验
        if (!isPlayerFight && petIdx && petIdx !== '肉身') {
          const pet = getPet(petIdx);
          if (pet) {
            let finalExp = expGain;
            if (data.player.skills?.includes('驯兽术')) finalExp = Math.floor(finalExp * 1.1);
            // 认真性格：经验获取+30%
            if (pet.nature === '认真') {
              finalExp = Math.floor(finalExp * (NATURES['认真'].expMod || 1.30));
            }
            // 猎人天赋：战斗经验+40%
            if (pet.talent === '猎人') {
              finalExp = Math.floor(finalExp * (TALENTS['猎人'].expMod || 1.40));
            }
            pet.exp = (pet.exp || 0) + finalExp;
            // 战斗胜利增加好感度
            const natureData = NATURES[pet.nature] || {};
            const affectionGain = Math.floor((2 + Math.floor(Math.random() * 4)) * (natureData.affectionMod || 1));
            pet.affection = Math.min(100, (pet.affection || 50) + affectionGain);
            const expNeed = pet.level * 100;
            if (pet.exp >= expNeed) {
              pet.exp -= expNeed;
              pet.level++;
              pet.maxHp += 5;
              pet.hp = Math.min(pet.hp + 5, pet.maxHp);
              pet.atk += 2;
              pet.def += 2;
              logs.push(`${pet.name} 升级到 Lv.${pet.level}！`);
            }
          }
        }
        
        // 给玩家加经验
        const playerExpGain = Math.floor(expGain * 0.5);
        data.player = data.player || { level: 1, exp: 0, str: 10, agi: 10, int: 10, vit: 10, energy: 100, maxEnergy: 100, equipment: {}, skills: [], dailyTrain: 0, lastTrainDate: '' };
        data.player.exp = (data.player.exp || 0) + playerExpGain;
        const playerExpNeed = PLAYER_EXP_TABLE[data.player.level] || data.player.level * 500;
        if (data.player.exp >= playerExpNeed) {
          data.player.exp -= playerExpNeed;
          data.player.level++;
          data.player.str = (data.player.str || 10) + 1;
          data.player.agi = (data.player.agi || 10) + 1;
          data.player.int = (data.player.int || 10) + 1;
          data.player.vit = (data.player.vit || 10) + 1;
          logs.push(`训练师升级到 Lv.${data.player.level}！全属性+1`);
        }

        if (hasCharm) {
          // 有符咒，可以捕捉宠物
          let captureRate = 0;

          if (wildPet.isLegendary) {
            // 孤品宠物捕捉率极低
            const baseRate = wildPet.catchRate || 0.01;
            // 道具加成
            let bonus = (data.items['神话契约'] || 0) * 0.05 + (data.items['高级捉宠符'] || 0) * 0.02;
            // 玩家技能：神话契约
            if (data.player.skills?.includes('神话契约')) bonus += 0.05;
            captureRate = Math.min(0.2, baseRate + bonus);
            captureSuccess = Math.random() < captureRate;

            logs.push(`[捕捉] 捕捉概率: ${(captureRate * 100).toFixed(1)}%`);
            if (captureSuccess) {
              logs.push(`[捕捉成功] ${wildPet.name}被捕获！`);
            } else {
              logs.push(`[捕捉失败] ${wildPet.name}挣脱了符咒！`);
              logs.push(`它消失在了虚空中...`);
              wildPet.escaped = true;
            }
          } else {
            // 普通宠物捕捉率计算：血量越低，捕捉率越高
            captureRate = 0.3 + (1 - wildPet.hp / wildPet.maxHp) * 0.3;  // 30%-60%基础率
            // 玩家技能：捕捉大师
            if (data.player.skills?.includes('捕捉大师')) captureRate += 0.1;
            captureRate = Math.min(0.9, captureRate);
            captureSuccess = Math.random() < captureRate;

            logs.push(`[捕捉] 捕捉概率: ${(captureRate * 100).toFixed(1)}%`);
            if (captureSuccess) {
              logs.push(`[捕捉成功] ${wildPet.name}被捕获！`);
            } else {
              logs.push(`[捕捉失败] ${wildPet.name}挣脱逃跑！`);
            }
          }

          if (captureSuccess) {
            // 检查容量
            if (data.pets.length >= CONFIG.maxPets && data.storage.length >= data.maxStorage) {
              logs.push(`宠物和仓库已满，无法收留`);
              logs.push(`获得 ${expGain} 经验，${goldGain} 金币`);
            } else {
              // 消耗符咒
              data.items['捉宠符咒']--;
              if (data.items['捉宠符咒'] <= 0) delete data.items['捉宠符咒'];

              // 孤品宠物特殊提示
              if (wildPet.isLegendary) {
                logs.push(`【神话降临】全服首只${wildPet.name}已被捕获！`);
                // 标记为已捕获（持久化）
                LegendaryManager.setCaptured(wildPet.name, uid);
                // 额外奖励
                if (wildPet.reward) {
                  if (wildPet.reward.money) {
                    data.money += wildPet.reward.money;
                    logs.push(`获得奖励金币 +${wildPet.reward.money}`);
                  }
                  if (wildPet.reward.item) {
                    data.items[wildPet.reward.item] = (data.items[wildPet.reward.item] || 0) + 1;
                    logs.push(`获得奖励道具: ${wildPet.reward.item}`);
                  }
                }
              }

              wildPet.hp = wildPet.maxHp;
              wildPet.energy = wildPet.maxEnergy;

              if (data.pets.length < CONFIG.maxPets) {
                data.pets.push(wildPet);
                logs.push(`已加入队伍 (${data.pets.length}/${CONFIG.maxPets})`);
              } else if (data.storage.length < data.maxStorage) {
                data.storage.push(wildPet);
                logs.push(`队伍已满，已存入仓库 (${data.storage.length}/${data.maxStorage})`);
              }
              logs.push(`获得 ${expGain} 经验，${goldGain} 金币`);
            }
          } else {
            // 捕捉失败也消耗符咒
            data.items['捉宠符咒']--;
            if (data.items['捉宠符咒'] <= 0) delete data.items['捉宠符咒'];
            logs.push(`获得 ${expGain} 经验，${goldGain} 金币`);
          }
          WanwuYouling.emit('capture', { uid, pet: wildPet });
        } else {
          // 无符咒，只获得经验和金币
          logs.push(`[捕捉] 没有捉宠符咒，无法捕捉宠物`);
          logs.push(`获得 ${expGain} 经验，${goldGain} 金币`);
          logs.push(`提示: 发送 .宠物商店 购买捉宠符咒`);
        }

        // 图鉴记录
        PokedexManager.discover(data, wildPet.species, wildPet.rarity);

        // 装备掉落(10%概率)
        if (Math.random() < 0.1) {
          if (!data.equipments) data.equipments = [];
          const equip = generateEquipment();
          data.equipments.push(equip);
          logs.push(`[掉落] 获得装备: [${equip.rarity}]${equip.name}`);
        }

        // 玩家装备掉落(5%概率)
        if (Math.random() < 0.05) {
          const types = Object.keys(PLAYER_EQUIPMENT);
          const type = types[Math.floor(Math.random() * types.length)];
          const items = Object.entries(PLAYER_EQUIPMENT[type]);
          // 按稀有度权重随机
          const weights = { '普通': 50, '稀有': 30, '史诗': 15, '传说': 5 };
          let total = 0;
          const weighted = items.map(([name, item]) => {
            total += weights[item.rarity] || 10;
            return [name, item, total];
          });
          const rand = Math.random() * total;
          for (const [name, item, threshold] of weighted) {
            if (rand <= threshold) {
              data.playerItems = data.playerItems || {};
              data.playerItems[name] = (data.playerItems[name] || 0) + 1;
              logs.push(`[训练师装备] 获得: [${item.rarity}]${name}`);
              break;
            }
          }
        }

        // 玩家技能书掉落(3%概率)
        if (Math.random() < 0.03) {
          const books = Object.entries(PLAYER_SKILL_BOOKS);
          const weights = { '稀有': 60, '史诗': 30, '传说': 10 };
          let total = 0;
          const weighted = books.map(([name, book]) => {
            total += weights[book.rarity] || 10;
            return [name, book, total];
          });
          const rand = Math.random() * total;
          for (const [name, book, threshold] of weighted) {
            if (rand <= threshold) {
              data.playerItems = data.playerItems || {};
              data.playerItems[name] = (data.playerItems[name] || 0) + 1;
              logs.push(`[技能书] 获得: [${book.rarity}]${name}`);
              break;
            }
          }
        }

        // 宠物出战消耗：同步战斗后的血量
        if (!isPlayerFight) {
          const pet = getPet(p1);
          applyBattleInjuryCap(pet, fighter.hp);
          pet.energy = Math.max(0, pet.energy - 15);
        }

        // 双人战斗：玩家精力消耗
        if (playerFighter && playerFighter.hp > 0) {
          data.player.energy = Math.max(0, playerFighter.energy - 15);
        }

        // 更新任务进度
        QuestManager.updateProgress(data, 'battle');
        if (hasCharm && result.winner === fighter) QuestManager.updateProgress(data, 'catch');
        if (regionId) QuestManager.updateProgress(data, 'explore');

        save();
      } else {
        logs.push(`\n[失败] ${fighter.name}被 ${wildPet.name} 打败了，它逃跑了...`);
        if (!isPlayerFight) {
          const pet = getPet(p1);
          applyBattleInjuryCap(pet, fighter.hp);
          pet.energy = Math.max(0, pet.energy - 15);
        }
        // 双人战斗：玩家精力消耗
        if (playerFighter) {
          data.player.energy = Math.max(0, playerFighter.energy - 15);
        }
        // 更新任务进度
        QuestManager.updateProgress(data, 'battle');
        if (regionId) QuestManager.updateProgress(data, 'explore');
        save();
      }

      // 捕捉成功时显示tips
      if (captureSuccess) {
        logs.push(getRandomTip());
      }
      
      if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
        WebUIReporter.reportBattleLog({
          zone: regionId ? REGIONS[regionId].name : '野外',
          actor: myName || uid,
          target: wildPet.name,
          result: captureSuccess ? 'win' : (result.winner === fighter ? 'draw' : 'lose'),
          turns: result.logs ? result.logs.filter(l => l.includes('回合')).length : 0,
          rewards: { exp: expGain || 0, gold: goldGain || 0 },
          exp: expGain || 0,
          gold: goldGain || 0,
          logs: logs,
          logText: logs.join('\n'),
          tags: ['捕捉', wildPet.rarity],
        });
      }
      
      // 群聊回复截断长日志
      let replyLogs = logs.length > 15 ? logs.slice(0, 14) : logs.slice();
      if (logs.length > 15) replyLogs.push('...（省略部分回合）...');
      reply(replyLogs.join('\n'));
    } catch (e) {
      console.log('[万物有灵] 捉宠错误:', e);
      reply('捉宠过程发生错误，请稍后重试');
    }
    return seal.ext.newCmdExecuteResult(true);
  }

  if (action === '列表' || action === '') {
    if (!data.pets.length) return reply('你还没有宠物，发送 .宠物 斗殴 去捕捉一只');
    const lines = [`【队伍】(${data.pets.length}/${CONFIG.maxPets})`, `金币: ${data.money}`];
    data.pets.forEach((pet, i) => {
      const e = ELEMENT_MARK[pet.element] || '';
      const r = RARITY_MARK[pet.rarity] || '';
      lines.push(`${i + 1}. ${r}${e} ${pet.name} (${pet.species}) Lv.${pet.level} 潜能:${PetFactory.power(pet)}`);
    });
    if (data.storage.length) lines.push(`\n仓库: ${data.storage.length}/${CONFIG.maxStorage} (.宠物 仓库 查看)`);
    return reply(lines.join('\n'));
  }

  if (action === '仓库') {
    if (!data.storage.length) return reply(`【仓库】(${data.storage.length}/${CONFIG.maxStorage})\n仓库空空如也`);
    const lines = [`【仓库】(${data.storage.length}/${CONFIG.maxStorage})`, ''];
    data.storage.forEach((pet, i) => {
      const e = ELEMENT_MARK[pet.element] || '';
      const r = RARITY_MARK[pet.rarity] || '';
      const hp = pet.hp > 0 ? `HP:${pet.hp}/${pet.maxHp}` : '已阵亡';
      lines.push(`${i + 4}. ${r}${e} ${pet.name} (${pet.species}) Lv.${pet.level} ${hp}`);  // 从4开始编号
    });
    lines.push('\n.宠物 取出 <编号> - 取出到队伍(队伍编号1-3)');
    lines.push('.宠物 存入 <编号> - 存入仓库');
    return reply(lines.join('\n'));
  }

  if (action === '存入') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    if (data.pets.length <= 1) return reply('队伍至少要保留1只宠物');
    if (data.storage.length >= CONFIG.maxStorage) return reply(`仓库已满(${CONFIG.maxStorage}只)`);
    const idx = data.pets.indexOf(pet);
    data.pets.splice(idx, 1);
    data.storage.push(pet);
    save();
    WanwuYouling.emit('store', { uid, pet, to: 'storage' });
    return reply(`${pet.name} 已存入仓库 (${data.storage.length}/${CONFIG.maxStorage})\n${getRandomTip()}`);
  }

  if (action === '取出') {
    const num = parseInt(p1);
    // 支持新编号：4-18是仓库宠物
    if (isNaN(num) || num < 4) return reply('请指定正确的仓库编号(4-18)');
    const storageIdx = num - 4;
    if (storageIdx >= data.storage.length) return reply('仓库无此宠物');
    const pet = data.storage[storageIdx];
    if (data.pets.length >= CONFIG.maxPets) return reply(`队伍已满(${CONFIG.maxPets}只)，请先存入一只`);
    data.storage.splice(storageIdx, 1);
    data.pets.push(pet);
    save();
    WanwuYouling.emit('store', { uid, pet, to: 'team' });
    return reply(`${pet.name} 已加入队伍 (${data.pets.length}/${CONFIG.maxPets})\n${getRandomTip()}`);
  }

  if (action === '信息') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    return reply(PetFactory.info(pet, parseInt(p1) - 1));
  }

  if (action === '背包') {
    const lines = [`【我的背包】`, `金币: ${data.money}`];
    const foodItems = Object.entries(data.food).filter(([_, count]) => count > 0);
    if (foodItems.length === 0) {
      lines.push('背包空空如也');
    } else {
      lines.push('食物:');
      for (const [name, count] of foodItems) {
        const f = FOODS[name];
        const effects = [];
        if (f.hp) effects.push(`生命+${f.hp}`);
        if (f.atk) effects.push(`攻击+${f.atk}`);
        if (f.def) effects.push(`防御+${f.def}`);
        if (f.energy) effects.push(`精力+${f.energy}`);
        lines.push(`  ${name} x${count} (${effects.join(', ')})`);
      }
    }
    return reply(lines.join('\n'));
  }

  if (action === '喂食') {
    QuestManager.initPlayerQuests(data);
    const FEED_STAT_CAP = 30;
    const feedArgs = actionFromCmd ? args : args.slice(1);
    const feedTarget = feedArgs[0] || '';
    const foodName = feedArgs[1] || '';
    const feedCountArg = feedArgs[2] || '';
    if (!foodName || !FOODS[foodName]) return reply(`未知食物，可用: ${Object.keys(FOODS).join('、')}`);
    const totalFood = data.food[foodName] || 0;
    if (totalFood <= 0) return reply(`你没有 ${foodName}，发送 .宠物 背包 查看拥有的食物`);

    const getAffectionGain = (pet, count, mode = 'single') => {
      const food = FOODS[foodName];
      const [minGain, maxGain] = food.affection || [3, 6];
      const natureData = NATURES[pet.nature] || {};
      const trackerKey = pet.id;
      let trackerCount = data.feedTracker[trackerKey] || 0;
      let totalGain = 0;
      let firstFeedBonus = false;

      for (let i = 0; i < count; i++) {
        const baseGain = minGain + Math.floor(Math.random() * (maxGain - minGain + 1));
        let gain = Math.floor(baseGain * (natureData.affectionMod || 1));
        const feedIndex = trackerCount + i + 1;
        let rate = 1;
        if (feedIndex >= 3 && feedIndex <= 5) rate = 0.8;
        else if (feedIndex >= 6) rate = 0.6;
        if (mode === 'all') rate *= 0.85;
        gain = Math.max(1, Math.floor(gain * rate));
        if (!data.feedDaily.firstBonusClaimed) {
          gain *= 2;
          data.feedDaily.firstBonusClaimed = true;
          firstFeedBonus = true;
        }
        totalGain += gain;
      }

      data.feedTracker[trackerKey] = trackerCount + count;
      return { affectionGain: totalGain, firstFeedBonus };
    };

    const applyFeedStatGrowth = (pet, food, count) => {
      pet.feedStats = pet.feedStats || { atk: 0, def: 0 };
      let atkGain = 0;
      let defGain = 0;
      for (let i = 0; i < count; i++) {
        if (food.atk > 0 && pet.feedStats.atk < FEED_STAT_CAP) {
          const gain = Math.min(food.atk, FEED_STAT_CAP - pet.feedStats.atk);
          pet.feedStats.atk += gain;
          atkGain += gain;
        }
        if (food.def > 0 && pet.feedStats.def < FEED_STAT_CAP) {
          const gain = Math.min(food.def, FEED_STAT_CAP - pet.feedStats.def);
          pet.feedStats.def += gain;
          defGain += gain;
        }
      }
      pet.atk += atkGain;
      pet.def += defGain;
      return { atkGain, defGain, capped: atkGain < food.atk * count || defGain < food.def * count };
    };

    const feedPet = (pet, count, mode = 'single') => {
      const f = FOODS[foodName];
      pet.hp = Math.min(pet.maxHp, pet.hp + f.hp * count);
      const statGain = applyFeedStatGrowth(pet, f, count);
      pet.energy = Math.min(pet.maxEnergy, pet.energy + f.energy * count);

      const { affectionGain, firstFeedBonus } = getAffectionGain(pet, count, mode);
      pet.affection = Math.min(100, (pet.affection || 50) + affectionGain);
      for (let i = 0; i < count; i++) QuestManager.updateProgress(data, 'feed');
      WanwuYouling.emit('feed', { uid, pet, food: foodName, foodData: f, count, mode });
      return { affectionGain, foodData: f, firstFeedBonus, statGain };
    };

    if (feedTarget === '全部') {
      if (!data.pets.length) return reply('你还没有队伍宠物');
      let count = parseInt(feedCountArg);
      if (!Number.isInteger(count) || count <= 0) count = 1;
      const petCount = data.pets.length;
      const maxBatch = Math.floor(totalFood / petCount);
      if (maxBatch <= 0) return reply(`${foodName} 数量不足，至少需要 ${petCount} 个才能全部喂食一次`);
      count = Math.min(count, maxBatch);
      data.food[foodName] -= count * petCount;

      const lines = [`全部喂食成功！所有队伍宠物都吃了 ${foodName} x${count}`];
      let hasFirstBonus = false;
      let hasCapReached = false;
      data.pets.forEach((pet, idx) => {
        const result = feedPet(pet, count, 'all');
        if (result.firstFeedBonus) hasFirstBonus = true;
        if (result.statGain.capped) hasCapReached = true;
        const statTips = [];
        if (result.statGain.atkGain > 0) statTips.push(`攻击+${result.statGain.atkGain}`);
        if (result.statGain.defGain > 0) statTips.push(`防御+${result.statGain.defGain}`);
        lines.push(`${idx + 1}. ${pet.name} 好感度+${result.affectionGain}${statTips.length ? ` (${statTips.join('，')})` : ''}`);
      });
      if (hasFirstBonus) lines.push('今日首次喂食双倍好感已触发');
      if (hasCapReached) lines.push(`部分宠物的喂食攻防成长已达到上限（攻击/防御各最多+${FEED_STAT_CAP}）`);
      save();
      lines.push(getRandomTip());
      return reply(lines.join('\n'));
    }

    const pet = getPet(feedTarget);
    if (!pet) return reply('请指定正确的宠物编号');

    let count = parseInt(feedCountArg);
    if (!Number.isInteger(count) || count <= 0) count = 1;
    count = Math.min(count, totalFood);
    data.food[foodName] -= count;

    const result = feedPet(pet, count, 'single');
    save();
    const bonusText = result.firstFeedBonus ? '\n今日首次喂食双倍好感已触发' : '';
    const capText = result.statGain.capped ? `\n该宠物的喂食攻防成长已接近或达到上限（攻击/防御各最多+${FEED_STAT_CAP}）` : '';
    return reply(`喂食成功！${pet.name} 吃了 ${foodName} x${count}\n好感度+${result.affectionGain}${bonusText}${capText}\n${PetFactory.info(pet, parseInt(feedTarget) - 1)}\n${getRandomTip()}`);
  }
  if (action === '改名') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    if (!p2) return reply('请指定新名字');
    if (p2.length > 10) return reply('名字最长10个字符');
    if (p2.length < 1) return reply('名字不能为空');
    if (/[^\u4e00-\u9fa5a-zA-Z0-9]/.test(p2)) return reply('名字只能包含中英文和数字');
    const oldName = pet.name;
    pet.name = p2;
    save();
    WanwuYouling.emit('rename', { uid, pet, oldName, newName: p2 });
    return reply(`已将宠物改名为 ${p2}\n${getRandomTip()}`);
  }

  if (action === '学习') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    const result = PetFactory.learnRandomSkill(pet);
    if (!result.success) return reply(result.error);
    save();
    WanwuYouling.emit('learn', { uid, pet, skill: result.skill });
    return reply(`${pet.name} 学会了 ${result.skill}！\n${getRandomTip()}`);
  }

  if (action === '对战') {
    // 解析参数 (v3.6.10 纯PVP模式)
    // 参数格式：
    // .宠物对战 @雪梨 → 最强宠物 vs 对方最强宠物
    // .宠物对战 3 @雪梨 → 3号宠物 vs 对方最强宠物
    // .宠物对战 3 1 @雪梨 → 3号宠物 vs 对方1号宠物
    // .宠物对战 3 1 3029590078 → 同上，用QQ号指定对手

    // 必须指定对手
    if (!atUserId && !rawArgs) {
      return reply('【对战】纯PVP模式\n用法:\n.宠物对战 @人 - 最强宠物出战\n.宠物对战 3 @人 - 指定宠物出战\n.宠物对战 12345678 - 用QQ号指定对手');
    }

    let myPetIdx = null;      // 己方宠物编号
    let enemyPetIdx = null;   // 对方宠物编号
    let targetUid = null;     // 对手用户ID

    // 优先使用 atUserId（来自消息段的@解析）
    if (atUserId) {
      targetUid = atUserId;
    }

    // 解析所有参数
    const allArgs = (rawArgs || '').trim().split(/\s+/).filter(x => x);

    // 过滤掉 CQ 码格式的 @
    const cleanArgs = allArgs.filter(arg => !arg.startsWith('[CQ:'));

    // 判断是否为宠物编号（1-18）
    const isPetIndex = (str) => {
      const num = parseInt(str);
      return !isNaN(num) && num >= 1 && num <= 18;
    };

    // 判断是否为 QQ 号（5位以上纯数字）
    const isQQNumber = (str) => /^\d{5,}$/.test(str);

    // 解析参数
    for (const arg of cleanArgs) {
      if (isPetIndex(arg)) {
        if (myPetIdx === null) {
          myPetIdx = parseInt(arg);
        } else if (enemyPetIdx === null) {
          enemyPetIdx = parseInt(arg);
        }
      } else if (isQQNumber(arg) && !targetUid) {
        targetUid = 'QQ:' + arg;
      }
    }

    // 纯PVP模式：必须指定对手
    if (!targetUid) {
      return reply('【对战】纯PVP模式\n用法:\n.宠物对战 @人 - 最强宠物出战\n.宠物对战 3 @人 - 指定宠物出战\n.宠物对战 12345678 - 用QQ号指定对手');
    }

    console.log('[万物有灵] PVP targetUid:', targetUid, 'myPetIdx:', myPetIdx, 'enemyPetIdx:', enemyPetIdx);

    // 获取己方宠物
    let pet1;
    if (myPetIdx) {
      pet1 = getPet(myPetIdx);
      if (!pet1) return reply('请指定正确的宠物编号');
    } else {
      pet1 = PetFactory.getStrongestPet(data.pets);
      if (!pet1) return reply('你没有宠物');
    }

    // 计算己方玩家战斗属性 (v3.6.12 修复：变量定义移到使用前)
    const player = data.player;
    const equipBonus = { str: 0, agi: 0, int: 0, vit: 0 };
    for (const slot of Object.values(player.equipment || {})) {
      if (slot) {
        for (const attr of ['str', 'agi', 'int', 'vit']) {
          if (slot[attr]) equipBonus[attr] += slot[attr];
        }
      }
    }

    // PVP不检查HP和精力，使用满状态副本
    const pet1Copy = JSON.parse(JSON.stringify(pet1));
    pet1Copy.hp = pet1Copy.maxHp;
    pet1Copy.energy = pet1Copy.maxEnergy || 100;

    // 计算己方训练师属性加成
    const myTotalStr = (player.str || 10) + (equipBonus.str || 0);
    const myTotalAgi = (player.agi || 10) + (equipBonus.agi || 0);
    const myTotalInt = (player.int || 10) + (equipBonus.int || 0);
    const myTotalVit = (player.vit || 10) + (equipBonus.vit || 0);
    const myStrBonus = 1 + Math.max(0, myTotalStr - 10) * 0.005;
    const myAgiBonus = 1 + Math.max(0, myTotalAgi - 10) * 0.005;
    const myIntBonus = 1 + Math.max(0, myTotalInt - 10) * 0.005;
    const myVitBonus = 1 + Math.max(0, myTotalVit - 10) * 0.005;
    pet1Copy.atk = Math.floor(pet1Copy.atk * myStrBonus);
    pet1Copy.spd = Math.floor(pet1Copy.spd * myAgiBonus);
    pet1Copy.maxEnergy = Math.floor(pet1Copy.maxEnergy * myIntBonus);
    pet1Copy.maxHp = Math.floor(pet1Copy.maxHp * myVitBonus);
    pet1Copy.hp = pet1Copy.maxHp;

    let pet2;
    let player2Fighter = null;  // 对手玩家战斗单位
    let isNPC = true;

    const pLevel = player.level || 1;
    const playerCombatAttrs = {
      hp: PLAYER_BASE.hp + (player.vit + equipBonus.vit) * 3 + (pLevel - 1) * 9,
      atk: PLAYER_BASE.atk + (player.str + equipBonus.str) * 1 + (pLevel - 1) * 3.5,
      def: PLAYER_BASE.def + (player.vit + equipBonus.vit) * 0.5 + (pLevel - 1) * 2,
      spd: PLAYER_BASE.spd + (player.agi + equipBonus.agi) * 0.5 + (pLevel - 1) * 1,
      energy: player.energy || 100,
    };
    const playerSkills = player.skills || [];
    const playerBuffs = {};
    if (playerSkills.includes('战斗直觉')) playerBuffs.critBoost = 0.05;
    if (playerSkills.includes('元素亲和')) playerBuffs.elementBoost = 0.1;
    if (playerSkills.includes('生命链接')) playerBuffs.hpRegen = 0.02;
    if (playerSkills.includes('能量涌动')) playerBuffs.energySave = 0.1;

    // 己方玩家战斗单位
    const player1Fighter = {
      name: myName || '你',
      hp: playerCombatAttrs.hp,
      maxHp: playerCombatAttrs.hp,
      atk: playerCombatAttrs.atk,
      def: playerCombatAttrs.def,
      spd: playerCombatAttrs.spd,
      energy: playerCombatAttrs.energy,
      maxEnergy: playerCombatAttrs.energy,
      skills: PLAYER_SKILLS,
      element: null,
      level: player.level,
      isPlayer: true,
      playerBuffs: playerBuffs,
    };

    // 用于存储对方昵称
    let targetName = '对手';

    if (targetUid) {
      // 有对手用户ID，进行PVP
      if (targetUid === uid) {
        return reply('不能和自己对战');
      }
      const targetData = DB.get(targetUid);
      if (!targetData.pets.length) return reply('对方没有宠物');

      // 获取对方昵称（优先全局映射，其次用户数据，最后QQ号）
      targetName = DB.getName(targetUid) || targetData.playerName || targetUid.replace('QQ:', '') || '对手';

      // 获取对方宠物（未指定则用最强）
      if (enemyPetIdx) {
        if (enemyPetIdx < 1 || enemyPetIdx > targetData.pets.length) {
          return reply('对方没有该编号的宠物');
        }
        pet2 = targetData.pets[enemyPetIdx - 1];
      } else {
        pet2 = PetFactory.getStrongestPet(targetData.pets);
        if (!pet2) return reply('对方没有宠物');
      }

      // PVP使用满状态副本
      pet2 = JSON.parse(JSON.stringify(pet2));
      pet2.hp = pet2.maxHp;
      pet2.energy = pet2.maxEnergy || 100;

      // 计算对方玩家战斗属性 (v3.6.10 修复：添加等级成长，保持削弱)
      const targetPlayer = targetData.player;
      const targetEquipBonus = { str: 0, agi: 0, int: 0, vit: 0 };
      for (const slot of Object.values(targetPlayer.equipment || {})) {
        if (slot) {
          for (const attr of ['str', 'agi', 'int', 'vit']) {
            if (slot[attr]) targetEquipBonus[attr] += slot[attr];
          }
        }
      }
      const targetLevel = targetPlayer.level || 1;
      const targetPlayerAttrs = {
        hp: PLAYER_BASE.hp + (targetPlayer.vit + targetEquipBonus.vit) * 3 + (targetLevel - 1) * 9,
        atk: PLAYER_BASE.atk + (targetPlayer.str + targetEquipBonus.str) * 1 + (targetLevel - 1) * 3.5,
        def: PLAYER_BASE.def + (targetPlayer.vit + targetEquipBonus.vit) * 0.5 + (targetLevel - 1) * 2,
        spd: PLAYER_BASE.spd + (targetPlayer.agi + targetEquipBonus.agi) * 0.5 + (targetLevel - 1) * 1,
        energy: targetPlayer.energy || 100,
      };
      const targetSkills = targetPlayer.skills || [];
      const targetBuffs = {};
      if (targetSkills.includes('战斗直觉')) targetBuffs.critBoost = 0.05;
      if (targetSkills.includes('元素亲和')) targetBuffs.elementBoost = 0.1;
      if (targetSkills.includes('生命链接')) targetBuffs.hpRegen = 0.02;
      if (targetSkills.includes('能量涌动')) targetBuffs.energySave = 0.1;

      player2Fighter = {
        name: targetName,
        hp: targetPlayerAttrs.hp,
        maxHp: targetPlayerAttrs.hp,
        atk: targetPlayerAttrs.atk,
        def: targetPlayerAttrs.def,
        spd: targetPlayerAttrs.spd,
        energy: targetPlayerAttrs.energy,
        maxEnergy: targetPlayerAttrs.energy,
        skills: PLAYER_SKILLS,
        element: null,
        level: targetPlayer.level,
        isPlayer: true,
        playerBuffs: targetBuffs,
      };

      isNPC = false;
    }

    try {
      // 使用之前创建的满状态副本进行战斗
      const result = Battle.run(pet1Copy, pet2, player1Fighter, player2Fighter);
      // 显示格式：【双人PVP】我的宠物 + 我 vs 对方宠物 + 对方昵称
      const vsTitle = player2Fighter
        ? `【双人PVP】${pet1.name} + ${myName || '你'} vs ${pet2.name} + ${targetName}`
        : `【双人PVP】${pet1.name} + ${myName || '你'} vs ${pet2.name}`;
      const logs = [vsTitle];

      // 日志截断：按回合截断，确保回合完整性
      const maxLogs = CONFIG.battleLogPvPLimit;
      const battleLogs = result.logs;
      if (battleLogs.length <= maxLogs) {
        logs.push(...battleLogs);
      } else {
        // 找到回合分割点，按回合截断
        const turnStarts = [];
        battleLogs.forEach((log, i) => {
          if (log.includes('--- 第') && log.includes('回合 ---')) {
            turnStarts.push(i);
          }
        });

        if (turnStarts.length <= 2) {
          logs.push(...battleLogs.slice(0, 8));
          logs.push('\n...（战斗太激烈，省略部分回合）...\n');
          logs.push(...battleLogs.slice(-8));
        } else {
          const headTurnEnd = turnStarts[2] || battleLogs.length;
          const tailTurnStart = turnStarts[turnStarts.length - 2] || 0;
          logs.push(...battleLogs.slice(0, headTurnEnd));
          logs.push('\n...（战斗太激烈，省略中间回合）...\n');
          logs.push(...battleLogs.slice(tailTurnStart));
        }
      }

      // PVP不扣血和精力，只记录战斗结果

      if (result.draw) {
        logs.push('\n[平局] 双方同归于尽！');
      } else {
        const player1Won = result.winner === pet1Copy || result.winner === player1Fighter;
        logs.push(`\n[胜利] ${result.winner.name} 获胜！`);
        if (player1Won) {
          const exp = CONFIG.baseExpGain + Math.floor(Math.random() * 10);
          pet1.exp += exp;
          pet1.sp++;
          pet1.battles++;
          logs.push(`${pet1.name} 获得 ${exp} 经验和 1 技能点`);

          const expNeed = pet1.level * 100;
          if (pet1.exp >= expNeed) {
            const oldLevel = pet1.level;
            pet1.exp -= expNeed;
            pet1.level++;
            pet1.maxHp += 5;
            pet1.hp = Math.min(pet1.hp + 5, pet1.maxHp);
            pet1.atk += 2;
            pet1.def += 2;
            logs.push(`[升级] ${pet1.name} 升级到 Lv.${pet1.level}！`);
            WanwuYouling.emit('levelup', { uid, pet: pet1, oldLevel, newLevel: pet1.level });
          }
        } else {
          pet1.battles++;
          logs.push(`${pet1.name} 战败`);
        }
      }

      if (pet1.evolved && pet1.battles >= pet1.maxBattles) {
        pet1.retired = true;
        logs.push(`${pet1.name} 已完成对战次数，退休了`);
        WanwuYouling.emit('retire', { uid, pet: pet1 });
      }

      // PVP不扣对方血量和精力

      save();
      // 触发对战事件
      WanwuYouling.emit('battle', {
        uid,
        winner: result.winner === pet1Copy,
        draw: result.draw,
        isNPC,
        targetUid,
        pet1,
        pet2,
        mode: isNPC ? 'wild' : 'pvp',
        playerMode: pet1 && pet1.isPlayer ? 'body' : 'pet'
      });

      // 上报战斗日志到WebUI
      if (WebUIReporter.config.enabled) {
        const rewardSourceText = Array.isArray(logs) ? logs.join('\n') : '';
        const rewardMatch = rewardSourceText.match(/获得\s*(\d+)\s*经验[，,]\s*(\d+)\s*金币/);
        const rewardExp = rewardMatch ? Number(rewardMatch[1] || 0) : 0;
        const rewardGold = rewardMatch ? Number(rewardMatch[2] || 0) : 0;
        WebUIReporter.reportBattleLog({
          zone: isNPC ? '野外' : 'PVP',
          actor: myName || uid,
          target: targetName || targetUid || 'NPC',
          result: result.draw ? 'draw' : (result.winner === pet1Copy ? 'win' : 'lose'),
          turns: result.logs ? result.logs.filter(l => l.includes('回合')).length : 0,
          rewards: { exp: rewardExp, gold: rewardGold },
          exp: rewardExp,
          gold: rewardGold,
          logs: Array.isArray(result.logs) ? result.logs : logs,
          logText: Array.isArray(result.logs) ? result.logs.join('\n') : logs.join('\n'),
          tags: isNPC ? ['野生'] : ['PVP'],
        });
      }

      // 群聊回复截断长日志
      let replyLogs = logs.length > 15 ? logs.slice(0, 14) : logs.slice();
      if (logs.length > 15) replyLogs.push('...（省略部分回合）...');
      reply(replyLogs.join('\n'));
    } catch (e) {
      console.log('[万物有灵] 对战错误:', e);
      reply('对战过程发生错误，请稍后重试');
    }
    return seal.ext.newCmdExecuteResult(true);
  }

  if (action === '育种') {
    const pet1 = getPet(p1);
    const pet2 = getPet(p2);
    if (!pet1 || !pet2) return reply('请指定两只正确的宠物编号');
    if (pet1.id === pet2.id) return reply('不能和自己育种');

    // 检查育种次数
    const breedCount1 = pet1.breedCount || 0;
    const breedCount2 = pet2.breedCount || 0;

    if (pet1.canBreed === false && !data.items['计划生育卡']) return reply(`${pet1.name}已失去生育能力，需要计划生育卡`);
    if (pet2.canBreed === false && !data.items['计划生育卡']) return reply(`${pet2.name}已失去生育能力，需要计划生育卡`);

    // 进化后无法育种
    if (pet1.evolved || pet2.evolved) return reply('进化后的宠物无法育种');

    // 检查是否需要计划生育卡
    let needCard1 = breedCount1 >= 1;
    let needCard2 = breedCount2 >= 1;

    if (needCard1 && !data.items['计划生育卡']) return reply(`${pet1.name}已育种${breedCount1}次，需要计划生育卡`);
    if (needCard2 && !data.items['计划生育卡']) return reply(`${pet2.name}已育种${breedCount2}次，需要计划生育卡`);

    // 检查是否有空间
    const hasTwinPotion = data.items['多胞胎药水'] > 0;
    const isTwin = hasTwinPotion || Math.random() < 0.08; // 8%多胞胎概率
    const babyCount = isTwin ? 2 : 1;

    if (data.pets.length + babyCount > CONFIG.maxPets && data.storage.length + babyCount > data.maxStorage) {
      return reply(`宠物和仓库空间不足，无法容纳${babyCount}只幼崽`);
    }

    // 消耗道具
    if (needCard1 || needCard2) {
      data.items['计划生育卡']--;
      if (data.items['计划生育卡'] <= 0) delete data.items['计划生育卡'];
    }
    if (hasTwinPotion) {
      data.items['多胞胎药水']--;
      if (data.items['多胞胎药水'] <= 0) delete data.items['多胞胎药水'];
    }

    // 更新育种次数
    pet1.breedCount = breedCount1 + 1;
    pet2.breedCount = breedCount2 + 1;
    pet1.canBreed = pet1.breedCount < 1;
    pet2.canBreed = pet2.breedCount < 1;

    const babies = [];
    for (let i = 0; i < babyCount; i++) {
      const child = PetFactory.create();
      if (Math.random() < 0.5) child.species = pet1.species;
      else child.species = pet2.species;
      if (Math.random() < 0.1) {
        const speciesKeys = Object.keys(SPECIES);
        child.species = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
      }

      // 确保子代元素在其种族的可用元素列表中
      const speciesData = SPECIES[child.species];
      const parentElements = [pet1.element, pet2.element];
      const validElements = speciesData.elements.filter(e => parentElements.includes(e));
      child.element = validElements.length > 0
        ? validElements[Math.floor(Math.random() * validElements.length)]
        : speciesData.elements[Math.floor(Math.random() * speciesData.elements.length)];
      child.name = PetFactory.generateName(child.element);
      // 记录父母信息
      child.parents = [
        { id: pet1.id, name: pet1.name, species: pet1.species },
        { id: pet2.id, name: pet2.name, species: pet2.species },
      ];
      babies.push(child);

      if (data.pets.length < CONFIG.maxPets) data.pets.push(child);
      else data.storage.push(child);
    }

    save();
    WanwuYouling.emit('breed', { uid, parents: [pet1, pet2], babies });

    const lines = ['[育种] 育种成功！'];
    if (isTwin) lines.push('[多胞胎] 恭喜！生出了双胞胎！');
    babies.forEach((child, i) => {
      lines.push(`获得 ${RARITY_MARK[child.rarity]}${ELEMENT_MARK[child.element]} ${child.name}(${child.species})`);
    });
    lines.push(getRandomTip());
    return reply(lines.join('\n'));
  }

  //   世界系统命令  
  if (action === '世界' || action === '地区') {
    const lines = [WorldManager.formatWorldStatus(p1)];
    lines.push('', '【可探索地区】');
    const regions = WorldManager.getAvailableRegions();
    regions.forEach(r => {
      const timeInfo = r.nightOnly ? '(夜间)' : (r.dayOnly ? '(白天)' : '');
      lines.push(`${r.name} ${timeInfo} - ${r.desc}`);
    });
    lines.push('', '使用 .宠物 探索 <地区> 前往探索');
    return reply(lines.join('\n'));
  }

  if (action === '探索') {
    const regionId = p1;
    if (!regionId || !REGIONS[regionId]) {
      const regions = WorldManager.getAvailableRegions();
      const lines = ['请指定要探索的地区:', ''];
      regions.forEach(r => lines.push(`${r.id} - ${r.name}`));
      return reply(lines.join('\n'));
    }

    const region = REGIONS[regionId];
    const isNight = WorldManager.isNight();

    // 检查时间限制
    if (region.nightOnly && !isNight) {
      return reply(`${region.name}只在夜间开放探索`);
    }
    if (region.dayOnly && isNight) {
      return reply(`${region.name}只在白天开放探索`);
    }

    // 显示探索信息
    const weather = WorldManager.getWeather(regionId);
    const weatherData = WEATHERS[weather];
    const lines = [
      `【探索】${region.name}`,
      `${region.desc}`,
      `天气: ${weather}(${weatherData.effect})`,
      '',
      `可能出现: ${region.species.slice(0, 5).join('、')}等`,
      '',
      '使用 .宠物 捉宠 [地区] 在此地区捕捉宠物',
    ];
    return reply(lines.join('\n'));
  }

  if (action === '商店') {
    const lines = ['【宠物商店】', `你的金币: ${data.money}`, '', '【基础食物】'];
    const basicFoods = getBasicShopFoods();
    for (const name of basicFoods) {
      const f = FOODS[name];
      if (!f) continue;
      const effects = [];
      if (f.hp) effects.push(`生命+${f.hp}`);
      if (f.atk) effects.push(`攻击+${f.atk}`);
      if (f.def) effects.push(`防御+${f.def}`);
      if (f.energy) effects.push(`精力+${f.energy}`);
      lines.push(`${name}: ${f.cost}金币 (${effects.join(', ')})`);
    }
    lines.push('', '【基础道具】');
    for (const [name, item] of Object.entries(ITEMS)) {
      lines.push(`${name}: ${item.cost}金币 (${item.desc})`);
    }
    lines.push('', '【城市特产】');
    lines.push('发送 .宠物 城镇 [城镇名] 查看当地专属食物');
    lines.push('发送 .宠物 NPC [NPC名] 查看城市商店');
    lines.push('', '使用 .宠物 购买 <物品/道具> [数量] 购买');
    lines.push('使用 .宠物 道具 查看拥有的道具');
    lines.push('使用 .宠物 使用 <道具> [宠物编号] 使用道具');
    return reply(lines.join('\n'));
  }

  if (action === '购买') {
    const buyArgs = actionFromCmd ? args : args.slice(1);
    const item = buyArgs[0] || '';
    const count = Math.max(1, parseInt(buyArgs[1]) || 1);

    const cityFoodSet = new Set(Object.values(SHOP_RUNTIME.cityFoods || {}).flat());
    const basicFoods = new Set(getBasicShopFoods());
    const currentTownFoods = new Set(getCityFoodShop(data.currentTown));
    const currentNpcFoods = new Set(getNpcFoodShop(data.currentShopNpc));
    const canBuyFromLocalShop = currentTownFoods.has(item) || currentNpcFoods.has(item);

    // 检查是食物还是道具
    if (FOODS[item]) {
      if (cityFoodSet.has(item) && !basicFoods.has(item) && !canBuyFromLocalShop) {
        const townId = Object.keys(SHOP_RUNTIME.cityFoods || {}).find(id => getCityFoodShop(id).includes(item));
        const townName = TOWNS[townId]?.name || '对应城镇';
        return reply(`${item} 是城市特产，请先前往 ${townName} 查看当地商店后再购买`);
      }
      const cost = FOODS[item].cost * count;
      if (data.money < cost) return reply(`金币不足，需要 ${cost} 金币`);
      data.money -= cost;
      data.food[item] = (data.food[item] || 0) + count;
      save();
      WanwuYouling.emit('buy', { uid, item, count, cost, type: 'food' });
      return reply(`购买成功！获得 ${item} x${count}，花费 ${cost} 金币\n${getRandomTip()}`);
    } else if (ITEMS[item]) {
      const cost = ITEMS[item].cost * count;
      if (data.money < cost) return reply(`金币不足，需要 ${cost} 金币`);
      data.money -= cost;
      data.items[item] = (data.items[item] || 0) + count;
      save();
      WanwuYouling.emit('buy', { uid, item, count, cost, type: 'item' });
      return reply(`购买成功！获得 ${item} x${count}，花费 ${cost} 金币\n${getRandomTip()}`);
    }
    return reply('未知物品，发送 .宠物商店 查看可购买的物品');
  }

  if (action === '道具') {
    const lines = ['【我的道具】'];
    const itemEntries = Object.entries(data.items);
    if (!itemEntries.length) {
      lines.push('暂无道具，发送 .宠物商店 购买');
    } else {
      for (const [name, count] of itemEntries) {
        const item = ITEMS[name];
        lines.push(`${name} x${count} - ${item ? item.desc : '未知道具'}`);
      }
    }
    return reply(lines.join('\n'));
  }

  if (action === '使用') {
    const itemName = p1;
    const petIdx = p2;
    const item = ITEMS[itemName];

    if (!item) return reply('未知道具，发送 .宠物 道具 查看拥有的道具');
    if (!data.items[itemName]) return reply(`你没有 ${itemName}`);

    const useItem = () => {
      data.items[itemName]--;
      if (data.items[itemName] <= 0) delete data.items[itemName];
    };

    switch (item.type) {
      case 'exp': {
        const pet = getPet(petIdx);
        if (!pet) return reply('请指定正确的宠物编号');
        const exp = item.effect?.action === 'addExp' ? Math.max(1, Math.floor(Number(item.effect.amount || 100))) : (itemName === '大经验药水' ? 300 : 100);
        const leveledUp = grantPetExp(pet, exp);
        useItem();
        save();
        WanwuYouling.emit('useItem', { uid, item: itemName, pet });
        const msg = leveledUp
          ? `${pet.name} 获得 ${exp} 经验并升级到 Lv.${pet.level}！`
          : `${pet.name} 获得 ${exp} 经验 (${pet.exp}/${pet.level * 100})`;
        return reply(msg);
      }

      case 'skill': {
        const pet = getPet(petIdx);
        if (!pet) return reply('请指定正确的宠物编号');
        const oldSp = pet.sp || 0;
        pet.sp = oldSp + (pet.skills ? pet.skills.length : 1);
        pet.skills = ['冲撞'];
        useItem();
        save();
        WanwuYouling.emit('useItem', { uid, item: itemName, pet });
        return reply(`${pet.name} 的技能已重置，恢复了 ${pet.sp - oldSp} 技能点\n${getRandomTip()}`);
      }

      case 'revive': {
        const pet = getPet(petIdx);
        if (!pet) return reply('请指定正确的宠物编号');
        if (pet.hp > 0) return reply(`${pet.name} 还活着，不需要复活`);
        pet.hp = pet.maxHp;
        pet.energy = pet.maxEnergy;
        useItem();
        save();
        WanwuYouling.emit('useItem', { uid, item: itemName, pet });
        return reply(`${pet.name} 已复活！生命和精力已恢复\n${getRandomTip()}`);
      }

      case 'misc': {
        if (item.effect) {
          const result = applyCustomItemEffect(item, { uid, data, itemName, petIdx, getPet, useItem, save });
          if (!result.ok) return reply(result.msg);
          return reply(`${result.msg}\n${getRandomTip()}`);
        }
        if (itemName === '扩容卡') {
          data.maxStorage = (data.maxStorage || 15) + 5;
          useItem();
          save();
          WanwuYouling.emit('useItem', { uid, item: itemName });
          return reply(`仓库容量已扩展！当前容量: ${data.maxStorage}\n${getRandomTip()}`);
        }
        return reply(`${itemName} 无法直接使用`);
      }

      case 'luck':
      case 'breed':
      case 'speed':
        return reply(`${itemName} 在对应操作时自动使用`);

      default:
        if (item.effect) {
          const result = applyCustomItemEffect(item, { uid, data, itemName, petIdx, getPet, useItem, save });
          if (!result.ok) return reply(result.msg);
          return reply(`${result.msg}\n${getRandomTip()}`);
        }
        return reply(`${itemName} 无法直接使用`);
    }
  }

  //   扩展命令  
  if (WanwuYouling._extCommands[action]) {
    const p = {
      uid, data, args, p1, p2, reply,
      save: () => { DB.save(uid, data); },
      getPet,
      DB, PetFactory, Battle, CONFIG, FOODS, SPECIES,
      // 兼容旧接口
      get uid() { return uid; },
      get data() { return data; },
    };
    const result = WanwuYouling._extCommands[action].handler(ctx, msg, p);
    return result || seal.ext.newCmdExecuteResult(true);
  }

  // 扩展命令兜底：兼容“购买宠物”别名在部分运行态未注册的情况
  if (action === '购买宠物') {
    const shortId = p1 || p2;
    if (!shortId) return reply('用法: .宠物 购买宠物 <编号>');
    const buyCmd = WanwuYouling._extCommands['购买'];
    if (buyCmd && typeof buyCmd.handler === 'function') {
      const payload = {
        uid, data, args, p1: shortId, p2: '', reply,
        save: () => { DB.save(uid, data); },
        getPet,
        DB, PetFactory, Battle, CONFIG, FOODS, SPECIES,
        get uid() { return uid; },
        get data() { return data; },
      };
      const result = buyCmd.handler(ctx, msg, payload);
      return result || seal.ext.newCmdExecuteResult(true);
    }
  }

  //   城镇系统
  if (action === '城镇' || action === 'town') {
    if (!p1) {
      // 显示所有城镇
      const lines = ['【城镇列表】'];
      for (const [id, town] of Object.entries(TOWNS)) {
        const region = REGIONS[town.region];
        lines.push(`${town.name} [${region?.name || town.region}]`);
        lines.push(`  ${town.desc}`);
      }
      lines.push('\n使用 .宠物 城镇 [城镇名] 查看详情');
      return reply(lines.join('\n'));
    }

    // 查找城镇
    const townId = Object.keys(TOWNS).find(id => TOWNS[id].name.includes(p1) || id.includes(p1));
    if (!townId) return reply('未找到该城镇');

    data.currentTown = townId;
    data.currentShopNpc = '';
    save();

    const town = TOWNS[townId];
    const region = REGIONS[town.region];
    const lines = [
      `【${town.name}】`,
      `所在地区: ${region?.name || town.region}`,
      `描述: ${town.desc}`,
      '',
      '【NPC列表】',
    ];
    for (const npcId of town.npcs) {
      const npc = NPCS[npcId];
      lines.push('• ' + npc.name + ': ' + npc.desc);
      if (npc.type === 'shop') {
        const townFoods = getCityFoodShop(townId);
        const preview = [...new Set([...getNpcSellList(npcId), ...townFoods])];
        lines.push(`  出售: ${preview.join('、')}`);
      }
    }
    lines.push('', '你已抵达该城镇，可直接购买本城特产');
    lines.push('使用 .宠物 NPC [NPC名] 与NPC交互');
    return reply(lines.join('\n'));
  }

  //   NPC交互  
  if (action === 'NPC' || action === 'npc') {
    if (!p1) return reply('请指定NPC名称，例如: .宠物 NPC 村长');

    // 查找NPC
    const npcId = Object.keys(NPCS).find(id => NPCS[id].name.includes(p1) || id.includes(p1));
    if (!npcId) return reply('未找到该NPC');

    const npc = NPCS[npcId];

    if (npc.type === 'shop') {
      // 商店NPC
      if (!getNpcSellList(npcId).length) return reply(`${npc.name} 暂无商品出售`);
      const townId = Object.keys(TOWNS).find(id => TOWNS[id].npcs.includes(npcId));
      if (townId) data.currentTown = townId;
      data.currentShopNpc = npcId;
      save();

      const cityFoods = townId ? getCityFoodShop(townId) : [];
      const npcSellList = getNpcSellList(npcId);
      const lines = [`【${npc.name}的商店】`];
      for (const item of npcSellList) {
        const food = FOODS[item];
        const baseItem = ITEMS[item];
        const price = food?.cost ?? baseItem?.cost;
        if (!price) continue;
        lines.push(`• ${item}: ${price}金币`);
      }
      if (cityFoods.length > 0) {
        lines.push('', '【本城特产】');
        for (const item of cityFoods) {
          const food = FOODS[item];
          if (!food) continue;
          const effects = [];
          if (food.hp) effects.push(`生命+${food.hp}`);
          if (food.atk) effects.push(`攻击+${food.atk}`);
          if (food.def) effects.push(`防御+${food.def}`);
          if (food.energy) effects.push(`精力+${food.energy}`);
          lines.push(`• ${item}: ${food.cost}金币 (${effects.join(', ')})`);
        }
      }
      lines.push('', '已进入当地商店，可直接使用 .宠物 购买 [物品名] [数量]');
      return reply(lines.join('\n'));
    } else {
      // 任务NPC
      const lines = [`【${npc.name}】`, npc.desc, ''];
      // 提供任务建议
      lines.push('你可以向这个NPC打听消息或接受任务');
      lines.push('使用 .宠物 任务 查看当前任务');
      return reply(lines.join('\n'));
    }
  }

  //   任务系统  
  if (action === '任务' || action === 'quest') {
    QuestManager.initPlayerQuests(data);

    if (!p1) {
      // 显示任务列表
      return reply(QuestManager.getQuestList(data));
    }

    if (p1 === '接受' || p1 === 'accept') {
      if (!p2) return reply('请指定任务名或任务ID，例如: .宠物 任务 接受 日常捕捉 或 .宠物 任务 接受 daily_catch');
      const result = QuestManager.acceptQuest(data, p2);
      save();
      return reply(result.msg);
    }

    if (p1 === '领取' || p1 === 'claim') {
      if (!p2) return reply('请指定任务名或任务ID，例如: .宠物 任务 领取 日常捕捉 或 .宠物 任务 领取 daily_catch');
      const result = QuestManager.claimReward(data, p2);
      save();
      return reply(result.msg);
    }

    return reply('用法: .宠物 任务 [接受/领取] [任务名或任务ID]');
  }

  //   进化系统
  if (action === '进化') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    const guardianKey = `${pet.species}:${pet.name}`;
    const evoChain = EVOLUTIONS[pet.species];
    if (!evoChain) return reply('该宠物无法进化');

    const currentStage = pet.evoStage || 0;
    const affection = pet.affection || 50;
    
    // 找出所有可能的进化选项
    const availableEvos = evoChain.filter(evo => {
      // 检查是否是从当前形态进化
      if (evo.from) {
        const fromList = Array.isArray(evo.from) ? evo.from : [evo.from];
        if (!fromList.includes(pet.name)) return false;
      } else {
        // 没有from字段的，检查阶数是否连续
        const expectedStage = currentStage === 0 ? 1 : (currentStage < 2 ? currentStage + 0.5 : currentStage + 1);
        if (Math.abs(evo.stage - expectedStage) > 0.1) return false;
      }
      
      // 检查等级
      if (pet.level < evo.level) return false;

      // 检查道具
      if ((data.items[evo.req.item] || 0) < evo.req.count) return false;

      // 检查特殊条件
      if (evo.condition) {
        if (evo.condition.element && pet.element !== evo.condition.element) return false;
        if (evo.condition.affection && affection < evo.condition.affection) return false;
      }

      // 第3阶进化：极高难度条件
      if (evo.stage === 3) {
        // 好感度必须满值100
        if (affection < 100) return false;
        // 需要击败过守护者Boss
        if (!data.guardianDefeated || !data.guardianDefeated[guardianKey]) return false;
      }

      return true;
    });

    if (availableEvos.length === 0) {
      // 显示进化预览
      const nextLevelEvos = evoChain.filter(evo => {
        if (evo.from) {
          const fromList = Array.isArray(evo.from) ? evo.from : [evo.from];
          return fromList.includes(pet.name);
        }
        return true;
      });
      
      if (nextLevelEvos.length === 0) return reply('已达最高进化形态');
      
      const lines = ['【进化预览】', `当前: ${pet.name} Lv.${pet.level} 好感度:${affection}`, ''];
      nextLevelEvos.forEach(evo => {
        const meetsLevel = pet.level >= evo.level;
        const meetsItem = (data.items[evo.req.item] || 0) >= evo.req.count;
        const meetsElement = !evo.condition?.element || pet.element === evo.condition.element;
        const meetsAffection = !evo.condition?.affection || affection >= evo.condition.affection;
        // 第3阶额外条件
        const meetsStage3Affection = evo.stage !== 3 || affection >= 100;
        const meetsGuardian = evo.stage !== 3 || (data.guardianDefeated && data.guardianDefeated[guardianKey]);

        let status = meetsLevel && meetsItem && meetsElement && meetsAffection && meetsStage3Affection && meetsGuardian ? '✓' : '✗';
        lines.push(`${status} ${evo.name} (Lv.${evo.level})`);
        lines.push(`   需要: ${evo.req.item}x${evo.req.count}`);
        if (evo.condition?.element) lines.push(`   属性: ${evo.condition.element} ${meetsElement ? '✓' : '✗'}`);
        if (evo.condition?.affection) lines.push(`   好感度: ${evo.condition.affection} ${meetsAffection ? '✓' : '✗'}`);
        // 第3阶特殊条件显示
        if (evo.stage === 3) {
          lines.push(`   [终极进化] 好感度100: ${meetsStage3Affection ? '✓' : '✗'}`);
          lines.push(`   [终极进化] 击败守护者: ${meetsGuardian ? '✓' : '✗'}`);
        }
      });
      return reply(lines.join('\n'));
    }

    // 如果只有一个选项，直接进化
    if (availableEvos.length === 1) {
      const evo = availableEvos[0];
      data.items[evo.req.item] -= evo.req.count;
      if (data.items[evo.req.item] <= 0) delete data.items[evo.req.item];

      const oldName = pet.name;
      pet.name = evo.name;
      pet.evoStage = evo.stage;
      pet.evolved = true;
      pet.maxBattles = 30;
      if (evo.bonus.hp) { pet.maxHp += evo.bonus.hp; pet.hp = pet.maxHp; }
      if (evo.bonus.atk) pet.atk += evo.bonus.atk;
      if (evo.bonus.def) pet.def += evo.bonus.def;
      if (evo.bonus.spd) pet.spd += evo.bonus.spd;
      if (evo.bonus.energy) pet.maxEnergy += evo.bonus.energy;
      if (evo.bonus.all) {
        pet.maxHp += evo.bonus.all; pet.hp = pet.maxHp;
        pet.atk += evo.bonus.all; pet.def += evo.bonus.all;
        pet.spd += evo.bonus.all;
        pet.maxEnergy += evo.bonus.all;
      }
      if (evo.bonus.skill && !pet.skills.includes(evo.bonus.skill)) {
        pet.skills.push(evo.bonus.skill);
      }
      save();
      WanwuYouling.emit('evolution', { uid, pet, oldSpecies: oldName, newSpecies: pet.name });
      return reply(`【进化成功】${oldName}进化为${pet.name}！\n${PetFactory.info(pet, parseInt(p1) - 1)}\n${getRandomTip()}`);
    }

    // 多个选项，显示分支选择
    const lines = ['【分支进化】', `${pet.name}可以进化为：`, ''];
    availableEvos.forEach((evo, i) => {
      const branchName = evo.branch || `分支${i + 1}`;
      lines.push(`${i + 1}. ${evo.name} (${branchName})`);
      if (evo.bonus.skill) lines.push(`   技能: ${evo.bonus.skill}`);
    });
    lines.push('');
    lines.push(`.宠物 进化 ${p1} <编号> 选择进化路线`);
    pet._availableEvos = availableEvos;
    save();
    return reply(lines.join('\n'));
  }

  // 进化分支选择
  if (action === '进化选择' || (action === '进化' && p2 && !isNaN(parseInt(p2)))) {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    const choiceIdx = parseInt(p2) - 1;
    const guardianKey = `${pet.species}:${pet.name}`;

    // 重新获取可用进化
    const evoChain = EVOLUTIONS[pet.species];
    if (!evoChain) return reply('该宠物无法进化');
    
    const currentStage = pet.evoStage || 0;
    const affection = pet.affection || 50;
    
    const availableEvos = evoChain.filter(evo => {
      if (evo.from) {
        const fromList = Array.isArray(evo.from) ? evo.from : [evo.from];
        if (!fromList.includes(pet.name)) return false;
      } else {
        const expectedStage = currentStage === 0 ? 1 : (currentStage < 2 ? currentStage + 0.5 : currentStage + 1);
        if (Math.abs(evo.stage - expectedStage) > 0.1) return false;
      }
      if (pet.level < evo.level) return false;
      if ((data.items[evo.req.item] || 0) < evo.req.count) return false;
      if (evo.condition) {
        if (evo.condition.element && pet.element !== evo.condition.element) return false;
        if (evo.condition.affection && affection < evo.condition.affection) return false;
      }
      if (evo.stage === 3) {
        if (affection < 100) return false;
        if (!data.guardianDefeated || !data.guardianDefeated[guardianKey]) return false;
      }
      return true;
    });

    if (choiceIdx < 0 || choiceIdx >= availableEvos.length) return reply('选择编号无效');
    
    const evo = availableEvos[choiceIdx];
    data.items[evo.req.item] -= evo.req.count;
    if (data.items[evo.req.item] <= 0) delete data.items[evo.req.item];

    const oldName = pet.name;
    pet.name = evo.name;
    pet.evoStage = evo.stage;
    pet.evolved = true;
    pet.maxBattles = 30;
    if (evo.bonus.hp) { pet.maxHp += evo.bonus.hp; pet.hp = pet.maxHp; }
    if (evo.bonus.atk) pet.atk += evo.bonus.atk;
    if (evo.bonus.def) pet.def += evo.bonus.def;
    if (evo.bonus.spd) pet.spd += evo.bonus.spd;
    if (evo.bonus.energy) pet.maxEnergy += evo.bonus.energy;
    if (evo.bonus.all) {
      pet.maxHp += evo.bonus.all; pet.hp = pet.maxHp;
      pet.atk += evo.bonus.all; pet.def += evo.bonus.all;
      pet.spd += evo.bonus.all;
      pet.maxEnergy += evo.bonus.all;
    }
    if (evo.bonus.skill && !pet.skills.includes(evo.bonus.skill)) {
      pet.skills.push(evo.bonus.skill);
    }
    save();
    WanwuYouling.emit('evolution', { uid, pet, oldSpecies: oldName, newSpecies: pet.name });
    return reply(`【进化成功】${oldName}进化为${pet.name}！\n${PetFactory.info(pet, parseInt(p1) - 1)}\n${getRandomTip()}`);
  }

  //   守护者挑战系统（第3阶进化前置条件）
  if (action === '守护者' || action === '挑战守护者') {
    const pet = getPet(p1);
    if (!pet) return reply('请指定正确的宠物编号');
    const guardianKey = `${pet.species}:${pet.name}`;

    const evoChain = EVOLUTIONS[pet.species];
    if (!evoChain) return reply('该宠物没有进化链');

    // 检查是否有第3阶进化
    const stage3Evo = evoChain.find(evo => evo.stage === 3);
    if (!stage3Evo) return reply('该宠物没有终极进化形态');

    // 检查是否已经击败过守护者
    if (data.guardianDefeated && data.guardianDefeated[guardianKey]) {
      return reply(`【守护者挑战】\n你已经击败过 ${pet.name} 的守护者，可以进行终极进化了！`);
    }

    // 检查等级和好感度
    if (pet.level < 50) return reply(`宠物等级不足50级，无法挑战守护者\n当前等级: ${pet.level}`);
    const affection = pet.affection || 50;
    if (affection < 100) return reply(`宠物好感度不足100，无法挑战守护者\n当前好感度: ${affection}`);

    // 创建守护者Boss
    const guardianName = stage3Evo.name.replace('神', '守护者').replace('·', '·') + '守护者';
    const guardian = {
      name: guardianName,
      species: pet.species,
      element: pet.element,
      level: Math.max(60, pet.level + 5),
      maxHp: 800 + pet.level * 20,
      hp: 800 + pet.level * 20,
      atk: 80 + pet.level * 3,
      def: 60 + pet.level * 2,
      spd: 100 + pet.level,
      maxEnergy: 150,
      energy: 150,
      skills: ['守护之击', '神圣护盾', '终极审判'],
      rarity: '传说',
    };

    const fighter = { ...pet };
    fighter.maxHp = pet.maxHp;
    fighter.hp = pet.hp;
    fighter.energy = pet.energy;

    const result = Battle.run(fighter, guardian);

    const logs = [`【守护者挑战】`, `${pet.name} VS ${guardianName}`, ''];
    logs.push(...result.logs);

    if (result.winner === fighter) {
      // 胜利
      if (!data.guardianDefeated) data.guardianDefeated = {};
      data.guardianDefeated[guardianKey] = true;
      // 同步战斗后的血量
      pet.hp = Math.max(1, fighter.hp);
      pet.energy = Math.max(0, fighter.energy);
      save();
      logs.push(`\n【胜利】你击败了 ${guardianName}！`);
      logs.push(`现在可以进行终极进化为 ${stage3Evo.name}！`);
      logs.push(`使用命令: .宠物 进化 ${p1}`);
    } else if (result.draw) {
      pet.hp = Math.max(1, fighter.hp);
      pet.energy = Math.max(0, fighter.energy - 20);
      save();
      logs.push(`\n【平局】守护者太强大了，再接再厉！`);
    } else {
      // 失败
      pet.hp = Math.max(1, fighter.hp);
      pet.energy = Math.max(0, fighter.energy - 30);
      save();
      logs.push(`\n【失败】${guardianName}太强大了...`);
      logs.push(`提升实力后再来挑战吧！`);
    }

    return reply(logs.join('\n'));
  }

  //   装备系统  
  if (action === '装备') {
    if (!p1) {
      // 显示装备列表
      if (!data.equipments || data.equipments.length === 0) return reply('你没有装备，战斗有几率掉落');
      const lines = ['【装备列表】'];
      data.equipments.forEach((e, i) => lines.push(`${i + 1}. [${e.rarity}]${e.name} (${e.type})`));
      return reply(lines.join('\n'));
    }
    const equipIdx = parseInt(p1);
    if (isNaN(equipIdx) || equipIdx < 1) return reply('请输入有效的装备编号');
    if (!data.equipments || !data.equipments[equipIdx - 1]) return reply('装备不存在');

    const pet = getPet(p2);
    if (!pet) return reply('用法: .宠物 装备 [装备编号] [宠物编号]');
    const equip = data.equipments[equipIdx - 1];

    // 装备
    if (!pet.equipments) pet.equipments = {};
    const oldEquip = pet.equipments[equip.type];

    // v3.6.10 修复：先扣除旧装备属性和技能
    if (oldEquip) {
      if (oldEquip.bonus.hp) { pet.maxHp -= oldEquip.bonus.hp; pet.hp = Math.min(pet.hp, pet.maxHp); }
      if (oldEquip.bonus.atk) pet.atk -= oldEquip.bonus.atk;
      if (oldEquip.bonus.def) pet.def -= oldEquip.bonus.def;
      if (oldEquip.bonus.spd) pet.spd -= oldEquip.bonus.spd;
      if (oldEquip.bonus.energy) pet.maxEnergy -= oldEquip.bonus.energy;
      // 移除旧装备技能
      if (oldEquip.skill && pet.skills) {
        pet.skills = pet.skills.filter(s => s !== oldEquip.skill);
      }
      data.equipments.push(oldEquip);
    }

    pet.equipments[equip.type] = equip;
    data.equipments.splice(equipIdx - 1, 1);

    // 应用新装备属性
    if (equip.bonus.hp) { pet.maxHp += equip.bonus.hp; pet.hp = Math.min(pet.hp + equip.bonus.hp, pet.maxHp); }
    if (equip.bonus.atk) pet.atk += equip.bonus.atk;
    if (equip.bonus.def) pet.def += equip.bonus.def;
    if (equip.bonus.spd) pet.spd += equip.bonus.spd;
    if (equip.bonus.energy) pet.maxEnergy += equip.bonus.energy;
    // v3.6.10 新增：添加装备技能
    if (equip.skill && !pet.skills.includes(equip.skill)) {
      pet.skills.push(equip.skill);
    }
    save();
    return reply(`${pet.name}装备了${equip.name}！${equip.skill ? `习得技能: ${equip.skill}` : ''}`);
  }

  //   图鉴系统  
  if (action === '图鉴') {
    return reply(PokedexManager.getList(data));
  }

  //   排行榜系统  
  if (action === '排行' || action === 'rank') {
    const type = p1 || 'power';
    const allData = {}; // 这里需要从全局存储获取所有玩家数据
    // 简化：只显示当前玩家排名
    const power = LeaderboardManager.calcPower(getPet(1) || { atk: 10, def: 10, hp: 50, spd: 100, level: 1 });
    return reply(`【排行榜】\n你的最高潜能: ${power}\n\n排行榜功能需要多玩家数据支持`);
  }

  //   副本系统
  if (action === '副本' || action === 'dungeon') {
    if (!p1) {
      const lines = ['【副本列表】'];
      for (const [n, d] of Object.entries(DUNGEONS)) {
        lines.push(`${n} - Boss:${d.boss} HP:${d.bossHp} ATK:${d.bossAtk}`);
      }
      lines.push('', '【难度】普通 / 困难 / 噩梦');
      lines.push('单人挑战: .宠物 副本 <副本名> [难度] [宠物编号]');
      lines.push('组队挑战: .宠物 组队 创建 <副本名> [难度]');
      return reply(lines.join('\n'));
    }

    const dungeonArgs = p2 ? p2.split(/\s+/) : [];
    let difficultyName = '普通';
    let petArg = '1';

    if (dungeonArgs.length > 0) {
      if (DUNGEON_DIFFICULTIES[dungeonArgs[0]]) {
        difficultyName = dungeonArgs[0];
        petArg = dungeonArgs[1] || '1';
      } else {
        petArg = dungeonArgs[0];
      }
    }

    const difficulty = DUNGEON_DIFFICULTIES[difficultyName];
    const pet = getPet(petArg);
    if (!pet) return reply('请指定宠物编号');
    const dungeon = getDungeonConfig(p1);
    if (!dungeon) return reply('副本不存在');
    if (pet.hp <= 0) return reply('宠物已阵亡，请先复活');
    if (pet.energy < difficulty.energyCost) return reply(`精力不足(需要${difficulty.energyCost})`);

    pet.energy -= difficulty.energyCost;

    const bossName = `${dungeon.boss}[${difficultyName}]`;
    let bossHp = Math.floor(dungeon.bossHp * difficulty.hp);
    const bossAtk = Math.floor(dungeon.bossAtk * difficulty.atk);
    const bossDef = Math.floor(dungeon.bossDef * difficulty.def);
    let petHp = pet.hp;
    const logs = [`【${bossName}战斗】`, `${pet.name} vs ${bossName}`];
    let round = 0;

    while (bossHp > 0 && petHp > 0 && round < 20) {
      round++;
      const petDamage = Math.max(1, pet.atk - bossDef + Math.floor(Math.random() * 20));
      bossHp -= petDamage;
      logs.push(`第${round}回合: ${pet.name}造成${petDamage}伤害`);
      if (bossHp <= 0) break;
      const bossDamage = Math.max(1, bossAtk - pet.def + Math.floor(Math.random() * 30));
      petHp -= bossDamage;
      logs.push(`${bossName}反击造成${bossDamage}伤害`);
    }

    pet.hp = Math.max(1, petHp);

    if (bossHp <= 0) {
      const minMoney = Math.floor(dungeon.rewards.money[0] * difficulty.reward);
      const maxMoney = Math.floor(dungeon.rewards.money[1] * difficulty.reward);
      const money = minMoney + Math.floor(Math.random() * Math.max(1, maxMoney - minMoney + 1));
      const item = dungeon.rewards.items[Math.floor(Math.random() * dungeon.rewards.items.length)];
      data.money += money;
      data.items[item] = (data.items[item] || 0) + 1;
      save();

      const resultLog = `【胜利】击败${bossName}！获得: ${money}金币, ${item}`;
      logs.push(resultLog);

      if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
        WebUIReporter.reportBattleLog({
          zone: p1,
          actor: myName || uid,
          target: bossName,
          result: 'win',
          turns: round,
          rewards: { exp: 0, gold: money },
          exp: 0,
          gold: money,
          logs: logs,
          logText: logs.join('\n'),
          tags: ['副本'],
        });
      }

      let replyLogs = logs.length > 15 ? logs.slice(0, 14) : logs.slice();
      if (logs.length > 15) {
          replyLogs.push('...（省略部分回合）...');
          replyLogs.push(resultLog);
      }
      return reply(replyLogs.join('\n'));
    } else {
      save();
      const resultLog = `【失败】被${bossName}击败...`;
      logs.push(resultLog);

      if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
        WebUIReporter.reportBattleLog({
          zone: p1,
          actor: myName || uid,
          target: bossName,
          result: 'lose',
          turns: round,
          rewards: { exp: 0, gold: 0 },
          exp: 0,
          gold: 0,
          logs: logs,
          logText: logs.join('\n'),
          tags: ['副本'],
        });
      }

      let replyLogs = logs.length > 15 ? logs.slice(0, 14) : logs.slice();
      if (logs.length > 15) {
          replyLogs.push('...（省略部分回合）...');
          replyLogs.push(resultLog);
      }
      return reply(replyLogs.join('\n'));
    }
  }
  //   公会系统
  if (action === '公会' || action === 'guild') {
    const usage = '用法: .宠物 公会 [信息/成员/签到/捐献/任务/商店/兑换/仓库/技能/Boss/公告/转让/任命/取消任命/踢出/日志/创建/加入/退出/恢复] [参数]';
    const gSub = actionArgs[1] || '';
    const gArg1 = actionArgs[2] || '';
    const gArg2 = actionArgs[3] || '';
    const gRest = actionArgs.slice(1).join(' ');
    if (!p1 || p1 === '信息') {
      const info = GuildManager.getGuildInfo(uid, data);
      save();
      return reply(info + '\n\n' + usage);
    }
    if (p1 === '创建') {
      const result = GuildManager.createGuild(uid, data, gRest);
      save();
      return reply(result.msg);
    }
    if (p1 === '加入') {
      const result = GuildManager.joinGuild(uid, data, gRest);
      save();
      return reply(result.msg);
    }
    if (p1 === '退出') {
      const result = GuildManager.leaveGuild(uid, data);
      save();
      return reply(result.msg);
    }
    if (p1 === '成员') return reply(GuildManager.formatMembers(uid, data));
    if (p1 === '签到') {
      const result = GuildManager.checkIn(uid, data);
      save();
      return reply(result.msg);
    }
    if (p1 === '捐献') {
      const result = GuildManager.donate(uid, data, gSub);
      save();
      return reply(result.msg);
    }
    if (p1 === '任务') {
      if (gSub === '领取') {
        const result = GuildManager.claimTask(uid, data, gArg1, gArg2);
        save();
        return reply(result.msg);
      }
      return reply(GuildManager.formatTasks(uid, data, gSub));
    }
    if (p1 === '公告') {
      const result = GuildManager.setNotice(uid, data, gRest);
      save();
      return reply(result.msg);
    }
    if (p1 === '转让') {
      const result = GuildManager.transfer(uid, data, atUserId || gRest);
      save();
      return reply(result.msg);
    }
    if (p1 === '任命') {
      const result = GuildManager.appoint(uid, data, atUserId || gRest, true);
      save();
      return reply(result.msg);
    }
    if (p1 === '取消任命') {
      const result = GuildManager.appoint(uid, data, atUserId || gRest, false);
      save();
      return reply(result.msg);
    }
    if (p1 === '踢出') {
      const result = GuildManager.kick(uid, data, atUserId || gRest);
      save();
      return reply(result.msg);
    }
    if (p1 === '日志') return reply(GuildManager.formatLogs(uid, data));
    if (p1 === '商店') return reply(GuildManager.formatShop(uid, data));
    if (p1 === '兑换') {
      const result = GuildManager.buyShop(uid, data, gRest);
      save();
      return reply(result.msg);
    }
    if (p1 === '仓库') {
      if (!gSub) return reply(GuildManager.formatStorage(uid, data));
      const result = gSub === '存入'
        ? GuildManager.storageDeposit(uid, data, gArg1, gArg2 || '1')
        : gSub === '取出'
          ? GuildManager.storageWithdraw(uid, data, gArg1, gArg2 || '1')
          : { msg: '用法: .宠物公会 仓库 [存入/取出] <道具> [数量]' };
      save();
      return reply(result.msg);
    }
    if (p1 === '技能') {
      if (!gSub) return reply(GuildManager.formatSkills(uid, data));
      if (gSub === '升级') {
        const result = GuildManager.upgradeSkill(uid, data, actionArgs.slice(2).join(' '));
        save();
        return reply(result.msg);
      }
      return reply(GuildManager.formatSkills(uid, data));
    }
    if (p1 === 'Boss' || p1 === 'boss') {
      if (!gSub) return reply(GuildManager.formatBoss(uid, data));
      if (gSub === '排行' || gSub === 'rank') return reply(GuildManager.formatBossRank(uid, data));
      if (gSub === '历史' || gSub === 'history') return reply(GuildManager.formatBossHistory(uid, data));
      if (gSub === '难度' || gSub === 'difficulty') {
        const result = GuildManager.setBossDifficulty(uid, data, gArg1 || '普通');
        save();
        return reply(result.msg);
      }
      if (gSub === '攻击' || gSub === 'attack') {
        const pet = getPet(gArg1 || '1');
        const result = GuildManager.attackBoss(uid, data, pet);
        save();
        return reply(result.msg);
      }
      return reply('用法: .宠物公会 Boss [攻击/排行/难度/历史] [参数]');
    }
    if (p1 === '恢复' || p1 === '重建') {
      const result = GuildManager.rebuildGuildFromUsers(gRest || data.guild, uid, data);
      save();
      return reply(result.msg);
    }
    return reply(usage);
  }

  //   组队系统
  if (action === '组队' || action === 'team') {
    if (!p1) {
      const myTeam = TeamManager.getUserTeam(uid);
      if (myTeam) {
        const difficultyText = myTeam.difficulty || '普通';
        const lines = [`【当前队伍】副本: ${myTeam.dungeon} [${difficultyText}]`];
        myTeam.members.forEach((m, i) => lines.push(`${i + 1}. ${m.name} (宠物${m.petIdx + 1})`));
        lines.push(`\n状态: ${myTeam.status === 'recruiting' ? '招募中' : '战斗中'}`);
        lines.push('.宠物 组队 设宠 <编号> - 设置出战宠物');
        if (myTeam.leader === uid) lines.push('.宠物 组队 开始 - 开始战斗');
        lines.push('.宠物 组队 退出 - 退出队伍');
        return reply(lines.join('\n'));
      }
      const teams = TeamManager.getRecruitingTeams();
      if (teams.length === 0) {
        return reply('暂无招募中的队伍\n.宠物 组队 创建 <副本名> [难度] - 创建队伍');
      }
      const lines = ['【招募中的队伍】'];
      teams.forEach(t => lines.push(`${t.dungeon} [${t.difficulty || '普通'}] - 队长:${t.leaderName} (${t.members.length}/4)`));
      lines.push('\n.宠物 组队 加入 @队长 - 加入队伍');
      lines.push('.宠物 组队 创建 <副本名> [难度] - 创建队伍');
      return reply(lines.join('\n'));
    }
    if (p1 === '创建') {
      const createArgs = actionFromCmd ? args.slice(1) : args.slice(2);
      const dungeonName = createArgs[0] || '';
      const diffArg = createArgs[1] || '普通';

      if (!dungeonName) return reply('用法: .宠物 组队 创建 <副本名/世界Boss> [难度]');
      const teamDifficulty = DUNGEON_DIFFICULTIES[diffArg] ? diffArg : '普通';
      // 检查是否是世界Boss或普通副本
      if (dungeonName !== '世界Boss' && !getDungeonConfig(dungeonName)) return reply('副本不存在，可选: 迷雾深渊/熔岩地狱/冰霜王座/虚空裂隙/森林回廊/沙海遗墓/雷鸣穹顶/星辉神殿/世界Boss');
      if (dungeonName === '世界Boss') {
        const spawnResult = WorldBossManager.checkAndSpawn();
        if (!spawnResult.boss) return reply('当前没有世界Boss');
      }
      const result = TeamManager.createTeam(uid, myName || '玩家', dungeonName, teamDifficulty);
      return reply(result.msg);
    }
    if (p1 === '加入') {
      const targetUid = atUserId;
      if (!targetUid) return reply('用法: .宠物 组队 加入 @队长');
      const teams = TeamManager.getRecruitingTeams();
      const team = teams.find(t => t.leader === targetUid);
      if (!team) return reply('该玩家没有招募中的队伍');
      const result = TeamManager.joinTeam(team.id, uid, myName || '玩家');
      return reply(result.msg);
    }
    if (p1 === '退出') {
      const myTeam = TeamManager.getUserTeam(uid);
      if (!myTeam) return reply('你不在任何队伍中');
      const result = TeamManager.leaveTeam(myTeam.id, uid);
      return reply(result.msg);
    }
    if (p1 === '设宠' || p1 === 'setpet') {
      const myTeam = TeamManager.getUserTeam(uid);
      if (!myTeam) return reply('你不在任何队伍中');
      const petIdx = parseInt(p2) || 1;
      if (petIdx < 1 || petIdx > data.pets.length) return reply('宠物编号无效');
      const result = TeamManager.setPet(myTeam.id, uid, petIdx - 1);
      return reply(result.msg);
    }
    if (p1 === '开始') {
      const myTeam = TeamManager.getUserTeam(uid);
      if (!myTeam) return reply('你不在任何队伍中');
      if (myTeam.leader !== uid) return reply('只有队长可以开始战斗');

      // 检查是世界Boss还是普通副本
      const isWorldBoss = myTeam.dungeon === '世界Boss';
      const difficultyName = myTeam.difficulty || '普通';
      const difficulty = DUNGEON_DIFFICULTIES[difficultyName] || DUNGEON_DIFFICULTIES['普通'];
      let bossData = null;

      if (isWorldBoss) {
        const spawnResult = WorldBossManager.checkAndSpawn();
        if (!spawnResult.boss) return reply('当前没有世界Boss');
        bossData = {
          name: spawnResult.boss.name,
          bossHp: spawnResult.boss.currentHp,
          bossAtk: spawnResult.boss.atk,
          bossDef: spawnResult.boss.def,
          maxHp: spawnResult.boss.maxHp,
        };
      } else {
        const baseDungeon = getDungeonConfig(myTeam.dungeon);
        if (!baseDungeon) return reply('副本不存在');
        bossData = {
          ...baseDungeon,
          name: `${baseDungeon.boss}[${difficultyName}]`,
          bossHp: Math.floor(baseDungeon.bossHp * difficulty.hp),
          bossAtk: Math.floor(baseDungeon.bossAtk * difficulty.atk),
          bossDef: Math.floor(baseDungeon.bossDef * difficulty.def),
          rewards: {
            ...baseDungeon.rewards,
            money: [
              Math.floor(baseDungeon.rewards.money[0] * difficulty.reward),
              Math.floor(baseDungeon.rewards.money[1] * difficulty.reward),
            ],
          },
        };
      }

      const fighters = [];
      const skipped = [];
      const teamSnapshot = JSON.parse(JSON.stringify(myTeam));
      WorldBossManager.load();
      for (const member of teamSnapshot.members) {
        const memberData = DB.get(member.uid);
        if (memberData && memberData.pets.length > 0) {
          // 如果没有设置宠物或设置的宠物不存在，使用最强宠物
          let petIdx = Math.max(0, Number(member.petIdx) || 0);
          let pet = memberData.pets[petIdx];
          if (!pet) {
            pet = PetFactory.getStrongestPet(memberData.pets);
            petIdx = Math.max(0, memberData.pets.indexOf(pet));
          }
          const energyCost = isWorldBoss ? 20 : difficulty.energyCost;
          const challenge = isWorldBoss ? WorldBossManager.canChallenge(member.uid) : { success: true };
          if (!challenge.success) {
            skipped.push(`${member.name}(${challenge.msg})`);
            continue;
          }
          if (pet && pet.hp > 0 && pet.energy >= energyCost) {
            if (isWorldBoss) {
              const consumed = WorldBossManager.consumeAttempt(member.uid);
              if (!consumed.success) {
                skipped.push(`${member.name}(${consumed.msg})`);
                continue;
              }
            }
            pet.energy -= energyCost;
            const fighter = JSON.parse(JSON.stringify(pet));
            fighter._teamUid = member.uid;
            fighter._teamPetIdx = petIdx;
            fighters.push({ pet, fighter, name: member.name, uid: member.uid, data: memberData, damage: 0 });
          } else if (pet) {
            skipped.push(`${member.name}(${pet.hp <= 0 ? '宠物已阵亡' : `精力不足，需要${energyCost}点`})`);
          }
        } else {
          skipped.push(`${member.name}(没有宠物)`);
        }
      }
      if (fighters.length === 0) return reply(skipped.length ? `没有可出战的宠物\n${skipped.join('\n')}` : '没有可出战的宠物');

      const teamSize = fighters.length;
      const hpScale = isWorldBoss ? 1 : (1 + Math.max(0, teamSize - 1) * 0.5);
      const bossMaxHp = Math.floor((isWorldBoss ? bossData.maxHp : bossData.bossHp) * hpScale);
      const bossFighter = {
        id: 'team_boss_' + Date.now(),
        name: bossData.name,
        species: bossData.name,
        element: bossData.element || '超能',
        rarity: '普通',
        level: Math.max(1, Math.floor((bossData.bossAtk || 80) / 10)),
        maxHp: bossMaxHp,
        hp: Math.floor(bossData.bossHp * hpScale),
        atk: bossData.bossAtk,
        def: bossData.bossDef,
        spd: bossData.spd || 100,
        maxEnergy: 999,
        energy: 999,
        skills: bossData.skills || ['冲撞'],
      };
      const logs = [
        `【组队${isWorldBoss ? '世界Boss' : '副本'}】${teamSnapshot.dungeon}${isWorldBoss ? '' : ` [${difficultyName}]`}`,
        `队伍 vs ${bossData.name}`,
        `参战人数: ${teamSize}人，敌方生命倍率 x${hpScale.toFixed(1)}`,
        `敌方生命: ${bossFighter.hp}/${bossFighter.maxHp}`,
      ];
      if (skipped.length) logs.push(`未参战: ${skipped.join('、')}`);

      const primary = fighters[0].fighter;
      const ally = fighters[1]?.fighter || null;
      const result = Battle.run(primary, bossFighter, ally);
      pushCompactBattleLogs(logs, result.logs, CONFIG.battleLogLimit);

      const totalDamage = Math.min(bossMaxHp, Math.max(0, bossMaxHp - Math.max(0, bossFighter.hp)));
      fighters.forEach(f => {
        const beforeHp = f.pet.hp;
        if (f.fighter === primary || f.fighter === ally) {
          applyBattleInjuryCap(f.pet, f.fighter.hp);
        }
        f.damage = Math.floor(totalDamage / fighters.length);
        if (f === fighters[fighters.length - 1]) {
          f.damage += totalDamage - fighters.reduce((sum, item) => sum + (item.damage || 0), 0);
        }
        f.pet.hp = Math.max(1, f.pet.hp || beforeHp);
        DB.save(f.uid, f.data);
      });
      TeamManager.completeTeam(myTeam.id);

      if (result.winner === primary || result.winner === ally || bossFighter.hp <= 0) {
        logs.push(`\n【胜利】击败${bossData.name}！`);

        if (isWorldBoss) {
          const damageByUid = {};
          fighters.forEach(f => { damageByUid[f.uid] = (damageByUid[f.uid] || 0) + (f.damage || 0); });
          const bossResult = WorldBossManager.applyTeamDamage(damageByUid, fighters, uid, myName || '队伍');
          if (!bossResult.success) return reply(bossResult.msg);
          const rewards = Array.isArray(bossResult.rewards) ? bossResult.rewards : [];
          if (rewards.length) {
            logs.push('【世界Boss结算】');
            rewards.forEach(r => logs.push(`${r.name}: ${r.money}金币, ${r.item}（${r.damage}伤害）`));
          } else {
            logs.push('无达标奖励成员');
          }
          
          if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
            WebUIReporter.reportBattleLog({
              zone: '世界Boss',
              actor: myName || uid,
              target: bossData.name,
              result: 'win',
              turns: result.logs ? result.logs.filter(l => l.includes('回合')).length : 0,
              rewards: { exp: 0, gold: 0 },
              exp: 0,
              gold: 0,
              logs: logs,
              logText: logs.join('\n'),
              tags: ['世界Boss', '多人'],
            });
          }
        } else {
          const moneyEach = bossData.rewards.money[0] + Math.floor(Math.random() * Math.max(1, bossData.rewards.money[1] - bossData.rewards.money[0] + 1));
          const item = bossData.rewards.items[Math.floor(Math.random() * bossData.rewards.items.length)];
          for (const f of fighters) {
            f.data.money = (f.data.money || 0) + moneyEach;
            f.data.items = f.data.items || {};
            f.data.items[item] = (f.data.items[item] || 0) + 1;
            DB.save(f.uid, f.data);
            logs.push(`${f.name}获得: ${moneyEach}金币, ${item}`);
          }

          if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
            WebUIReporter.reportBattleLog({
              zone: '世界Boss',
              actor: myName || uid,
              target: bossData.name,
              result: 'win',
              turns: result.logs ? result.logs.filter(l => l.includes('回合')).length : 0,
              rewards: { exp: 0, gold: moneyEach },
              exp: 0,
              gold: moneyEach,
              logs: logs,
              logText: logs.join('\n'),
              tags: ['世界Boss', '多人'],
            });
          }
        }
        // 群聊回复截断长日志
        let replyLogs = logs.length > 15 ? logs.slice(0, 14) : logs.slice();
        if (logs.length > 15) replyLogs.push('...（省略部分回合）...');
        return reply(replyLogs.join('\n'));
      } else {
        if (isWorldBoss) {
          const damageByUid = {};
          fighters.forEach(f => { damageByUid[f.uid] = (damageByUid[f.uid] || 0) + (f.damage || 0); });
          const bossResult = WorldBossManager.applyTeamDamage(damageByUid, fighters, uid, myName || '队伍');
          if (!bossResult.success) return reply(bossResult.msg);
          logs.push(`\n【撤退】对${bossData.name}造成${bossResult.damage}点伤害`);
          logs.push(`Boss剩余HP: ${bossResult.currentHp}/${bossResult.maxHp}`);
          
          if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
            WebUIReporter.reportBattleLog({
              zone: '世界Boss',
              actor: myName || uid,
              target: bossData.name,
              result: 'draw',
              turns: result.logs ? result.logs.filter(l => l.includes('回合')).length : 0,
              rewards: { exp: 0, gold: 0 },
              exp: 0,
              gold: 0,
              logs: logs,
              logText: logs.join('\n'),
              tags: ['世界Boss', '多人'],
            });
          }
        } else {
          logs.push(`\n【失败】被${bossData.name}击败...`);

          if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
            WebUIReporter.reportBattleLog({
              zone: '世界Boss',
              actor: myName || uid,
              target: bossData.name,
              result: 'lose',
              turns: result.logs ? result.logs.filter(l => l.includes('回合')).length : 0,
              rewards: { exp: 0, gold: 0 },
              exp: 0,
              gold: 0,
              logs: logs,
              logText: logs.join('\n'),
              tags: ['世界Boss', '多人'],
            });
          }
        }
        // 群聊回复截断长日志
        let replyLogs = logs.length > 15 ? logs.slice(0, 14) : logs.slice();
        if (logs.length > 15) replyLogs.push('...（省略部分回合）...');
        return reply(replyLogs.join('\n'));
      }
    }
    return reply('用法: .宠物 组队 [创建/加入/退出/开始]');
  }
  //   世界Boss系统
  if (action === '世界Boss' || action === 'worldboss') {
    // 检查并自动刷新世界Boss
    const spawnResult = WorldBossManager.checkAndSpawn();
    
    if (!p1) {
      if (!spawnResult.boss) {
        const nextSpawn = WorldBossManager.getNextSpawnTime();
        return reply(`【世界Boss】当前没有世界Boss\n刷新时间: 每天 12:00、18:00、22:00\n下次刷新: ${nextSpawn}`);
      }
      const boss = spawnResult.boss;
      const lines = [
        `【世界Boss】${boss.name}`,
        `HP: ${boss.currentHp}/${boss.maxHp} (${Math.floor(boss.currentHp / boss.maxHp * 100)}%)`,
        `出现时间: ${new Date(boss.spawnTime).toLocaleString()}`,
        '\n.宠物 世界Boss 攻击 <宠物编号> - 攻击世界Boss',
        '.宠物 世界Boss 排行 - 查看伤害排行',
      ];
      if (spawnResult.spawned) {
        lines.unshift('🌟 【世界Boss降临】');
      }
      return reply(lines.join('\n'));
    }
    if (p1 === '攻击' || p1 === 'attack') {
      if (!spawnResult.boss) return reply('当前没有世界Boss');
      const pet = getPet(p2 || '1');
      if (!pet) return reply('请指定宠物编号');
      if (pet.hp <= 0) return reply('宠物已阵亡');
      const result = WorldBossManager.attackBoss(uid, myName || '玩家', pet);
      if (!result.success) return reply(result.msg);
      save();
      const lines = [`【攻击世界Boss】`, `${pet.name}造成${result.damage}伤害`, `Boss HP: ${result.currentHp}/${result.maxHp}`, `${pet.name}受到${result.counterDamage}反击伤害`];
      
      if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
        WebUIReporter.reportBattleLog({
          zone: '世界Boss',
          actor: myName || uid,
          target: spawnResult.boss.name,
          result: result.killed ? 'win' : 'draw',
          turns: 1,
          rewards: { exp: 0, gold: 0 },
          exp: 0,
          gold: 0,
          logs: lines,
          logText: lines.join('\n'),
          tags: ['世界Boss'],
        });
      }

      if (result.killed) {
        lines.push('\n【击杀成功】世界Boss已被击败！');
        const rewards = Array.isArray(result.rewards) ? result.rewards : [];
        if (rewards.length) {
          lines.push('【结算奖励】');
          rewards.forEach(r => lines.push(`${r.name}: ${r.money}金币、${r.item}x1（${r.damage}伤害）`));
        } else {
          lines.push('无达标奖励成员');
        }
      }
      // 群聊回复截断长日志
      let replyLines = lines.length > 15 ? lines.slice(0, 14) : lines.slice();
      if (lines.length > 15) replyLines.push('...（省略部分回合）...');
      return reply(replyLines.join('\n'));
    }
    if (p1 === '排行' || p1 === 'rank') {
      if (!spawnResult.boss) return reply('当前没有世界Boss');
      const rank = WorldBossManager.getDamageRank();
      if (rank.length === 0) return reply('暂无伤害记录');
      const lines = ['【世界Boss伤害排行】'];
      rank.forEach(r => lines.push(`${r.rank}. ${r.uid.replace('QQ:', '')} - ${r.damage}伤害`));
      return reply(lines.join('\n'));
    }
    return reply('用法: .宠物 世界Boss [攻击/排行]');
  }

  //   出售系统
  if (action === '出售' || action === 'sell') {
    if (!p1) return reply('用法: .宠物 出售 [物品名/宠物编号] [数量]\n      编号: 1-3队伍, 4-18仓库\n      挂售到市场: .宠物 挂售 [物品名/编号] [价格]\n      说明: 装备/技能书/道具也可以出售给系统，系统默认以 10 金币回收装备/技能书。');

    // 首先检查是否是出售装备/技能书/道具
    const playerItems = data.playerItems || {};
    const items = data.items || {};
    
    // 检查是否是玩家装备或技能书
    let isEquipOrBook = false;
    for (const [type, typeItems] of Object.entries(PLAYER_EQUIPMENT)) {
      if (typeItems[p1]) isEquipOrBook = true;
    }
    if (PLAYER_SKILL_BOOKS[p1]) isEquipOrBook = true;

    if (isEquipOrBook) {
      if (!playerItems[p1] || playerItems[p1] <= 0) return reply(`你没有 ${p1}`);
      const count = Math.max(1, parseInt(p2) || 1);
      if (playerItems[p1] < count) return reply(`你的 ${p1} 数量不足，当前拥有: ${playerItems[p1]}`);

      const price = 10; // 系统回收固定价格 10 金币
      const total = price * count;
      
      playerItems[p1] -= count;
      if (playerItems[p1] <= 0) delete playerItems[p1];
      data.money += total;
      save();
      
      return reply(`【系统回收】\n出售了 ${p1} x${count}\n获得: ${total}金币\n当前金币: ${data.money}`);
    }
    
    // 检查是否是普通道具
    if (ITEMS[p1]) {
      if (!items[p1] || items[p1] <= 0) return reply(`你没有 ${p1}`);
      const count = Math.max(1, parseInt(p2) || 1);
      if (items[p1] < count) return reply(`你的 ${p1} 数量不足，当前拥有: ${items[p1]}`);
      
      const price = Math.max(1, Math.floor((ITEMS[p1].cost || 10) * 0.5)); // 系统半价回收道具
      const total = price * count;
      
      items[p1] -= count;
      if (items[p1] <= 0) delete items[p1];
      data.money += total;
      save();
      
      return reply(`【系统回收】\n出售了 ${p1} x${count}\n获得: ${total}金币\n当前金币: ${data.money}`);
    }

    // 原有的宠物出售逻辑
    const pet = getPet(parseInt(p1));
    if (!pet) return reply('宠物或物品不存在');

    const basePrice = {
      '普通': 50,
      '稀有': 150,
      '超稀有': 500,
      '传说': 2000,
    };
    const buyPrice = Math.floor((basePrice[pet.rarity] || 50) * (1 + pet.level * 0.1));
    const sellPrice = Math.floor(buyPrice * 1.5);
    removePet(parseInt(p1));
    data.money += buyPrice;
    save();

    // 添加到保护机构市场
    const shelterMarket = WanwuYouling.getShelterMarket();
    const listingId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    shelterMarket[listingId] = {
      pet,
      price: sellPrice,
      time: Date.now(),
      expire: Date.now() + 24 * 60 * 60 * 1000,
    };
    WanwuYouling.saveShelterMarket(shelterMarket);

    return reply(`【生灵保护机构收购】\n${pet.name} → ${buyPrice}金币\n将以${sellPrice}金币上架，编号: #${listingId.slice(-4)}\n1天后放生\n.宠物 机构 查看`);
  }
  //   繁殖优化  
  if (action === '繁殖') {
    if (!p1 || !p2) return reply('用法: .宠物 繁殖 [宠物1编号] [宠物2编号]');
    const result = BreedManager.breed(data, parseInt(p1), parseInt(p2));
    save();
    return reply(result.msg);
  }

  //   玩家系统  
  if (action === '训练师' || action === 'player') {
    const player = data.player;
    const totalAttr = player.str + player.agi + player.int + player.vit;
    const equipBonus = { str: 0, agi: 0, int: 0, vit: 0 };

    // 计算装备加成
    for (const slot of Object.values(player.equipment || {})) {
      if (slot) {
        for (const attr of ['str', 'agi', 'int', 'vit']) {
          if (slot[attr]) equipBonus[attr] += slot[attr];
        }
      }
    }

    const lines = [
      `【训练师信息】`,
      `等级: Lv.${player.level}`,
      `经验: ${player.exp}/${PLAYER_EXP_TABLE[player.level] || player.level * 500}`,
      '',
      `【属性】(装备加成)`,
      `力量: ${player.str} (+${equipBonus.str}) - 宠物攻击+${Math.floor((player.str + equipBonus.str - 10) * 0.5)}%`,
      `敏捷: ${player.agi} (+${equipBonus.agi}) - 宠物速度+${Math.floor((player.agi + equipBonus.agi - 10) * 0.5)}%`,
      `智力: ${player.int} (+${equipBonus.int}) - 宠物精力+${Math.floor((player.int + equipBonus.int - 10) * 0.5)}%`,
      `体质: ${player.vit} (+${equipBonus.vit}) - 宠物生命+${Math.floor((player.vit + equipBonus.vit - 10) * 0.5)}%`,
      '',
      `【装备】`,
      `武器: ${player.equipment?.weapon?.name || '无'}`,
      `护甲: ${player.equipment?.armor?.name || '无'}`,
      `饰品: ${player.equipment?.accessory?.name || '无'}`,
      '',
      `【技能】`,
      player.skills?.length > 0 ? player.skills.map(s => `${s}: ${PLAYER_SKILL_BOOKS[s]?.desc || ''}`).join('\n') : '未学习任何技能',
    ];
    return reply(lines.join('\n'));
  }

  if (action === '装备玩家' || action === 'equip') {
    if (!p1) {
      // 显示玩家装备背包
      const playerItems = data.playerItems || {};
      const lines = ['【玩家装备背包】'];
      let hasItem = false;
      for (const [type, items] of Object.entries(PLAYER_EQUIPMENT)) {
        for (const [name, item] of Object.entries(items)) {
          if (playerItems[name] > 0) {
            lines.push(`[${item.rarity}]${name} x${playerItems[name]}`);
            hasItem = true;
          }
        }
      }
      if (!hasItem) lines.push('暂无装备，战斗有几率掉落');
      lines.push('\n使用 .宠物 装备玩家 [装备名] 装备');
      return reply(lines.join('\n'));
    }

    // 查找装备
    let equipData = null;
    let equipType = null;
    for (const [type, items] of Object.entries(PLAYER_EQUIPMENT)) {
      if (items[p1]) {
        equipData = items[p1];
        equipType = type;
        break;
      }
    }

    if (!equipData) return reply('未找到该装备');

    // 检查是否拥有
    const playerItems = data.playerItems || {};
    if (!playerItems[p1] || playerItems[p1] <= 0) {
      return reply('你没有这件装备');
    }

    // 装备
    const player = data.player;
    if (!player.equipment) player.equipment = { weapon: null, armor: null, accessory: null };

    // 卸下旧装备：返还背包并扣除属性
    const oldEquip = player.equipment[equipType];
    if (oldEquip) {
      playerItems[oldEquip.name] = (playerItems[oldEquip.name] || 0) + 1;
      // 扣除旧装备属性（保底下限为1）
      if (oldEquip.str) player.str = Math.max(1, player.str - oldEquip.str);
      if (oldEquip.agi) player.agi = Math.max(1, player.agi - oldEquip.agi);
      if (oldEquip.int) player.int = Math.max(1, player.int - oldEquip.int);
      if (oldEquip.vit) player.vit = Math.max(1, player.vit - oldEquip.vit);
    }

    // 穿上新装备：扣除背包并应用属性
    player.equipment[equipType] = { name: p1, ...equipData };
    playerItems[p1]--;
    if (playerItems[p1] <= 0) delete playerItems[p1];
    // 应用新装备属性
    if (equipData.str) player.str = (player.str || 10) + equipData.str;
    if (equipData.agi) player.agi = (player.agi || 10) + equipData.agi;
    if (equipData.int) player.int = (player.int || 10) + equipData.int;
    if (equipData.vit) player.vit = (player.vit || 10) + equipData.vit;

    data.playerItems = playerItems;
    save();
    return reply(`已装备 [${equipData.rarity}]${p1}\n${equipData.desc}`);
  }

  if (action === '学习技能') {
    if (!p1) {
      const lines = ['【玩家技能书】'];
      const playerItems = data.playerItems || {};
      let hasBook = false;
      for (const [name, book] of Object.entries(PLAYER_SKILL_BOOKS)) {
        if (playerItems[name] > 0) {
          const learned = data.player.skills?.includes(name);
          lines.push(`[${book.rarity}]${name} x${playerItems[name]} ${learned ? '(已学习)' : ''}`);
          lines.push(`  ${book.desc}`);
          hasBook = true;
        }
      }
      if (!hasBook) lines.push('暂无技能书');
      lines.push('\n使用 .宠物 学习技能 [技能名] 学习');
      return reply(lines.join('\n'));
    }

    const book = PLAYER_SKILL_BOOKS[p1];
    if (!book) return reply('未找到该技能书');

    const playerItems = data.playerItems || {};
    if (!playerItems[p1] || playerItems[p1] <= 0) {
      return reply('你没有这本技能书');
    }

    if (data.player.skills?.includes(p1)) {
      return reply('已经学习过这个技能了');
    }

    // 学习技能
    data.player.skills = data.player.skills || [];
    data.player.skills.push(p1);
    playerItems[p1]--;
    if (playerItems[p1] <= 0) delete playerItems[p1];
    data.playerItems = playerItems;
    save();
    return reply(`【技能学习成功】\n${p1}: ${book.desc}\n${getRandomTip()}`);
  }

  //   神话宠物  
  if (action === '神话' || action === 'legendary') {
    const lines = ['【神话宠物录】', ''];
    for (const [name, legend] of Object.entries(LEGENDARY_PETS)) {
      const captured = LegendaryManager.isCaptured(name);
      const capturedBy = LegendaryManager.getCapturedBy(name);
      const status = captured ? `✓已被${capturedBy || '某位训练师'}捕获` : '?尚未现身';
      lines.push(`【${name}】`);
      lines.push(`  ${legend.desc}`);
      lines.push(`  属性: ${legend.element} | 状态: ${status}`);
      lines.push(`  被动: ${legend.passive}`);
      lines.push(`  出现条件: ${legend.spawnCondition.region} | ${legend.spawnCondition.weather} | ${legend.spawnCondition.time} | 等级${legend.spawnCondition.playerLevel}+`);
      lines.push(`  基础捕捉率: ${(legend.catchRate * 100).toFixed(1)}%`);
      lines.push('');
    }
    lines.push('提示: 神话宠物全服唯一，捕获后其他玩家无法再获得');
    lines.push('使用"神话召唤石"可提升出现概率');
    lines.push('使用"神话契约"可提升捕捉概率');
    return reply(lines.join('\n'));
  }

  //   Mod管理
  if (action === 'mod') {
    const isOwner = ctx.privilegeLevel >= 100;
    if (!isOwner) {
      return reply('【权限不足】\nWebUI Mod 命令仅限骰主使用。');
    }
    const mods = WanwuYouling.getMods();

    // .宠物 mod 列表 - 查看WebUI可用Mod
    if (p1 === '列表' || p1 === 'list') {
      if (!WebUIReporter.config.enabled) {
        return reply('【WebUI未启用】\n请先配置并启用WebUI:\n.宠物 webui 配置 <端点> <Token>\n.宠物 webui 启用');
      }
      reply('正在从WebUI拉取Mod列表...');
      const webMods = await WebUIReporter.fetchMods();
      if (!webMods.length) {
        return reply('【WebUI Mod列表】\n暂无可用Mod');
      }
      const installed = WebUIReporter.getInstalledMods();
      const lines = ['【WebUI Mod列表】', ''];
      for (const mod of webMods) {
        const isInstalled = installed.includes(mod.id);
        const status = isInstalled ? '[已安装]' : '[可安装]';
        lines.push(`${status} ${mod.name} (${mod.type})`);
        lines.push(`  ID: ${mod.id}`);
        if (mod.description) lines.push(`  ${mod.description}`);
        lines.push('');
      }
      lines.push('安装: .宠物 mod 安装 <ID>');
      return reply(lines.join('\n'));
    }

    // .宠物 mod 安装 <名称> - 从WebUI安装Mod
    if (p1 === '安装' || p1 === 'install') {
      if (!p2) return reply('用法: .宠物 mod 安装 <Mod名称或ID>');
      if (!WebUIReporter.config.enabled) {
        return reply('【WebUI未启用】\n请先配置并启用WebUI');
      }
      reply(`正在安装Mod: ${p2}...`);
      const result = await WebUIReporter.installMod(p2);
      await WebUIReporter.reportModStatus(p2, 'installed', result.ok);
      if (result.ok) {
        return reply(`【Mod安装成功】\n${result.name || p2} 已安装并激活`);
      }
      return reply(`【Mod安装失败】\n错误: ${result.error}`);
    }

    // .宠物 mod 卸载 <名称> - 卸载Mod
    if (p1 === '卸载' || p1 === 'uninstall') {
      if (!p2) return reply('用法: .宠物 mod 卸载 <Mod名称或ID>');
      const result = WebUIReporter.uninstallMod(p2);
      await WebUIReporter.reportModStatus(p2, 'uninstalled', result.removed);
      return reply(`【Mod已卸载】\n${p2}${result.removed ? '' : '\n提示: 本地未记录该 Mod，已保持未安装状态。'}`);
    }

    // .宠物 mod - 显示已注册Mod
    if (!mods.length) return reply('【Mod信息】\n没有已注册的扩展\n\n使用 .宠物 mod 列表 查看WebUI可用Mod');

    if (p1) {
      const mod = mods.find(m => m.id === p1 || m.name === p1);
      if (!mod) return reply(`未找到Mod: ${p1}`);
      const lines = [
        `【${mod.name}】`,
        `ID: ${mod.id}`,
        `版本: ${mod.version}`,
        `作者: ${mod.author}`,
        `状态: ${mod.state === 'active' ? '已加载' : mod.state}`,
      ];
      if (mod.description) lines.push(`描述: ${mod.description}`);
      if (mod.dependencies?.length) lines.push(`依赖: ${mod.dependencies.map(dep => dep.id).join(', ')}`);
      return reply(lines.join('\n'));
    }

    const lines = ['【Mod信息】', ''];
    for (const mod of mods) {
      const status = mod.state === 'active' ? '[√]' : `[${mod.state || 'registered'}]`;
      lines.push(`${status} ${mod.name} v${mod.version} (${mod.author})`);
      if (mod.description) lines.push(`  ${mod.description}`);
    }
    lines.push('', '查看详情: .宠物 mod <名称>');
    lines.push('WebUI Mod: .宠物 mod 列表');
    return reply(lines.join('\n'));
  }

  //   WebUI管理
  if (action === 'webui') {
    // 验证和公告允许普通用户，其他 WebUI 管理命令仅限骰主
    const isOwner = ctx.privilegeLevel >= 100;
    const publicWebUIActions = ['验证', 'verify', '公告', 'announcement'];
    if (!isOwner && !publicWebUIActions.includes(p1)) {
      return reply('【权限不足】\nWebUI 管理命令仅限骰主使用；普通用户可使用 .宠物 webui 公告 查看公告。');
    }

    // .宠物 webui - 查看状态
    if (!p1 || p1 === '状态' || p1 === 'status') {
      const status = WebUIReporter.getStatus();
      const lines = ['【WebUI状态】', ''];
      lines.push(`状态: ${status.enabled ? '已启用' : '未启用'}`);
      lines.push(`端点: ${status.endpoint || '未配置'}`);
      lines.push(`队列: ${status.queueSize} 条待发送`);
      lines.push(`已安装Mod: ${status.installedMods} 个`);
      lines.push(`已读公告: ${status.knownAnnouncements} 条`);
      lines.push('', '命令:');
      lines.push('.宠物 webui 配置 <端点> <Token>');
      lines.push('.宠物 webui 启用/禁用');
      lines.push('.宠物 webui 同步');
      lines.push('.宠物 webui 公告');
      lines.push('.宠物 webui 补丁');
      lines.push('.宠物 webui 补偿');
      lines.push(`远程管理指令: ${status.remoteAdminEnabled ? '已启用' : '未启用'}`);
      lines.push(`远程管理白名单: ${(status.remoteAdminAllowedTypes || []).join(', ') || '无'}`);
      return reply(lines.join('\n'));
    }

    // .宠物 webui 验证 <验证码> - 完成注册验证
    if (p1 === '验证' || p1 === 'verify') {
      const verifyArgs = actionFromCmd ? args.slice(1) : args.slice(2);
      const codeArg = verifyArgs[0] || '';

      if (!codeArg) {
        return reply('用法: .宠物 webui 验证 <验证码>\n请在 WebUI 注册后获取验证码');
      }
      const code = codeArg.toUpperCase();
      const qq = uid.split(':')[1] || uid;
      
      // 向 WebUI 发送验证请求
      try {
        const response = await fetch(`${WebUIReporter.config.endpoint || ''}/api/auth/verify-dice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, qq, uid }),
        });
        const result = await response.json();
        
        if (result.success) {
          return reply(`【验证成功】\nQQ: ${qq}\n账号已完成绑定，请返回 WebUI 登录。\n为避免泄露，Token 不会在聊天中显示。`);
        } else {
          return reply(`【验证失败】\n${result.error || '验证码无效或已过期'}`);
        }
      } catch (e) {
        return reply(`【验证失败】\n网络错误，请检查 WebUI 端点配置`);
      }
    }

    // .宠物 webui 配置 <端点> <Token>
    if (p1 === '配置' || p1 === 'config') {
      const configArgs = actionFromCmd ? args.slice(1) : args.slice(2);
      const endpointArg = configArgs[0] || '';
      const tokenArg = configArgs[1] || '';

      if (!endpointArg || !tokenArg) {
        return reply('用法: .宠物 webui 配置 <端点> <Token>\n示例: .宠物 webui 配置 https://wwyl.xiaocui.icu my-token-123');
      }
      const endpoint = endpointArg.endsWith('/') ? endpointArg.slice(0, -1) : endpointArg;
      const token = tokenArg;
      WebUIReporter.stop();
      WebUIReporter.init({ endpoint, token, enabled: false });
      ext.storageSet('webui_config', JSON.stringify({ endpoint, token, enabled: false }));
      return reply(`【WebUI配置已保存】\n端点: ${endpoint}\nToken: ******（已隐藏）\n\n使用 .宠物 webui 启用 开启上报`);
    }

    // .宠物 webui 启用
    if (p1 === '启用' || p1 === 'enable') {
      if (!WebUIReporter.config.endpoint) {
        return reply('请先配置WebUI端点:\n.宠物 webui 配置 <端点> <Token>');
      }
      WebUIReporter.init({ enabled: true });
      ext.storageSet('webui_config', JSON.stringify(WebUIReporter.config));
      return reply('【WebUI已启用】\n数据将自动上报到: ' + WebUIReporter.config.endpoint);
    }

    // .宠物 webui 禁用
    if (p1 === '禁用' || p1 === 'disable') {
      WebUIReporter.config.enabled = false;
      WebUIReporter.stop();
      ext.storageSet('webui_config', JSON.stringify(WebUIReporter.config));
      return reply('【WebUI已禁用】');
    }

    // .宠物 webui 远程管理 启用/禁用 - 控制 WebUI 管理指令自动执行
    if (p1 === '远程管理' || p1 === 'admin') {
      if (p2 === '启用' || p2 === 'enable') {
        WebUIReporter.config.remoteAdminEnabled = true;
        ext.storageSet('webui_config', JSON.stringify(WebUIReporter.config));
        return reply('【远程管理已启用】\nWebUI 下发的管理指令将由插件自动执行。请确保 WebUI 管理员和永久 Token 来源可信。');
      }
      if (p2 === '禁用' || p2 === 'disable') {
        WebUIReporter.config.remoteAdminEnabled = false;
        ext.storageSet('webui_config', JSON.stringify(WebUIReporter.config));
        return reply('【远程管理已禁用】\n插件将不再自动拉取和执行 WebUI 管理指令。');
      }
      return reply(`【远程管理状态】\n当前: ${WebUIReporter.config.remoteAdminEnabled ? '已启用' : '未启用'}\n白名单: ${Array.from(WebUIReporter._getRemoteAdminAllowedTypes()).join(', ') || '无'}\n当前仅允许低风险地图拓扑同步；玩家/公会/Boss/市场/全局配置等远端写操作默认拒绝。\n启用: .宠物 webui 远程管理 启用\n禁用: .宠物 webui 远程管理 禁用`);
    }

    // .宠物 webui 同步 - 立即同步
    if (p1 === '同步' || p1 === 'sync') {
      if (!WebUIReporter.config.enabled) {
        return reply('WebUI未启用');
      }
      const queueSize = WebUIReporter._queue.length;
      console.log(`[WebUI Reporter] 准备同步数据，当前队列长度: ${queueSize}`);
      await WebUIReporter._flush();
      const compensationRet = await WebUIReporter.syncCompensations();
      const adminRet = await WebUIReporter.syncAdminCommands();
      const announcementRet = await WebUIReporter.syncAnnouncements();
      const adminText = adminRet.skipped ? adminRet.reason : `总计${adminRet.total} 成功${adminRet.success} 失败${adminRet.failed}`;
      return reply(`【数据已同步】\n处理了 ${queueSize} 条上报\n补偿: 总计${compensationRet.total} 成功${compensationRet.success} 失败${compensationRet.failed}\n远程管理: ${adminText}\n公告: 总计${announcementRet.total} 未读${announcementRet.unread.length}`);
    }

    // .宠物 webui 补偿 - 立即拉取并发放补偿
    if (p1 === '补偿' || p1 === 'compensation') {
      if (!WebUIReporter.config.enabled) {
        return reply('WebUI未启用');
      }
      const ret = await WebUIReporter.syncCompensations();
      return reply(`【补偿同步完成】\n总计: ${ret.total}\n成功: ${ret.success}\n失败: ${ret.failed}`);
    }

    // .宠物 webui 公告 - 拉取 WebUI 公告
    if (p1 === '公告' || p1 === 'announcement') {
      if (!WebUIReporter.config.enabled) {
        return reply('WebUI未启用');
      }
      const markRead = p2 === '未读' || p2 === 'unread' ? false : true;
      const unreadOnly = p2 === '未读' || p2 === 'unread';
      const ret = await WebUIReporter.syncAnnouncements({ markRead });
      if (p2 === '已读' || p2 === 'read') {
        return reply(`【WebUI公告】\n已标记 ${ret.total} 条公告为已读`);
      }
      const text = WebUIReporter.formatAnnouncementList(ret.announcements, unreadOnly);
      if (!unreadOnly && ret.unread.length) {
        return reply(`${text}\n\n已自动标记 ${ret.total} 条公告为已读`);
      }
      return reply(text);
    }

    // .宠物 webui 补丁 - 拉取并应用补丁
    if (p1 === '补丁' || p1 === 'patch') {
      if (!WebUIReporter.config.enabled) {
        return reply('WebUI未启用');
      }
      reply('正在拉取补丁...');
      const patches = await WebUIReporter.fetchPatches();
      if (!patches.length) {
        return reply('【补丁】暂无生效中的补丁');
      }
      const lines = ['【补丁应用结果】', ''];
      for (const patch of patches) {
        const success = WebUIReporter.applyPatch(patch);
        const reason = success || !patch._lastError ? '' : ` - ${patch._lastError}`;
        lines.push(`${success ? '✓' : '✗'} ${patch.name} (${patch.scope})${reason}`);
      }
      return reply(lines.join('\n'));
    }

    return reply('未知命令\n使用 .宠物 help webui 查看帮助');
  }

  // 未知命令提示
  if (action) {
    return reply(`未知命令: ${action}\n使用 .宠物 help 查看帮助`);
  }

  return seal.ext.newCmdExecuteResult(true);
};

// 注册主命令
ext.cmdMap['宠物'] = cmd;
ext.cmdMap['万物有灵'] = cmd;

// 为别名命令创建独立的命令对象
const aliasNames = ['宠物对战', '宠物捉宠', '宠物斗殴', '宠物喂食', '宠物购买', '宠物公会'];
for (const aliasName of aliasNames) {
  const aliasCmd = seal.ext.newCmdItemInfo();
  aliasCmd.name = aliasName;
  aliasCmd.help = cmd.help;
  aliasCmd.solve = cmd.solve;
  aliasCmd.allowDelegate = true;  // 允许@其他人
  ext.cmdMap[aliasName] = aliasCmd;
  console.log(`[万物有灵] 注册别名命令: ${aliasName}`);
}

//   外部接口
const WanwuYouling = {
  version: '4.3.52',
  ext,

  DB: {
    get: (userId) => DB.get(userId),
    save: (userId, data) => DB.save(userId, data),
  },

  Tips: {
    list: GAME_TIPS,
    getRandom: () => getRandomTip(),
  },

  Storage: {
    getJSON(key, defaultValue = null) {
      try {
        const raw = ext.storageGet(key);
        if (!raw) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    },
    setJSON(key, value) {
      try {
        ext.storageSet(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.log('[万物有灵] 存储写入失败:', e);
        return false;
      }
    },
  },

  Species: SPECIES,
  Elements: Object.keys(ELEMENT_MARK),
  Rarities: Object.keys(RARITY_WEIGHTS),

  PetFactory: {
    create: (rarityBoost = 0, forceLegend = false, customName = null) => PetFactory.create(rarityBoost, forceLegend, customName),
    generateName: (element) => PetFactory.generateName(element),
    power: (pet) => PetFactory.power(pet),
    info: (pet, idx) => PetFactory.info(pet, idx),
    getLearnableSkills: (pet) => PetFactory.getLearnableSkills(pet),
    learnSkill: (pet, skillName) => PetFactory.learnSkill(pet, skillName),
    learnRandomSkill: (pet) => PetFactory.learnRandomSkill(pet),
  },

  Battle: {
    run: (attacker, defender) => Battle.run(attacker, defender),
    calcDmg: (atk, def, skill, atkLv, atkEle, defEle) => Battle.calcDmg(atk, def, skill, atkLv, atkEle, defEle),
  },

  Utils: {
    getUserData: (userId) => DB.get(userId),
    saveUserData: (userId, data) => {
      DB.save(userId, data);
      return data;
    },
    addPet: (userId, pet) => {
      const data = DB.get(userId);
      if (data.pets.length >= CONFIG.maxPets) return { success: false, error: '宠物已达上限' };
      data.pets.push(pet);
      DB.save(userId, data);
      return { success: true, pet };
    },
    addPetToAvailableSlot: (userId, pet) => {
      const data = DB.get(userId);
      data.storage = data.storage || [];
      if (data.pets.length < CONFIG.maxPets) {
        data.pets.push(pet);
        DB.save(userId, data);
        return { success: true, location: 'pets', pet };
      }
      if (data.storage.length < (data.maxStorage || CONFIG.maxStorage)) {
        data.storage.push(pet);
        DB.save(userId, data);
        return { success: true, location: 'storage', pet };
      }
      return { success: false, error: '宠物和仓库已满' };
    },
    removePet: (userId, petId) => {
      const data = DB.get(userId);
      const idx = data.pets.findIndex(p => p.id === petId);
      if (idx !== -1) {
        const pet = data.pets.splice(idx, 1)[0];
        DB.save(userId, data);
        return { success: true, pet, from: 'pets' };
      }
      data.storage = data.storage || [];
      const storageIdx = data.storage.findIndex(p => p.id === petId);
      if (storageIdx === -1) return { success: false, error: '宠物不存在' };
      const pet = data.storage.splice(storageIdx, 1)[0];
      DB.save(userId, data);
      return { success: true, pet, from: 'storage' };
    },
    removePetBySlot: (userId, slotType, index) => {
      const data = DB.get(userId);
      const list = slotType === 'storage' ? (data.storage || []) : data.pets;
      if (index < 0 || index >= list.length) return { success: false, error: '宠物不存在' };
      const pet = list.splice(index, 1)[0];
      DB.save(userId, data);
      return { success: true, pet, from: slotType === 'storage' ? 'storage' : 'pets' };
    },
    getPet: (userId, petId) => {
      const data = DB.get(userId);
      return data.pets.find(p => p.id === petId) || (data.storage || []).find(p => p.id === petId) || null;
    },
    getPetBySlot: (userId, slotType, index) => {
      const data = DB.get(userId);
      const list = slotType === 'storage' ? (data.storage || []) : data.pets;
      return list[index] || null;
    },
    updatePetById: (userId, petId, updater) => {
      const data = DB.get(userId);
      const lists = [data.pets, data.storage || []];
      for (const list of lists) {
        const pet = list.find(p => p.id === petId);
        if (pet) {
          updater(pet, data);
          DB.save(userId, data);
          return { success: true, pet, data };
        }
      }
      return { success: false, error: '宠物不存在' };
    },
    addMoney: (userId, amount) => {
      const data = DB.get(userId);
      data.money += amount;
      DB.save(userId, data);
      return data.money;
    },
    costMoney: (userId, amount) => {
      const data = DB.get(userId);
      if ((data.money || 0) < amount) return { success: false, error: '金币不足', money: data.money || 0 };
      data.money -= amount;
      DB.save(userId, data);
      return { success: true, money: data.money };
    },
    addFood: (userId, foodName, count) => {
      const data = DB.get(userId);
      data.food[foodName] = (data.food[foodName] || 0) + count;
      DB.save(userId, data);
      return data.food[foodName];
    },
    addSkill: (pet, skillName) => {
      if (!SKILLS[skillName]) return { success: false, error: '技能不存在' };
      if (pet.skills.includes(skillName)) return { success: false, error: '已学会该技能' };
      pet.skills.push(skillName);
      return { success: true, skill: skillName };
    },
  },

  Config: CONFIG,
  Skills: SKILLS,
  Foods: FOODS,

  //   市场数据管理
  _marketData: null,
  getMarketData() {
    if (!this._marketData) {
      this._marketData = this.Storage.getJSON('market_global', { listings: {}, lastUpdate: 0 });
    }
    return this._marketData;
  },
  saveMarketData(data) {
    this._marketData = data;
    if (!this.Storage.setJSON('market_global', data)) {
      console.log('[万物有灵] 市场数据保存失败');
    }
    if (typeof WebUIReporter !== 'undefined' && WebUIReporter.config.enabled) {
      WebUIReporter.reportGeneric('market_snapshot', data || { listings: {} });
    }
  },

  _shelterMarket: null,
  getShelterMarket() {
    if (!this._shelterMarket) {
      this._shelterMarket = this.Storage.getJSON('shelterMarket', {});
    }
    return this._shelterMarket;
  },
  saveShelterMarket(data) {
    this._shelterMarket = data;
    if (!this.Storage.setJSON('shelterMarket', data)) {
      console.log('[万物有灵] 保护机构数据保存失败');
    }
  },

  //   Mod系统
  _mods: {},           // 已注册的mod
  _extCommands: {},    // 扩展命令
  _hooks: {},          // 事件钩子
  _overrides: {},      // 函数覆写
  _hookSeq: 0,
  _listenerSeq: 0,

  _normalizeDependencies(dependencies = []) {
    return (dependencies || []).map(dep => typeof dep === 'string' ? { id: dep } : dep).filter(dep => dep && dep.id);
  },

  _findDependents(modId) {
    return Object.values(this._mods).filter(mod => (mod.dependencies || []).some(dep => dep.id === modId));
  },

  _detectDependencyCycle(modId, visited = new Set(), stack = new Set()) {
    if (stack.has(modId)) return true;
    if (visited.has(modId)) return false;
    visited.add(modId);
    stack.add(modId);
    const mod = this._mods[modId];
    if (mod) {
      for (const dep of mod.dependencies || []) {
        if (this._detectDependencyCycle(dep.id, visited, stack)) return true;
      }
    }
    stack.delete(modId);
    return false;
  },

  _clearModResources(modId) {
    for (const [name, cmd] of Object.entries(this._extCommands)) {
      if (cmd.modId === modId) delete this._extCommands[name];
    }
    for (const event of Object.keys(this._hooks)) {
      this._hooks[event] = this._hooks[event].filter(h => h.modId !== modId);
    }
    for (const [name, stack] of Object.entries(this._overrides)) {
      const nextStack = (stack || []).filter(item => item.modId !== modId);
      if (nextStack.length > 0) this._overrides[name] = nextStack;
      else delete this._overrides[name];
    }
  },

  _activateMod(modId, api = null) {
    const mod = this._mods[modId];
    if (!mod) return { success: false, error: 'Mod不存在' };
    if (mod.state === 'active') return { success: true, reloaded: false };
    for (const dep of mod.dependencies || []) {
      const depMod = this._mods[dep.id];
      if (!depMod) return { success: false, error: `缺少依赖: ${dep.id}` };
      const depResult = this._activateMod(dep.id);
      if (!depResult.success) return depResult;
    }
    mod.state = 'activating';
    if (api) mod.api = api;
    try {
      if (mod.api.onLoad) mod.api.onLoad();
      mod.state = 'active';
      return { success: true, reloaded: false };
    } catch (e) {
      this._clearModResources(modId);
      mod.state = 'error';
      console.log(`[万物有灵] Mod ${modId} 加载错误:`, e);
      return { success: false, error: `加载失败: ${e.message || e}` };
    }
  },

  // 注册Mod（注册即生效）
  registerMod(meta, api = {}) {
    if (!meta.id) return { success: false, error: 'Mod缺少id' };
    const exists = this._mods[meta.id];
    const previous = exists ? {
      meta: {
        id: exists.id,
        name: exists.name,
        version: exists.version,
        author: exists.author,
        description: exists.description,
        dependencies: exists.dependencies,
        hotReloadable: exists.hotReloadable,
      },
      api: exists.api,
    } : null;
    if (exists) {
      const unloadResult = this.unregisterMod(meta.id, { force: true, silent: true });
      if (!unloadResult.success) return unloadResult;
    }
    this._mods[meta.id] = {
      id: meta.id,
      name: meta.name || meta.id,
      version: meta.version || '1.0.0',
      author: meta.author || '未知',
      description: meta.description || '',
      dependencies: this._normalizeDependencies(meta.dependencies),
      state: 'registered',
      api: api || {},
      hotReloadable: meta.hotReloadable !== false,
    };
    if (this._detectDependencyCycle(meta.id)) {
      delete this._mods[meta.id];
      if (previous) this.registerMod(previous.meta, previous.api);
      return { success: false, error: '检测到循环依赖' };
    }
    const result = this._activateMod(meta.id, api || {});
    if (!result.success) {
      delete this._mods[meta.id];
      if (previous) this.registerMod(previous.meta, previous.api);
      return result;
    }
    return { success: true, reloaded: !!exists };
  },

  // 兼容旧接口：视为重载/重新激活
  enableMod(modId, api = null) {
    const mod = this._mods[modId];
    if (!mod) return { success: false, error: 'Mod不存在' };
    if (api) mod.api = api;
    return this._activateMod(modId, api || mod.api);
  },

  reloadMod(modId, meta = null, api = null) {
    const existing = this._mods[modId];
    if (!existing) return { success: false, error: 'Mod不存在' };
    const nextMeta = meta || {
      id: existing.id,
      name: existing.name,
      version: existing.version,
      author: existing.author,
      description: existing.description,
      dependencies: existing.dependencies,
      hotReloadable: existing.hotReloadable,
    };
    return this.registerMod(nextMeta, api || existing.api);
  },

  // 注销/卸载Mod
  unregisterMod(modId, options = {}) {
    const mod = this._mods[modId];
    if (!mod) return { success: false, error: 'Mod不存在' };
    const dependents = this._findDependents(modId).filter(dep => dep.id !== modId);
    if (!options.force && dependents.some(dep => dep.state === 'active')) {
      return { success: false, error: `仍被依赖: ${dependents.filter(dep => dep.state === 'active').map(dep => dep.id).join(', ')}` };
    }
    if (mod.api.onUnload) {
      try { mod.api.onUnload(); } catch (e) { console.log(`[万物有灵] Mod ${modId} onUnload错误:`, e); }
    }
    this._clearModResources(modId);
    mod.state = 'unloaded';
    mod.api = {};
    delete this._mods[modId];
    return { success: true };
  },

  // 兼容旧接口：实际执行卸载
  disableMod(modId) {
    return this.unregisterMod(modId, { force: false });
  },

  // 获取Mod
  getMod(modId) {
    return this._mods[modId];
  },

  // 获取所有Mod
  getMods() {
    return Object.values(this._mods).map(mod => ({
      ...mod,
      enabled: mod.state === 'active',
    }));
  },

  // 注册命令
  registerCommand(name, handler, helpText, modId, category = '其他') {
    const current = this._extCommands[name];
    if (current && current.modId !== modId) {
      console.log(`[万物有灵] 命令 ${name} 已被 ${current.modId} 注册，将被 ${modId} 覆盖`);
    }
    this._extCommands[name] = { handler, helpText, modId, category };
  },

  // 注销命令
  unregisterCommand(name) {
    delete this._extCommands[name];
  },

  // 获取帮助
  getExtHelp(category = null) {
    const lines = [];
    for (const [name, cmd] of Object.entries(this._extCommands)) {
      if (cmd.helpText && (category === null || cmd.category === category)) {
        lines.push(`.宠物 ${name} - ${cmd.helpText}`);
      }
    }
    return lines.join('\n');
  },

  // 获取所有分类
  getExtCategories() {
    const cats = new Set();
    for (const cmd of Object.values(this._extCommands)) {
      if (cmd.category) cats.add(cmd.category);
    }
    return Array.from(cats);
  },

  // 订阅事件（广播事件）
  on(event, handler, modId, options = {}) {
    if (typeof options === 'string') {
      options = { key: options };
    }
    if (!this._hooks[event]) this._hooks[event] = [];
    const autoKey = `${modId}:${event}:${handler.name || 'anonymous'}:${++this._listenerSeq}`;
    const key = options.key || autoKey;
    this._hooks[event] = this._hooks[event].filter(h => !(h.modId === modId && h.key === key));
    const record = {
      id: ++this._hookSeq,
      event,
      modId,
      key,
      handler,
      priority: options.priority || 0,
      mode: options.mode || 'event',
    };
    this._hooks[event].push(record);
    this._hooks[event].sort((a, b) => b.priority - a.priority || a.id - b.id);
    return () => this.off(event, record.id);
  },

  // 取消订阅
  off(event, handlerOrId) {
    if (!this._hooks[event]) return;
    this._hooks[event] = this._hooks[event].filter(h => h.id !== handlerOrId && h.handler !== handlerOrId);
  },

  // 触发广播事件
  emit(event, data) {
    if (!this._hooks[event]) return data;
    for (const h of this._hooks[event]) {
      if (h.mode !== 'event') continue;
      try {
        h.handler(data);
      } catch (e) {
        console.log(`[万物有灵] 事件${event}处理错误:`, e);
      }
    }
    return data;
  },

  // 可变Hook管道
  runHook(event, data) {
    if (!this._hooks[event]) return data;
    let result = data;
    for (const h of this._hooks[event]) {
      if (h.mode !== 'hook') continue;
      try {
        const next = h.handler(result);
        if (next !== undefined) result = next;
      } catch (e) {
        console.log(`[万物有灵] Hook ${event}处理错误:`, e);
      }
    }
    return result;
  },

  // 覆写函数
  override(name, fn, modId) {
    if (!this._overrides[name]) this._overrides[name] = [];
    this._overrides[name].push({ fn, modId });
  },

  // 获取覆写
  getOverride(name) {
    const stack = this._overrides[name];
    if (!stack || !stack.length) return undefined;
    return stack[stack.length - 1].fn;
  },

  // 调用其他Mod API
  call(modId, method, ...args) {
    const mod = this._mods[modId];
    if (!mod) return { ok: false, error: 'mod_not_found' };
    if (mod.state !== 'active') return { ok: false, error: 'mod_not_active' };
    if (!mod.api[method]) return { ok: false, error: 'method_not_found' };
    try {
      return { ok: true, value: mod.api[method](...args) };
    } catch (e) {
      return { ok: false, error: 'call_failed', message: e.message || String(e) };
    }
  },
};

if (typeof global !== 'undefined') {
  global.WanwuYouling = WanwuYouling;
}
if (typeof globalThis !== 'undefined') {
  globalThis.WanwuYouling = WanwuYouling;
}
