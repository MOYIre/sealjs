// ==UserScript==
// @name        猫掌柜运势
// @author      铭茗
// @version     2.1.0
// @description 猫掌柜六爻卜卦
// @timestamp   1742716800
// @license     Apache-2
// @updateUrl   https://mirror.ghproxy.com/https://raw.githubusercontent.com/MOYIre/sealjs/main/%E8%BF%90%E5%8A%BF.js
// ==/UserScript==

let ext = seal.ext.find('猫掌柜运势')
if (!ext) {
  ext = seal.ext.new('猫掌柜运势', '铭茗', '2.1.0')
  seal.ext.register(ext)
}

// 六十四卦数据（含详细卦辞）
const sixtyFourGuas = {
  '乾乾乾': { 
    name: '乾为天', 
    meaning: '天行健，君子以自强不息。',
    detail: '龙腾九天之象，刚健中正，元亨利贞。宜主动进取，开创事业，贵人相助，诸事皆宜。',
    level: '上上' 
  },
  '坤坤坤': { 
    name: '坤为地', 
    meaning: '地势坤，君子以厚德载物。',
    detail: '大地承载万物之象，柔顺谦和，厚德载福。宜守成不宜冒进，利于合作与包容。',
    level: '上中' 
  },
  '震震震': { 
    name: '震为雷', 
    meaning: '震惊百里，声威大震。',
    detail: '雷声震动百里，变动之时，有惊有喜。宜谨慎行事，警惕突来之变，居安思危。',
    level: '中平' 
  },
  '巽巽巽': { 
    name: '巽为风', 
    meaning: '随风而行，顺势而为。',
    detail: '风行天下无孔不入，柔顺谦逊，宜顺势而为，不宜强求，利于沟通协调。',
    level: '中上' 
  },
  '坎坎坎': { 
    name: '坎为水', 
    meaning: '习坎入坎，险阻重重。',
    detail: '水流险阻，重重困境。处险不惊，保持冷静，方能化险为夷，切忌冲动。',
    level: '下下' 
  },
  '离离离': { 
    name: '离为火', 
    meaning: '明两作离，光明正大。',
    detail: '火焰升腾，光明照耀。利于展现才华，宜公开行事，切忌阴谋诡计。',
    level: '中上' 
  },
  '艮艮艮': { 
    name: '艮为山', 
    meaning: '时止则止，时行则行。',
    detail: '山岳稳重，止而不动。知止而后有定，宜静待时机，不宜躁动。',
    level: '中平' 
  },
  '兑兑兑': { 
    name: '兑为泽', 
    meaning: '朋友讲习，喜悦和乐。',
    detail: '泽水相连，喜悦交流。利于社交、谈判，心情愉悦，诸事顺遂。',
    level: '上中' 
  },
  '乾坤坤': { 
    name: '天地否', 
    meaning: '天地不交，万物不通。',
    detail: '天地闭塞，阴阳不交。诸事阻滞，宜守静待时，不宜妄动，韬光养晦。',
    level: '下下' 
  },
  '坤乾乾': { 
    name: '地天泰', 
    meaning: '天地交而万物通，小往大来。',
    detail: '天地交融，万物亨通。小往大来，吉无不利，宜把握时机，大展宏图。',
    level: '上上' 
  },
  '震坤坤': { 
    name: '雷地豫', 
    meaning: '雷出地奋，豫悦顺动。',
    detail: '春雷惊蛰，万物复苏。豫悦之象，利于行动，众望所归，事半功倍。',
    level: '上中' 
  },
  '坤震震': { 
    name: '地雷复', 
    meaning: '雷在地中，阳气复生。',
    detail: '一阳来复，否极泰来。旧事重提，失而复得，利于重新开始。',
    level: '中上' 
  },
  '巽坤坤': { 
    name: '风地观', 
    meaning: '风行地上，观天之神道。',
    detail: '观仰审视，以观我生。宜静观其变，深思熟虑，不宜轻举妄动。',
    level: '中平' 
  },
  '坤巽巽': { 
    name: '地风升', 
    meaning: '地中生木，渐进上升。',
    detail: '木生地中，逐渐成长。积小成大，循序渐进，利于稳步发展。',
    level: '上中' 
  },
  '坎坤坤': { 
    name: '水地比', 
    meaning: '地上有水，亲比辅助。',
    detail: '水润大地，亲密无间。利于合作结盟，众志成城，宜亲近他人。',
    level: '中上' 
  },
  '坤坎坎': { 
    name: '地水师', 
    meaning: '地中有水，行师打仗。',
    detail: '众水汇聚，统帅有方。利于组织管理，宜以正道行事，切忌偏激。',
    level: '中平' 
  },
  '离坤坤': { 
    name: '火地晋', 
    meaning: '明出地上，晋进光明。',
    detail: '旭日东升，前途光明。进取之时，贵人相助，事业亨通，大吉大利。',
    level: '上上' 
  },
  '坤离离': { 
    name: '地火明夷', 
    meaning: '明入地中，光明受损。',
    detail: '日落西山，光明被遮。宜韬光养晦，隐忍待时，切忌张扬。',
    level: '下中' 
  },
  '艮坤坤': { 
    name: '山地剥', 
    meaning: '山附于地，剥落削弱。',
    detail: '山崩地裂，根基动摇。诸事不利，宜收敛自守，静待转机。',
    level: '下下' 
  },
  '坤艮艮': { 
    name: '地山谦', 
    meaning: '地中有山，谦卑退让。',
    detail: '山藏地中，谦虚自处。谦受益，满招损，宜低调行事，终有所成。',
    level: '上中' 
  },
  '兑坤坤': { 
    name: '泽地萃', 
    meaning: '泽上于地，聚集会合。',
    detail: '众水汇聚，人才济济。利于聚会合作，贵人相逢，宜把握人脉。',
    level: '上中' 
  },
  '坤兑兑': { 
    name: '地泽临', 
    meaning: '泽上有地，居高临下。',
    detail: '居高临下，俯察万物。宜主动作为，施展抱负，但需防盛极而衰。',
    level: '中上' 
  },
  '乾震震': { 
    name: '天雷无妄', 
    meaning: '天下雷行，无妄之行。',
    detail: '雷动天下，诚惶诚恐。不可妄为，顺势而行则吉，逆势妄动则凶。',
    level: '中平' 
  },
  '震乾乾': { 
    name: '雷天大壮', 
    meaning: '雷在天上，刚健有力。',
    detail: '雷声隆隆，阳刚之气充沛。宜积极进取，但需防过刚易折，中道为上。',
    level: '上中' 
  },
  '乾巽巽': { 
    name: '天风姤', 
    meaning: '天下有风，邂逅相遇。',
    detail: '风吹天下，不期而遇。有邂逅之缘，但需谨慎交友，防小人暗算。',
    level: '中平' 
  },
  '巽乾乾': { 
    name: '风天小畜', 
    meaning: '风行天上，密云不雨。',
    detail: '云聚不雨，蓄势待发。小有积蓄，时机未到，宜耐心等待。',
    level: '中平' 
  },
  '乾坎坎': { 
    name: '天水讼', 
    meaning: '天与水违，争讼不和。',
    detail: '天西水东，背道而驰。宜和解不宜争讼，退一步海阔天空。',
    level: '下中' 
  },
  '坎乾乾': { 
    name: '水天需', 
    meaning: '云上于天，等待之时。',
    detail: '云聚天际，等待雨落。需待时机，不可急躁，静候佳音自来。',
    level: '中上' 
  },
  '乾离离': { 
    name: '天火同人', 
    meaning: '天与火同，志同道合。',
    detail: '天火同明，同心协力。利于合作共事，志同道合者助，大吉。',
    level: '上上' 
  },
  '离乾乾': { 
    name: '火天大有', 
    meaning: '火在天上，大有收获。',
    detail: '日照中天，万物丰盛。大有作为，财运亨通，事业兴旺，大吉大利。',
    level: '上上' 
  },
  '乾艮艮': { 
    name: '天山遁', 
    meaning: '天下有山，退避隐遁。',
    detail: '山高天远，退避为上。宜急流勇退，明哲保身，不宜进取。',
    level: '中平' 
  },
  '艮乾乾': { 
    name: '山天大畜', 
    meaning: '天在山中，大有积蓄。',
    detail: '藏天于山，积德累善。利于积蓄实力，厚积薄发，前程似锦。',
    level: '上中' 
  },
  '乾兑兑': { 
    name: '天泽履', 
    meaning: '上天下泽，履虎尾。',
    detail: '如履虎尾，险中求安。谨慎行事，小心翼翼，终能化险为夷。',
    level: '中上' 
  },
  '兑乾乾': { 
    name: '泽天夬', 
    meaning: '泽上于天，决断果敢。',
    detail: '水涨决堤，当机立断。宜果断决策，排除万难，切忌犹豫。',
    level: '中上' 
  },
  '震巽巽': { 
    name: '雷风恒', 
    meaning: '雷风相薄，恒久不变。',
    detail: '雷风相激，持之以恒。宜坚守正道，不轻言放弃，终有所成。',
    level: '中上' 
  },
  '巽震震': { 
    name: '风雷益', 
    meaning: '风雷交作，增益进取。',
    detail: '风助雷势，雷壮风威。利于进取改革，贵人相助，事半功倍。',
    level: '上上' 
  },
  '震坎坎': { 
    name: '雷水解', 
    meaning: '雷雨作解，困难解除。',
    detail: '春雷化雨，冰雪消融。困境渐解，豁然开朗，宜把握转机。',
    level: '中上' 
  },
  '坎震震': { 
    name: '水雷屯', 
    meaning: '云雷屯聚，创业艰难。',
    detail: '万物初生，艰难困苦。创业维艰，需坚定信念，终能破土而出。',
    level: '下中' 
  },
  '震离离': { 
    name: '雷火丰', 
    meaning: '雷电皆至，丰盛成就。',
    detail: '雷火交加，盛大光明。事业有成，但需防盛极而衰，居安思危。',
    level: '上中' 
  },
  '离震震': { 
    name: '火雷噬嗑', 
    meaning: '雷电噬嗑，明断刑罚。',
    detail: '口中有物，噬而后合。宜明辨是非，果断处理，清除障碍。',
    level: '中平' 
  },
  '震艮艮': { 
    name: '雷山小过', 
    meaning: '山上有雷，小有过越。',
    detail: '雷过山顶，稍有过之。可小有作为，不宜大事，谨守本分。',
    level: '中平' 
  },
  '艮震震': { 
    name: '山雷颐', 
    meaning: '山下有雷，颐养身心。',
    detail: '雷动山下，颐养之象。宜修身养性，注意饮食起居，养精蓄锐。',
    level: '中上' 
  },
  '震兑兑': { 
    name: '雷泽归妹', 
    meaning: '泽上有雷，归妹出嫁。',
    detail: '少女出嫁，有始无终。不宜冒进，需谨慎选择，防感情波折。',
    level: '下下' 
  },
  '兑震震': { 
    name: '泽雷随', 
    meaning: '泽中有雷，随顺和悦。',
    detail: '雷入泽中，顺势而为。宜随机应变，随遇而安，顺应时势。',
    level: '上中' 
  },
  '巽坎坎': { 
    name: '风水涣', 
    meaning: '风行水上，涣散离析。',
    detail: '风吹水散，人心离散。宜疏通化解，拨乱反正，重聚人心。',
    level: '中平' 
  },
  '坎巽巽': { 
    name: '水风井', 
    meaning: '木上有水，井养万物。',
    detail: '井水涌出，滋养众生。利于服务他人，德泽四方，细水长流。',
    level: '中上' 
  },
  '巽离离': { 
    name: '风火家人', 
    meaning: '风自火出，家人和睦。',
    detail: '家火生风，和睦兴旺。利于家庭事务，亲情融洽，宜守正持家。',
    level: '上上' 
  },
  '离巽巽': { 
    name: '火风鼎', 
    meaning: '木上有火，鼎革更新。',
    detail: '鼎烹食物，革故鼎新。利于变革创新，事业革新，大有可为。',
    level: '上上' 
  },
  '巽艮艮': { 
    name: '风山渐', 
    meaning: '山上有木，渐进成长。',
    detail: '木生山上，渐次成长。宜循序渐进，稳步发展，不急不躁。',
    level: '上中' 
  },
  '艮巽巽': { 
    name: '山风蛊', 
    meaning: '山下有风，蛊惑败坏。',
    detail: '风入山中，败坏滋生。需振作革新，清除积弊，方能转危为安。',
    level: '下中' 
  },
  '巽兑兑': { 
    name: '风泽中孚', 
    meaning: '泽上有风，诚信感化。',
    detail: '风行泽上，诚信为本。以诚待人，感化他人，利于合作。',
    level: '上中' 
  },
  '兑巽巽': { 
    name: '泽风大过', 
    meaning: '泽灭木，栋桡大过。',
    detail: '水淹林木，负担过重。宜量力而行，不可强撑，防倾覆之虞。',
    level: '下中' 
  },
  '坎离离': { 
    name: '水火既济', 
    meaning: '水在火上，功成事毕。',
    detail: '水火相济，阴阳调和。功成名就，但需防初吉终乱，居安思危。',
    level: '中上' 
  },
  '离坎坎': { 
    name: '火水未济', 
    meaning: '火在水上，功业未成。',
    detail: '水火不交，事情未成。需继续努力，耐心等待，终能达成。',
    level: '中平' 
  },
  '坎艮艮': { 
    name: '水山蹇', 
    meaning: '山上有水，艰难险阻。',
    detail: '山路积水，步履维艰。困境重重，宜知难而返，另辟蹊径。',
    level: '下下' 
  },
  '艮坎坎': { 
    name: '山水蒙', 
    meaning: '山下出泉，启蒙发昧。',
    detail: '泉水涌出，启蒙教化。利于学习求知，宜虚心请教，开悟明智。',
    level: '中平' 
  },
  '坎兑兑': { 
    name: '水泽节', 
    meaning: '泽上有水，节制适度。',
    detail: '水聚泽中，量入为出。宜适度节制，不可过度，中庸为上。',
    level: '中上' 
  },
  '兑坎坎': { 
    name: '泽水困', 
    meaning: '泽无水，困穷之时。',
    detail: '泽中无水，困顿艰难。宜坚守正道，等待时机，终能脱困。',
    level: '下中' 
  },
  '离艮艮': { 
    name: '火山旅', 
    meaning: '山上有火，旅行在外。',
    detail: '火燃山上，漂泊在外。利于出行，但需小心谨慎，客居他乡。',
    level: '中平' 
  },
  '艮离离': { 
    name: '山火贲', 
    meaning: '山下有火，文饰装点。',
    detail: '火照山下，文采斐然。利于展示才华，但需防华而不实。',
    level: '中上' 
  },
  '离兑兑': { 
    name: '火泽睽', 
    meaning: '上火下泽，乖异背离。',
    detail: '火炎水泽，背道而驰。人心离散，宜求同存异，化解矛盾。',
    level: '下中' 
  },
  '兑离离': { 
    name: '泽火革', 
    meaning: '泽中有火，变革改旧。',
    detail: '水火相息，革故鼎新。利于改革变通，去旧迎新，开创局面。',
    level: '上中' 
  },
  '艮兑兑': { 
    name: '山泽损', 
    meaning: '山下有泽，减损下益。',
    detail: '损下益上，先舍后得。宜先付出，不计小利，终有回报。',
    level: '中平' 
  },
  '兑艮艮': { 
    name: '泽山咸', 
    meaning: '山上有泽，感应相通。',
    detail: '山泽通气，心心相印。利于人际交往，感情和谐，意气相通。',
    level: '上上' 
  },
}

