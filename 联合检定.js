// ==UserScript==
// @name 联合技能检定
// @author 铭茗
// @version 1.1.0
// @description COC7联合技能检定：投一个骰子与多个技能比较，支持技能默认值
// @timestamp 1742716800
// @license apache2.0
// @updateUrl https://ghproxy.net/https://raw.githubusercontent.com/MOYIre/sealjs/main/联合检定.js
// ==/UserScript==

/**
 * 联合技能检定：投一个骰子与多个技能比较
 * 全部成功: .ram all 技能1 技能2
 * 任一成功: .ram any 技能1 技能2
 * 支持COC7规则：优先使用玩家录入值，未录入则使用技能默认值
 */
//请支持铭茗喵，有问题发给我QQ:3029590078
const ext = seal.ext.new('联合技能检定', '铭茗', '1.1.0');
const cmdCombined = seal.ext.newCmdItemInfo();

cmdCombined.name = 'ram';
cmdCombined.help = '联合技能检定:\n' +
    '.ram all 技能1 技能2 [技能3] ... // 全部成功模式\n' +
    '.ram any 技能1 技能2 [技能3] ... // 任一成功模式\n' +
    '示例: .ram all 机械维修 电气维修\n' +
    '示例: .ram any 侦查 听觉\n' +
    '示例: .ram all 斗殴 闪避  // 支持默认值技能';

const difficultyPrefixMap = {
    '困难': 1, '极难': 2, '大成功': 3,
    '困難': 1, '極難': 2
};

// COC7技能默认值
const skillDefaults = {
    // 固定默认值
    乔装: 5, 书法: 5, 人类学: 1, 会计: 5, 伪造: 5, 估价: 5,
    侦查: 25, 信用评级: 0, 催眠: 1, 克苏鲁神话: 0, 写作: 5,
    冲锋枪: 15, 制陶: 5, 剑: 20, 动物学: 1, 动物驯养: 5,
    化学: 1, 医学: 1, 博物学: 10, 历史: 5, 厨艺: 5,
    取悦: 15, 司法科学: 1, 吹真空管: 5, 喜剧: 5, 器乐: 5,
    园艺: 5, 图书馆使用: 20, 地质学: 1, 声乐: 5, 天文学: 1,
    妙手: 10, 学识: 1, 密码学: 1, 导航: 10, 工程学: 1,
    弓: 15, 心理学: 10, 急救: 30, 恐吓: 15, 手枪: 20,
    打字: 5, 技术制图: 5, 投掷: 20, 摄影: 5, 操作重型机械: 1,
    攀爬: 20, 数学: 10, 斗殴: 25, 斧: 15, 日本刀: 20,
    木匠: 5, 机枪: 10, 机械维修: 10, 极地: 10, 植物学: 1,
    歌剧歌唱: 5, 气象学: 1, 汽车驾驶: 20, 沙漠: 10, 法律: 5,
    海洋: 10, 游泳: 20, 潜水: 1, 潜行: 20, 火焰喷射器: 10,
    炮术: 1, 爆破: 1, 物理学: 1, 理发: 5, 生存: 10,
    生物学: 1, 电子学: 1, 电气维修: 10, 矛: 20, 神秘学: 5,
    科学: 1, 粉刷匠和油漆工: 5, 精神分析: 1, 绞索: 15, 美术: 5,
    考古学: 1, 耕作: 5, 聆听: 20, 舞蹈: 5, 船: 1,
    艺术与手艺: 5, 药学: 1, 莫里斯舞蹈: 5, 表演: 5, 裁缝: 5,
    计算机使用: 5, 话术: 5, 语言: 1, 说服: 10, 读唇: 1,
    跳跃: 20, 连枷: 10, 追踪: 10, 速记: 5, 重武器: 10,
    链锯: 10, 锁匠: 1, 雕塑: 5, 霰弹枪: 25, 鞭: 5,
    飞行器: 1, 骑术: 5
};