// 爻的表示（使用对齐的符号）
const yaoSymbols = {
  '少阳': '▅▅▅▅▅',
  '少阴': '▅▅    ▅▅',
  '老阳': '▅▅▅▅▅ ○',
  '老阴': '▅▅    ▅▅ ×',
}

// 猫掌柜开场白（增加喵的概率）
const openingLines = [
  '哦？又有人来求签了喵，让本掌柜看看你的命格…',
  '客官是要问前程吗？且让本掌柜为你卜上一卦喵。',
  '来，今日卦象如何？让猫掌柜为你细说一二喵。',
  '贵客临门，是要问卜吗？请摇动卦筒喵。',
  '本掌柜今日心情不错，便为你占上一卦吧喵。',
  '命运的齿轮在转动喵，让我看看为你指引何方…',
  '哼，又来了一个迷途的小家伙，让本掌柜为你解惑喵。',
  '阴阳交汇之时，你的卦象将如何呈现呢喵？',
  '喵~让本掌柜用三枚铜钱为你起卦…',
  '唔，今日天象如何？让我为你卜上一卦喵。',
]

// 猫掌柜结语（增加喵的概率）
const closingLines = {
  '上上': [
    '这是难得的好卦喵，客官好福气喵。',
    '这卦象极好喵，想必客官近日会有喜事喵。',
    '本掌柜也要恭喜客官了，此乃上上之签喵！',
  ],
  '上中': [
    '此卦甚吉喵，客官切记把握机会喵。',
    '卦象不错喵，好好努力，必有收获喵。',
    '嗯，这是个好兆头喵，本掌柜看好你喵。',
  ],
  '中上': [
    '此卦有小成之象喵，稳中求进便好喵。',
    '卦象显示前方有路喵，只管放心前行。',
    '此卦平和向好喵，客官不必过于忧心。',
  ],
  '中平': [
    '平平淡淡才是真喵，此卦无凶无吉喵。',
    '卦象中庸喵，宜守不宜进喵。',
    '此卦平平喵，保持现状为上策喵。',
  ],
  '中下': [
    '此卦有些波折喵，客官需多加小心喵。',
    '卦象欠佳喵，凡事三思而后行喵。',
    '此卦不甚理想喵，但也不必过于担忧，小心驶得万年船喵。',
  ],
  '下中': [
    '此卦有些凶险喵，客官近期还是低调些好喵。',
    '卦象欠佳喵，宜静不宜动喵。',
    '此卦不佳喵，本掌柜建议客官暂避锋芒喵。',
  ],
  '下下': [
    '此卦甚凶喵，客官还是…多多保重吧喵。',
    '卦象极为不佳喵，本掌柜也不知该说什么好喵…',
    '这是个凶卦喵，客官切记谨慎行事喵，能躲则躲喵。',
  ],
}

// 动爻判词（增加喵）
const dongYaoTips = {
  '初爻': [
    '初爻发动，根基有变喵。',
    '下爻有动，基础之事需注意喵。',
  ],
  '二爻': [
    '二爻发动，中道有变喵。',
    '第二爻动，事情发展会有转折喵。',
  ],
  '三爻': [
    '三爻发动，内卦有变喵。',
    '第三爻动，内在因素在变化喵。',
  ],
  '四爻': [
    '四爻发动，外卦有变喵。',
    '第四爻动，外在影响需关注喵。',
  ],
  '五爻': [
    '五爻发动，君位有变喵。',
    '第五爻动，关键之事会有变化喵。',
  ],
  '上爻': [
    '上爻发动，终局有变喵。',
    '最上爻动，事情结局会有转机喵。',
  ],
}

// 六爻属性
const yaoNames = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

// 根据日期和用户生成种子
function getTodaySeed(userId) {
  let now = new Date()
  let dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  let str = userId + dateKey
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash
}

// 伪随机数生成器
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// 生成一爻
function generateYao(seed, yaoIndex) {
  // 传统六爻：三枚铜钱
  // 正正正 = 老阳(O) - 3正面
  // 正正反 = 少阳(—) - 2正1反
  // 正反反 = 少阴(--) - 1正2反
  // 反反反 = 老阴(X) - 3反面
  let rand = seededRandom(seed + yaoIndex * 100)
  
  // 模拟三枚铜钱的结果
  let coins = []
  for (let i = 0; i < 3; i++) {
    coins.push(seededRandom(seed + yaoIndex * 100 + i * 10) > 0.5 ? 1 : 0)
  }
  
  let heads = coins.reduce((a, b) => a + b, 0)
  
  if (heads === 3) return '老阳'
  if (heads === 2) return '少阳'
  if (heads === 1) return '少阴'
  return '老阴'
}