// 计算型默认值（需要基于属性计算）
const computedDefaults = {
    '闪避': (ctx) => {
        const agi = seal.vars.intGet(ctx, '敏捷')[0] || 50;
        return Math.floor(agi / 2);
    },
    '母语': (ctx) => {
        const edu = seal.vars.intGet(ctx, '教育')[0] || 50;
        return edu;
    },
    '语言': (ctx) => {
        const edu = seal.vars.intGet(ctx, '教育')[0] || 50;
        return edu;
    }
};

// 技能别名映射
const skillAlias = {
    '格斗': '斗殴', '鬥毆': '斗殴', '格斗：斗殴': '斗殴', '格斗:斗殴': '斗殴',
    '射击': '枪械', '射擊': '枪械', '火器': '枪械', '槍械': '枪械',
    '手槍': '手枪', '射击：手枪': '手枪', '射击:手枪': '手枪',
    '衝鋒槍': '冲锋枪', '射击：冲锋枪': '冲锋枪', '射击:冲锋枪': '冲锋枪',
    '機槍': '机枪', '射击：机枪': '机枪', '射击:机枪': '机枪',
    '弓術': '弓', '弓箭': '弓', '射击：弓箭': '弓', '射击:弓箭': '弓', '射击：弓': '弓', '射击:弓': '弓',
    '劍': '剑', '劍術': '剑', '格斗：剑': '剑', '格斗:剑': '剑',
    '閃避': '闪避',
    '偵查': '侦查', '侦察': '侦查',
    '聆聽': '聆听', '听觉': '聆听',
    '潛行': '潜行', '隐蔽': '潜行',
    '說服': '说服', '话术': '话术', '話術': '话术'
};

// 检定
function checkResult(d100, attrValue) {
    let criticalSuccessValue = attrValue >= 50 ? 5 : Math.max(1, Math.floor(attrValue / 10));
    let fumbleValue = attrValue < 50 ? 100 : 96;
    
    if (d100 <= criticalSuccessValue) return 5;  // 大成功
    if (d100 >= fumbleValue) return -1;          // 大失败
    if (d100 <= attrValue) {
        if (d100 <= Math.floor(attrValue / 5)) return 4;  // 极难成功
        if (d100 <= Math.floor(attrValue / 2)) return 3;  // 困难成功
        return 2;  // 普通成功
    }
    return 0;  // 失败
}

function getResultText(successRank, passed) {
    if (successRank === 5) return '大成功';
    if (successRank === -1) return '大失败';
    if (successRank === 4) return '极难成功';
    if (successRank === 3) return '困难成功';
    if (successRank === 2) return '成功';
    return '失败';
}

function getDifficultyText(difficulty) {
    return ['', '困难', '极难', '大成功'][difficulty] || '常规';
}

function parseSkill(skillText) {
    let difficulty = 0, skillName = skillText;
    for (const [prefix, diff] of Object.entries(difficultyPrefixMap)) {
        if (skillText.startsWith(prefix)) {
            difficulty = diff;
            skillName = skillText.substring(prefix.length).trim();
            break;
        }
    }
    // 处理别名
    skillName = skillAlias[skillName] || skillName;
    return { skillName, difficulty };
}

// 获取技能值（优先级：玩家录入 > 计算默认值 > 固定默认值）
function getSkillValue(ctx, skillName) {
    // 1. 优先查找玩家录入的值
    const result = seal.vars.intGet(ctx, skillName);
    if (Array.isArray(result) && result[1] === true && result[0] > 0) {
        return { value: result[0], source: '录入' };
    }
    
    // 2. 查找计算型默认值
    if (computedDefaults[skillName]) {
        const computedValue = computedDefaults[skillName](ctx);
        return { value: computedValue, source: '默认' };
    }
    
    // 3. 查找固定默认值
    if (skillDefaults[skillName] !== undefined) {
        return { value: skillDefaults[skillName], source: '默认' };
    }
    
    // 4. 尝试解析数字形式...这次不是todo
    const numMatch = skillName.match(/^(.+?)(\d+)$/);
    if (numMatch) {
        const baseName = skillAlias[numMatch[1]] || numMatch[1];
        const numValue = parseInt(numMatch[2]);
        return { value: numValue, source: '指定', baseName };
    }
    
    if (/^\d+$/.test(skillName)) {
        return { value: parseInt(skillName), source: '数值' };
    }
    
    return { value: 0, source: null };
}