// 生成完整的六爻卦象
function generateLiuyao(userId) {
  let seed = getTodaySeed(userId)
  let yaos = []
  let dongYaos = []
  
  for (let i = 0; i < 6; i++) {
    let yao = generateYao(seed, i)
    yaos.push(yao)
    if (yao === '老阳' || yao === '老阴') {
      dongYaos.push(i)
    }
  }
  
  return { yaos, dongYaos, seed }
}

// 根据六爻确定卦名
function getGuaKey(yaos) {
  let lowerTrigram = []
  let upperTrigram = []
  
  // 八卦对应
  const trigramMap = {
    '111': '乾',
    '000': '坤',
    '001': '震',
    '100': '艮',
    '010': '坎',
    '011': '兑',
    '101': '离',
    '110': '巽',
  }
  
  for (let i = 0; i < 3; i++) {
    let isYang = (yaos[i] === '少阳' || yaos[i] === '老阳') ? '1' : '0'
    lowerTrigram.push(isYang)
  }
  
  for (let i = 3; i < 6; i++) {
    let isYang = (yaos[i] === '少阳' || yaos[i] === '老阳') ? '1' : '0'
    upperTrigram.push(isYang)
  }
  
  let lowerKey = lowerTrigram.join('')
  let upperKey = upperTrigram.join('')
  
  let lower = trigramMap[lowerKey] || '坎'
  let upper = trigramMap[upperKey] || '离'
  
  return upper + lower + lower
}

// 解卦
function interpretGua(yaos, dongYaos, seed) {
  let guaKey = getGuaKey(yaos)
  let gua = sixtyFourGuas[guaKey]
  
  if (!gua) {
    gua = { name: '水火既济', meaning: '阴阳调和，万物有序。', detail: '顺其自然，必有所成喵。', level: '中上' }
  }
  
  return gua
}

// 主命令
let cmd = seal.ext.newCmdItemInfo()
cmd.name = '运势'
cmd.help = `
.运势 / .fortune
由猫掌柜为你卜六爻之卦（每日固定，不会变化）
六爻乃上古占卜之法，本掌柜用三枚铜钱为你起卦喵。
`

cmd.solve = (ctx, msg, argv) => {
  let result = seal.ext.newCmdExecuteResult(true)
  
  // 生成卦象
  let liuyao = generateLiuyao(msg.sender.userId)
  let gua = interpretGua(liuyao.yaos, liuyao.dongYaos, liuyao.seed)
  
  // 随机选择开场白和结语
  let openingIdx = Math.floor(seededRandom(liuyao.seed) * openingLines.length)
  let opening = openingLines[openingIdx]
  
  let closingOptions = closingLines[gua.level] || closingLines['中平']
  let closingIdx = Math.floor(seededRandom(liuyao.seed + 1) * closingOptions.length)
  let closing = closingOptions[closingIdx]
  
  // 构建卦象显示（从上到下）
  let guaDisplay = ''
  for (let i = 5; i >= 0; i--) {
    let yao = liuyao.yaos[i]
    let symbol = yaoSymbols[yao]
    guaDisplay += `${symbol}  ${yaoNames[i]}\n`
  }
  
  // 动爻提示
  let dongYaoText = ''
  if (liuyao.dongYaos.length > 0) {
    dongYaoText = '\n【动爻】\n'
    for (let idx of liuyao.dongYaos) {
      let tipOptions = dongYaoTips[yaoNames[idx]]
      let tipIdx = Math.floor(seededRandom(liuyao.seed + idx) * tipOptions.length)
      dongYaoText += `· ${tipOptions[tipIdx]}\n`
    }
    dongYaoText += '(○为老阳变阴，×为老阴变阳)'
  }
  
  // 构建回复
  let reply = `${opening}

【${gua.name}】 ${gua.level}

${guaDisplay}
【卦辞】${gua.meaning}

【详解】${gua.detail}
${dongYaoText}
${closing}`

  seal.replyToSender(ctx, msg, reply)
  
  return result
}