cmdCombined.solve = (ctx, msg, cmdArgs) => {
    const args = cmdArgs.args;
    
    // 解析模式
    let mode = 'all';
    if (args.length > 0 && (args[0] === 'any' || args[0] === '任一')) {
        mode = 'any';
    }
    
    // 获取技能
    const skills = [];
    const startIndex = (args.length > 0 && (args[0] === 'all' || args[0] === 'any' || args[0] === '任一' || args[0] === '全部')) ? 1 : 0;
    for (let i = startIndex; i < args.length; i++) {
        if (args[i] && args[i].trim()) {
            skills.push(args[i].trim());
        }
    }
    
    if (skills.length < 2) {
        seal.replyToSender(ctx, msg, '联合技能检定至少需要两个技能！\n用法: .ram all 技能1 技能2\n用法: .ram any 技能1 技能2');
        return seal.ext.newCmdExecuteResult(true);
    }
    
    if (skills.length > 10) {
        seal.replyToSender(ctx, msg, '联合技能检定最多支持10个技能！');
        return seal.ext.newCmdExecuteResult(true);
    }

    // 投一个1D100（这个分布更好）
    let d100;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const arr = new Uint8Array(1);
        do {
            crypto.getRandomValues(arr);
        } while (arr[0] >= 200);
        d100 = (arr[0] % 100) + 1;
    } else {
        d100 = Math.floor(Math.random() * 100) + 1;
    }
    
    const results = [];
    let allPassed = true, anyPassed = false;
    
    for (const skillText of skills) {
        const { skillName, difficulty } = parseSkill(skillText);
        
        // 获取技能值
        const skillInfo = getSkillValue(ctx, skillName);
        
        if (!skillInfo.source || skillInfo.value <= 0) {
            seal.replyToSender(ctx, msg, `未找到技能「${skillName}」的数值，请先使用 .st 录入`);
            return seal.ext.newCmdExecuteResult(true);
        }
        
        const skillValue = skillInfo.value;
        const displayName = skillInfo.baseName || skillName;

        // 计算判定阈值
        let checkValue = skillValue;
        if (difficulty === 1) checkValue = Math.floor(skillValue / 2);
        else if (difficulty === 2) checkValue = Math.floor(skillValue / 5);
        else if (difficulty === 3) checkValue = 1;

        // 用原始技能值判定成功等级
        const successRank = checkResult(d100, skillValue);
        const passed = d100 <= checkValue;
        
        results.push({
            skillName: skillText, displayName, skillValue, difficulty, checkValue,
            successRank, passed, resultText: getResultText(successRank, passed),
            source: skillInfo.source
        });
        
        if (!passed) allPassed = false;
        if (passed) anyPassed = true;
    }
    
    const overallPassed = (mode === 'all') ? allPassed : anyPassed;
    const modeText = (mode === 'all') ? '全部成功' : '任一成功';
    
    let reply = `【联合技能检定】\n检定模式: ${modeText}\n骰点: D100 = ${d100}\n─────────────\n`;
    
    for (const r of results) {
        const diffText = r.difficulty > 0 ? `(${getDifficultyText(r.difficulty)})` : '';
        const status = r.passed ? '✓' : '✗';
        const valueText = r.difficulty > 0 ? `${r.skillValue}→${r.checkValue}` : `${r.skillValue}`;
        reply += `${status} ${r.displayName}${diffText}: ${valueText} ${r.resultText}\n`;
    }
    //之前真的好难看
    reply += `─────────────\n最终结果: ${overallPassed ? '成功！' : '失败'}`;
    
    if (mode === 'any' && anyPassed) {
        reply += ` (${results.filter(r => r.passed).length}/${results.length}通过)`;
    }
    
    seal.replyToSender(ctx, msg, reply);
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['ram'] = cmdCombined;
seal.ext.register(ext);