ext.cmdMap['运势'] = cmd
ext.cmdMap['fortune'] = cmd


// 彩蛋命令：单独摇卦
let cmdDivination = seal.ext.newCmdItemInfo()
cmdDivination.name = '摇卦'
cmdDivination.help = `
.摇卦 / .divine
猫掌柜为你即时摇一卦（随机，每次不同）。
`

cmdDivination.solve = (ctx, msg, argv) => {
  let result = seal.ext.newCmdExecuteResult(true)
  
  let yaos = []
  let dongYaos = []
  
  for (let i = 0; i < 6; i++) {
    let coins = []
    for (let j = 0; j < 3; j++) {
      coins.push(Math.random() > 0.5 ? 1 : 0)
    }
    let heads = coins.reduce((a, b) => a + b, 0)
    
    let yao
    if (heads === 3) yao = '老阳'
    else if (heads === 2) yao = '少阳'
    else if (heads === 1) yao = '少阴'
    else yao = '老阴'
    
    yaos.push(yao)
    if (yao === '老阳' || yao === '老阴') {
      dongYaos.push(i)
    }
  }
  
  let guaKey = getGuaKey(yaos)
  let gua = sixtyFourGuas[guaKey] || { name: '水火既济', meaning: '阴阳调和，万物有序。', detail: '顺其自然，必有所成喵。', level: '中上' }
  
  // 随机台词
  let openingIdx = Math.floor(Math.random() * openingLines.length)
  let opening = openingLines[openingIdx]
  
  let closingOptions = closingLines[gua.level] || closingLines['中平']
  let closingIdx = Math.floor(Math.random() * closingOptions.length)
  let closing = closingOptions[closingIdx]
  
  let guaDisplay = ''
  for (let i = 5; i >= 0; i--) {
    let yao = yaos[i]
    let symbol = yaoSymbols[yao]
    guaDisplay += `${symbol}  ${yaoNames[i]}\n`
  }
  
  let dongYaoText = ''
  if (dongYaos.length > 0) {
    dongYaoText = '\n【动爻】\n'
    for (let idx of dongYaos) {
      let tipOptions = dongYaoTips[yaoNames[idx]]
      let tipIdx = Math.floor(Math.random() * tipOptions.length)
      dongYaoText += `· ${tipOptions[tipIdx]}\n`
    }
    dongYaoText += '(○为老阳变阴，×为老阴变阳)'
  }
  
  let reply = `${opening}

【${gua.name}】 ${gua.level}

${guaDisplay}
【卦辞】${gua.meaning}

【详解】${gua.detail}
${dongYaoText}
${closing}`

  seal.replyToSender(ctx, msg, reply)
  
  return result
}

ext.cmdMap['摇卦'] = cmdDivination
ext.cmdMap['divine'] = cmdDivination
