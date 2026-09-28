const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const rng = {
  queue: [],
  /* 整局种子驱动的可复现随机源。
     state.seed 之前只是一个展示用的字符串，实际 next() 走 Math.random，
     所以同一个 seed 根本复现不出一局。现在 seed 会真正推着随机序列走。
     rng.set([...]) 仍然优先：自动化用例钉死序列时不受种子影响。 */
  seedValue: null,
  state: 0,
  next() {
    if (this.queue.length) return Math.max(0, Math.min(0.999999, Number(this.queue.shift())));
    if (this.seedValue !== null) return this.nextSeeded();
    return Math.random();
  },
  nextSeeded() {
    // mulberry32：短小、状态可保存、跨浏览器一致。
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  set(values) { this.queue = [...values]; },
  seed(value) {
    const text = String(value ?? '');
    this.seedValue = text;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    this.state = hash >>> 0;
    return this.state;
  },
  /* 纯视听随机（音量抖动、粒子）用这个，避免消耗掉玩法随机序列。 */
  cosmetic() { return Math.random(); }
};

const pick = list => list[Math.floor(rng.next() * list.length)];
const rand = (min, max) => Math.floor(rng.next() * (max - min + 1)) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
/* 只把「缺失」当缺失。属性合法地等于 0 时不能悄悄变成 5 ——
   原版 effectiveStat(...) || 5 会让被削到 0 的属性凭空回到 5。 */
const statOr = (value, fallback = 5) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const shuffle = list => [...list].map(value => ({ value, order: rng.next() })).sort((a, b) => a.order - b.order).map(entry => entry.value);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const uniqueAdd = (list, value) => list.includes(value) ? list : [...list, value];

const ROOMS = [
  { id: 'bedroom', name: '自己的房间', floor: '西翼 · 二层', atlas: 'room-atlas-a.png', pos: '0% 0%', desc: '烛火照着没有寄件人的信，床下偶尔传来第二个人的呼吸。', icon: '▣' },
  { id: 'corridor', name: '长烛走廊', floor: '西翼 · 二层', atlas: 'room-atlas-a.png', pos: '100% 0%', desc: '两排房门沉默地望着彼此，脚步声总比你多一次。', icon: '⋯' },
  { id: 'hall', name: '黑冠大厅', floor: '主楼 · 一层', atlas: 'room-atlas-a.png', pos: '0% 100%', desc: '双生楼梯通向不同的黑暗，正门后有什么东西在缓慢呼吸。', icon: '♜' },
  { id: 'kitchen', name: '旧厨房', floor: '东翼 · 一层', atlas: 'room-atlas-a.png', pos: '100% 100%', desc: '滴水与铜锅碰撞出不安的节拍，砧板上的刀自己转了半圈。', icon: '♨' },
  { id: 'library', name: '沉默图书馆', floor: '东翼 · 二层', atlas: 'room-atlas-b.png', pos: '0% 0%', desc: '书页在无风时翻动，梯子停在一本没有书名的黑皮书前。', icon: '▤' },
  { id: 'basement', name: '潮湿地下室', floor: '主楼 · 地下一层', atlas: 'room-atlas-b.png', pos: '100% 0%', desc: '管道发出低鸣，积水倒映着一张不属于你的脸。', icon: '⌁' },
  { id: 'attic', name: '风蚀阁楼', floor: '西翼 · 顶层', atlas: 'room-atlas-b.png', pos: '0% 100%', desc: '木板随风弯曲，蒙布下的东西每隔一会儿就换一个姿势。', icon: '⌃' },
  { id: 'secret', name: '星图密室', floor: '墙体夹层', atlas: 'room-atlas-b.png', pos: '100% 100%', desc: '移动书架刚刚合拢，仪式桌上的墨水仍保持温热。', icon: '◉' },
  { id: 'garden', name: '荆棘花园', floor: '北侧 · 温室', atlas: 'room-atlas-c.png', pos: '0% 0%', desc: '月光落在湿润玫瑰上，虫鸣会在你转身时突然停下。', icon: '✿' },
  { id: 'clock', name: '无眠钟楼', floor: '主楼 · 塔顶', atlas: 'room-atlas-c.png', pos: '100% 0%', desc: '巨大的钟摆切割月光，齿轮间卡着一枚仍在跳动的怀表。', icon: '◷' },
  { id: 'storage', name: '蒙尘储藏室', floor: '东翼 · 夹层', atlas: 'room-atlas-c.png', pos: '0% 100%', desc: '箱子堆出狭窄通道，盖着白布的雕像悄悄面向门口。', icon: '▥' },
  { id: 'chapel', name: '破败祷告室', floor: '北侧 · 一层', atlas: 'room-atlas-c.png', pos: '100% 100%', desc: '蜡烛向下燃烧，彩窗上的圣徒把手指放在嘴边。', icon: '†' },
  { id: 'dungeon', name: '锁链地牢', floor: '城堡 · 最深处', atlas: 'room-atlas-b.png', pos: '100% 0%', desc: '铁链贴着潮湿石墙缓慢收紧，牢门外的脚步从不属于同一个人。', icon: '▦', special: true },
  { id: 'reward', name: '神秘奖励房', floor: '不存在的夹层', atlas: 'room-atlas-b.png', pos: '100% 100%', desc: '符文在金色裂隙中逐个苏醒，房间像刚刚拆开的一份危险礼物。', icon: '✦', special: true }
];

const ROOM_BY_ID = Object.fromEntries(ROOMS.map(room => [room.id, room]));
/* 新阶段的房间登记在这里，纯追加。带 stage 字段的房间不进「原有城堡」的普通房间池，
   所以原来那 12 间房、地牢、奖励房的行为一行都不受影响。
   背景图：复用现有 visuals/。把图命名成 {房间id}.png 放进 visuals/ 就会自动换上，
   不需要改代码（ClassicVisuals.roomAsset 会先按房间 id 找图）。 */
const STAGE_ROOMS = [
	// —— 城堡之巅：3 个普通房间 + 1 个地狱 ——
	{ id: 'windCorridor', name: '风蚀回廊', floor: '城堡之巅 · 高空', stage: 'summit', fallbackScene: 'upper-wing', desc: '断桥横在回廊尽头，风把石屑吹成一条不肯落地的线。', icon: '⇡' },
	{ id: 'starObservatory', name: '星火观测台', floor: '城堡之巅 · 塔侧', stage: 'summit', fallbackScene: 'clock', desc: '星盘在头顶缓慢错位，一束失控的光每隔几息扫过墙面。', icon: '✷' },
	{ id: 'courtBanquet', name: '王庭遗宴', floor: '城堡之巅 · 旧厅', stage: 'summit', fallbackScene: 'hall', desc: '餐具悬在长桌上方，契约的墨迹还没干。', icon: '♜' },
	{ id: 'hellOfSin', name: '焚罪地狱', floor: '城堡之巅 · 灰烬底层', stage: 'summit', fallbackScene: 'dungeon', special: true, desc: '锁链从穹顶垂进灰烬里，台阶一级级通向审判之门。', icon: '△' },
	// —— 终局之战：8 个房间（最后避难所也在其中）——
	{ id: 'bellTower', name: '塔顶钟楼', floor: '终局之战 · 塔顶', stage: 'finale', fallbackScene: 'clock', desc: '钟舌比人还高，每一声钟声都把塔身推向另一个方向。', icon: '◷' },
	{ id: 'bloodThrone', name: '血染王座', floor: '终局之战 · 王座厅', stage: 'finale', fallbackScene: 'hall', desc: '王座上的暗红从未干过，厅里的影子都在等一个人坐下。', icon: '♛' },
	{ id: 'lastHaven', name: '最后避难所', floor: '终局之战 · 边廊', stage: 'finale', fallbackScene: 'dungeon', special: true, desc: '铁门只锁一次，锁过的人会被送向下一个房间。', icon: '⛓' },
	{ id: 'brokenBanner', name: '断旗战庭', floor: '终局之战 · 战庭', stage: 'finale', fallbackScene: 'hall', desc: '旗杆倒了一半，泥地里全是踩碎的徽记。', icon: '⚔' },
	{ id: 'royalVault', name: '王库残厅', floor: '终局之战 · 库房', stage: 'finale', fallbackScene: 'storage', desc: '柜门全开，值钱的东西却一件没少——因为它们都在别人身上。', icon: '▤' },
	{ id: 'obsidianCouncil', name: '黑曜议事厅', floor: '终局之战 · 议事厅', stage: 'finale', fallbackScene: 'library', desc: '长桌两侧的椅子还带着体温，契约叠在正中央。', icon: '◈' },
	{ id: 'ashAltar', name: '灰烬圣坛', floor: '终局之战 · 圣坛', stage: 'finale', fallbackScene: 'chapel', desc: '香灰堆到脚踝，石台上的水还是温的。', icon: '†' },
	{ id: 'mirrorGallery', name: '裂镜长廊', floor: '终局之战 · 长廊', stage: 'finale', fallbackScene: 'secret', desc: '镜面碎成窄条，每一条里的你都比上一条更远一点。', icon: '☍' },
	// —— 钟楼碎影：5 个时空房间 ——
	{ id: 'traceGate', name: '循迹之门', floor: '钟楼碎影 · 轨迹', stage: 'shard', fallbackScene: 'secret', desc: '发光轨迹从门框穿过，尽头站着一个只剩轮廓的人。', icon: '⌁' },
	{ id: 'goldVault', name: '流金密室', floor: '钟楼碎影 · 逆流', stage: 'shard', fallbackScene: 'storage', desc: '金币逆着地心往上走，宝库的门框正在缓慢错位。', icon: '✦' },
	{ id: 'ruinConvergence', name: '毁灭汇点', floor: '钟楼碎影 · 汇流', stage: 'shard', fallbackScene: 'hall', desc: '所有裂纹都朝一个方向汇，站上去会觉得人数不再重要。', icon: '◎' },
	{ id: 'mirrorSanctum', name: '镜像圣所', floor: '钟楼碎影 · 倒影', stage: 'shard', fallbackScene: 'garden', desc: '镜面把你的属性摊开成符号，最弱的那一项格外清楚。', icon: '◇' },
	{ id: 'collapseClock', name: '崩溃时钟', floor: '钟楼碎影 · 中心', stage: 'shard', fallbackScene: 'clock', special: true, desc: '钟盘悬空，中心是黑的，周围的房间碎片正一圈圈掉下去。', icon: '◉' }
];
ROOMS.push(...STAGE_ROOMS);
// ROOM_BY_ID 在上面就建好了，这里把新房间补进去（Object.assign 只补键，不重建表）。
Object.assign(ROOM_BY_ID, Object.fromEntries(STAGE_ROOMS.map(room => [room.id, room])));

/* 原有城堡的普通房间池：12 间，和改动前完全一致。
   带 stage 字段的房间属于新阶段，不进这个池子。 */
const NORMAL_ROOM_IDS = ROOMS.filter(room => !room.special && !room.stage).map(room => room.id);
/* 【msg8 §18】钟楼碎影落点扩及整座城堡：排除 special（崩溃时钟另行显形）与终局核心房
   （塔顶钟楼/血染王座），其余所有房间都进碎影门池。 */
const ALL_LANDING_ROOM_IDS = ROOMS.filter(room => !room.special && room.id !== 'collapseClock' && room.id !== 'bellTower' && room.id !== 'bloodThrone').map(room => room.id);
const stageRoomIds = stageId => stageId === 'shard' ? ALL_LANDING_ROOM_IDS : STAGE_ROOMS.filter(room => room.stage === stageId).map(room => room.id);

/* 焚罪地狱的失败代价（提示词第四节）。
   失败就按这里的账扣，然后继续留在地狱、下一次行动重新选考验。
   成功后给一次小额补偿并自动传送到随机普通房间。 */
const HELL_COSTS = {
	'踏过炽链': [['health', -1], ['stamina', -1]],
	'直面审判': [['stamina', -2]],
	'辨认赦令': [['sanity', -2]],
	'数清钟摆': [['sanity', -1]],
	'赎回影子': [['stamina', -1]],
	'向审判者求饶': [['sanity', -1]]
};
/* 连续失败两次后出现的保底选项：损失 1 点当前最高基础属性后离开；
   基础属性已无可扣值时免费离开。 */
const HELL_GUARANTEE_TEXT = '交出一段记忆';
const HELL_GUARANTEE_FLAVOR = '把最锋利的那一段自己留在灰烬里';
const SAFE_DUNGEON_EXITS = NORMAL_ROOM_IDS.filter(id => id !== 'secret');

const GRAPH = {
  bedroom: [['corridor', 'open'], ['hall', 'down'], ['attic', 'ladder']],
  corridor: [['bedroom', 'close'], ['hall', 'run'], ['kitchen', 'push'], ['library', 'open'], ['storage', 'sneak']],
  hall: [['corridor', 'run'], ['kitchen', 'open'], ['library', 'up'], ['chapel', 'push'], ['garden', 'window'], ['clock', 'up']],
  kitchen: [['corridor', 'push'], ['hall', 'open'], ['basement', 'down'], ['garden', 'window'], ['storage', 'push']],
  library: [['corridor', 'close'], ['hall', 'down'], ['attic', 'ladder'], ['secret', 'push'], ['chapel', 'sneak']],
  basement: [['kitchen', 'up'], ['storage', 'sneak'], ['secret', 'push'], ['hall', 'up']],
  attic: [['bedroom', 'ladder'], ['library', 'down'], ['clock', 'ladder'], ['storage', 'down']],
  secret: [['library', 'push'], ['basement', 'sneak'], ['chapel', 'push'], ['storage', 'sneak']],
  garden: [['hall', 'window'], ['kitchen', 'window'], ['chapel', 'sneak'], ['clock', 'up']],
  clock: [['hall', 'down'], ['attic', 'down'], ['garden', 'down'], ['chapel', 'down']],
  storage: [['corridor', 'sneak'], ['kitchen', 'push'], ['basement', 'down'], ['attic', 'ladder'], ['chapel', 'sneak']],
  chapel: [['hall', 'open'], ['library', 'sneak'], ['secret', 'push'], ['garden', 'open'], ['clock', 'up'], ['storage', 'sneak']]
};

const ACTION_LABEL = {
  open: '推开房门', close: '关门离开', up: '踏上楼梯', down: '沿阶而下', push: '推开沉重暗门',
  window: '钻过破窗', ladder: '攀上木梯', sneak: '贴墙潜行', run: '快速奔跑', escape: '逃离地牢',
  /* 终局与碎影的「留在原地」也是一条正常路线，必须有名字，
     否则选项上会出现 undefined。 */
  stay: '留在原地'
};

const ACTION_TAGS = {
  open: ['lock', 'mechanism'], close: ['mechanism'], up: ['climb'], down: ['climb', 'dark'], push: ['pry', 'force'],
  window: ['window', 'climb'], ladder: ['climb'], sneak: ['stealth', 'dark'], run: ['escape'], escape: ['escape', 'dark']
};

const STAT_LABEL = {
  health: '生命', stamina: '体力', sanity: '理智', strength: '力量', agility: '敏捷', perception: '感知',
  luck: '运气', intimidation: '威慑', stealth: '隐藏', keys: '钥匙', clues: '线索'
};

/* ---------------------------------------------------------------------------
 * 人物立绘素材表（外观层，不改任何规则）
 * ---------------------------------------------------------------------------
 * 七张独立 PNG 里，三张给了三名现有角色；其余四张登记在这里作为「可选外观」，
 * 只影响画哪张图，绝不新增技能 / 属性 / 关系 / 结局 —— 复用所选基础角色的整套规则。
 * 02 是双人相拥的一个不可拆分视觉单位：artWide 让占位更宽、两人都不裁，
 * 且不产生第二个操控者、第二套行动或第二个碰撞主体。
 * 接入提示词明确要求：新增可玩身份需用户另行指定，因此这里不把它们登记成新角色。
 * ------------------------------------------------------------------------- */
const ART_SKINS = {
  '01-white-pink-flower': { src: 'assets/01-white-pink-flower.png', bounds: [357, 23, 983, 1238], label: '白粉花帽' },
  '02-embracing-duo': { src: 'assets/02-embracing-duo.png', bounds: [115, 23, 1174, 1236], label: '相拥双子', artWide: true },
  '03-black-red-hood': { src: 'assets/03-black-red-hood.png', bounds: [343, 40, 971, 1234], label: '黑红兜帽' },
  '04-green-rose': { src: 'assets/04-green-rose.png', bounds: [137, 5, 1187, 1241], label: '绿玫瑰' },
  '05-crimson-crown': { src: 'assets/05-crimson-crown.png', bounds: [227, 6, 1026, 1248], label: '绯红冠' },
  '06-rainbow-painter': { src: 'assets/06-rainbow-painter.png', bounds: [212, 33, 1041, 1230], label: '彩绘笔' },
  '07-indigo-sheep': { src: 'assets/07-indigo-sheep.png', bounds: [155, 74, 1111, 1226], label: '靛蓝抱羊' }
};

const HEROES = [
  {
    name: '皮普', title: '铃铛骑士', className: 'hero-0', trait: '坚韧与正面压制', kit: ['rustKey', 'ironBadge'],
    // 独立 PNG 素材（可选字段）。素材不存在时自动回退到旧 heroes-v2.png 图集，绝不出现空框。
    // 尺寸与脚底锚点按 alpha≥32 的真实边界推算，不按整幅 1254 画布贴边裁切。
    talent: {
      id: 'bellEcho', name: '铁钟回响',
      summary: '硬碰硬失手的时候，钟声会替你卸掉最重的那一下。',
      detail: '以力气或气势正面硬上却彻底失手时，钟声会把最狠的那一半反噬挡掉，让事情只停在“没成”；一整夜里只响一次。'
    },
    base: { health: 5, stamina: 5, sanity: 3, strength: 7, agility: 5, perception: 5, luck: 5, intimidation: 6, stealth: 4, keys: 0, clues: 0 }
  },
  {
    name: '莫斯', title: '蘑菇炼金师', className: 'hero-1', trait: '感知与神秘解读', kit: ['lantern', 'mirrorCharm'],
    talent: {
      id: 'sporeBlend', name: '孢子调和',
      summary: '用过的东西常常还能再用一次；净化时能多洗掉一层附着的阴影。',
      detail: '每次动用行囊里的东西，它都有机会一点不磨损；净化时会额外多摘掉一个负面状态或诅咒。'
    },
    base: { health: 4, stamina: 3, sanity: 4, strength: 4, agility: 5, perception: 8, luck: 6, intimidation: 4, stealth: 6, keys: 0, clues: 1 }
  },
  {
    name: '诺克斯', title: '影子牧灯人', className: 'hero-2', trait: '敏捷与潜伏伏击', kit: ['lockpick', 'mistCloak'],
    talent: {
      id: 'lampfoot', name: '无灯脚步',
      summary: '藏在暗处、靠身手完成的事情更稳；没有人看着你时，下手格外顺。',
      detail: '凡是靠藏匿或身手去做的行动都更稳当；当这间房里没有第二双眼睛盯着你时，夺取会明显更容易得手。'
    },
    base: { health: 3, stamina: 4, sanity: 5, strength: 4, agility: 7, perception: 6, luck: 5, intimidation: 5, stealth: 8, keys: 0, clues: 0 }
  }
];

// 保留原版三人；七张新立绘各对应一个有独立规则的可玩角色。
const NEW_HEROES = [
  { name: '花棠', title: '白花信使', artSlug: '01-white-pink-flower', trait: '搜寻与留下线索', kit: ['chalk', 'tonic'], talent: { id: 'flowerTrace', name: '花径留痕', summary: '每回合首次成功搜寻会额外找到一条线索。', detail: '每回合第一次成功的搜寻行动额外获得一条线索。' }, base: { health: 4, stamina: 4, sanity: 5, strength: 4, agility: 6, perception: 8, luck: 6, intimidation: 4, stealth: 6, keys: 0, clues: 0 } },
  { name: '双生', title: '相拥旅者', artSlug: '02-embracing-duo', trait: '互相守护与疗愈', kit: ['styptic', 'mirrorCharm'], talent: { id: 'embraceWard', name: '共担微光', summary: '每回合首次受到伤害时保住一口气。', detail: '每回合首次在普通行动中受伤时，立即恢复一点生命并消除疲惫。两人是同一可玩单位。' }, base: { health: 5, stamina: 3, sanity: 4, strength: 4, agility: 4, perception: 6, luck: 6, intimidation: 5, stealth: 5, keys: 0, clues: 0 } },
  { name: '绯影', title: '蒙面潜行者', artSlug: '03-black-red-hood', trait: '暗处行动与脱身', kit: ['smokeVial', 'lockpick'], talent: { id: 'redVeil', name: '赤影换位', summary: '潜行行动更稳，失败时也能掩去踪迹。', detail: '隐藏与敏捷行动获得稳定加成；每回合首次潜行失败移除暴露并恢复一点体力。' }, base: { health: 3, stamina: 5, sanity: 4, strength: 4, agility: 8, perception: 6, luck: 5, intimidation: 5, stealth: 8, keys: 0, clues: 0 } },
  { name: '蔷薇', title: '温室守护者', artSlug: '04-green-rose', trait: '疗愈与荆棘通路', kit: ['thornSeed', 'tonic'], talent: { id: 'roseBloom', name: '蔷薇再生', summary: '每回合首次恢复行动会再补一点体力。', detail: '每回合第一次进行恢复或净化行动，额外恢复一点体力，并记下花园通路。' }, base: { health: 4, stamina: 4, sanity: 5, strength: 4, agility: 5, perception: 7, luck: 6, intimidation: 4, stealth: 5, keys: 0, clues: 0 } },
  { name: '夜冠', title: '赤冠执礼者', artSlug: '05-crimson-crown', trait: '威慑与坚定防线', kit: ['ironBadge', 'royalSeal'], talent: { id: 'crownOath', name: '赤冠号令', summary: '威慑更稳；每回合首次成功威慑后标记一名对手。', detail: '威慑行动获得稳定加成；每回合第一次成功威慑后标记一名在场对手——被标记者下回合行动风险提高，你对其夺取 / 攻击获得加成。' }, base: { health: 5, stamina: 4, sanity: 4, strength: 5, agility: 5, perception: 5, luck: 5, intimidation: 8, stealth: 4, keys: 0, clues: 0 } },
  { name: '彩墨', title: '斑斓画师', artSlug: '06-rainbow-painter', trait: '道具保养与发现', kit: ['paintVial', 'echoBell'], talent: { id: 'colorKeeper', name: '调色匣', summary: '每回合首次动用道具不磨损。', detail: '每回合首次真正消耗道具时保留它的耐久；若用画具，额外发现一条线索。' }, base: { health: 4, stamina: 4, sanity: 4, strength: 4, agility: 6, perception: 7, luck: 7, intimidation: 4, stealth: 5, keys: 0, clues: 0 } },
  { name: '眠羊', title: '靛蓝梦行者', artSlug: '07-indigo-sheep', trait: '稳住理智与梦境', kit: ['calmIncense', 'dreamThread'], talent: { id: 'dreamShepherd', name: '眠羊织梦', summary: '神秘行动更稳；每回合首次成功神秘后使一名对手陷入沉迷。', detail: '神秘与理智行动获得稳定加成；每回合第一次成功的神秘行动使一名对手陷入「沉迷」——其下回合敏捷与感知临时下降，并暴露一条线索给你。' }, base: { health: 4, stamina: 3, sanity: 5, strength: 4, agility: 5, perception: 7, luck: 6, intimidation: 4, stealth: 6, keys: 0, clues: 1 } }
];
HEROES.push(...NEW_HEROES);

/* 【msg8 §4】每角色一个主动技能（与被动 talent 并存）。
   limit：oncePerGame 每局 1 次 / oncePerStage 每图 1 次 / every3 每 3 回合 1 次。
   触发条件：限次通过 + 不在冷却 + 当前处于选择阶段。目标类技能用 intent.targetId。 */
const HERO_ACTIVES = {
  bellEcho: { name: '铁钟回响', limit: 'oncePerGame', desc: '下回合所有强攻额外 +3 力量判定。', needsTarget: false },
  sporeBlend: { name: '孢子调和', limit: 'oncePerStage', desc: '立刻净化自身全部诅咒，并恢复 1 点理智。', needsTarget: false },
  lampfoot: { name: '无灯脚步', limit: 'every3', desc: '本回合下次夺取失败可重掷一次（隐藏判定豁免）。', needsTarget: false },
  flowerTrace: { name: '花径留痕', limit: 'oncePerStage', desc: '标记一名对手，立即获取一条线索，并获得 1 点感知。', needsTarget: true },
  embraceWard: { name: '共担微光', limit: 'oncePerGame', desc: '立即恢复 1 点生命，并解除「受伤」「疲惫」。', needsTarget: false },
  redVeil: { name: '赤影换位', limit: 'every3', desc: '本回合脱身 / 潜行更稳，立刻抹去暴露并 +1 体力。', needsTarget: false },
  roseBloom: { name: '蔷薇再生', limit: 'oncePerStage', desc: '立即回满 3 点体力，并记下花园通路。', needsTarget: false },
  crownOath: { name: '赤冠号令', limit: 'oncePerGame', desc: '标记一名在场对手；本回合对其夺取失败可重掷一次。', needsTarget: true },
  colorKeeper: { name: '调色匣', limit: 'oncePerStage', desc: '立即获得一条线索，并把一件同房目标的一件道具「上色」——使其暴露。', needsTarget: true },
  dreamShepherd: { name: '眠羊织梦', limit: 'oncePerGame', desc: '使一名对手「沉迷」：本回合其逃脱 / 潜行再难成立，并暴露一条线索给你。', needsTarget: true }
};

function heroActiveOf(player) {
  const id = HEROES[player?.hero]?.talent?.id;
  return id ? (HERO_ACTIVES[id] || null) : null;
}
/* 主动技能当前是否可放：限次 + 冷却 + 阶段 + 目标。 */
function activeAvailability(player) {
  const active = heroActiveOf(player);
  if (!active) return { ok: false, reason: '该角色没有主动技能' };
  if (!isSelectPhase()) return { ok: false, reason: '当前阶段不能释放技能' };
  if (playerCannotAct(player)) return { ok: false, reason: '本回合已无法行动' };
  const used = player.activeUsed?.[active.name] || 0;
  if (active.limit === 'oncePerGame' && used >= 1) return { ok: false, reason: '本局已用过' };
  if (active.limit === 'oncePerStage' && used >= 1 && player.activeStageId === state.stageId) return { ok: false, reason: '本图已用过' };
  if (active.limit === 'every3' && (player.activeCooldown || 0) > 0) return { ok: false, reason: `冷却中（还剩 ${player.activeCooldown} 回合）` };
  if (active.needsTarget && !activeTargetsFor(player).length) return { ok: false, reason: '当前没有合法目标' };
  return { ok: true, reason: '' };
}
function activeTargetsFor(player) {
  return state.players.filter(other => other.id !== player.id && !other.collapsed
    && other.room === player.room && other.room !== 'dungeon' && other.room !== 'reward');
}
/* 释放主动技能：走与道具一致的面板 / 确认流程，无需占行动槽。 */
function useActiveSkill(playerIndex, targetId = null) {
  const player = state.players[playerIndex];
  if (!player || player.control !== 'human') return false;
  const avail = activeAvailability(player);
  if (!avail.ok) return false;
  if (!openActivePanel(playerIndex, targetId)) return false;
  return confirmActiveSkill(playerIndex);
}
function applyActiveSkill(player, active, target, result) {
  player.activeUsed = player.activeUsed || {};
  player.activeUsed[active.name] = (player.activeUsed[active.name] || 0) + 1;
  player.activeStageId = state.stageId;
  if (active.limit === 'every3') player.activeCooldown = 3;
  switch (active.name) {
    case '铁钟回响':
      player.buffs = [...(player.buffs || []), { id: 'active-bell', name: '铁钟回响', rounds: 1, statKey: 'strength', delta: 3, source: '主动技能' }];
      result.consequences.push('钟声在你胸中回响：下回合所有强攻获得额外力量判定。');
      break;
    case '孢子调和':
      if (player.curses.length) { result.consequences.push(`孢子散开，${player.curses.length} 道诅咒被中和。`); player.curses = []; }
      else result.consequences.push('孢子散开，你身上没有可中和的诅咒。');
      applyChanges(player, [['sanity', 1]], result);
      break;
    case '无灯脚步':
      player.buffs = [...(player.buffs || []), { id: 'active-lamp', name: '无灯脚步', rounds: 1, tag: 'seizeReroll', source: '主动技能' }];
      result.consequences.push('你踏进没有光的缝隙：本回合下一次夺取失手还会再试一次。');
      break;
    case '花径留痕':
      applyChanges(player, [['clues', 1], ['perception', 1]], result);
      if (target) { target.marks = uniqueAdd(target.marks, `花痕·${player.label}`); result.consequences.push(`花径缠上${target.label}，你循着它多握到一条线索。`); }
      break;
    case '共担微光':
      applyChanges(player, [['health', 1]], result);
      removeStatuses(player, ['受伤', '疲惫'], result);
      result.consequences.push('微光替你与同伴分担，伤口与疲惫都退了半分。');
      break;
    case '赤影换位':
      removeStatuses(player, ['暴露'], result);
      applyChanges(player, [['stamina', 1]], result);
      player.buffs = [...(player.buffs || []), { id: 'active-redveil', name: '赤影换位', rounds: 1, tag: 'stealthSteady', source: '主动技能' }];
      result.consequences.push('你与自己的影子换了位，踪迹和疲惫一起被抹去。');
      break;
    case '蔷薇再生':
      applyChanges(player, [['stamina', 3]], result);
      player.flags = uniqueAdd(player.flags, 'gardenRoute');
      result.consequences.push('蔷薇在伤口上开花，三口气回来了，花园也认下这条路。');
      break;
    case '赤冠号令':
      if (target) { target.marks = uniqueAdd(target.marks, '赤冠号令'); player.activeMarked = target.id; result.consequences.push(`赤冠号令指向${target.label}：本回合对其夺取失手还会再试一次。`); }
      break;
    case '调色匣':
      applyChanges(player, [['clues', 1]], result);
      if (target && target.inventory.length) { const it = pick(target.inventory); target.statuses = uniqueAdd(target.statuses, '暴露'); result.consequences.push(`你给${ITEMS[it.id].name}上了一层色，${target.label}的行踪随之暴露。`); }
      else result.consequences.push('调色匣替你记下一条线索。');
      break;
    case '眠羊织梦':
      if (target) { target.buffs = [...(target.buffs || []), { id: 'active-dream', name: '沉迷', rounds: 1, tag: 'dazed', delta: -2, source: '眠羊织梦' }]; result.consequences.push(`${target.label}陷入沉迷，逃不开了。`); }
      applyChanges(player, [['clues', 1]], result);
      break;
    default:
      result.consequences.push(`${active.name}在这一刻没有产生额外效果。`);
  }
}
/* 每回合开始时递减主动技能冷却。 */
function tickActiveCooldown(player) { player.activeCooldown = Math.max(0, (player.activeCooldown || 0) - 1); }

/* ---------------------------------------------------------------------------
 * 道具系统
 * ---------------------------------------------------------------------------
 * category 决定它在行囊里的分区与使用方式：
 *   active   主动道具 —— 必须玩家确认时机与目标，消耗当前行动（quick 类不消耗）
 *   passive  被动/装备 —— 装备后持续生效，界面上写明触发条件与是否耗耐久
 *   reactive 反应道具 —— 被攻击/踩陷阱/中诅咒时弹出确认；可设“本局自动使用”
 *   relic    关键遗物 —— 独特边框 + 低频动画，不与消耗品混放
 * effect 字段是真实结算入口，禁止只写文案。
 */
const ITEM_CATEGORY = {
  active: { label: '主动道具', short: '主动', tone: '#c9a35c' },
  equipment: { label: '体系装备 / 武器', short: '装备', tone: '#d0a87b' },
  passive: { label: '通用被动', short: '被动', tone: '#7fa8c9' },
  reactive: { label: '反应道具', short: '反应', tone: '#c98080' },
  relic: { label: '关键遗物', short: '遗物', tone: '#b47bd3' }
};

const ITEMS = {
  // 六件基础道具全部改成"用了当场看得见结果"的效果：改变资源 / 状态 / 位置，而不是暗改概率。
  rustKey: { name: '生锈钥匙', glyph: '⚿', colors: ['#b88a4f', '#3a291d'], type: 'common', category: 'active', useTags: ['lock', 'pry'], bonus: 2, durability: 2, description: '锈屑落进锁孔，旧锁会认它。', effect: { kind: 'openLock' } },
  lockpick: { name: '折光撬锁针', glyph: '⋔', colors: ['#7ba6b5', '#263744'], type: 'common', category: 'active', useTags: ['lock', 'mechanism'], bonus: 2.2, durability: 2, description: '细针比手指更懂暗格与锁孔。', effect: { kind: 'pick' } },
  lantern: { name: '守夜提灯', glyph: '◐', colors: ['#d6a94c', '#49311d'], type: 'common', category: 'active', useTags: ['dark', 'search'], bonus: 2, durability: 2, description: '把这一段黑暗从房间里拎出去。', effect: { kind: 'light' } },
  chalk: { name: '星纹粉笔', glyph: '✧', colors: ['#b99ada', '#3c2d50'], type: 'common', category: 'active', useTags: ['rune', 'mystery'], bonus: 2.3, durability: 2, description: '在墙上留一道只有你认得的纹路。', effect: { kind: 'mark' } },
  rope: { name: '银扣绳钩', glyph: '⌁', colors: ['#a8a9af', '#35363b'], type: 'common', category: 'active', useTags: ['climb', 'window'], bonus: 2, durability: 2, description: '绳子替你找到一条不该存在的路。', effect: { kind: 'shortcut' } },
  tonic: { name: '苦味药瓶', glyph: '♧', colors: ['#7fb66d', '#263a25'], type: 'common', category: 'active', useTags: ['heal', 'taste'], bonus: 2.1, durability: 2, description: '苦味会先把血止住，也能试探可疑食物。', effect: { kind: 'heal', health: 1, removeStatuses: ['受伤', '虚弱', '疲惫'] } },

  // —— 主动道具（新增）——
  scrollOfPassage: {
    name: '传送卷轴', glyph: '⌘', colors: ['#9c8ce0', '#2c2450'], type: 'common', category: 'active', quick: false,
    useTags: ['mystery', 'escape'], bonus: 2.4, durability: 2, rare: true,
    description: '选择一名仍在场的角色，把自己传送到其所在的普通房间。',
    effect: { kind: 'teleport', requiresTarget: true, forbidRooms: ['dungeon', 'reward'], warn: '使用时会向双方暴露彼此的位置。' }
  },
  returnFeather: {
    name: '返程羽毛', glyph: '❧', colors: ['#cbb27a', '#4a3a22'], type: 'common', category: 'active', quick: false,
    useTags: ['escape', 'search'], bonus: 2.2, durability: 2,
    description: '顺着来时的记忆回到自己的初始房间。',
    effect: { kind: 'returnHome' }
  },
  smokeVial: {
    name: '烟雾瓶', glyph: '☁', colors: ['#8d93a6', '#2b2f3d'], type: 'common', category: 'active', quick: true,
    useTags: ['stealth', 'escape'], bonus: 2.6, durability: 2,
    description: '从行囊主动使用：立即脱离同房冲突，并降低下一次被夺取的概率。不占行动。',
    effect: { kind: 'smoke', breakCombat: true, lowerIncoming: .20 }
  },
  styptic: {
    name: '止血剂', glyph: '✚', colors: ['#c96a6a', '#43202a'], type: 'common', category: 'active', quick: true,
    useTags: ['heal', 'guard'], bonus: 2.2, durability: 2,
    description: '恢复生命并移除“受伤”。顺手就能用，不占这一步。',
    effect: { kind: 'heal', health: 2, removeStatuses: ['受伤'] }
  },
  calmIncense: {
    name: '镇静香', glyph: '❁', colors: ['#9fc6a0', '#2b3d2c'], type: 'common', category: 'active', quick: true,
    useTags: ['heal', 'mystery'], bonus: 2.2, durability: 2,
    description: '恢复理智并移除“恐惧”或“动摇”。顺手就能用，不占这一步。',
    effect: { kind: 'soothe', sanity: 2, removeStatuses: ['恐惧', '动摇'] }
  },
  echoBell: {
    name: '回声铃', glyph: '♢', colors: ['#d9b458', '#4a3718'], type: 'common', category: 'active', quick: false,
    useTags: ['search', 'mechanism'], bonus: 2.4, durability: 2,
    description: '摇响后查看一个未知出口的房间名称与危险等级。',
    effect: { kind: 'scout' }
  },
  waxDouble: {
    name: '替身蜡像', glyph: '♟', colors: ['#cfa27f', '#453023'], type: 'common', category: 'active', quick: false,
    useTags: ['guard', 'curse'], bonus: 2.8, durability: 2, rare: true,
    description: '下一次失败不会把你送进地牢；替死时蜡像会当场碎掉，不再归还。',
    effect: { kind: 'ward', preventsJail: 1 }
  },
  chainKey: {
    name: '锁链钥匙', glyph: '⚯', colors: ['#b0a06a', '#3a3320'], type: 'common', category: 'active', quick: false,
    useTags: ['lock', 'escape'], bonus: 2.7, durability: 2, rare: true,
    description: '携带时自动使地牢锁链少限制一次行动。每局最多生效一次。',
    effect: { kind: 'shortenJail', limited: 'oncePerGame' }
  },
  swapContract: {
    name: '交换契约', glyph: '⇄', colors: ['#b98aa6', '#3d2436'], type: 'common', category: 'active', quick: false,
    useTags: ['intimidate', 'mystery'], bonus: 2.3, durability: 2,
    description: '与同房目标交换一件双方确认的普通道具。',
    effect: { kind: 'swap', requiresTarget: true, sameRoomOnly: true }
  },
  curseLens: {
    name: '破咒镜片', glyph: '⑂', colors: ['#8fbccb', '#26343f'], type: 'common', category: 'active', quick: false,
    useTags: ['curse', 'mystery'], bonus: 2.6, durability: 2,
    description: '查看一条诅咒的真实效果，并决定是否消耗镜片解除它。',
    effect: { kind: 'inspectCurse' }
  },

  // —— 被动 / 装备 ——
  moonBoots: {
    name: '月影靴', glyph: '⇞', colors: ['#8fa6d8', '#272f4a'], type: 'passive', category: 'passive',
    useTags: ['escape', 'climb'], bonus: 2.4, durability: 2, rare: true,
    description: '穿上它，需要身手的行动更容易成事；每次触发磨掉一点耐久。',
    effect: { kind: 'passive', statKey: 'agility', chanceBonus: .06, wearOnTrigger: true }
  },
  vigilLamp: {
    name: '守夜灯', glyph: '⚱', colors: ['#dfb968', '#43331b'], type: 'passive', category: 'passive',
    useTags: ['dark', 'search'], bonus: 2.5, durability: 2, rare: true,
    description: '挂在身上，黑暗里的搜寻与察看得更清楚；每次触发磨掉一点耐久。',
    effect: { kind: 'passive', statKey: 'perception', chanceBonus: .06, requiresTag: 'dark', wearOnTrigger: true }
  },

  // —— 反应道具 ——
  ironBadge: { name: '铁刺徽章', glyph: '✥', colors: ['#bd6c5f', '#442027'], type: 'defense', category: 'reactive', useTags: ['guard', 'intimidate'], bonus: 2.2, durability: 2, autoProtect: true, description: '格挡攻击或强化威慑，成功时能够反制。', effect: { kind: 'reactive', trigger: 'attack' } },
  mirrorCharm: { name: '镜纹护符', glyph: '◇', colors: ['#8cc7dd', '#303a59'], type: 'defense', category: 'reactive', useTags: ['guard', 'curse'], bonus: 2.8, durability: 2, autoProtect: true, rare: true, description: '反射攻击，也能隔绝诅咒。', effect: { kind: 'reactive', trigger: 'attack' } },
  mistCloak: { name: '雾幕披肩', glyph: '≈', colors: ['#7989bd', '#292b4a'], type: 'defense', category: 'reactive', useTags: ['guard', 'stealth'], bonus: 2.5, durability: 2, autoProtect: true, rare: true, description: '在防护和潜行时扭曲轮廓。', effect: { kind: 'reactive', trigger: 'attack' } },

  // —— 关键遗物 ——
  resonance: { name: '共鸣石', glyph: '◎', colors: ['#ce83e5', '#482855'], type: 'relic', category: 'relic', useTags: ['reward', 'clock'], bonus: 3.4, durability: 2, rare: true, description: '唤醒奖励房与钟楼深处的共鸣。', effect: { kind: 'relicBonus', bonus: 3.4 } },
  moonCompass: { name: '月光罗盘', glyph: '✦', colors: ['#8dc8e7', '#293650'], type: 'relic', category: 'relic', useTags: ['reward', 'mystery'], bonus: 3.2, durability: 2, rare: true, description: '指向不存在的房间和神秘出口。', effect: { kind: 'relicBonus', bonus: 3.2 } },
  starKey: { name: '星纹钥匙', glyph: '✶', colors: ['#e1c56c', '#59411d'], type: 'relic', category: 'relic', useTags: ['reward', 'lock'], bonus: 3.5, durability: 2, rare: true, description: '开启奖励机关与最高等级的旧锁。', effect: { kind: 'relicBonus', bonus: 3.5 } },
  thornSeed: { name: '荆棘种子', glyph: '❀', colors: ['#86bb72', '#263c29'], type: 'common', category: 'active', useTags: ['window', 'heal'], bonus: 1.8, durability: 2, description: '长出一条通往花园的路，并恢复体力。', effect: { kind: 'gardenPath' } },
  royalSeal: { name: '赤冠蜡封', glyph: '♛', colors: ['#d77078', '#47212c'], type: 'common', category: 'active', useTags: ['guard', 'intimidate'], bonus: 2.1, durability: 2, description: '立起一次防护，压住慌乱。', effect: { kind: 'fortify' } },
  paintVial: { name: '斑斓墨瓶', glyph: '◈', colors: ['#86cde0', '#3c2759'], type: 'common', category: 'active', useTags: ['rune', 'search'], bonus: 1.9, durability: 2, description: '画出藏在墙里的线索，并记下一处暗路。', effect: { kind: 'paintPath' } },
  dreamThread: { name: '眠羊丝线', glyph: '☾', colors: ['#b6addd', '#262344'], type: 'common', category: 'active', useTags: ['curse', 'mystery'], bonus: 1.8, durability: 2, description: '剪去一道诅咒，或安抚失控的理智。', effect: { kind: 'dreamMend' } },
  ironRation: { name: '铁皮口粮', glyph: '▣', colors: ['#d5ac6d', '#493724'], type: 'common', category: 'active', useTags: ['heal', 'taste'], bonus: 1.5, durability: 2, description: '一口恢复体力，也能撑住一点伤势。', effect: { kind: 'rations' } },
  glassMoth: { name: '玻璃蛾', glyph: '✧', colors: ['#a8dde1', '#304553'], type: 'common', category: 'active', useTags: ['search', 'dark'], bonus: 1.7, durability: 2, description: '追着蛾光找到线索，并在下一次行动占先。', effect: { kind: 'mothGuide' } },
  graveSalt: { name: '墓园盐', glyph: '❖', colors: ['#d3c6bb', '#534650'], type: 'common', category: 'active', useTags: ['curse', 'guard'], bonus: 1.8, durability: 2, description: '驱散一道诅咒与暴露的痕迹。', effect: { kind: 'saltWard' } },
  clockSpring: { name: '钟芯发条', glyph: '◷', colors: ['#dfbf70', '#554025'], type: 'common', category: 'active', useTags: ['clock', 'mechanism'], bonus: 1.7, durability: 2, description: '恢复体力并获得下一步的专注。', effect: { kind: 'springWind' } },
  shadowDart: { name: '影缝飞刃', glyph: '✣', colors: ['#b273a5', '#35233c'], type: 'common', category: 'active', useTags: ['stealth', 'intimidate'], bonus: 2.2, durability: 2, description: '同房投出飞刃，削去目标生命并留下暴露痕迹。', effect: { kind: 'attackDart', requiresTarget: true, sameRoomOnly: true } },
  thunderFlask: { name: '雷鸣药瓶', glyph: 'ϟ', colors: ['#eccb78', '#483751'], type: 'common', category: 'active', useTags: ['force', 'guard'], bonus: 2.1, durability: 1, description: '震荡同房的其他人，削去体力并暴露身形；自己也会受到惊吓。', effect: { kind: 'shockBurst' } },
  silkMantle: { name: '静步披肩', glyph: '◌', colors: ['#9c91b9', '#262637'], type: 'passive', category: 'passive', useTags: ['stealth', 'escape'], bonus: 1.8, durability: 2, description: '穿着它，潜行行动更稳；每次触发磨掉一点耐久。', effect: { kind: 'passive', statKey: 'stealth', chanceBonus: .08, wearOnTrigger: true } },
  starLens: { name: '窥星镜', glyph: '✴', colors: ['#a1c7d5', '#263847'], type: 'passive', category: 'passive', useTags: ['search', 'mystery'], bonus: 1.8, durability: 2, description: '搜寻与神秘行动时看得更清楚；每次触发磨掉一点耐久。', effect: { kind: 'passive', statKey: 'perception', chanceBonus: .08, wearOnTrigger: true } },
  wardRibbon: { name: '回护缎带', glyph: '❧', colors: ['#e7a8c1', '#4a2b42'], type: 'defense', category: 'reactive', useTags: ['guard', 'heal'], bonus: 2.3, durability: 2, autoProtect: true, description: '受袭时自动挡下一击，防护成功还会恢复一点体力。', effect: { kind: 'reactive', trigger: 'attack', onGuard: 'stamina' } },
  thornBuckler: { name: '刺藤小盾', glyph: '✿', colors: ['#9bb778', '#30402a'], type: 'defense', category: 'reactive', useTags: ['guard', 'force'], bonus: 2.2, durability: 2, autoProtect: true, description: '受袭时自动举盾；防护成功让来犯者留下暴露痕迹。', effect: { kind: 'reactive', trigger: 'attack', onGuard: 'expose' } }
};

const RECOVERY_IDS = [];
for (const [vital, label, names] of [
  ['health', '生命', ['止血贴', '急救包', '再生药箱']],
  ['stamina', '体力', ['糖盐片', '补给包', '强心药箱']],
  ['sanity', '理智', ['安神香', '静心包', '清明药箱']],
  ['all', '生命、体力和理智', ['三息药丸', '三相补给包', '全愈药箱']]
]) {
  [1, 2, 3].forEach((level, index) => {
    const id = `supply_${vital}_${level}`;
    RECOVERY_IDS.push(id);
    ITEMS[id] = { name: names[index], glyph: ['✚', '▣', '✦'][index], colors: ['#a8d9b6', '#294238'], type: 'supply',
      category: 'active', useTags: ['heal', 'taste'], bonus: level, durability: 1, rarity: ['common', 'fine', 'epic'][index],
      rare: level >= 2, description: `立即恢复${label}${level === 3 ? '大量' : level === 2 ? '适量' : '少量'}。`,
      effect: { kind: 'restore', vital, amount: level === 3 ? 5 : level === 2 ? 3 : 1 } };
  });
}
const WARP_IDS = [];
for (const [id, name, dest, tags] of [
  ['warp_shadow', '影路折页', 'attic', ['stealth', 'escape']],
  ['warp_forge', '炉门折页', 'basement', ['force', 'mechanism']],
  ['warp_star', '星图折页', 'library', ['search', 'mystery']],
  ['warp_garden', '温室折页', 'garden', ['heal', 'escape']],
  ['warp_chapel', '祷室折页', 'chapel', ['guard', 'heal']]
]) {
  WARP_IDS.push(id);
  ITEMS[id] = { name, glyph: '⌁', colors: ['#99bed2', '#2d354b'], type: 'portal', category: 'active', useTags: tags,
    bonus: 1.8, durability: 2, rarity: 'fine', description: `使用后传送至${ROOM_BY_ID[dest].name}，可去寻找当地更常见的装备。`,
    effect: { kind: 'warpRoom', dest } };
}
ITEMS.hunterBeacon = { name: '逐影罗盘', glyph: '◎', colors: ['#b887a8', '#3e2540'], type: 'portal', category: 'active',
  useTags: ['stealth', 'search'], bonus: 2, durability: 2, rarity: 'fine', description: '随机传送到一名仍在场的玩家所在房间，便于追击。', effect: { kind: 'huntWarp' } };
ITEMS.escapeBeacon = { name: '断踪羽', glyph: '➳', colors: ['#8fc8bd', '#233f41'], type: 'portal', category: 'active',
  useTags: ['escape', 'stealth'], bonus: 2, durability: 2, rarity: 'fine', description: '传送到无人普通房间，并降低下一次被夺取概率。', effect: { kind: 'escapeWarp' } };
ITEMS.dungeonShackle = { name: '狱影锁环', glyph: '⛓', colors: ['#998aaf', '#352c44'], type: 'passive', category: 'equipment',
  useTags: ['stealth', 'curse'], bonus: 2.4, unbreakable: true, rarity: 'epic', rare: true,
  description: '只在地牢深处找到的装备，提升潜行并在离开地牢后保留优势。',
  effect: { kind: 'passive', statKey: 'stealth', chanceBonus: .12, wearOnTrigger: false } };
/* 【msg8 §24】新增 4 件逃跑 / 传送道具，主掉落自探索 / 冒险选项与碎影召集房，不从商店直买。
   裂隙步 = 随机无人普通房（复用 escapeWarp）；镜渡符 = 指定友方 / NPC 房（复用 teleport·requiresTarget）；
   风信标 / 时砂漏 = 本回合脱身护持（新 effect 见 applyItemEffect）。 */
ITEMS.riftStep = { name: '裂隙步', glyph: '⌁', colors: ['#9fd0c8', '#21403f'], type: 'portal', category: 'active',
  useTags: ['escape', 'stealth', 'teleport'], bonus: 2.2, durability: 2, rarity: 'fine', rare: true,
  description: '踏进一道刚裂开的缝隙，落到随机一间无人的普通房间，并降低下次被夺概率。', effect: { kind: 'escapeWarp' } };
ITEMS.mirrorFerry = { name: '镜渡符', glyph: '⦿', colors: ['#b9a8dc', '#2b2850'], type: 'portal', category: 'active',
  useTags: ['escape', 'stealth', 'teleport', 'ally'], bonus: 2.4, durability: 2, rarity: 'fine', rare: true,
  description: '照出一名同伴或 NPC 所在的房间，把自己折叠过去。', effect: { kind: 'teleport', requiresTarget: true, forbidRooms: ['dungeon', 'reward'], warn: '使用时会向双方暴露彼此的位置。' } };
ITEMS.windBeacon = { name: '风信标', glyph: '✴', colors: ['#a8d6e0', '#243b46'], type: 'active', category: 'active', quick: true,
  useTags: ['escape', 'stealth'], bonus: 2.2, durability: 2, rarity: 'fine',
  description: '举起信标：本回合下次被夺更难下手，并临时 +1 敏捷。不占行动。', effect: { kind: 'windWard', agility: 1, lowerIncoming: .5 } };
ITEMS.hourglassEscape = { name: '时砂漏', glyph: '⧗', colors: ['#e0c97a', '#4a3a1c'], type: 'portal', category: 'active', quick: true,
  useTags: ['escape', 'clock'], bonus: 2.3, durability: 2, rarity: 'fine',
  description: '翻倒砂漏：立刻脱离当前房间，本回合免疫一次夺取。不占行动。', effect: { kind: 'clockEscape', lowerIncoming: .6 } };
for (const [id, name, value] of [['silverScrip', '银印筹', 1], ['goldScrip', '金印筹', 2], ['crownScrip', '夜冠筹', 3]]) {
  ITEMS[id] = { name, glyph: '♛', colors: ['#d6bb84', '#4a352d'], type: 'relic', category: 'relic',
    useTags: ['reward', 'search'], bonus: 0, durability: 1, rarity: value === 3 ? 'epic' : 'fine', rare: value > 1,
    description: `可作交易和抽奖筹码，价值${value}筹；平时不能使用。`, value,
    effect: { kind: 'currency' } };
}

// 后期构筑：行囊中的体系装备持续生效，2/4/6 件逐级解锁。
// 品质只控制掉落；阵营只控制光暗互动，两者互不替代。
const GEAR_SYSTEMS = {
  hunt: { name: '夜猎', stat: 'stealth', tags: ['stealth', 'escape'], color: '#a78fbf', names: ['影牙', '无声斗篷', '鸦目兜帽', '血线手套', '踏影靴', '猎月铃'] },
  eclipse: { name: '蚀冠', stat: 'intimidation', tags: ['curse', 'dark'], color: '#a46b9d', names: ['咒蚀刃', '丧仪袍', '黑纱冠', '债主手套', '葬步靴', '蚀冠印'] },
  breach: { name: '破城', stat: 'strength', tags: ['force', 'guard'], color: '#bc8071', names: ['裂门槌', '铸骨甲', '铁额盔', '碎盾拳套', '重锚靴', '城门戒'] },
  astral: { name: '星迹', stat: 'perception', tags: ['search', 'mystery'], color: '#80acc8', names: ['刻星针', '观测披衣', '测距冠', '校准手套', '巡星靴', '星盘'] },
  dawn: { name: '晨誓', stat: 'sanity', tags: ['heal', 'guard'], color: '#d9c785', names: ['曙光刃', '守誓袍', '白烛冠', '净银手套', '朝露靴', '晨星坠'] },
  fate: { name: '逆命', stat: 'luck', tags: ['search', 'mystery'], color: '#c3a8d6', names: ['偏骰匕首', '赌徒外衣', '双面冠', '筹码手套', '断线靴', '断针怀表'] },
  market: { name: '夜市商会', stat: 'luck', tags: ['search', 'mechanism'], color: '#d1ae75', names: ['秤骨刀', '账房长衣', '铜面冠', '验货手套', '行商靴', '黑金契约'] }
};
/* 成长倾向：由初始装备的体系决定，没有体系初始装备的按天赋定位给一个默认方向。
   阶段奖励与保底装备会照着这个方向给，保证「至少有一个选项匹配当前主方向」。 */
function heroKitSystem(hero) {
  for (const id of hero?.kit || []) {
    const system = ITEMS[id]?.system;
    if (system && GEAR_SYSTEMS[system]) return system;
  }
  const byTalent = {
    lampfoot: 'hunt', redVeil: 'hunt', sporeBlend: 'astral', flowerTrace: 'astral',
    embraceWard: 'dawn', roseBloom: 'dawn', crownOath: 'eclipse', colorKeeper: 'market',
    dreamShepherd: 'astral', bellEcho: 'breach'
  };
  return byTalent[hero?.talent?.id] || 'astral';
}
/* 角色当前的主方向：初始方向 + 行囊里实装最多的体系。 */
function growthDirection(player) {
  const counts = Object.keys(GEAR_SYSTEMS)
    .map(key => [key, player.inventory.filter(item => ITEMS[item.id]?.system === key).length])
    .sort((a, b) => b[1] - a[1]);
  if (counts[0] && counts[0][1] > 0) return counts[0][0];
  return player.direction || 'astral';
}
const SYSTEM_EFFECT_TEXT = {
  hunt: '伏击成功率逐级提高；六件时伏击上限提高到82%。',
  eclipse: '四件后成功夺取追加诅咒；六件让全部非光明道具转为黑暗。',
  breach: '正面强攻逐级增强；六件会削弱对方防护。',
  astral: '搜寻更稳；四件后每回合首次成功搜寻额外得线索。',
  dawn: '防护与恢复增强；六件能挽救一次资源归零。',
  fate: '六件后每回合可消耗理智改写一次失败。',
  market: '搜寻产出线索；四件并签约进入夜市，六件降低生命价格。'
};
const SYSTEM_TIER_BONUS = {
  hunt: ['伏击更稳', '伏击更稳', '伏击上限提高到82%'],
  eclipse: ['威慑更稳', '夺取追加诅咒', '非光明道具黑化，夺取惩罚加重'],
  breach: ['强攻更稳', '强攻更稳', '削弱目标防护'],
  astral: ['搜寻更稳', '每回合首次成功搜寻多得线索', '搜寻优势继续提高'],
  dawn: ['防护更稳', '恢复行动更有效', '首次资源归零时获救'],
  fate: ['运气行动更稳', '运气行动更稳', '每回合可耗理智改写一次失败'],
  market: ['搜寻多得线索', '签约后可进入夜市', '夜市生命价格降低']
};
const GEAR_IDS = {};
const GEAR_PIECE_TEXT = [
  '该体系对应的袭击额外提高成功率', '防护时额外增加反制机会',
  '用该体系主属性与NPC对话时更有说服力', '搜寻成功时更容易发现装备',
  '更容易踏进神秘奖励房', '补齐六件后启动该体系最终能力'
];
for (const [system, spec] of Object.entries(GEAR_SYSTEMS)) {
  GEAR_IDS[system] = spec.names.map((name, index) => {
    const id = `gear_${system}_${index + 1}`;
    ITEMS[id] = {
      name, glyph: ['✣', '◈', '♜', '✥', '⇞', '✦'][index],
      colors: [spec.color, '#302838'], type: 'passive', category: 'equipment',
      useTags: spec.tags, bonus: 1.5 + index * .14, unbreakable: true,
      rarity: index < 2 ? 'common' : index < 4 ? 'fine' : 'epic',
      system, piece: index + 1, alignment: system === 'dawn' ? 'light' : system === 'eclipse' ? 'dark' : 'neutral',
      rare: index >= 2,
      description: `${spec.name}体系装备：${GEAR_PIECE_TEXT[index]}。携带同系二、四、六件逐级解锁能力；${STAT_LABEL[spec.stat]}越高越强。`,
      effect: { kind: 'passive', statKey: spec.stat, chanceBonus: .025, wearOnTrigger: false }
    };
    return id;
  });
}
const NPC_EXCLUSIVE_IDS = {};
for (const [system, spec] of Object.entries(GEAR_SYSTEMS)) {
  const id = `npc_gear_${system}`;
  NPC_EXCLUSIVE_IDS[system] = id;
  ITEMS[id] = { name: `${spec.name}秘仪`, glyph: '✺', colors: [spec.color, '#211925'], type: 'passive',
    category: 'equipment', useTags: spec.tags, bonus: 3.3, unbreakable: true, rarity: 'epic', rare: true,
    system, alignment: system === 'dawn' ? 'light' : system === 'eclipse' ? 'dark' : 'neutral',
    description: `NPC 才能交出的${spec.name}专属秘仪；算作一件体系装备，并额外强化${STAT_LABEL[spec.stat]}行动。`,
    effect: { kind: 'passive', statKey: spec.stat, chanceBonus: .14, wearOnTrigger: false } };
}
const UNIVERSAL_GEAR = {
  gear_prism: ['染色棱镜', '将一件非光明的异体系装备临时改算为当前最多的体系，最多帮助触发四件效果。', 'mystery', 'search'],
  gear_dual: ['双面徽记', '同时为当前最多的两套体系各补一件，最多帮助触发四件效果。', 'guard', 'mystery'],
  gear_wash: ['洗印匣', '持续抵消蚀冠施加额外诅咒时自己的理智代价。', 'curse', 'heal'],
  gear_guardbox: ['守护匣', '抵挡一次关键道具被夺取。', 'guard', 'lock'],
  gear_echo: ['回声织机', '提高体系装备在行动中的效果。', 'mechanism', 'rune'],
  gear_compass: ['岔路罗盘', '提升不同体系混搭时的探索收益。', 'search', 'escape'],
  gear_anchor: ['生命锚', '生命不高于三点时，挡住夺取造成的一点生命伤害。', 'heal', 'guard'],
  gear_veil: ['静息面纱', '理智危险时降低诅咒影响。', 'curse', 'stealth'],
  gear_ledger: ['旧账本', '普通商人交易少花一份线索。', 'search', 'mechanism'],
  gear_flame: ['孤灯', '持续抵挡蚀冠夺取附加的诅咒惩罚。', 'dark', 'guard'],
  gear_lens: ['裂隙镜', '搜寻时提高装备掉落概率。', 'search', 'mystery'],
  gear_pouch: ['补给袋', '休整时额外恢复一点体力。', 'heal', 'taste']
};
for (const [id, [name, description, ...useTags]] of Object.entries(UNIVERSAL_GEAR)) {
  ITEMS[id] = { name, glyph: '◇', colors: ['#a9c2bc', '#30403e'], type: 'passive', category: 'passive',
    useTags, bonus: 1.8, durability: 3, rarity: ['gear_prism', 'gear_dual', 'gear_guardbox'].includes(id) ? 'epic' : 'fine',
    rare: true, alignment: id === 'gear_flame' ? 'light' : 'neutral', description,
    effect: { kind: 'passive', statKey: 'perception', chanceBonus: .02, wearOnTrigger: false } };
}

// 每件体系装备有自己的词条方案。体系决定组合倾向，不再锁定单一属性。
// 蓝/紫/金分别为词条一/二/三档；只有专属传奇能拥有三条满档词条。
const AFFIX_VALUES = {
  flat_stat: [2, 3, 5], gain_stat: [2, 3, 5], attack_stat: [2, 3, 5],
  gain_pct: [.25, .40, .50], guard_pct: [.25, .40, .50],
  loot_pct: [.05, .08, .12], heal_pct: [.25, .40, .50]
};
const AFFIX_COLORS = ['#65baf0', '#b887ef', '#f2c46b'];
const QUALITY_COLORS = { blue: '#65baf0', purple: '#b887ef', gold: '#f2c46b' };
const GEAR_AFFIX_PLAN = {
  hunt: [
    [['flat_stat','stealth'],['attack_stat','agility']], [['gain_stat','agility'],['loot_pct']],
    [['attack_stat','agility'],['flat_stat','perception']], [['gain_pct'],['flat_stat','luck']],
    [['guard_pct'],['attack_stat','stealth']], [['flat_stat','strength'],['attack_stat','agility']]
  ],
  eclipse: [
    [['flat_stat','luck'],['attack_stat','intimidation']], [['gain_stat','strength'],['guard_pct']],
    [['attack_stat','sanity'],['flat_stat','stealth']], [['gain_pct'],['flat_stat','intimidation']],
    [['loot_pct'],['attack_stat','strength']], [['flat_stat','agility'],['guard_pct']]
  ],
  breach: [
    [['flat_stat','strength'],['guard_pct']], [['gain_stat','strength'],['attack_stat','agility']],
    [['attack_stat','agility'],['flat_stat','strength']], [['heal_pct'],['flat_stat','intimidation']],
    [['gain_pct'],['attack_stat','strength']], [['flat_stat','perception'],['guard_pct']]
  ],
  astral: [
    [['flat_stat','perception'],['loot_pct']], [['gain_stat','luck'],['flat_stat','agility']],
    [['loot_pct'],['attack_stat','perception']], [['gain_pct'],['flat_stat','luck']],
    [['guard_pct'],['flat_stat','strength']], [['flat_stat','stealth'],['heal_pct']]
  ],
  dawn: [
    [['flat_stat','perception'],['heal_pct']], [['gain_stat','perception'],['guard_pct']],
    [['heal_pct'],['flat_stat','perception']], [['gain_pct'],['attack_stat','strength']],
    [['guard_pct'],['flat_stat','agility']], [['flat_stat','intimidation'],['heal_pct']]
  ],
  fate: [
    [['flat_stat','luck'],['gain_pct']], [['gain_stat','perception'],['loot_pct']],
    [['attack_stat','agility'],['flat_stat','luck']], [['gain_pct'],['guard_pct']],
    [['loot_pct'],['flat_stat','strength']], [['flat_stat','stealth'],['attack_stat','luck']]
  ],
  market: [
    [['gain_pct'],['flat_stat','luck']], [['gain_stat','strength'],['loot_pct']],
    [['loot_pct'],['flat_stat','perception']], [['flat_stat','agility'],['guard_pct']],
    [['heal_pct'],['attack_stat','intimidation']], [['flat_stat','perception'],['gain_pct']]
  ]
};
const LEGENDARY_AFFIX_PLAN = {
  hunt: [['flat_stat','agility'],['attack_stat','stealth'],['gain_pct']],
  eclipse: [['flat_stat','intimidation'],['attack_stat','sanity'],['guard_pct']],
  breach: [['flat_stat','strength'],['attack_stat','agility'],['gain_stat','strength']],
  astral: [['flat_stat','perception'],['loot_pct'],['gain_pct']],
  dawn: [['flat_stat','perception'],['heal_pct'],['guard_pct']],
  fate: [['flat_stat','luck'],['gain_pct'],['attack_stat','agility']],
  market: [['gain_pct'],['loot_pct'],['gain_stat','luck']]
};
/* ---------------------------------------------------------------------------
 * 装备实例
 * ---------------------------------------------------------------------------
 * 同名装备不再每局长得一样：
 *   quality  蓝 / 紫 / 金，决定词条条数（1 / 2 / 3）；
 *   growth   成长档 1–5，后期掉落同名装备的档位更高、词条数值更大；
 *   affixes  按品质与成长档当场掷出的结果，之后一直存在实例上；
 *   uid      唯一 ID，掉落 / 交易 / 展示读的都是同一份实例数据。
 * 展示与结算不再调用 gearAffixesFor() 现算，避免「打开背包就换一套词条」。
 * ------------------------------------------------------------------------- */
const QUALITY_AFFIX_COUNT = { blue: 1, purple: 2, gold: 3 };
const QUALITY_LABEL = { blue: '蓝', purple: '紫', gold: '金' };
const MAX_BUFF_STACK = 12;

/* 七体系的金色独特机制（任务书第六节 E：两件方向成立、四件玩法变化、六件构筑完成）。 */
const SYSTEM_UNIQUE = {
  hunt: { mechanic: 'huntMark', label: '猎意', text: '成功潜行积一层猎意；下一次伏击消耗全部猎意，这一步的隐藏大幅提高。' },
  eclipse: { mechanic: 'eclipseMark', label: '蚀痕', text: '承受诅咒时积累蚀痕，每层让威慑与防护更高；净化会带走一半蚀痕。' },
  breach: { mechanic: 'breachWall', label: '碎壁', text: '每回合第一次成功强行行动永久增加一点力量。' },
  astral: { mechanic: 'astralTrace', label: '星迹', text: '每回合第一次有效发现永久增加一点感知。' },
  dawn: { mechanic: 'dawnOath', label: '守誓', text: '按实际恢复的生存资源积累守誓，每两层换成一次防护；满血空转不计。' },
  fate: { mechanic: 'fateReroll', label: '逆命', text: '失败积累逆命；下一次成功时兑现，额外换来一份资源。' },
  market: { mechanic: 'marketCredit', label: '商誉', text: '交易积累商誉；商誉满时，下一件掉落直接提升一个成长档。' }
};

function gearGrowthTier() {
  /* 开局建立 state 的过程中也会造装备，那一刻 state 还在暂时性死区里，
     所以这里必须容错地读，而不是直接 state.stageIndex。 */
  let stage = 0;
  let round = 1;
  try {
    stage = Number(state?.stageIndex ?? 0) || 0;
    round = Number(state?.round ?? 1) || 1;
  } catch (_) {
    stage = 0;
    round = 1;
  }
  const stageBase = [1, 2, 3, 4, 4][stage] ?? 1;
  return clamp(stageBase + (round >= 6 ? 1 : 0), 1, 5);
}

function rollGearQuality(growth = gearGrowthTier(), bonus = 0) {
  const roll = rng.next() + bonus;
  if (growth >= 4) return roll < .28 ? 'gold' : 'purple';
  if (growth >= 3) return roll < .10 ? 'gold' : roll < .52 ? 'purple' : 'blue';
  if (growth >= 2) return roll < .03 ? 'gold' : roll < .26 ? 'purple' : 'blue';
  return roll < .08 ? 'purple' : 'blue';
}

/* 成长档放大词条数值：固定值每档 +30%，百分比每档 +15%。 */
function scaleAffixValue(kind, base, growth) {
  const isPercent = String(kind).endsWith('_pct');
  const factor = 1 + (isPercent ? .15 : .3) * (Math.max(1, growth) - 1);
  const value = Number(base || 0) * factor;
  return isPercent ? Math.round(value * 100) / 100 : Math.max(1, Math.round(value));
}

function makeAffix([kind, stat], tier, growth = 1) {
  const base = AFFIX_VALUES[kind]?.[tier - 1] ?? 0;
  return { kind, stat: stat || null, tier, growth, value: scaleAffixValue(kind, base, growth) };
}

function uniqueAffixFor(system, growth = 1) {
  const spec = SYSTEM_UNIQUE[system];
  if (!spec) return null;
  return { kind: 'unique', stat: null, tier: 3, growth, value: growth, mechanic: spec.mechanic, label: spec.label, text: spec.text };
}

/* 词条条数与档次由品质决定；核心身份（体系 + 部件）固定，不会变成完全无关的装备。 */
function gearAffixesFor(id, quality = null, growth = null) {
  const def = ITEMS[id];
  if (!def || def.category !== 'equipment') return [];
  const tier = growth || gearGrowthTier();
  const grade = quality || (id.startsWith('npc_gear_') || id === 'dungeonShackle' ? 'gold' : rollGearQuality(tier));
  const rows = id === 'dungeonShackle'
    ? [['flat_stat', 'stealth'], ['attack_stat', 'agility'], ['guard_pct', null]]
    : id.startsWith('npc_gear_')
      ? LEGENDARY_AFFIX_PLAN[def.system]
      : def.system && def.piece
        ? GEAR_AFFIX_PLAN[def.system][def.piece - 1]
        : [['flat_stat', def.useTags?.includes('guard') ? 'agility' : def.useTags?.includes('heal') ? 'perception' : 'luck']];
  const unique = def.system && grade === 'gold' ? uniqueAffixFor(def.system, tier) : null;
  /* 品质决定组成（任务书第六节 C）：
       蓝 = 明确主属性 + 1 条辅助
       紫 = 更高主属性 + 2 条辅助或触发
       金 = 高主属性 + 2 条词条 + 1 个独特机制
     独特机制占用第三条位置，所以金装的普通词条是 2 条而不是 3 条 ——
     之前写成 3 条普通 + 1 条独特，一条装备挂四行，还出现重复词条。 */
  const regularCount = unique ? (QUALITY_AFFIX_COUNT[grade] || 1) - 1 : (QUALITY_AFFIX_COUNT[grade] || 1);
  /* 百分比词条落到这件装备自己的体系主属性上，避免「一件装备把六项一起抬高」。
     这样玩家是在一两个方向上形成优势，而不是六项同时膨胀。 */
  const systemStat = def.system ? GEAR_SYSTEMS[def.system]?.stat : null;
  const tierIndex = grade === 'gold' ? 3 : grade === 'purple' ? 2 : 1;
  const affixes = [];
  for (let index = 0; index < regularCount; index += 1) {
    const raw = rows[index % rows.length];
    const row = (raw[0] === 'gain_pct' && !raw[1] && systemStat) ? [raw[0], systemStat] : raw;
    const affix = makeAffix(row, Math.max(1, tierIndex), tier);
    /* 同一件装备不挂两条完全一样的词条。 */
    if (affixes.some(existing => existing.kind === affix.kind && existing.stat === affix.stat)) continue;
    affixes.push(affix);
  }
  if (unique) affixes.push(unique);
  return affixes;
}

function itemAffixes(item) { return item?.affixes || []; }
function gearQuality(item) {
  if (item?.quality) return item.quality;
  const affixes = itemAffixes(item);
  if (affixes.some(affix => affix.kind === 'unique') || affixes.length >= 3) return 'gold';
  if (affixes.length >= 2) return 'purple';
  return 'blue';
}
function gearGrowthOf(item) { return Number(item?.growth) || 1; }
function affixText(affix) {
  if (affix.kind === 'unique') return `${affix.label}：${affix.text}`;
  const name = STAT_LABEL[affix.stat] || affix.stat;
  if (affix.kind === 'flat_stat') return `${name} +${affix.value}`;
  if (affix.kind === 'gain_stat') return `获得${name}时额外 +${affix.value}`;
  if (affix.kind === 'attack_stat') return `攻击时${name} +${affix.value}`;
  if (affix.kind === 'gain_pct') return `常驻属性 +${Math.round(affix.value * 100)}%（同类加算）`;
  if (affix.kind === 'guard_pct') return `防护加成 +${Math.round(affix.value * 100)}%`;
  if (affix.kind === 'loot_pct') return `搜寻道具概率 +${Math.round(affix.value * 100)}%`;
  if (affix.kind === 'heal_pct') return `恢复量 +${Math.round(affix.value * 100)}%`;
  if (affix.kind === 'burst_stat') return `首次${affix.triggerLabel || '伏击'}时${name} +${affix.value}（行动结束移除）`;
  return '';
}
function activeAffixes(player) { return player.inventory.flatMap(item => itemAffixes(item)); }
function affixTotal(player, kind, stat = null) {
  return activeAffixes(player).filter(affix => affix.kind === kind && (!stat || affix.stat === stat))
    .reduce((sum, affix) => sum + affix.value, 0);
}

/* ---------------------------------------------------------------------------
 * 属性来源分层（任务书第六节 B）
 * ---------------------------------------------------------------------------
 * 常驻有效属性 = floor((基础值 + 永久成长 + 装备固定值) × (1 + 同类百分比之和))
 *   - player.stats 保存「基础值 + 本局永久成长」这一层；
 *   - 装备固定值来自 flat_stat 词条；
 *   - 同类百分比加算（gain_pct），不做乘算爆炸；
 *   - 临时状态单独计算，不写回 player.stats，结算也不认它。
 * 生命 / 体力 / 理智是生存资源，保持自己的尺度，不吃百分比强化。
 * ------------------------------------------------------------------------- */
function standingStat(player, key) {
  const raw = Number(player.stats[key] || 0) + affixTotal(player, 'flat_stat', key);
  /* 同类百分比加算，并封顶：真正独立的乘算效应要单独注明作用范围，
     不能每件装备各乘一次造成失控。 */
  const percent = CORE_STAT_KEYS.includes(key)
    ? Math.min(PERCENT_TOTAL_CAP, affixTotal(player, 'gain_pct', key) + setPercentFor(player, key))
    : 0;
  const value = Math.floor(raw * (1 + percent));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/* 套装百分比加成：2 / 4 / 6 件分别给方向属性 +8% / +16% / +30%（同类加算）。
   两件只求方向成立，四件开始明显，六件才谈得上「构筑完成」。 */
const PERCENT_TOTAL_CAP = 1.5;
const SET_TIER_PERCENT = [0, .08, .16, .30];
function setPercentFor(player, key) {
  let percent = 0;
  for (const system of Object.keys(GEAR_SYSTEMS)) {
    if (GEAR_SYSTEMS[system].stat !== key) continue;
    percent += SET_TIER_PERCENT[systemTier(player, system)] || 0;
  }
  return percent;
}

function buffTotal(player, key) {
  const serial = Number(state.turnSerial || 0);
  return (Array.isArray(player.buffs) ? player.buffs : [])
    .filter(buff => buff.stat === key && (buff.expiresAt == null || buff.expiresAt > serial))
    .reduce((sum, buff) => sum + (Number(buff.perStack) || 0) * (Number(buff.stacks) || 0), 0);
}

function effectiveStat(player, key) {
  return Math.max(0, standingStat(player, key) + buffTotal(player, key));
}

/* ---------------------------------------------------------------------------
 * 临时状态（Buff）
 * ---------------------------------------------------------------------------
 * 统一入口，统一字段：perStack × stacks，按全局行动序号过期。
 * 层数有上下限，绝不出现负数层或 Infinity。
 * ------------------------------------------------------------------------- */
function addBuff(player, spec) {
  player.buffs = Array.isArray(player.buffs) ? player.buffs : [];
  const perStack = Number(spec.perStack ?? spec.value);
  if (!Number.isFinite(perStack) || perStack === 0 || !spec.stat) return null;
  const key = `${spec.id}:${spec.stat}`;
  const existing = player.buffs.find(buff => buff.key === key);
  if (existing) {
    existing.stacks = spec.replace
      ? clamp(Number(spec.stacks) || 1, -MAX_BUFF_STACK, MAX_BUFF_STACK)
      : clamp((Number(existing.stacks) || 0) + (Number(spec.stacks) || 1), -MAX_BUFF_STACK, MAX_BUFF_STACK);
    if (spec.expiresAt !== undefined) existing.expiresAt = spec.expiresAt;
    if (!existing.stacks) removeBuff(player, key);
    return existing;
  }
  const buff = {
    key,
    id: spec.id,
    label: spec.label || spec.id,
    stat: spec.stat,
    perStack,
    stacks: clamp(Number(spec.stacks) || 1, -MAX_BUFF_STACK, MAX_BUFF_STACK),
    expiresAt: spec.expiresAt === undefined ? null : spec.expiresAt,
    sourceUid: spec.sourceUid || null,
    note: spec.note || ''
  };
  if (!buff.stacks) return null;
  player.buffs.push(buff);
  if (player.buffs.length > 16) player.buffs = player.buffs.slice(-16);
  return buff;
}

function removeBuff(player, key) {
  player.buffs = (Array.isArray(player.buffs) ? player.buffs : []).filter(buff => buff.key !== key);
}

function expireBuffs(player) {
  const serial = Number(state.turnSerial || 0);
  player.buffs = (Array.isArray(player.buffs) ? player.buffs : [])
    .filter(buff => buff.expiresAt == null || buff.expiresAt > serial);
}

/* 一次真实事件只触发同一个词条一次。用行动序号 + 事件名去重，
   避免「装备生成的额外奖励又触发同类奖励链」这种无限循环。 */
function claimEvent(player, id) {
  if (!(player.claimedEvents instanceof Set)) player.claimedEvents = new Set();
  const key = `${id}@${Number(state.turnSerial || 0)}`;
  if (player.claimedEvents.has(key)) return false;
  player.claimedEvents.add(key);
  if (player.claimedEvents.size > 500) player.claimedEvents = new Set([key]);
  return true;
}

function gearMechanicFor(player, mechanic) {
  return (player.inventory || []).some(item =>
    itemAffixes(item).some(affix => affix.kind === 'unique' && affix.mechanic === mechanic));
}

/* ---------------------------------------------------------------------------
 * 七体系独特机制的统一入口
 * ---------------------------------------------------------------------------
 * 每个事件都先 claimEvent() 去重：一次真实事件只触发同一个词条一次，
 * 装备生成的额外奖励不会再触发同类奖励链。
 *   heal_actual  按实际恢复量积累守誓（满血治疗不计）
 *   curse_gain   承受诅咒积累蚀痕
 *   cleanse      净化带走一半蚀痕
 *   trade        交易积累商誉
 *   其余在行动结算后由 gearMechanicForOutcome() 分发
 * ------------------------------------------------------------------------- */
function gearMechanicEvent(player, event, payload = {}, result = null) {
  const counters = player.counters = player.counters || {};
  const note = text => { if (result) result.consequences.push(text); };
  if (event === 'heal_actual') {
    if (!gearMechanicFor(player, 'dawnOath')) return;
    const gained = Math.floor(Number(payload.amount) || 0);
    if (gained <= 0) return;
    counters.oath = clamp((Number(counters.oath) || 0) + gained, 0, 6);
    while (counters.oath >= 2) {
      counters.oath -= 2;
      player.wardCharges = clamp(Number(player.wardCharges || 0) + 1, 0, 3);
      note('守誓记下了这次真正的恢复：换来一次防护。');
    }
    return;
  }
  if (event === 'curse_gain') {
    if (!gearMechanicFor(player, 'eclipseMark')) return;
    if (!claimEvent(player, 'eclipseMark')) return;
    counters.eclipse = clamp((Number(counters.eclipse) || 0) + 1, 0, 4);
    addBuff(player, { id: 'eclipseMark', label: '蚀痕', stat: 'intimidation', perStack: counters.eclipse, stacks: 1, replace: true });
    note(`蚀痕加深到 ${counters.eclipse} 层，威慑随之上升。`);
    return;
  }
  if (event === 'cleanse') {
    if (!(Number(counters.eclipse) > 0)) return;
    counters.eclipse = Math.floor(Number(counters.eclipse) / 2);
    if (counters.eclipse > 0) {
      addBuff(player, { id: 'eclipseMark', label: '蚀痕', stat: 'intimidation', perStack: counters.eclipse, stacks: 1, replace: true });
    } else {
      removeBuff(player, 'eclipseMark:intimidation');
    }
    note('净化带走了蚀冠留下的一半痕迹。');
    return;
  }
  if (event === 'trade') {
    if (!gearMechanicFor(player, 'marketCredit')) return;
    counters.credit = clamp((Number(counters.credit) || 0) + 1, 0, 3);
    note(counters.credit >= 3
      ? '商誉已经攒满：下一件装备会以更高的成长档落到你手里。'
      : `商誉记下一笔（${counters.credit}/3）。`);
    return;
  }
  if (event === 'outcome_fail') {
    if (!gearMechanicFor(player, 'fateReroll')) return;
    if (!claimEvent(player, 'fateMark')) return;
    counters.fate = clamp((Number(counters.fate) || 0) + 1, 0, 3);
    note(`逆命记下这次失手（${counters.fate}/3）；下一次成功会兑现。`);
    return;
  }
}

/* 行动开始前的准备：把积累层数转成本次行动真正生效的临时加成。 */
function prepareGearMechanics(player, entry, result = null) {
  if (!player || !entry) return;
  const counters = player.counters = player.counters || {};
  const stacks = Number(counters.hunt) || 0;
  const isAmbush = entry.kind === 'attack' && (entry.tags || []).includes('stealth');
  if (stacks > 0 && isAmbush && gearMechanicFor(player, 'huntMark')) {
    counters.hunt = 0;
    const value = Math.max(1, Math.round(standingStat(player, 'stealth') * .35 * stacks));
    addBuff(player, {
      id: 'huntMarkBurst', label: '猎意', stat: 'stealth', perStack: value, stacks: 1,
      expiresAt: Number(state.turnSerial || 0) + 1
    });
    if (result) result.consequences.push(`猎意全部灌进这一步：隐藏临时提高 ${value}，行动结束即散。`);
  }
}

/* 行动结算后的分发：成功走体系机制，失败走逆命积累。 */
function gearMechanicForOutcome(player, entry, outcome, result = null) {
  if (!player || !entry) return;
  const success = outcome === 'success' || outcome === 'great';
  const tags = entry.tags || [];
  const counters = player.counters = player.counters || {};
  if (!success) {
    gearMechanicEvent(player, 'outcome_fail', {}, result);
    return;
  }
  if (tags.includes('stealth') && gearMechanicFor(player, 'huntMark') && claimEvent(player, 'huntMark')) {
    counters.hunt = clamp((Number(counters.hunt) || 0) + 1, 0, 3);
    if (result) result.consequences.push(`猎意积到 ${counters.hunt} 层，下一次伏击会用掉它。`);
  }
  if (tags.includes('force') && gearMechanicFor(player, 'breachWall') && claimEvent(player, 'breachWall')) {
    applyChanges(player, [['strength', 1]], result);
    if (result) result.consequences.push('碎壁：正面撞开的东西永久留在了你的力量里。');
  }
  if (tags.includes('search') && gearMechanicFor(player, 'astralTrace') && claimEvent(player, 'astralTrace')) {
    applyChanges(player, [['perception', 1]], result);
    if (result) result.consequences.push('星迹：这次发现永久抬高了一点感知。');
  }
  if ((tags.includes('menace') || tags.includes('curse')) && gearMechanicFor(player, 'eclipseMark')) {
    gearMechanicEvent(player, 'curse_gain', {}, result);
  }
  if (tags.includes('trade') && gearMechanicFor(player, 'marketCredit')) {
    gearMechanicEvent(player, 'trade', {}, result);
  }
  if ((Number(counters.fate) || 0) > 0 && gearMechanicFor(player, 'fateReroll')) {
    const stacks = counters.fate;
    counters.fate = 0;
    applyChanges(player, [['clues', stacks], ['stamina', 1]], result);
    if (result) result.consequences.push(`逆命兑现：${stacks} 层换来 ${stacks} 条线索与一点体力。`);
  }
}

function prismConversion(player) {
  if (!player.inventory.some(item => item.id === 'gear_prism')) return null;
  const counts = Object.keys(GEAR_SYSTEMS).map(key => [key, player.inventory.filter(item => ITEMS[item.id]?.system === key).length])
    .sort((a, b) => b[1] - a[1]);
  const [major, count] = counts[0] || [];
  if (!count || count >= 4) return null;
  const source = player.inventory.find(item => ITEMS[item.id]?.system && ITEMS[item.id].system !== major
    && (item.alignment || ITEMS[item.id].alignment) !== 'light');
  return source ? { uid: source.uid, system: major } : null;
}
function effectiveGearSystem(player, item) {
  const conversion = prismConversion(player);
  return conversion?.uid === item.uid ? conversion.system : ITEMS[item.id]?.system || null;
}
function systemCount(player, system) {
  const conversion = prismConversion(player);
  const effective = item => conversion?.uid === item.uid ? conversion.system : ITEMS[item.id]?.system;
  const owned = player.inventory.filter(item => effective(item) === system).length;
  if (!owned) return 0;
  const counts = Object.keys(GEAR_SYSTEMS).map(key => [key, player.inventory.filter(item => effective(item) === key).length])
    .sort((a, b) => b[1] - a[1]);
  const bridge = player.inventory.some(item => item.id === 'gear_dual') && counts.slice(0, 2).some(([key]) => key === system);
  return Math.min(6, owned + (bridge && owned < 4 ? 1 : 0));
}
function systemTier(player, system) {
  const count = systemCount(player, system);
  return count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0;
}
function systemPower(player, system) {
  const key = GEAR_SYSTEMS[system]?.stat;
  return key ? Math.max(0, Math.min(2, Math.floor(((player.stats[key] || 0) - 6) / 2))) : 0;
}
function hasGear(player, id) { return player.inventory.some(item => item.id === id); }
function gearPieceSystems(player, piece) { return player.inventory.map(item => ITEMS[item.id]).filter(def => def?.piece === piece).map(def => def.system); }
function alignmentOf(item) { return item.alignment || ITEMS[item.id]?.alignment || 'neutral'; }
function refreshCorruption(player) {
  if (systemTier(player, 'eclipse') < 3) return;
  for (const item of player.inventory) if (alignmentOf(item) !== 'light') item.alignment = 'dark';
}
function secretMarketOpen(player) { return player.inventory.filter(item => ITEMS[item.id]?.system === 'market').length >= 4 && player.flags.includes('nightMarketContract'); }

const ITEM_CATEGORY_ORDER = ['equipment', 'active', 'passive', 'reactive', 'relic'];
const itemCategoryOf = item => ITEMS[item?.id]?.category || 'active';
/* 【msg8 §7】三大生命值上限。原版为 10，方案要求压到 5（更严厉的失败惩罚）。
   注意：HELL/破城等处描述里的「3 点」等数值是按上限 5 的尺度写的。 */
const MAX_VITAL = 5;
const VITAL_KEYS = ['health', 'stamina', 'sanity'];
const BAG_CAPACITY = 10;
const OTHER_ITEM_CAPACITY = 8;
function itemCapacityGroup(itemId) {
  const def = ITEMS[itemId];
  return def.category === 'relic' ? 'relic' : def.system ? 'system' : 'other';
}
function bagCounts(player) {
  const counts = { system: 0, other: 0, relic: 0 };
  for (const item of player.inventory) counts[itemCapacityGroup(item.id)]++;
  return counts;
}
function canCarryItem(player, itemId) {
  const group = itemCapacityGroup(itemId);
  if (group === 'relic') return true;
  return bagCounts(player)[group] < (group === 'system' ? BAG_CAPACITY : OTHER_ITEM_CAPACITY);
}
function fullBagReason(itemId) {
  return itemCapacityGroup(itemId) === 'system' ? '体系装备已满（10 件）' : '其他道具已满（8 件）';
}

const option = (text, flavor, stat, risk, kind, tags = [], flags = {}) => ({ text, flavor, stat, risk, kind, tags, ...flags });

const ROOM_ACTIONS = {
	/* 焚罪地狱（城堡之巅）：三条必须面对的考验路线。
	   失败按提示词扣资源、继续留在地狱、下一次行动重新选；
	   连续失败两次后的保底选项「交出一段记忆」由选项生成流程追加。 */
	hellOfSin: [
		option('踏过炽链', '滚烫的链环之间只有一脚宽的空隙', 'agility', 2, 'run', ['escape', 'stealth']),
		option('直面审判', '门后的声音要求你先报上名字', 'strength', 2, 'force', ['guard', 'intimidate']),
		option('辨认赦令', '两张判决书里只有一张是真的', 'perception', 2, 'mystery', ['mystery', 'search']),
		option('数清钟摆', '钟摆的相位错一格就会让你失神', 'luck', 2, 'mystery', ['mystery', 'clock']),
		option('赎回影子', '把影子从锁链里买回来，需要不被发现', 'stealth', 3, 'hide', ['stealth', 'dark']),
		option('向审判者求饶', '你跪下的瞬间，锁链笑出了声', 'sanity', 1, 'mystery', ['memory', 'leave'], { hellTrap: true })
	],
	/* 最后避难所（终局）：到达后的下一次行动被禁锢。
	   这一次只显示锁链与「失去一次行动」，不生成普通探索或夺取选项；
	   结算完立刻强制送往本阶段的一个普通落点。 */
	lastHaven: [
		option('失去一次行动', '锁链只锁这一次，之后门会自己开', 'sanity', 1, 'wait', ['haven', 'hold'])
	],
	/* 塔顶钟楼（终局核心房间）：敲钟。每人每局最多成功一次。 */
	bellTower: [
		option('敲响钟楼', '钟舌比人还高，敲一次要用上全身的力气', 'strength', 2, 'bell', ['bell', 'mystery'])
	],
	/* 血染王座（终局核心房间）：戴上全局唯一的血染王冠。 */
	bloodThrone: [
		option('戴上血染王冠', '王座上的暗红还没干，戴上它就等于把靶子画在自己背上', 'intimidation', 2, 'crown', ['crown', 'dark'])
	],
	/* —— 钟楼碎影：五个时空房间 —— */
	traceGate: [
		option('循迹', '光轨指着一个还在这座城堡里的名字', 'perception', 1, 'mystery', ['track', 'mystery'])
	],
	goldVault: [
		option('取走流金', '金币逆着地心往上走，你只需要伸手', 'luck', 1, 'reward', ['gold', 'reward'])
	],
	ruinConvergence: [
		option('召集所有人', '把这一局的账一次算清', 'intimidation', 2, 'menace', ['gather', 'crowd'])
	],
	mirrorSanctum: [
		option('照见自己', '镜面把你最弱的那一项摊开给你看', 'sanity', 1, 'mystery', ['mirror', 'growth'])
	],
	collapseClock: [
		option('任由时空崩溃', '钟盘中心是黑的，房间碎片正一圈圈掉下去', 'sanity', 2, 'mystery', ['collapse', 'clock'])
	],
	bedroom: [
    option('翻找床板下的夹层', '木头里有东西在轻轻敲击', 'perception', 1, 'search', ['search', 'dark']),
    option('拆开没有署名的信', '蜡封闻起来像雨后的铁', 'sanity', 1, 'mystery', ['mystery', 'rune']),
    option('屏住呼吸检查床底', '那阵呼吸不像来自你', 'stealth', 2, 'hide', ['stealth', 'dark']),
    option('撬开床尾的私人箱', '锁孔里伸出一根细小的舌头', 'strength', 2, 'force', ['lock', 'pry'])
  ],
  corridor: [
    option('贴墙慢移到下一盏灯下', '让脚步声先替你过去', 'stealth', 1, 'hide', ['stealth', 'dark']),
    option('逐扇倾听紧闭的房门', '有一扇门也在听你', 'perception', 1, 'search', ['search', 'mechanism']),
    option('追上远处晃动的影子', '它看起来像某人的披风', 'agility', 2, 'run', ['escape', 'stealth']),
    option('朝黑暗喊出一个假名字', '看看谁会回答', 'intimidation', 2, 'intimidate', ['intimidate', 'mystery'])
  ],
  hall: [
    option('检查主门锁舌的磨损', '有人从里面反复试过这把锁', 'perception', 1, 'search', ['search', 'lock']),
    option('冲过空旷地面抢先登阶', '吊灯正好在头顶摇晃', 'agility', 2, 'run', ['escape', 'climb']),
    option('对楼梯上的肖像发号施令', '画像不喜欢被当成仆人', 'intimidation', 2, 'intimidate', ['intimidate', 'mystery']),
    option('撬开石像底座的暗格', '石像的爪子离你很近', 'strength', 2, 'force', ['pry', 'mechanism'])
  ],
  kitchen: [
    option('翻找柜子最深处', '盘子后面藏着潮湿的抓痕', 'perception', 1, 'search', ['search', 'dark']),
    option('尝一口仍在冒泡的汤', '锅里没有火，汤却一直很热', 'luck', 2, 'use', ['taste', 'heal']),
    option('拆下水槽后的松动铜板', '下面传来指甲刮擦声', 'strength', 2, 'force', ['pry', 'mechanism']),
    option('借锅盖反光观察门口', '不要直接看那道影子', 'stealth', 1, 'hide', ['stealth', 'guard'])
  ],
  library: [
    option('沿书脊寻找被磨亮的位置', '有人总在触碰同一本书', 'perception', 1, 'search', ['search', 'mystery']),
    option('爬上摇晃的移动梯', '最高处的书页正在呼吸', 'agility', 2, 'run', ['climb', 'search']),
    option('把黑皮书倒着读', '文字会从眼角爬出去', 'sanity', 2, 'mystery', ['mystery', 'rune']),
    option('撬开被钉死的书匣', '钉帽正在跟随你的手指转动', 'agility', 2, 'search', ['lock', 'mechanism'])
  ],
  basement: [
    option('顺着滴水声走向管道后方', '水面映出晚一步的动作', 'perception', 2, 'search', ['search', 'dark']),
    option('扳动锈死的炉门', '炉膛里有东西不喜欢光', 'strength', 3, 'force', ['pry', 'dark']),
    option('涉水摸向远处的工作台', '水下偶尔碰到你的脚踝', 'agility', 2, 'sneak', ['stealth', 'dark']),
    option('贴近低鸣的墙壁倾听', '声音正在学你的呼吸', 'sanity', 2, 'mystery', ['mystery', 'curse'])
  ],
  attic: [
    option('掀开最旧的白布', '下面的轮廓刚刚动过', 'sanity', 2, 'search', ['search', 'mystery']),
    option('踩过弯曲横梁去够木箱', '风会挑最坏的时候推你', 'agility', 3, 'run', ['climb', 'window']),
    option('翻查旅行箱的夹层', '锁扣上刻着你的姓氏', 'perception', 1, 'search', ['lock', 'search']),
    option('藏进倾斜屋檐的阴影', '让经过的人以为这里只有风', 'stealth', 1, 'hide', ['stealth', 'dark'])
  ],
  secret: [
    option('比对墙上星图与旧线索', '星星的位置正在缓慢改变', 'perception', 2, 'search', ['rune', 'mystery']),
    option('触碰仪式桌中央的杯子', '杯里装着一小片夜空', 'sanity', 3, 'mystery', ['mystery', 'curse']),
    option('撬开锁住的圣物匣', '锁链会记住伤害它的人', 'strength', 3, 'force', ['lock', 'pry']),
    option('在书架合拢前留一道缝', '也许还有别人会进来', 'stealth', 2, 'hide', ['stealth', 'mechanism'])
  ],
  garden: [
    option('穿过荆棘寻找发光虫群', '刺会挑选最温暖的血', 'agility', 2, 'sneak', ['stealth', 'search']),
    option('挖开玫瑰下的新鲜泥土', '根系缠着一只小盒子', 'strength', 2, 'force', ['pry', 'search']),
    option('跟随突然停止的虫鸣', '安静本身正在移动', 'perception', 2, 'search', ['search', 'mystery']),
    option('从温室高窗探入月光', '碎玻璃会记住经过的人', 'agility', 2, 'use', ['window', 'climb'])
  ],
  clock: [
    option('从钟摆下方冲过去', '每一次摆动都比上次更低', 'agility', 3, 'run', ['escape', 'clock']),
    option('把耳朵贴近主齿轮', '里面有人在倒数', 'perception', 2, 'search', ['mechanism', 'clock']),
    option('逆向推动最小的齿轮', '时间会收取自己的利息', 'strength', 3, 'force', ['force', 'clock']),
    option('在钟声之间画出静止符号', '粉尘悬在半空不再落下', 'sanity', 2, 'mystery', ['rune', 'clock'])
  ],
  storage: [
    option('钻进覆盖雕像的白布之间', '有一块布下面没有雕像', 'stealth', 1, 'hide', ['stealth', 'dark']),
    option('撬开标记被刮掉的木箱', '箱内东西正在挠盖子', 'strength', 2, 'force', ['lock', 'pry']),
    option('按灰尘中的脚印反向追踪', '脚印从墙里开始', 'perception', 1, 'search', ['search', 'mystery']),
    option('翻找最里层的旧行李', '有些东西不愿被再次认领', 'luck', 2, 'search', ['search', 'mechanism'])
  ],
  chapel: [
    option('在忏悔室外偷听', '里面的人知道你在等', 'stealth', 1, 'hide', ['stealth', 'mystery']),
    option('检查倒燃蜡烛的蜡泪', '蜡滴拼成一条路线', 'perception', 1, 'search', ['search', 'rune']),
    option('向沉默圣像提出质问', '它的嘴角比刚才更低', 'intimidation', 2, 'intimidate', ['intimidate', 'curse']),
    option('把手伸进干涸圣水盆', '盆底仍有一层寒意', 'sanity', 2, 'mystery', ['curse', 'heal'])
  ],
  reward: [
    option('触碰房间中央的脉动星匣', '它在等待能与之共鸣的东西', 'luck', 2, 'reward', ['reward', 'mystery']),
    option('沿金色裂缝寻找第二层机关', '光芒后还藏着另一道锁', 'perception', 2, 'reward', ['reward', 'lock']),
    option('在泉眼边喘息', '泉水漫过伤口，三口气回来了', 'sanity', 1, 'rewardHeal', ['heal', 'guard'])
  ]
};

/* 每个普通房间至少 6 条房间专属行动（原版 4 条 → 6 条），
   让 8 回合赛程内的组合变化来自“选项池”，而不是来自“更多回合”。 */
const ROOM_ACTIONS_EXTRA = {
  bedroom: [
    option('对着镜子整理表情', '镜中人比你多犹豫了一格', 'sanity', 1, 'mystery', ['mystery', 'curse']),
    option('把床推进门口挡住通道', '重物落地的声音传得很远', 'strength', 2, 'force', ['force', 'guard'])
  ],
  corridor: [
    option('把灯芯一根根掐灭', '黑暗会让某些东西放松警惕', 'stealth', 2, 'sneak', ['stealth', 'dark']),
    option('用粉笔在门框上留记号', '下一次路过时你会知道走对了没有', 'perception', 1, 'search', ['rune', 'search'])
  ],
  hall: [
    option('拆下吊灯的配重链', '上面挂着不止一个锁扣', 'strength', 2, 'force', ['climb', 'pry']),
    option('在正门前摆出主人的姿态', '门后那个呼吸停顿了半拍', 'intimidation', 2, 'intimidate', ['intimidate', 'guard'])
  ],
  kitchen: [
    option('把刀收进围裙再检查砧板', '砧板上的痕迹从来不是直的', 'perception', 2, 'search', ['search', 'mechanism']),
    option('往灶膛里添一把湿柴', '烟会把某样东西逼出来', 'luck', 3, 'mystery', ['mystery', 'dark'])
  ],
  library: [
    option('把散落的书页按页码拼回去', '缺的那一页被撕得很新', 'perception', 2, 'search', ['rune', 'search']),
    option('爬上梯子直接抽走最厚的书', '梯子在你脚下改了角度', 'agility', 3, 'run', ['climb', 'search'])
  ],
  basement: [
    option('用铁链把炉门重新拴紧', '锁扣的位置比刚才低了一寸', 'strength', 2, 'force', ['pry', 'guard']),
    option('把手伸进积水摸排水口', '水底有东西在往回吸', 'perception', 2, 'search', ['search', 'curse'])
  ],
  attic: [
    option('掀开地板找到下面的横梁', '横梁上刻着一串日期', 'perception', 2, 'search', ['search', 'lock']),
    option('钻出天窗看屋檐外侧', '外面的高度和你记忆里不同', 'agility', 3, 'run', ['window', 'climb'])
  ],
  secret: [
    option('把仪式杯里的夜空倒回星图', '星星归位时发出了轻响', 'sanity', 2, 'mystery', ['rune', 'mystery']),
    option('在星图上划掉一颗不该存在的星', '墙面上立刻少了一道裂缝', 'perception', 3, 'search', ['rune', 'lock'])
  ],
  garden: [
    option('用剪刀剪断缠住门闩的藤', '剪口渗出透明的汁液', 'agility', 2, 'sneak', ['pry', 'search']),
    option('对着虫群撒一把灰', '它们停了一瞬，然后换了方向', 'luck', 2, 'mystery', ['mystery', 'curse'])
  ],
  clock: [
    option('把钟摆的螺丝拧紧一格', '每一次摆动终于对齐了心跳', 'strength', 2, 'force', ['mechanism', 'clock']),
    option('在主钟响起时屏息数到七', '第七下比前六下多出一个人声', 'sanity', 3, 'mystery', ['clock', 'curse'])
  ],
  storage: [
    option('把白布下面的东西重新盖好', '你不想知道它换了什么姿势', 'stealth', 1, 'hide', ['stealth', 'curse']),
    option('拖出最沉的木箱抵住门', '箱子里的东西跟着一起移动', 'strength', 3, 'force', ['pry', 'guard'])
  ],
  chapel: [
    option('把倒燃的蜡烛全部吹熄', '黑暗里有人松了一口气', 'stealth', 2, 'hide', ['stealth', 'curse']),
    option('在圣像前按仪式念出祷文', '每个字都落到了正确的位置', 'sanity', 2, 'mystery', ['rune', 'heal'])
  ]
};
for (const [roomId, extra] of Object.entries(ROOM_ACTIONS_EXTRA)) {
  ROOM_ACTIONS[roomId] = [...(ROOM_ACTIONS[roomId] || []), ...extra];
}

const GENERIC_ACTIONS = [
  option('退回阴影等待动静靠近', '耐心有时比武器更锋利', 'stealth', 1, 'hide', ['stealth', 'dark']),
  option('检查空气里陌生的气味', '危险往往比脚步更早抵达', 'perception', 1, 'search', ['search', 'mystery']),
  option('用随身工具试探附近机关', '有些代价不会立刻出现', 'luck', 2, 'use', ['mechanism', 'pry']),
  option('屏住呼吸穿过光线最暗处', '黑暗并不总愿意收留你', 'agility', 1, 'sneak', ['stealth', 'dark']),
  option('朝看不见的东西发出警告', '恐惧也会观察你的底气', 'intimidation', 2, 'intimidate', ['intimidate', 'guard'])
];

const EVENT_ACTIONS = [
  option('接住墙缝里突然掉出的怀表', '它的指针正在倒着走', 'luck', 3, 'mystery', ['clock', 'mystery']),
  option('回应通风口里喊你的声音', '那个声音比你更熟悉自己的名字', 'sanity', 3, 'mystery', ['curse', 'mystery']),
  option('跟随地面上新鲜出现的湿脚印', '脚印没有来处，只有去处', 'perception', 2, 'search', ['search', 'dark']),
  option('把一滴血按在眼形裂缝里', '墙体在等待某种证明', 'strength', 3, 'force', ['rune', 'pry'])
];

/* ---------------------------------------------------------------------------
 * NPC 与分支对话
 * ---------------------------------------------------------------------------
 * NPC 不是随机奖励按钮：每次对话至少 2–3 个选择，每个选择都显式声明
 * 主要影响属性 / 最大正面变化 / 最大负面变化 / 可用道具标签 / 关系变化 / 是否消耗行动点。
 * 关系记忆只有四档（初识 / 信任 / 警惕 / 敌对），只影响少量选项、价格与信息真伪。
 */
const NPC_RELATION_LEVELS = [
  { min: 3, label: '信任', tone: 'good' },
  { min: 1, label: '亲近', tone: 'good' },
  { min: 0, label: '初识', tone: '' },
  { min: -2, label: '警惕', tone: 'warn' },
  { min: -99, label: '敌对', tone: 'alert' }
];

const dialogueChoice = (spec) => ({
  kind: 'npc', consumesAction: true, rel: 0, usesItem: [], gain: [], loss: [], risk: 1, ...spec
});

const NPCS = {
  healer: {
    id: 'healer', name: '黑羽医师', glyph: '❦', accent: '#8d9bb5', room: 'chapel',
    intro: '她不问姓名，只问伤口是什么时候开始的。',
    greet: ['把呼吸放慢。这里不接受急的人。', '银线缝不上你自己扯开的裂口。'],
    topics: [
      dialogueChoice({
        id: 'heal-ask', text: '请她处理伤口', flavor: '她把手按在绷带上方，不碰皮肤',
        stat: 'sanity', risk: 1, usesItem: ['heal', 'curse'], gain: [['health', 2]], loss: [['stamina', -1]], rel: 1,
        success: { changes: [['health', 2], ['stamina', -1]], statuses: [], text: '银线穿过看不见的裂口，痛感像退潮一样退下去。' },
        failure: { changes: [['health', 1]], text: '她只来得及按住最浅的一道。' }
      }),
      dialogueChoice({
        id: 'heal-purge', text: '请求净化附着的阴影', flavor: '她会问“你确定要现在看它吗”',
        stat: 'perception', risk: 2, usesItem: ['curse', 'rune'], gain: [['sanity', 2]], loss: [['sanity', -1]], rel: 1,
        cleanse: true,
        success: { changes: [['sanity', 2]], text: '附着的阴影一片片从呼吸里脱落，房间的轮廓重新变得清楚。' },
        failure: { changes: [['sanity', -1]], statuses: ['动摇'], text: '阴影比想象中粘得更紧，她被反推了半步。' }
      }),
      dialogueChoice({
        id: 'heal-origin', text: '追问伤势的来源', flavor: '这个问题她自己也在找答案',
        stat: 'perception', risk: 1, usesItem: ['search'], gain: [['clues', 2]], loss: [['sanity', -1]], rel: -1,
        success: { changes: [['clues', 2]], text: '她报出三个房间的名字，其中一个你从没听过。' },
        failure: { changes: [['sanity', -1]], text: '她沉默很久，然后说“不要问了”。' }
      }),
      dialogueChoice({
        id: 'heal-leave', text: '道谢后离开', flavor: '她不会挽留',
        stat: 'luck', risk: 1, action: false, rel: 0,
        success: { changes: [], text: '你退到祷告室的阴影里，她没有抬头。' }
      })
    ],
    talentTopic: {
      sporeBlend: dialogueChoice({
        id: 'heal-spore', text: '用孢子调和帮她稳定针脚', flavor: '只有懂炼金的人才能配合她',
        stat: 'perception', risk: 1, usesItem: ['heal'], gain: [['health', 2], ['sanity', 1]], loss: [], rel: 2, talentOnly: 'sporeBlend',
        success: { changes: [['health', 2], ['sanity', 1]], text: '菌丝在银线外侧织出一层临时皮肤，她第一次认真看了你一眼。' },
        failure: { changes: [['sanity', -1]], text: '孢子过早散开，只留下一股潮味。' }
      })
    }
  },
  archivist: {
    id: 'archivist', name: '盲眼馆员', glyph: '◍', accent: '#9a8fc0', room: 'library',
    intro: '他的眼睛看不见，手指却总停在你正需要的那一格书脊上。',
    greet: ['书不会自己翻页，除非有人替它翻。', '你要找的东西，编号比名字更可靠。'],
    topics: [
      dialogueChoice({
        id: 'arch-ask', text: '询问城堡的结构', flavor: '他会用指尖画出一条你走不通的路',
        stat: 'perception', risk: 1, usesItem: ['search', 'rune'], gain: [['clues', 2]], loss: [], rel: 1,
        success: { changes: [['clues', 2]], flags: ['bookshelf'], text: '他在桌上画出移动书架的回路，并指出一条夹层通道。' },
        failure: { changes: [], text: '他绕了很大一圈，最后还是承认记不清。' }
      }),
      dialogueChoice({
        id: 'arch-secret', text: '请求进入密室的许可', flavor: '他把钥匙放在书页之间，而不是手里',
        stat: 'perception', risk: 2, usesItem: ['lock', 'rune'], gain: [['clues', 1]], loss: [['stamina', -1]], rel: 1,
        requiresRelation: 1, flags: ['bookshelf'],
        success: { changes: [['clues', 1], ['stamina', -1]], text: '他用一句很轻的咒语让书架让开半个人宽。' },
        failure: { changes: [['stamina', -1]], text: '书架合拢得比你的手更快。' }
      }),
      dialogueChoice({
        id: 'arch-forbidden', text: '索要一本禁书', flavor: '他先问你打算怎么还',
        stat: 'sanity', risk: 3, usesItem: ['curse', 'mystery'], gain: [['sanity', 2]], loss: [['sanity', -2]], rel: -1,
        success: { changes: [['sanity', 2], ['clues', 1]], items: ['chalk'], text: '禁书只允许摘抄一页。你把那一页折进怀里。' },
        failure: { changes: [['sanity', -2]], curses: ['耳语'], text: '书页在指尖碎成黑屑，它们找到了你的耳朵。' }
      }),
      dialogueChoice({
        id: 'arch-leave', text: '把书放回原位', flavor: '他听得出你有没有归位',
        stat: 'luck', risk: 1, action: false, rel: 1,
        success: { changes: [], text: '书脊“咔”地一声回到队列里。' }
      })
    ],
    talentTopic: {
      lampfoot: dialogueChoice({
        id: 'arch-silent', text: '不出声地陪他走完一整排书架', flavor: '只有真正无声的脚步才能跟上他',
        stat: 'stealth', risk: 1, gain: [['clues', 2]], loss: [], rel: 2, talentOnly: 'lampfoot',
        success: { changes: [['clues', 2], ['stealth', 1]], text: '他把你带到书架最深处，那里有一本没有人借过的书。' },
        failure: { changes: [], text: '你踩到了一块会说话的木板。' }
      })
    }
  },
  cook: {
    id: 'cook', name: '灰烬厨师', glyph: '♨', accent: '#c08a5c', room: 'kitchen',
    intro: '锅下的火早就灭了，汤却一直在翻。',
    greet: ['先吃，再问。', '想换东西？把手上那件放在台面上。'],
    topics: [
      dialogueChoice({
        id: 'cook-eat', text: '喝下他盛的汤', flavor: '汤面浮着一层没烧完的纸',
        stat: 'luck', risk: 2, usesItem: ['taste', 'heal'], gain: [['stamina', 2], ['health', 1]], loss: [['health', -1]], rel: 1,
        success: { changes: [['stamina', 2], ['health', 1]], text: '热气从喉咙一路烧到指尖，疲惫被压下去一层。' },
        failure: { changes: [['health', -1]], statuses: ['疲惫'], text: '汤在胃里结成一块冰。' }
      }),
      dialogueChoice({
        id: 'cook-trade', text: '用道具换一份药剂', flavor: '他从不问道具是怎么来的',
        stat: 'intimidation', risk: 2, usesItem: ['pry'], gain: [['health', 1]], loss: [], rel: 0,
        trade: { give: 'anyCommon', take: 'styptic' },
        success: { changes: [], text: '他把药剂推过来，同时把台面上那件东西收进围裙。' },
        failure: { changes: [['stamina', -1]], text: '他摇头，把药剂又收回了架子上。' }
      }),
      dialogueChoice({
        id: 'cook-threat', text: '威胁他把柜子全部打开', flavor: '他的手一直没有离开刀柄',
        stat: 'intimidation', risk: 3, usesItem: ['intimidate'], gain: [['clues', 1]], loss: [['health', -2]], rel: -2,
        success: { changes: [['clues', 1]], items: ['rope'], text: '柜门一间间弹开，里面的抓痕还湿着。' },
        failure: { changes: [['health', -2]], statuses: ['受伤'], text: '刀背先到，汤勺后到。你退到门口。' }
      }),
      dialogueChoice({
        id: 'cook-leave', text: '放下碗离开厨房', flavor: '他没看你，只看碗',
        stat: 'luck', risk: 1, action: false, rel: 0,
        success: { changes: [], text: '碗底剩下一行用汤写的小字。' }
      })
    ],
    talentTopic: {
      bellEcho: dialogueChoice({
        id: 'cook-bell', text: '摇响铁钟，让他把火重新点起来', flavor: '他认得那口钟的声音',
        stat: 'intimidation', risk: 1, gain: [['stamina', 2]], loss: [], rel: 2, talentOnly: 'bellEcho',
        success: { changes: [['stamina', 2], ['health', 1]], text: '钟声落进灶膛，炉火自己直起腰来。' },
        failure: { changes: [], text: '钟只响了一声，他没有回头。' }
      })
    }
  },
  timekeeper: {
    id: 'timekeeper', name: '钟楼守时人', glyph: '◷', accent: '#c0a05a', room: 'clock',
    intro: '他的怀表比主钟快三秒，他说那三秒是留给活人的。',
    greet: ['你还剩几个动作？先数清楚再开口。', '时间不卖，只借。'],
    topics: [
      dialogueChoice({
        id: 'time-borrow', text: '借三秒时间', flavor: '他会先问你要拿去做什么',
        stat: 'sanity', risk: 2, usesItem: ['clock'], gain: [['stamina', 2]], loss: [['sanity', -1]], rel: 1,
        borrowTime: true,
        success: { changes: [['stamina', 2]], text: '齿轮为你多转了一格，你凭空多出一点体力。' },
        failure: { changes: [['sanity', -1]], text: '三秒是从你自己身上扣的。' }
      }),
      dialogueChoice({
        id: 'time-order', text: '请他打乱本回合的行动顺序', flavor: '他说顺序比时间更容易借',
        stat: 'perception', risk: 2, usesItem: ['mechanism', 'clock'], gain: [['luck', 1]], loss: [], rel: 1,
        reorder: true,
        success: { changes: [['luck', 1]], text: '他拨了一格齿轮，下一位出手的人不再是你预想的那一个。' },
        failure: { changes: [], text: '齿轮咬得太死，他让你下次早点来。' }
      }),
      dialogueChoice({
        id: 'time-steal', text: '趁他抬头时偷走怀表', flavor: '怀表里跳的不是秒',
        stat: 'stealth', risk: 3, usesItem: ['stealth'], gain: [['clues', 2]], loss: [['health', -2], ['sanity', -1]], rel: -2,
        success: { changes: [['clues', 2]], items: ['resonance'], text: '怀表落进你手里，里面关着一小段属于别人的夜。' },
        failure: { changes: [['health', -2], ['sanity', -1]], statuses: ['受伤'], text: '钟摆在你手腕上停了一瞬，然后把它折向错误的方向。' }
      }),
      dialogueChoice({
        id: 'time-leave', text: '看一眼自己的影子再离开', flavor: '影子比你先走了一步',
        stat: 'luck', risk: 1, action: false, rel: 0,
        success: { changes: [], text: '影子的步幅比你的更大。' }
      })
    ],
    talentTopic: {
      lampfoot: dialogueChoice({
        id: 'time-silent', text: '在他的钟声之间无声穿行', flavor: '不打乱任何一格齿轮',
        stat: 'stealth', risk: 1, gain: [['stamina', 1], ['luck', 1]], loss: [], rel: 2, talentOnly: 'lampfoot',
        success: { changes: [['stamina', 1], ['luck', 1]], text: '他等你走完才开口：“你比钟更安静。”' },
        failure: { changes: [], text: '你还是踩响了一格。' }
      })
    }
  },
  jailer: {
    id: 'jailer', name: '锁链看守', glyph: '⛓', accent: '#7a6f80', room: 'dungeon',
    intro: '他从窗栅外递进来一碗水，水里泡着一把钥匙的影子。',
    greet: ['牢门不是我锁的，但钥匙在我这里。', '想出去？先说清楚你值多少。'],
    topics: [
      dialogueChoice({
        id: 'jail-bribe', text: '用钥匙或线索换一次提前离开', flavor: '他不收哭',
        stat: 'intimidation', risk: 2, usesItem: ['lock', 'intimidate'], gain: [], loss: [], rel: 1,
        shortenJail: true,
        success: { changes: [], text: '他把铁环往回拨了一格，锁链的伸缩声短了一截。' },
        failure: { changes: [['stamina', -1]], text: '他笑了一下，把铁环又推了回去。' }
      }),
      dialogueChoice({
        id: 'jail-threaten', text: '隔着栅栏威胁他', flavor: '他知道你现在出不来',
        stat: 'intimidation', risk: 3, usesItem: ['intimidate', 'force'], gain: [['clues', 1]], loss: [['health', -2]], rel: -2,
        success: { changes: [['clues', 1]], text: '他后退半步，顺口说出另一个囚室里的名字。' },
        failure: { changes: [['health', -2]], statuses: ['受伤'], text: '他隔着栅栏用手杖敲了你的指节。' }
      }),
      dialogueChoice({
        id: 'jail-listen', text: '听他说完这层楼的故事', flavor: '他的故事里总有一个和你很像的人',
        stat: 'sanity', risk: 1, usesItem: ['curse'], gain: [['sanity', 2]], loss: [['sanity', -1]], rel: 1,
        success: { changes: [['sanity', 2], ['clues', 1]], text: '你听懂了：这座地牢比城堡更早存在。' },
        failure: { changes: [['sanity', -1]], text: '故事在同一个句子上重复了四次。' }
      }),
      dialogueChoice({
        id: 'jail-leave', text: '把水碗推回去', flavor: '钥匙的影子沉到碗底',
        stat: 'luck', risk: 1, action: false, rel: 0,
        success: { changes: [], text: '影子在碗底停了一会儿，然后不动了。' }
      })
    ],
    talentTopic: {
      bellEcho: dialogueChoice({
        id: 'jail-bell', text: '用铁钟回响震松锁链', flavor: '钟声在这里比钥匙好用',
        stat: 'strength', risk: 1, gain: [['stamina', 1]], loss: [], rel: 2, talentOnly: 'bellEcho',
        shortenJail: true,
        success: { changes: [['stamina', 1]], text: '锁链被同一个频率震松，铁环松开一圈。' },
        failure: { changes: [], text: '钟声被石墙吃掉了。' }
      })
    }
  },
  gardener: {
    id: 'gardener', name: '荆棘园丁', glyph: '❃', accent: '#7fa86f', room: 'garden',
    intro: '她修剪的枝条会自己回头，顺着她的手腕看人。',
    greet: ['别碰会转头的那些。', '草药不一定救命，但一定能改变你。'],
    topics: [
      dialogueChoice({
        id: 'garden-herb', text: '请她配一剂草药', flavor: '她先割破自己的手指试药性',
        stat: 'perception', risk: 1, usesItem: ['heal', 'taste'], gain: [['health', 2]], loss: [['stamina', -1]], rel: 1,
        success: { changes: [['health', 2], ['stamina', -1]], text: '草药先麻后暖，伤口边缘收拢得像被线拉住。' },
        failure: { changes: [['stamina', -1]], text: '药性跑偏了，你只有一嘴苦味。' }
      }),
      dialogueChoice({
        id: 'garden-route', text: '请她指出穿过温室的路', flavor: '她用手势画出一条贴墙的弧线',
        stat: 'agility', risk: 2, usesItem: ['window', 'climb'], gain: [['clues', 1]], loss: [], rel: 1,
        flags: ['gardenRoute'],
        success: { changes: [['clues', 1]], text: '她把一段藤蔓拨开，后面是一条没人走过的小径。' },
        failure: { changes: [['stamina', -1]], text: '藤蔓在最后一刻收紧，你退回原处。' }
      }),
      dialogueChoice({
        id: 'garden-cursed', text: '问她要那盆会说话的植物', flavor: '花盆边缘写着别人的名字',
        stat: 'sanity', risk: 3, usesItem: ['curse', 'rune'], gain: [['sanity', 2]], loss: [['sanity', -2]], rel: -1,
        success: { changes: [['sanity', 2]], items: ['calmIncense'], curses: [], text: '植物只肯说一句话，但那句话让你安静下来。' },
        failure: { changes: [['sanity', -2]], curses: ['倒影'], text: '植物用你的声音说话，说了很久。' }
      }),
      dialogueChoice({
        id: 'garden-leave', text: '把鞋底的血迹蹭在石阶上', flavor: '花园会记住它',
        stat: 'luck', risk: 1, action: false, rel: 0,
        success: { changes: [], text: '石阶上的血迹很快就干了。' }
      })
    ],
    talentTopic: {
      sporeBlend: dialogueChoice({
        id: 'garden-spore', text: '用孢子帮她把花圃重新接上', flavor: '只有炼金师能听懂根的语言',
        stat: 'perception', risk: 1, gain: [['health', 1], ['clues', 1]], loss: [], rel: 2, talentOnly: 'sporeBlend',
        success: { changes: [['health', 1], ['clues', 1]], text: '菌丝把断根接回去，她第一次把剪刀递给你。' },
        failure: { changes: [], text: '根须拒绝了外来的菌丝。' }
      })
    }
  },
  mirrorChild: {
    id: 'mirrorChild', name: '镜中孩子', glyph: '☍', accent: '#8fbccb', room: 'storage',
    intro: '白布下面是一面镜子，镜子里的孩子比你年轻，也比你先到这里。',
    greet: ['我知道三件事，其中一件是真的。', '你上次也是这样问的。'],
    topics: [
      dialogueChoice({
        id: 'mirror-info', text: '问他另外几个人的位置', flavor: '真假各半，你只能自己判断',
        stat: 'perception', risk: 2, usesItem: ['search', 'mystery'], gain: [['clues', 2]], loss: [['sanity', -1]], rel: 1,
        mixedInfo: true,
        success: { changes: [['clues', 2]], text: '他报出的三个方向里，有两个和你手上的线索对得上。' },
        failure: { changes: [['sanity', -1]], text: '他说了三个方向，然后承认自己一个都没去过。' }
      }),
      dialogueChoice({
        id: 'mirror-test', text: '用一个只有自己知道的问题试探他', flavor: '镜子会先答错，再改口',
        stat: 'sanity', risk: 2, usesItem: ['rune'], gain: [['sanity', 2]], loss: [['sanity', -1]], rel: 1,
        success: { changes: [['sanity', 2]], text: '他答错了，然后立刻改口——你确认他不是你。' },
        failure: { changes: [['sanity', -1]], statuses: ['动摇'], text: '他答对了。你不确定这是好是坏。' }
      }),
      dialogueChoice({
        id: 'mirror-smash', text: '用白布把镜子盖上', flavor: '他很怕布，也很喜欢布',
        stat: 'strength', risk: 3, usesItem: ['force', 'pry'], gain: [['stamina', 1]], loss: [['health', -1], ['sanity', -1]], rel: -2,
        success: { changes: [['stamina', 1]], text: '镜面闷进去一声，箱子后的通道露了出来。' },
        failure: { changes: [['health', -1], ['sanity', -1]], statuses: ['动摇'], text: '布下面伸出一只手，把布又拉了回去。' }
      }),
      dialogueChoice({
        id: 'mirror-leave', text: '也对他笑一下', flavor: '他比你晚半秒',
        stat: 'luck', risk: 1, action: false, rel: 0,
        success: { changes: [], text: '镜子里的人比你晚半秒收起笑容。' }
      })
    ],
    talentTopic: {
      lampfoot: dialogueChoice({
        id: 'mirror-shadow', text: '把自己的影子借给他一会儿', flavor: '只有无灯的人愿意借出影子',
        stat: 'stealth', risk: 1, gain: [['clues', 2]], loss: [], rel: 2, talentOnly: 'lampfoot',
        success: { changes: [['clues', 2]], text: '影子在镜子里站直，替你指出一条墙缝。' },
        failure: { changes: [], text: '影子不肯过去。' }
      })
    }
  },
  relicDealer: {
    id: 'relicDealer', name: '遗物商人', glyph: '⚖', accent: '#c3a76a', room: 'hall',
    intro: '她面前的桌上摆着三件不属于任何人的东西，价签一律空白。',
    greet: ['遗物不标价钱，标的是你还剩多少。', '线索、钥匙、或者一件旧东西，随你。'],
    topics: [
      dialogueChoice({
        id: 'dealer-clues', text: '用线索换一件遗物', flavor: '她把线索按厚度排成一列',
        stat: 'perception', risk: 2, usesItem: ['mystery', 'rune'], gain: [], loss: [], rel: 1,
        trade: { give: 'clues', cost: 2, take: 'relic' },
        success: { changes: [], text: '她收走两条线索，推过来一件还在轻微震动的遗物。' },
        failure: { changes: [], text: '她说线索太薄，换不动。' }
      }),
      dialogueChoice({
        id: 'dealer-keys', text: '用钥匙换一件遗物', flavor: '钥匙在她手里会自己转半圈',
        stat: 'luck', risk: 2, usesItem: ['lock'], gain: [], loss: [], rel: 1,
        trade: { give: 'keys', cost: 1, take: 'relic' },
        success: { changes: [], text: '钥匙离开你的手心时，你能感觉到它在找新的锁。' },
        failure: { changes: [], text: '她摊开手：你没有钥匙。' }
      }),
      dialogueChoice({
        id: 'dealer-cheat', text: '趁她转身多拿一件', flavor: '桌上的三件东西都在看你',
        stat: 'stealth', risk: 3, usesItem: ['stealth'], gain: [['clues', 1]], loss: [['sanity', -2]], rel: -2,
        success: { changes: [['clues', 1]], items: ['moonCompass'], text: '你多带走了一件，只是它一直在发烫。' },
        failure: { changes: [['sanity', -2]], curses: ['空腹'], text: '她转过身时，桌面上只剩两件东西，但你的手在抖。' }
      }),
      dialogueChoice({
        id: 'dealer-leave', text: '把东西推回桌子中央', flavor: '她记性很好',
        stat: 'luck', risk: 1, action: false, rel: 1,
        success: { changes: [], text: '她点头，像是认可了一件小事。' }
      })
    ],
    talentTopic: {
      bellEcho: dialogueChoice({
        id: 'dealer-bell', text: '用铁钟回响验一件遗物的真假', flavor: '真遗物会和钟声一起响',
        stat: 'strength', risk: 1, gain: [['clues', 1]], loss: [], rel: 2, talentOnly: 'bellEcho',
        success: { changes: [['clues', 1]], items: ['resonance'], text: '其中一件跟着钟声一起震，她把它推给了你。' },
        failure: { changes: [], text: '三件东西都很安静。' }
      })
    }
  }
};

const NPC_BY_ROOM = Object.fromEntries(Object.values(NPCS).map(npc => [npc.room, npc.id]));
function availableNpc(player) {
  const npcId = NPC_BY_ROOM[player.room];
  if (!npcId) return null;
  const encounterKey = `${state.round}:${player.room}`;
  if (player.npcEncounter?.key === encounterKey) return player.npcEncounter.id;
  if (state.round === 1 && player.room === player.homeRoom) {
    player.npcEncounter = { key: encounterKey, id: null };
    return null;
  }
  const baseStats = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth'];
  const weak = baseStats.reduce((sum, key) => sum + player.stats[key], 0) / baseStats.length < 5.5;
  const sparse = player.inventory.filter(item => ITEMS[item.id]?.category === 'equipment').length < 2;
  const darkRoom = ['secret', 'basement', 'dungeon'].includes(player.room);
  const chance = .37 + (weak && sparse && darkRoom ? .20 : 0);
  const roomCode = [...player.room].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const roll = ((state.round * 37 + player.index * 19 + roomCode * 7) % 101) / 101;
  player.npcEncounter = { key: encounterKey, id: roll < chance ? npcId : null };
  return player.npcEncounter.id;
}
const NPC_ART = {
  healer: 'npc-healer', archivist: 'npc-archivist', cook: 'npc-cook',
  timekeeper: 'npc-keeper', jailer: 'npc-jailer', gardener: 'npc-gardener',
  mirrorChild: 'npc-mirror-child', relicDealer: 'npc-relic-dealer'
};
function npcPortrait(npc, extraClass = '') {
  return `<img class="npc-portrait ${extraClass}" src="assets/${NPC_ART[npc.id]}.png" alt="${npc.name}的形象" loading="eager">`;
}

// 诅咒说明同样只写"会怎样"，不写几点、不写判定口径。
const CURSE_TABLE = {
  耳语: { effect: 'sanit', amount: -1, note: '每过一回合，耳边的话就多啃掉一口神智。' },
  倒影: { effect: 'stamina', amount: -1, note: '每过一回合，你的力气就被影子分走一点。' },
  空腹: { effect: 'health', amount: -1, note: '每过一回合，饥饿就从骨头里刮走一点。' },
  褪色: { effect: 'luck', amount: -1, note: '靠运气的那些事，开始一件件落空。' },
  缠根: { effect: 'agility', amount: -1, note: '脚下的东西总在你迈步时缠上来。' }
};

const OUTCOME_META = {
  great: { label: '大成功', className: '', icon: '✦', severity: 1 },
  success: { label: '成功', className: '', icon: '◆', severity: 2 },
  fail: { label: '失败', className: 'bad', icon: '⌁', severity: 3 },
  critical: { label: '大失败', className: 'bad', icon: '✕', severity: 4 },
  special: { label: '特殊事件', className: 'special', icon: '◉', severity: 2 }
};

const STORY = {
  great: ['你比城堡更早猜到机关的下一步。阴影没来得及缩回去，连同秘密一起落入手中。', '最危险的一瞬忽然安静下来。你抓住那道几乎不存在的机会，迫使房间交出答案。'],
  success: ['动作比预想更顺利。代价依然存在，但你在它真正咬住你前收回了手。', '房间发出一声不情愿的轻响。你没有完全看懂规则，却足够拿走一部分答案。'],
  fail: ['某样东西在最后一刻改变位置。局面没有完全失控，但城堡已经记住你的犹豫。', '看似安全的细节突然翻转。你空手退开，身后却多出一道脚步声。'],
  critical: ['陷阱等的正是这一刻。光线断裂，疼痛和低语同时涌来。', '你误读了房间的暗示。黑暗猛地合拢，再散开时已经带走了某些东西。'],
  special: ['规则在动作发生时短暂改变，一个不属于这里的存在留下了难辨好坏的礼物。', '时间折叠了一瞬。你的动作从另一个方向重复，随后有东西选择留在这一边。']
};

/* ---------------------------------------------------------------------------
 * 统一行动结果与反馈数据结构
 * ---------------------------------------------------------------------------
 * 经典双影与夜行共用同一层：action -> outcome -> feedback。
 * 这里定义一次行动产出的全部可呈现信息，渲染层只读这套结构，不再自己推算。
 * 关键点：影响预览由 estimateDelta() 用真实结算配置计算，UI 不硬编码预测值。
 */

// 每档判定的演出强度。severity 越高，粒子/震屏/音效越重。
const OUTCOME_FEEDBACK = {
  great: { intensity: 1.00, shake: .35, particle: 'spark', hold: 1120 },
  success: { intensity: .72, shake: .16, particle: 'dust', hold: 940 },
  fail: { intensity: .78, shake: .30, particle: 'dust', hold: 980 },
  critical: { intensity: 1.20, shake: .62, particle: 'shard', hold: 1240 },
  special: { intensity: 1.05, shake: .40, particle: 'rune', hold: 1200 }
};

// 逐字对话节奏（毫秒）。中文按字推进，标点留白，环境音在说话时压低。
const SPEECH = {
  charMs: [28, 36],
  punctuationMs: 190,
  punctuation: '，。！？；：、…—·「」『』（）',
  // 每 2–3 个可见字符补一记极轻的本地合成短音
  tickEvery: [2, 3],
  tickMs: [35, 55],
  tickGain: .10,
  duckDb: -11
};

const ACTION_FEEDBACK = {
  search: { animation: 'searching', sfx: 'search', lines: ['翻动、翻动，灰尘替你让开一条缝。', '指尖先碰到答案，眼睛才跟上。'] },
  hide: { animation: 'hiding', sfx: 'hide', lines: ['你把呼吸压进墙里。', '影子替你多站了一会儿。'] },
  sneak: { animation: 'hiding', sfx: 'sneak', lines: ['脚步被地面吞掉。', '你从光线够不到的地方穿过去。'] },
  run: { animation: 'searching', sfx: 'run', lines: ['空气撞在脸上，像有人从后面推你。', '你抢在声音之前抵达。'] },
  force: { animation: 'attacking', sfx: 'hit', lines: ['木头、铁和骨头同时发出一声抗议。', '你用身体当钥匙。'] },
  use: { animation: 'using', sfx: 'use', lines: ['旧东西找到了新的用途。', '机关认出了你手里的东西。'] },
  mystery: { animation: 'using', sfx: 'use', lines: ['文字从眼角爬出去，又爬回来。', '你听见规则翻页的声音。'] },
  intimidate: { animation: 'attacking', sfx: 'hit', lines: ['你把底气摆到桌面上。', '黑暗犹豫了一下。'] },
  guard: { animation: 'using', sfx: 'guard', lines: ['你把退路收成一个更小的圈。', '防线立起来了，暂时没有人来撞。'] },
  reward: { animation: 'rewarding', sfx: 'reward', lines: ['光芒退开，真正的机关从墙里升起。', '奖励沿着符文落进行囊。'] },
  cleanse: { animation: 'using', sfx: 'use', lines: ['银线缝合看不见的裂口。', '附着的阴影从呼吸里脱落。'] },
  attack: { animation: 'attacking', sfx: 'attack', lines: ['你切进了对方的防线。', '手比对方的反应更快。'] },
  move: { animation: 'searching', sfx: 'walk', lines: ['门在你身后合上。'] },
  skip: { animation: '', sfx: 'blocked', lines: ['锁链没有松开。'] }
};

// 12 场景各自的语气与强调色，避免所有房间反馈同质化。
const ROOM_VOICE = {
  bedroom: { tone: '私密', accent: '#b98a9e', note: '这座房间记得你躺下的重量。' },
  corridor: { tone: '流动', accent: '#8fa0b8', note: '走廊永远有第二双脚印。' },
  hall: { tone: '正式', accent: '#c3a76a', note: '大厅把所有声音都放得很大。' },
  kitchen: { tone: '温热', accent: '#c08a5c', note: '锅里的东西比火更耐心。' },
  library: { tone: '安静', accent: '#9a8fc0', note: '书脊之后有人在数页码。' },
  basement: { tone: '潮湿', accent: '#6f8f96', note: '水位记住了每一个经过的人。' },
  attic: { tone: '干燥', accent: '#b0a07a', note: '白布下面从来不只是家具。' },
  secret: { tone: '禁忌', accent: '#a879c4', note: '墙上的星图正在慢慢改写自己。' },
  garden: { tone: '鲜活', accent: '#7fa86f', note: '虫鸣停下来的时候，你要小心。' },
  clock: { tone: '精确', accent: '#c0a05a', note: '每一秒都在向某个方向还债。' },
  storage: { tone: '囤积', accent: '#9b8f7a', note: '没有人认领的东西会自己走开。' },
  chapel: { tone: '肃穆', accent: '#8d9bb5', note: '圣像的嘴角比刚才更低了一点。' },
  reward: { tone: '被照亮的', accent: '#ce83e5', note: '光芒后面还藏着一道锁。' },
  dungeon: { tone: '被囚禁的', accent: '#7a6f80', note: '锁链会逐次消耗行动。' }
};

/* ---------------------------------------------------------------------------
 * v6 叙事层：玩家可见文案不得出现数字 / 百分比 / 判定过程 / 内部阶段名。
 * 数值仍然在内部真实结算，只是不写在玩家眼前。
 * --------------------------------------------------------------------------- */
const STAT_HINT = {
  health: { up: '伤口合上了一点', down: '又添了一处新伤' },
  stamina: { up: '气力回来了一些', down: '腿开始发沉' },
  sanity: { up: '心神稳了一点', down: '眼前发虚' },
  strength: { up: '手上更有劲了', down: '手臂发软' },
  agility: { up: '身手更利落了', down: '动作发僵' },
  perception: { up: '你听得更清楚了', down: '耳音变钝了' },
  luck: { up: '运气偏向了你', down: '运气转冷' },
  intimidation: { up: '底气更足了', down: '气势被压下去' },
  stealth: { up: '存在感更淡了', down: '行踪更容易被看见' },
  keys: { up: '手里多了一把钥匙', down: '少了一把钥匙' },
  clues: { up: '又握到一条线索', down: '一条线索断了' }
};
// 属性变化只讲"发生了什么"，不写属性名也不写数字。
function statHint(key, value) {
  const row = STAT_HINT[key];
  if (!row) return value >= 0 ? '身上起了些变化' : '身上少了点什么';
  return value >= 0 ? row.up : row.down;
}

// 三条生命线在回合总结里只用一句话讲"现在怎么样"，不写 x/10。
const VITAL_LEVELS = {
  health: [[8, '身上还算完整'], [5, '带着伤，但还站得住'], [3, '血一直在往外走'], [-Infinity, '再挨一下就躺下了']],
  stamina: [[8, '气力还够'], [5, '腿有点沉'], [3, '每一步都要借力'], [-Infinity, '快迈不动了']],
  sanity: [[8, '心神安稳'], [5, '耳边有杂音'], [3, '看东西开始重影'], [-Infinity, '快认不出自己了']]
};
function vitalWord(key, value) {
  const rows = VITAL_LEVELS[key] || [];
  return (rows.find(row => value >= row[0]) || rows[rows.length - 1] || ['', ''])[1];
}

// 夺取只用"优势档位"表达：箭头多少 + 档位词，不给任何数字。
const EDGE_TIERS = [
  { min: .30, up: '压倒性优势', down: '几乎没有胜算', arrows: '▲▲▲' },
  { min: .18, up: '明显占上风', down: '明显处下风', arrows: '▲▲' },
  { min: .08, up: '略占上风', down: '略处下风', arrows: '▲' },
  { min: -Infinity, up: '势均力敌', down: '势均力敌', arrows: '＝' }
];
function edgeTier(margin) {
  const size = Math.abs(margin);
  return EDGE_TIERS.find(tier => size >= tier.min) || EDGE_TIERS[EDGE_TIERS.length - 1];
}
// margin > 0 表示"我占优"，< 0 表示"我处下风"。
function edgeNote(margin) {
  const tier = edgeTier(margin);
  return `${tier.arrows} ${margin >= 0 ? tier.up : tier.down}`;
}

// 主动道具在选项上的一句氛围短句（不含任何数字）。
const ITEM_USE_FLAVOR = {
  rustKey: '锈屑落进锁孔，旧锁会认它',
  lockpick: '细针比手指更懂锁',
  lantern: '把这一段黑暗从房间里拎出去',
  chalk: '在墙上留一道只有你认得的纹路',
  rope: '绳子替你找到一条不该存在的路',
  tonic: '苦味会先把血止住',
  scrollOfPassage: '把自己折叠进另一个人的位置',
  returnFeather: '来时的路还记着你',
  smokeVial: '立即脱离同房冲突，并降低下一次被夺取的概率',
  styptic: '先把血止住，其余稍后再说',
  calmIncense: '让呼吸重新排好队',
  echoBell: '用一声铃换一个房间的名字',
  waxDouble: '让下一次灾祸砸在蜡上',
  chainKey: '牢门会为它提前松一次',
  swapContract: '把各自手里的东西换一次位置',
  curseLens: '把附在身上的东西照出原形'
};
const itemUseFlavor = id => ITEM_USE_FLAVOR[id] || '它在这类场合正合用';

// 被动装备的行囊说明：只说"它让你更容易怎样"，不出现属性名之外的数值。
const PASSIVE_FLAVOR = {
  agility: '需要身手的行动更容易成事',
  perception: '黑暗里也看得见、听得清',
  strength: '需要力气的行动更容易成事',
  stealth: '藏起来这件事更容易成事'
};

// 后期节奏按所选回合上限等比缩放，不把 8 回合的节奏硬套到 6 / 12 回合上。
const scaledRound = fraction => Math.max(2, Math.ceil((state?.maxRounds || 8) * fraction));
const LATE_ROUND = () => scaledRound(.75);   // 8→6   6→5   12→9
const FINAL_ROUND = () => scaledRound(.8);   // 8→7   6→5   12→10

// 用真实结算配置估算某条行动对一个属性的可能影响区间，供 UI 预览使用。
// 注意：这里必须与 rollOutcome 的阈值体系保持一致，不得出现"预览说 +3、实际给 -1"。
function estimateDelta(player, entry, item = null) {
  if (!entry || entry.kind === 'skip') return [];
  if (entry.kind === 'gearChoice') {
    if (entry.choice === 'stat') return [];
    if (entry.choice === 'loot' || entry.choice === 'supply') return [];
    if (entry.choice === 'rest') return [['health', 0, 2], ['stamina', 0, 2], ['sanity', 0, 2]];
  }
  if (entry.kind === 'move') return [];
  if (entry.kind === 'guard') return [['perception', 0, 1]];
  if (entry.kind === 'cleanse') return [['health', 1, 2], ['stamina', 0, 1]];
  if (entry.kind === 'item') {
    const def = ITEMS[entry.itemId || (item && item.id)];
    const effect = def?.effect || {};
    if (effect.kind === 'heal') return [['health', effect.health, effect.health]];
    if (effect.kind === 'restore') return (effect.vital === 'all' ? ['health', 'stamina', 'sanity'] : [effect.vital]).map(key => [key, effect.amount, effect.amount]);
    if (effect.kind === 'soothe') return [['sanity', effect.sanity, effect.sanity]];
    if (effect.kind === 'scout') return [['clues', 1, 1]];
    if (effect.kind === 'ward') return [['health', 0, 1]];
    if (effect.kind === 'swap') return [];
    if (effect.kind === 'teleport' || effect.kind === 'returnHome' || effect.kind === 'smoke') return [];
    return [];
  }
  if (entry.kind === 'npc') {
    const npc = NPCS[entry.npcId];
    if (!npc) return [];
    const topic = npc.topics.find(candidate => candidate.id === entry.topicId)
      || (npc.talentTopic && Object.values(npc.talentTopic).find(candidate => candidate.id === entry.topicId));
    if (!topic) return [['clues', 0, 2]];
    const rows = [];
    for (const [key, max] of topic.gain || []) rows.push([key, 0, max]);
    for (const [key, min] of topic.loss || []) rows.push([key, min, 0]);
    return rows;
  }
  if (entry.kind === 'reward') {
    const relic = item && ITEMS[item.id]?.type === 'relic' && ITEMS[item.id].useTags.includes('reward');
    return relic ? [['clues', 2, 2]] : [['luck', 1, 1]];
  }
  if (entry.kind === 'attack') {
    const target = entry.targetId ? state.players.find(other => other.id === entry.targetId) : null;
    if (!target) return [];
    const chance = calculateAttackChance(player, target, entry, item).finalChance;
    const hi = Math.round(chance * 10) / 10;
    return [['clues', 0, hi >= .55 ? 2 : 1]];
  }
  // 普通行动：核心属性单场景合计不超过 ±1，其余走生命/体力/理智与状态。
  const core = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth'].includes(entry.stat) ? entry.stat : null;
  if (core) return [[core, -1, 1]];
  return [[entry.stat, -1, 1]];
}

let itemSerial = 0;
/* 掉落时就掷出品质、成长档与词条，之后一直跟着这件实例走。
   bonusQuality 用于保底 / 商誉 / 阶段奖励：确定性地把品质抬一档。 */
const makeItem = (id, options = {}) => {
  const def = ITEMS[id];
  const equipment = def?.category === 'equipment';
  const growth = equipment ? clamp(Number(options.growth) || gearGrowthTier(), 1, 5) : 1;
  const quality = equipment
    ? (options.quality || (def.system || def.piece ? rollGearQuality(growth, Number(options.luck) || 0) : 'blue'))
    : null;
  return {
    id,
    uid: `${id}-${++itemSerial}`,
    instanceId: `${id}-${itemSerial}`,
    wear: 0,
    auto: false,
    quality,
    growth,
    affixes: equipment ? gearAffixesFor(id, quality, growth) : []
  };
};
const itemDurability = item => {
  const def = ITEMS[item?.id];
  if (!def) return 0;
  if (def.unbreakable) return Infinity;
  return Math.max(0, (def.durability || 2) - (item.wear || 0));
};
const setupSelection = [0, 2];
const heroCatalogPage = [1, 1]; // 默认展示新增七人；原版三人始终可切回。
/* 【msg8 §22】选人键盘导航（拳击选人式）：光标当前在哪一侧 / 哪张卡。 */
const setupCursor = { side: 0, hero: 0 };
const setupConfirmed = [false, false];
let setupMode = 'local';
let setupBotCount = 2;
/* 留空则每局自动生成；填入则写进 state.seed 并真正驱动随机源。 */
let setupSeed = '';
// 赛程长度由玩家在开局界面选：短局 6 / 标准 8 / 长局 12，默认 8。
const ROUND_PRESETS = [
  /* 这里选的是「初次探索」这一段的长度，不是整局总回合数。 */
  { rounds: 6, label: '短局', hint: '初次探索 6 回合。整局还有城堡之巅、重返探索和终局，大约十四到十九个回合。' },
  { rounds: 8, label: '标准', hint: '初次探索 8 回合。整局还有城堡之巅、重返探索和终局，大约十六到二十一个回合。' },
  { rounds: 12, label: '长局', hint: '初次探索 12 回合，成长最充裕。整局大约二十到二十五个回合。' }
];
let setupRounds = 8;
/* 调试跳关：在设置页选一个阶段与回合，直接从那里开始，方便验后面的玩法。
   留空就是从头开始（正式玩法不受影响）。 */
let setupDebugStage = '';
let setupDebugRound = 1;

/* ---------------------------------------------------------------------------
 * 五阶段（外层）
 * ---------------------------------------------------------------------------
 * 原有的「回合 → 行动点 → 结算」循环一行没动，阶段只是套在它外面的一层。
 *   初次探索：回合数沿用开局页选的赛程（短局 6 / 标准 8 / 长局 12）
 *   城堡之巅：固定 3 回合，3 次行动
 *   重返探索：固定 4 回合，3 次行动
 *   终局之战：固定 8 回合，2 次行动
 *   钟楼碎影：隐藏时长，2 次行动
 * 后两个阶段互斥，一局只进一个（分支由整局种子在重返探索结束时决定）。
 */
const STAGES = [
  { id: 'explore', label: '初次探索', rounds: 0, hint: '沿用开局选择的赛程，在原有城堡里探索。' },
  { id: 'summit', label: '城堡之巅', rounds: 3, hint: '每回合只出现一扇随机大门；夺取失败会被锁链拖进焚罪地狱，用考验换一次离开。' },
  { id: 'return', label: '重返探索', rounds: 4, hint: '回到原来的城堡，把这一夜攒下的东西用出去。' },
  { id: 'finale', label: '终局之战', rounds: 8, hint: '八个终局房间；塔顶钟楼与血染王座是核心房间。' },
  /* 这条说明要和实际路线池一致：碎影里每回合只有一扇随机门，
     落点全是碎影自己的房间；崩溃时钟在最后两回合才显形。 */
  { id: 'shard', label: '钟楼碎影', rounds: 5, hint: '每回合只有一扇随机门，落点扩及整座城堡的任意错位房间；钟盘只剩最后一圈时，崩溃时钟会显形。' }
];
const stageById = id => STAGES.find(stage => stage.id === id) || STAGES[0];

/* ---------------------------------------------------------------------------
 * 阶段成长奖励（任务书第六节 F：确定性保底）
 * ---------------------------------------------------------------------------
 * 每个阶段结束给一次三选一，其中一张一定匹配当前主方向。
 * 这不是「提高掉率」，是走到就一定拿得到，保证低运气角色有进入后期的底子。
 * 强力构筑仍然要靠词条组合，阶段奖励只保证下限。
 * ------------------------------------------------------------------------- */
const STAGE_GROWTH_GAIN = 8;
const FINALE_ENTRY_GAIN = 10;
const CALIBRATION_TARGET = 20;

function growthOffers(player) {
  const dir = growthDirection(player);
  const stat = GEAR_SYSTEMS[dir].stat;
  const anchors = [
    { id: 'gear', kind: 'gear', title: `${GEAR_SYSTEMS[dir].name} · 成型装备`, detail: `直接得到一件${GEAR_SYSTEMS[dir].name}装备，核心身份与你的方向一致。` },
    { id: 'stat', kind: 'stat', title: `${STAT_LABEL[stat]} +${STAGE_GROWTH_GAIN}`, detail: '本局永久成长，脱下装备也不会消失。' },
    { id: 'balance', kind: 'balance', title: '补齐两项最弱属性', detail: '最弱的两项核心属性各抬 4 点，专治一路偏科。' },
    { id: 'material', kind: 'material', title: `强化材料 ×${MATERIAL_UPGRADE_COST}`, detail: '可以在行囊里把一件装备的成长档推上去。' }
  ];
  const rest = shuffle(anchors.filter(offer => offer.kind !== 'gear')).slice(0, 2);
  return [anchors[0], ...rest];
}

function applyGrowthOffer(player, offer, result = null) {
  const dir = growthDirection(player);
  if (offer.kind === 'gear') {
    const id = pityGear(player);
    /* 阶段奖励的成型装备直接给金色：这是「构筑完成度」的确定性来源，
       不靠运气。低运气角色拿到的是下限保证，能冲多高仍然看后续词条组合。 */
    giveItem(player, id, result, { item: { quality: 'gold', growth: gearGrowthTier() } });
    return `${player.label} 选择成型装备：${ITEMS[id].name}。`;
  }
  if (offer.kind === 'stat') {
    const stat = GEAR_SYSTEMS[dir].stat;
    applyChanges(player, [[stat, STAGE_GROWTH_GAIN]], result);
    return `${player.label} 的${STAT_LABEL[stat]}永久 +${STAGE_GROWTH_GAIN}。`;
  }
  if (offer.kind === 'balance') {
    const weakest = CORE_STAT_KEYS.map(key => [key, player.stats[key] || 0]).sort((a, b) => a[1] - b[1]).slice(0, 2);
    weakest.forEach(([key]) => applyChanges(player, [[key, 4]], result));
    return `${player.label} 补齐了${weakest.map(([key]) => STAT_LABEL[key]).join('、')}。`;
  }
  player.materials = clamp((Number(player.materials) || 0) + MATERIAL_UPGRADE_COST, 0, 99);
  return `${player.label} 拿到 ${MATERIAL_UPGRADE_COST} 份强化材料。`;
}

/* 重返探索结束前的一次性成长校准：主属性没到 20 就以明确奖励补足差额。
   只执行一次，记录原因，不能反复领取。 */
function applyCalibration(player, log = null) {
  if (player.calibrationDone) return null;
  const highest = CORE_STAT_KEYS.reduce((best, key) => (standingStat(player, key) > standingStat(player, best) ? key : best), CORE_STAT_KEYS[0]);
  const current = standingStat(player, highest);
  player.calibrationDone = true;
  if (current >= CALIBRATION_TARGET) return null;
  const gain = CALIBRATION_TARGET - current;
  applyChanges(player, [[highest, gain]], null);
  const note = `成长校准：重返探索结束前，${STAT_LABEL[highest]}从 ${current} 补到 ${CALIBRATION_TARGET}（差额 ${gain}）。只执行一次。`;
  player.growthChoices.push({ stage: 'return', offer: 'calibration', note });
  if (log) log.push(note);
  return note;
}

/* 阶段推进：本阶段打满后切到下一个阶段，只有最后一个阶段打满才结束整局。
   装备、货币、关键道具、基础属性、NPC 好感全部保留；只重置阶段内的回合计数。 */
function advanceStage() {
	/* 已经打到终局就该结束整局。
	   终局之战与钟楼碎影是二选一，任意一个打完都不能再切到另一个 —— 之前漏了这一条，
	   所以打完终局会接着跳进钟楼碎影。 */
	if (state.stageId === 'finale' || state.stageId === 'shard') return false;
	/* 后两个阶段互斥：一局只进一种终局。
	   分支在「重返探索」结束时由整局种子决定，结果立刻写进 state.finaleBranch，
	   读档不会重抽；玩家要等转场时才看见是哪一种。 */
	if (state.stageId === 'return') {
		if (!state.finaleBranch) state.finaleBranch = rng.next() < 0.5 ? 'finale' : 'shard';
		const target = stageById(state.finaleBranch);
		state.stageIndex = STAGES.indexOf(target);
		state.stageId = target.id;
		state.round = 1;
		// 钟楼碎影的时长是隐藏的：由种子抽 5～10，写进对局状态，读档不会重抽。
		state.maxRounds = target.id === 'shard' ? 5 + Math.floor(rng.next() * 6) : target.rounds;
		state.stageBanner = { id: target.id, label: target.label, hint: target.hint, at: Date.now() };
		/* 进入终局时全队获得一次「推进力」：终局阶段本身就要求更高的常驻属性，
		   而它又是最后一个阶段，成长必须在这里到位，不能等到结算才算。 */
		state.players.filter(player => !player.collapsed).forEach(player => applyChanges(player, [[GEAR_SYSTEMS[growthDirection(player)].stat, FINALE_ENTRY_GAIN]], null));
		/* 有人可能停在原有城堡或奖励房里，统一收回本阶段的合法房间。 */
		normalizeRoomsForStage();
		return true;
	}
  const next = STAGES[state.stageIndex + 1];
  if (!next) return false;
  state.stageIndex += 1;
  state.stageId = next.id;
  state.round = 1;
  state.maxRounds = next.rounds > 0 ? next.rounds : state.maxRounds;
  state.stageBanner = { id: next.id, label: next.label, hint: next.hint, at: Date.now() };
  /* 阶段切换后所有人回到本阶段的合法房间。 */
  normalizeRoomsForStage();
  return true;
}
let audio = new AudioEngine();

/* ---------------------------------------------------------------------------
 * 音乐生命周期只由显式事件驱动。渲染函数一律不许碰音乐开关。
 * 这样「结算页重新播探索曲」「旧渐变几秒后把旧曲拉回来」这两类问题从结构上消失。
 * ------------------------------------------------------------------------- */
const MUSIC_EVENTS = {
  title: { track: null, reason: 'title' },       // 标题页：不铺背景音乐
  start: { track: 'explore', reason: 'start' },  // 开局：回到初次探索的程序化背景层
  stage: { track: null, reason: 'stage' },       // 换阶段：跟随 state.stageId
  end: { track: null, reason: 'end' }            // 结算：只允许结算音乐
};

function musicEvent(name, options = {}) {
  if (typeof StageMusic === 'undefined') return false;
  if (name === 'title') return StageMusic.stop('title');
  if (name === 'end') return StageMusic.playResult(options.kind || 'dawn', options.playerIndex || 0);
  const track = name === 'start' ? 'explore' : state.stageId;
  return StageMusic.play(track, options);
}

if (typeof StageMusic !== 'undefined') {
  StageMusic.attach(audio);
  StageMusic.setErrorHandler(message => {
    const button = $('#soundBtn');
    if (!button) return;
    button.classList.add('audio-error');
    button.title = `有一首背景音乐没能加载（${message}）。点这里再试一次。`;
  });
}

/* ---------------------------------------------------------------------------
 * 统一行动意图结构
 * ---------------------------------------------------------------------------
 * 原版把 player.locked 同时当对象和数组使用，导致道具、防护、普通行动、
 * 奖励、净化、第二行动、攻击与反击各自猜测形状，地牢囚禁者更是永远不满足
 * “数组长度 >= 行动点”的就绪条件，直接把整局卡死。
 *
 * 现在只有一套结构：player.turn.slots[1|2] 各自显式保存
 *   { entry, itemUid, targetId, confirmed, resolved, result }
 * 所有结算函数都必须接收当前 slot 的 intent，禁止再从任何全局字段里猜。
 */
const ACTION_POINTS_PER_ROUND = 3;
const ACTION_SLOTS = [1, 2, 3];
/* 每回合的行动次数按阶段走：初次探索 / 城堡之巅 / 重返探索 3 次，
   两个终局（终局之战 / 钟楼碎影）2 次。上面的格位表是上限，实际用几个由这里裁。 */
const slotCountForStage = stageId => (stageId === 'finale' || stageId === 'shard') ? 2 : 3;
const roundSlots = () => ACTION_SLOTS.slice(0, slotCountForStage(state.stageId));

function makeSlotState() {
  return {
    entry: null, itemUid: null, targetId: null,
    confirmed: false, resolved: false, result: null,
    options: [], cancelled: false, cancelReason: '', acknowledged: true
  };
}

function makeTurnState(round = 1) {
  return {
    round,
    travel: { route: null, itemUid: null, confirmed: false, resolved: false, result: null },
    slots: { 1: makeSlotState(), 2: makeSlotState(), 3: makeSlotState() },
    activeSlot: 1,
    npc: null,        // { npcId, topicId, choiceId, lines, lineIndex }
    itemPanel: null,  // { slot, itemUid, mode }
    layer: null,      // 本侧展开层：{ kind:'bag'|'talk', page, view, itemUid, targetId }
    roundReady: -1    // 回合准备所在的回合号；与"结果已读""行动确认"彼此独立
  };
}

// 角色名里不出现阿拉伯数字（v6 §6：玩家可见文案里不许有数字）。
const CN_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const cnNumber = value => CN_NUMERALS[value] || String(value);

function makePlayer(index, heroIndex, control) {
  const hero = HEROES[heroIndex];
  const home = ['bedroom', 'hall', 'kitchen', 'library', 'garden', 'storage', 'attic'][index % 7];
  return {
    index,
    id: `p${index + 1}`,
    label: control === 'ai' ? `人机${cnNumber(index + 1)}` : `玩家${index ? '二' : '一'}`,
    control,
    hero: heroIndex,
    homeRoom: home,
    room: home,
    stats: { ...hero.base },
    inventory: hero.kit.map(makeItem), lootReceived: { equipment: 0, active: 0, passive: 0, reactive: 0, relic: 0 },
    statuses: [], marks: [], curses: [], flags: [], history: [],
    routes: [], blocked: [], options: [],
    turn: makeTurnState(),
    result: null,
    roundResult: null,
    skipTurns: 0, skippedThisRound: false, jailedThisRound: false,
    lastRewardRound: -10, travelNotes: [], hatred: {}, gold: 0,
    routePlan: [], goal: null, injuries: [], protection: 0, dungeonHistory: [],
    actionPoints: ACTION_POINTS_PER_ROUND, talentUsedThisRound: false, collapsed: false,
    /* 【msg8 §4】主动技能：每角色一个，按 perGame / perStage / every3 限次。 */
    activeUsed: {}, activeStageId: null, activeCooldown: 0,
    npcRelation: {}, wardCharges: 0, chainKeyUsed: false, quickUsedThisRound: false,
    passiveWearNotes: [], incomingStealPenalty: 0, scoutInfo: null, phaseStall: 0, roundDeltas: {},
    gainRemainder: {}, dungeonActionsLeft: 0, dungeonRelicSeen: false, lastDungeonSearchRound: -10,
    /* 成长与构筑（任务书第六节） */
    buffs: [],                 // 临时状态：只影响行动，不写回 stats，也不进总分
    counters: {},              // 猎意 / 蚀痕 / 守誓 / 逆命 / 商誉等积累层数
    peakStats: {},             // 本局峰值，结算展示用
    materials: 0,              // 重复装备转化来的强化材料
    dryPulls: 0,               // 连续没有拿到装备的次数，用于确定性保底
    calibrationDone: false,    // 重返探索结束前的一次性成长校准
    growthChoices: [],         // 已领取的阶段成长
    direction: heroKitSystem(hero)
  };
}

function makeState(mode = setupMode, botCount = setupBotCount, rounds = setupRounds) {
  const safeBotCount = clamp(Number(botCount) || 2, 2, 5);
  const safeRounds = [6, 8, 12].includes(Number(rounds)) ? Number(rounds) : 8;
  /* 整局种子：可复现对局与「种子决定」说法的唯一来源。 */
  const seed = (setupSeed && String(setupSeed)) || `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  rng.seed(seed);
  const humans = mode === 'local'
    ? [makePlayer(0, setupSelection[0], 'human'), makePlayer(1, setupSelection[1], 'human')]
    : [makePlayer(0, setupSelection[0], 'human')];
  const bots = Array.from({ length: safeBotCount }, (_, botIndex) => {
    const index = humans.length + botIndex;
    const bot = makePlayer(index, (botIndex + 1) % HEROES.length, 'ai');
    bot.label = `人机${cnNumber(botIndex + 1)}`;
    bot.goal = ['搜集遗物', '夺取资源', '破解密室', '保存实力', '追逐高收益'][botIndex];
    return bot;
  });
  return {
    mode,
    botCount: safeBotCount,
	round: 1,
	maxRounds: safeRounds,
	stageIndex: 0,
	stageId: 'explore',
	stageBanner: null,
	crownHolder: null,        // 血染王冠的持有者 id；全局唯一，可转移
	mendedBy: null,           // 用时间护符修补钟楼的人：拿到特殊胜利
	destroyedRooms: [],       // 被崩溃时钟抹掉的房间，本局永久失效
	finaleBranch: null,       // 终局分支：在重返探索结束时由整局种子决定，读档不重抽
	phase: 'setup',
    resolving: false,
    token: 0,
    lastInputAt: 0,
    stalls: [],
    headless: false,
    seed,
    /* 全局序号：阶段内的 state.round 会归 1，跨阶段计时（体力耗尽宽限、冷却）
       必须用这两个才不会在阶段切换时错位。 */
    turnSerial: 0,
    roundSerial: 0,
    players: [...humans, ...bots]
  };
}

let state = makeState();
let reducedMotion = false;

function applyStoredMotionPreference() {
  let stored = null;
  try { stored = localStorage.getItem('nightcrown.reduceMotion'); } catch (error) { stored = null; }
  const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  reducedMotion = stored === '1' || (stored === null && prefersReduced);
  if (reducedMotion) document.body.classList.add('reduce-motion');
  const button = $('#motionBtn');
  if (button) {
    button.setAttribute('aria-pressed', reducedMotion ? 'true' : 'false');
    button.classList.toggle('active', reducedMotion);
  }
}

function playerPanelTemplate(index) {
  const sideClass = index ? 'player-two' : 'player-one';
  return `
    <article class="player-view ${sideClass}" id="playerView-${index}" data-player="${index}">
      <header class="player-head">
        <div class="portrait hero-0" id="portrait-${index}"></div>
        <div class="identity"><small id="controlLabel-${index}">PLAYER</small><b id="heroName-${index}"></b><span id="heroTitle-${index}"></span></div>
        <div class="head-metrics"><div class="stats-grid" id="stats-${index}"></div><div class="vitals" id="vitals-${index}"></div></div>
      </header>

      <div class="stage-wrap">
      <section class="room-stage" id="stage-${index}" data-room="bedroom">
        <div class="room-bg current" id="roomCurrent-${index}"></div>
        <div class="room-bg incoming" id="roomIncoming-${index}"></div>
        <div class="room-tint"></div><div class="depth-haze"></div><div class="light-shafts"></div><div class="particles"></div><div class="foreground"></div><div class="vignette"></div><div class="film-grain"></div>
        <div class="door left"></div><div class="door right"></div>
        <div class="room-heading"><small id="roomFloor-${index}"></small><h2 id="roomTitle-${index}"></h2><p id="roomDesc-${index}"></p></div>
        <div class="stage-badge" id="stageBadge-${index}"></div>
        <div class="actor player hero-0" id="actor-${index}" data-subject-id="p${index + 1}"><div class="sprite"></div></div>
        <div class="actor opponent hero-1 hidden" id="opponent-${index}"><div class="sprite"></div><label></label></div>
        <div class="impact-fx"></div>
        <div class="transition-caption" id="transitionCaption-${index}"><small>正在前往</small><b></b></div>
        <div class="narrative"><span id="narrativeIcon-${index}">◐</span><p id="narrative-${index}"></p></div>
      </section>

      <section class="info-strip" id="infoStrip-${index}">
        <button class="strip-toggle" data-strip-toggle="${index}" aria-expanded="true" title="把这一栏收窄，只留舞台">收起 ▾</button>
        <div class="system-bonuses"><button class="system-bonus-toggle" data-system-toggle="${index}">体系加成 · ${index ? ';' : 'B'} 展开</button><div id="systemBonuses-${index}"></div></div>
        <div class="inventory-block">
          <div class="inventory-title"><span>行囊</span><span>按数字键取用</span></div>
          <div class="item-groups" id="inventory-${index}"></div>
        </div>
        <div class="status-line" id="statuses-${index}"></div>
      </section>
      </div>

      <section class="feedback-dock">
        <section class="decision-panel" id="decision-${index}">
          <header class="decision-head"><div><small id="decisionEyebrow-${index}"></small><b id="decisionTitle-${index}"></b></div><span id="choiceCount-${index}"></span></header>
          <div class="item-panel-host hidden" id="itemPanel-${index}"></div>
          <div class="choices" id="choices-${index}"></div>
          <div class="blocked-list" id="blocked-${index}"></div>
          <div class="locked-cover hidden" id="locked-${index}"><div><span>⌛</span><b>选择已锁定</b><small>等待另一侧完成决定</small></div></div>
        </section>

        <section class="result-panel hidden" id="result-${index}"></section>
      </section>

      <!-- 本侧独立展开层：覆盖自己的房间与下方区域，不改变双栏尺寸、不遮住另一位玩家 -->
      <div class="side-layer hidden" id="layer-${index}" data-layer-player="${index}"></div>
    </article>`;
}

function renderPlayerShells() {
  const humans = state.players.filter(player => player.control === 'human');
  $('#splitBoard').innerHTML = humans.map(player => playerPanelTemplate(player.index)).join('');
  $('#splitBoard').classList.toggle('single-player', humans.length === 1);
}

function setHeroClass(element, heroIndex) {
  [...element.classList].filter(name => /^hero-\d+$/.test(name)).forEach(name => element.classList.remove(name));
  element.classList.add(`hero-${heroIndex}`);
}

/* ---------------------------------------------------------------------------
 * 人物立绘：独立 PNG 优先，旧 heroes-v2.png 图集兜底
 * ---------------------------------------------------------------------------
 * 新素材是七张各自独立的方形 PNG（1254×1254），不能替换旧图集后继续按
 * background-size:300% 三等分裁切 —— 那样会把一个人切成三个错位的头。
 * 因此这里走两条互不干扰的路径：
 *   · 有 imageSrc → 用真实透明边界（alpha≥32）定位，脚底对齐、留安全边距，
 *     非破坏性裁出头像预览；未加载出来时（404 / 解码失败）自动去掉内联样式，
 *     退回旧图集，绝不在界面上留一个空框。
 *   · 没有 imageSrc → 完全维持旧图集行为，旧存档与角色 ID 不受影响。
 * 双人相拥素材（02）是一个不可拆分的视觉单位：不额外加操控者、行动或碰撞体。
 * --------------------------------------------------------------------------- */
const heroArtCache = new Map();

// 解析某角色的立绘素材：只认 artSlug，外观与规则彻底解耦。
function heroArtSkin(heroIndex) {
  const hero = HEROES[heroIndex];
  if (!hero) return null;
  const skin = hero.artSlug ? ART_SKINS[hero.artSlug] : null;
  if (skin) return skin;
  // 兼容直接写 imageSrc / artBounds 的旧写法。
  if (hero.imageSrc) return { src: hero.imageSrc, bounds: hero.artBounds, artWide: hero.artWide };
  return null;
}

function heroArtUrl(heroIndex) {
  const skin = heroArtSkin(heroIndex);
  return skin && skin.src ? skin.src : '';
}

// 按 alpha≥32 的真实边界算「主体占画布比例」与「脚底位置」，得出可复用的定位样式。
// background-size: 取「占位尺寸 / 主体占画布的比例」，于是主体刚好铺满占位。
// background-position: 用 CSS 的百分比对齐公式反解 —— 让主体框中心落在占位中心。
//   P = (0.5 - c·S) / (1 - S)，其中 c 是主体中心在画布里的比例，S 是图相对占位的倍数。
// 单人图略放大以填满占位；双人相拥是更宽的整体轮廓，单独放宽，不把两人挤小。
function heroArtStyle(heroIndex, mode = 'full') {
  const skin = heroArtSkin(heroIndex);
  const url = heroArtUrl(heroIndex);
  if (!url) return '';
  const bounds = skin?.bounds;
  const style = [`--art-url:url('${url}')`];
  if (!bounds) return style.join(';');
  const IMG = 1254;                       // 七张素材统一为 1254×1254
  const [x1, y1, x2, y2] = bounds;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const cw = w / IMG;                     // 主体宽度占画布比例
  const ch = h / IMG;                     // 主体高度占画布比例
  const cx = (x1 + w / 2) / IMG;          // 主体中心 x 比例
  const cy = (y1 + h / 2) / IMG;          // 主体中心 y 比例
  // 占位里主体高度应占到多少：单人立绘尽量顶满，双人组合保持完整轮廓。
  // 说明：这里以「主体框」为准而不是整幅画布，因此头部饰品（绿裙/花冠/兜帽）不会被裁。
  const wide = Boolean(skin?.artWide);
  const fill = wide ? 0.92 : (mode === 'portrait' ? 0.94 : 0.98);
  // 图相对占位的放大倍数 S：让 ch·S = fill。
  const S = fill / ch;
  // 宽高各按自身比例换算 —— 占位不是正方形，横纵不能共用同一个倍数。
  const Sx = S * (IMG / IMG);
  const Sy = S * (IMG / IMG);
  const posX = (0.5 - cx * Sx) / (1 - Sx);
  // 垂直方向额外留一点顶部余量，避免头饰贴边被切。
  const headroom = wide ? 0.02 : (mode === 'portrait' ? 0.03 : 0.02);
  const posY = (0.5 - headroom - cy * Sy) / (1 - Sy);
  style.push(`--art-w:${(Sx * 100).toFixed(1)}%`);
  style.push(`--art-h:${(Sy * 100).toFixed(1)}%`);
  style.push(`--art-x:${(posX * 100).toFixed(2)}%`);
  style.push(`--art-y:${(posY * 100).toFixed(2)}%`);
  return style.join(';');
}

function applyHeroArt(element, heroIndex, mode = 'full') {
  if (!element) return;
  const url = heroArtUrl(heroIndex);
  if (!url) { element.classList.remove('has-art'); element.style.removeProperty('--art-url'); setHeroClass(element, heroIndex); return; }
  const style = heroArtStyle(heroIndex, mode);
  style.split(';').forEach(part => {
    const colon = part.indexOf(':');
    if (colon > 0) element.style.setProperty(part.slice(0, colon), part.slice(colon + 1));
  });
  element.classList.add('has-art');
  element.classList.remove('art-fallback');
  // 素材缺失时退回旧图集，并把问题记录下来，方便在控制台排查。
  if (!heroArtCache.has(url)) {
    const probe = new Image();
    probe.onload = () => heroArtCache.set(url, true);
    probe.onerror = () => {
      heroArtCache.set(url, false);
      element.classList.remove('has-art');
      element.classList.add('art-fallback');
      element.style.removeProperty('--art-url');
      setHeroClass(element, heroIndex);
      if (!heroArtFailures.includes(url)) {
        heroArtFailures.push(url);
        console.warn('[夜冠] 人物素材缺失，已回退到旧图集：', url);
      }
    };
    probe.src = url;
    heroArtCache.set(url, 'pending');
  } else if (heroArtCache.get(url) === false) {
    element.classList.remove('has-art');
    element.classList.add('art-fallback');
    element.style.removeProperty('--art-url');
    setHeroClass(element, heroIndex);
  }
}

const heroArtFailures = [];

function applyRoomBg(element, roomId) {
  if (!element) return;
  const stage = state?.stageId || 'explore';
  const art = window.ClassicVisuals.roomArt(roomId, stage);
  /* 只替换 art-* 前缀的类，保留 current / incoming 这类状态类。 */
  const keep = [...element.classList].filter(name => !name.startsWith('art-'));
  element.className = [...keep, ...art.variantClass.split(' ')].filter(Boolean).join(' ');
  element.dataset.room = roomId;
  element.dataset.motif = art.motif;
  element.style.setProperty('--room-accent', art.accent);
  element.style.backgroundImage = `url('${art.url}')`;
  element.style.backgroundPosition = 'center center';
  element.classList.toggle('art-pending', Boolean(art.needsArt));
  /* 待补素材角标：缺图必须看得见，不能静默伪装成别处的房间。 */
  const host = element.parentElement;
  if (host) {
    let badge = host.querySelector(':scope > .art-pending-badge');
    if (art.needsArt) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'art-pending-badge';
        badge.textContent = '场景素材待补 · 当前为基础构图 + 独立覆盖层';
        host.appendChild(badge);
      }
      badge.hidden = false;
    } else if (badge) {
      badge.hidden = true;
    }
  }
  /* 真正去探测文件是否存在；探测失败才降级，并把「缺图」留在界面上。
     角标以磁盘上有没有 visuals/{房间id}.png 为准，所以素材一放进去就会自动消失。 */
  window.ClassicVisuals.artStatus(roomId, stage).then(resolved => {
    if (element.dataset.room !== roomId) return;   // 已经换到别的房间了
    element.style.backgroundImage = `url('${resolved.url}')`;
    element.classList.toggle('art-missing', Boolean(resolved.missing));
    element.classList.toggle('art-pending', Boolean(resolved.needsArt));
    /* 独立美术到位后，把程序化的「母题覆盖层」摘掉 ——
       那些形状原本就是用来临时顶替这张图的，真图里已经画了同样的东西，
       再叠一层会过曝、也会糊掉细节。 */
    if (resolved.ownArtPresent) {
      [...element.classList].filter(name => name.startsWith('art-motif-') || name === 'art-return' || name.startsWith('art-light-') || name.startsWith('art-overlay-')).forEach(name => element.classList.remove(name));
    }
    if (!resolved.needsArt) {
      const badge = element.parentElement?.querySelector(':scope > .art-pending-badge');
      if (badge) badge.hidden = true;
    }
  }).catch(() => {});
}

function itemIconMarkup(item, small = false) {
  const def = ITEMS[item.id];
  const total = def.unbreakable ? 0 : def.durability || 2;
  const remaining = itemDurability(item);
  const pips = Array.from({ length: total }, (_, index) => `<i class="${index < remaining ? 'on' : 'off'}"></i>`).join('');
  const durabilityText = def.unbreakable ? '不会损坏' : `耐久 ${remaining}/${total}`;
  const quality = def.category === 'equipment' ? gearQuality(item) : '';
  return `<span class="item-icon ${small ? 'small' : ''} ${quality ? `quality-${quality}` : ''} ${def.type === 'defense' ? 'defense' : ''}" data-item-uid="${item.uid}" style="--item-a:${def.colors[0]};--item-b:${def.colors[1]};--quality-color:${QUALITY_COLORS[quality] || 'transparent'}" title="${def.name}${quality ? ` · ${affixText(itemAffixes(item)[0])}` : `：${def.description}（${durabilityText}）`}">${def.glyph}<span class="item-pips" data-pips aria-label="${durabilityText}">${pips}</span></span>`;
}

function renderHeroSetup() {
  $$('.hero-cards').forEach(container => {
    const playerIndex = Number(container.dataset.player);
    const page = heroCatalogPage[playerIndex];
    const visible = HEROES.map((hero, heroIndex) => ({ hero, heroIndex }))
      .filter(({ heroIndex }) => page ? heroIndex >= 3 : heroIndex < 3);
    container.innerHTML = `<div class="hero-catalog-tabs">
      <span>当前：${HEROES[setupSelection[playerIndex]].name}</span>
      <button data-hero-page="0" data-player="${playerIndex}" class="${page ? '' : 'active'}">原版 3 人</button>
      <button data-hero-page="1" data-player="${playerIndex}" class="${page ? 'active' : ''}">新增 7 人</button>
      </div>` + visible.map(({ hero, heroIndex }) => `
      <button class="hero-card ${setupSelection[playerIndex] === heroIndex ? 'active' : ''}" data-setup-player="${playerIndex}" data-hero="${heroIndex}">
        <div class="hero-preview hero-${heroIndex}" data-hero-preview="${heroIndex}"></div><b>${hero.name}</b><span>${hero.trait}</span>
        <em class="hero-talent" title="${hero.talent.detail}">${hero.talent.name}</em>
      </button>`).join('');
    // 选人卡的立绘从同一张 PNG 非破坏性裁出头像预览（场景仍用全身），不额外制作头像文件。
    $$('.hero-preview', container).forEach(node => {
      const heroIndex = Number(node.dataset.heroPreview);
      setHeroClass(node, heroIndex);
      applyHeroArt(node, heroIndex, 'portrait');
    });
  });
  // 键盘光标可见：给当前聚焦的卡加 focus ring。
  $$('.hero-card').forEach(card => {
    const p = Number(card.dataset.setupPlayer), h = Number(card.dataset.hero);
    const on = p === setupCursor.side && h === setupCursor.hero;
    card.classList.toggle('kb-focus', on);
    if (setupConfirmed[p]) card.classList.add('locked');
  });
}

/* 【msg8 §22】拳击式选人键盘导航：A/D 或 ←/→ 换卡，W/S 或 ↑/↓ / Tab 换侧，
   Enter/Space/J/K 确认；两侧都确认后 Enter 进游戏。 */
function setupKeyboardNav(code) {
  const page = idx => heroCatalogPage[idx];
  const visible = idx => HEROES.map((_, i) => i).filter(i => page(idx) ? i >= 3 : i < 3);
  const focusCard = () => { const c = $$('.hero-card').find(n => Number(n.dataset.setupPlayer) === setupCursor.side && Number(n.dataset.hero) === setupCursor.hero); if (c) c.scrollIntoView({ block: 'nearest' }); };
  const left = code === 'KeyA' || code === 'ArrowLeft';
  const right = code === 'KeyD' || code === 'ArrowRight';
  const up = code === 'KeyW' || code === 'ArrowUp';
  const down = code === 'KeyS' || code === 'ArrowDown';
  const swapSide = code === 'Tab' || up || down;
  if (left || right) {
    const list = visible(setupCursor.side);
    const at = list.indexOf(setupCursor.hero);
    const next = at < 0 ? 0 : (at + (right ? 1 : list.length - 1)) % list.length;
    setupCursor.hero = list[next];
    setupConfirmed[setupCursor.side] = false;
    renderHeroSetup(); focusCard();
    return true;
  }
  if (swapSide) {
    // 单人模式只在一侧；本地双人才切侧。
    if (setupMode === 'local') setupCursor.side = setupCursor.side ? 0 : 1;
    const list = visible(setupCursor.side);
    if (!list.includes(setupCursor.hero)) setupCursor.hero = list[0];
    renderHeroSetup(); focusCard();
    return true;
  }
  const confirmKeys = ['Enter', 'Space', 'KeyJ', 'KeyK', 'NumpadEnter'];
  if (confirmKeys.includes(code)) {
    // 先确认当前侧；已确认则切到另一侧再确认；两侧都确认后进游戏。
    if (!setupConfirmed[setupCursor.side]) {
      setupSelection[setupCursor.side] = setupCursor.hero;
      setupConfirmed[setupCursor.side] = true;
      renderHeroSetup();
      return true;
    }
    if (setupMode === 'local' && !setupConfirmed[1]) { setupCursor.side = 1; const list = visible(1); if (!list.includes(setupCursor.hero)) setupCursor.hero = list[0]; renderHeroSetup(); return true; }
    if (setupMode !== 'local' || (setupConfirmed[0] && setupConfirmed[1])) { enterGame(); return true; }
    return true;
  }
  // Q/E 切分页（原版 3 人 / 新增 7 人）
  if (code === 'KeyQ' || code === 'KeyE') {
    heroCatalogPage[setupCursor.side] = code === 'KeyQ' ? 0 : 1;
    const list = visible(setupCursor.side);
    setupCursor.hero = list[0];
    renderHeroSetup();
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 * 九阶段状态机
 * ---------------------------------------------------------------------------
 * travel_select → travel_resolve
 *   → action_1_select → action_1_resolve → action_1_result
 *   → action_2_select → action_2_resolve → action_2_result
 *   → round_summary → (下一回合 / 结束)
 *
 * 每一次推进都必须经过 allReady() 闸门；被囚禁、没有合法选项、AI 延迟
 * 这三种情况由系统自动标记就绪，而不是要求玩家选择不存在的行动。
 */
const PHASES = {
  setup: 'setup',
  travelSelect: 'travel_select',
  travelResolve: 'travel_resolve',
  actionSelect: slot => `action_${slot}_select`,
  actionResolve: slot => `action_${slot}_resolve`,
  actionResult: slot => `action_${slot}_result`,
  roundSummary: 'round_summary',
  end: 'end'
};

const TRAVEL_SELECT = PHASES.travelSelect;
const TRAVEL_RESOLVE = PHASES.travelResolve;
const ROUND_SUMMARY = PHASES.roundSummary;

function slotOfPhase(phase, kind) {
  const match = /^action_(\d)_(select|resolve|result)$/.exec(phase || '');
  if (!match) return 0;
  if (kind && match[2] !== kind) return 0;
  return Number(match[1]);
}

function isSelectPhase(phase = state.phase) {
  return phase === TRAVEL_SELECT || slotOfPhase(phase, 'select') > 0;
}

function phaseName() {
  const slot = slotOfPhase(state.phase);
  if (state.phase === 'setup') return '等待入场';
  if (state.phase === TRAVEL_SELECT) return '选择去路';
  if (state.phase === TRAVEL_RESOLVE) return '来时的走廊正在退远';
  if (slot && state.phase.endsWith('_select')) return ['','第一步 · 想好就定下','第二步 · 想好就定下','第三步 · 想好就定下'][slot];
  if (slot && state.phase.endsWith('_resolve')) return '事情正在发生';
  if (slot && state.phase.endsWith('_result')) return '看看刚才发生了什么';
  if (state.phase === ROUND_SUMMARY) return '这一回合的账';
  if (state.phase === 'stage_growth') return '阶段成长';
  if (state.phase === 'stage_transition') return '阶段切换';
  if (state.phase === 'end') return '钟声停止';
  return '等待';
}

function setNarrative(playerIndex, text, icon = '◐') {
  $(`#narrative-${playerIndex}`).textContent = text;
  $(`#narrativeIcon-${playerIndex}`).textContent = icon;
}

/* ---------------------------------------------------------------------------
 * 属性可视化阈值
 * ---------------------------------------------------------------------------
 * 生命 / 体力 / 理智按固定 0–10 分四档：8–10 稳定、5–7 正常、3–4 警告、0–2 危险。
 * 核心属性按“当前上限”（max(10, 当前值)）归一化：>70% 优势、35–69% 中性、<35% 危险。
 * 不允许只靠颜色判断：每一档同时输出图标 + 文字，颜色只是加速识别。
 */
const VITAL_TIERS = [
  { min: 8, key: 'high', label: '稳定', icon: '●' },
  { min: 5, key: 'normal', label: '正常', icon: '○' },
  { min: 3, key: 'warn', label: '警告', icon: '▲' },
  { min: -99, key: 'danger', label: '危险', icon: '✕' }
];

/* 核心属性改用固定成长档，不再按「动态凑整上限」归一化。
   旧写法用 max(10, 向上取整到十位) 当分母，会出现「数值涨了、档位反而掉了」的误导。
   现在的档位只随数值单调上行，几十到几百都能一眼看出自己走到哪一段。 */
const CORE_TIERS = [
  { min: 80, key: 'mythic', label: '超凡', icon: '✸' },
  { min: 40, key: 'high', label: '优势', icon: '◆' },
  { min: 20, key: 'solid', label: '成型', icon: '◈' },
  { min: 10, key: 'normal', label: '中性', icon: '◇' },
  { min: -99, key: 'danger', label: '危险', icon: '✕' }
];

function coreTierFor(value) {
  return CORE_TIERS.find(tier => value >= tier.min) || CORE_TIERS.at(-1);
}

function vitalTier(value) {
  return VITAL_TIERS.find(tier => value >= tier.min) || VITAL_TIERS.at(-1);
}

function coreTier(player, key) {
  return coreTierFor(effectiveStat(player, key));
}

function deltaBadge(player, key) {
  const delta = player.roundDeltas?.[key] || 0;
  if (!delta) return '';
  /* 方向 + 增量数字：属性进入几十到几百的区间后，「涨了一点」已经不够用，
     玩家需要看见这一步到底挪了多少。 */
  return `<span class="delta-badge ${delta > 0 ? 'up' : 'down'}" title="${statHint(key, delta)}">${delta > 0 ? '↑' : '↓'}${Math.abs(delta)}</span>`;
}

function renderVitals(player) {
  const values = [['health', '生命', '#b43e58'], ['stamina', '体力', '#c09a4d'], ['sanity', '理智', '#6585bd']];
  $(`#vitals-${player.index}`).innerHTML = values.map(([key, label, color]) => {
    const value = player.stats[key];
    const tier = vitalTier(value);
    return `<div class="vital tier-${tier.key}" title="${label} ${value}/${MAX_VITAL} · ${tier.label}">
      <label><span>${label}</span><b>${value}</b><em class="tier-mark">${tier.icon}${tier.label}</em>${deltaBadge(player, key)}</label>
      <i style="--value:${clamp(value, 0, MAX_VITAL) / MAX_VITAL * 100}%;--bar:${color}"></i></div>`;
  }).join('');
}

function renderStats(player) {
  const keys = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth', 'keys', 'clues'];
  $(`#stats-${player.index}`).innerHTML = keys.map(key => {
    if (key === 'keys' || key === 'clues') {
      return `<div class="stat-chip resource key-resource ${player.stats[key] > 0 ? 'has' : ''}"><span>${STAT_LABEL[key]}</span><b>${player.stats[key]}</b>${deltaBadge(player, key)}</div>`;
    }
    const tier = coreTier(player, key);
    const standing = standingStat(player, key);
    const effective = effectiveStat(player, key);
    const buff = effective - standing;
    return `<div class="stat-chip tier-${tier.key}" title="${STAT_LABEL[key]} 基础${player.stats[key]} · 装备后常驻 ${standing}${buff ? ` · 临时状态 +${buff}` : ''} · ${tier.label}">
      <span>${STAT_LABEL[key]}</span><b>${effective}</b><em class="tier-mark">${tier.icon}</em>${buff ? `<em class="buff-mark" title="临时状态">△</em>` : ''}${deltaBadge(player, key)}</div>`;
  }).join('');
}

/* 行囊格子的可用性说明：只讲"能不能用、用了会怎样"，不写成功率、不写阶段名。 */
function itemAvailability(player, item) {
  const def = ITEMS[item.id];
  if (def.effect?.kind === 'shortenJail' && !player.chainKeyUsed) {
    return { ok: true, note: '被送入地牢时自动生效' };
  }
  if (def.effect?.kind === 'passive') {
    if (def.effect.requiresTag) {
      return { ok: true, note: `装备中 · 碰上${def.effect.requiresTag === 'dark' ? '伸手不见五指的地方' : '对路的场合'}才发声` };
    }
    return { ok: true, note: `装备中 · ${PASSIVE_FLAVOR[def.effect.statKey] || '对路的行动更容易成事'}` };
  }
  if (def.effect?.kind === 'reactive') {
    return { ok: true, note: '有人扑上来时它会自己挡一下' };
  }
  if (def.effect?.kind === 'shortenJail' && player.chainKeyUsed) {
    return { ok: false, reason: '它已经用掉了自己的那一次机会' };
  }
  if (def.quick && player.quickUsedThisRound) {
    return { ok: false, reason: '这一回合它已经帮过你一次' };
  }
  const slot = slotOfPhase(state.phase, 'select');
  if (!slot && state.phase !== TRAVEL_SELECT) return { ok: false, reason: '此刻腾不出手' };
  const usable = itemUsable(player, item);
  if (!usable.ok) return usable;
  return { ok: true, note: (def.quick || (isHealingItem(def) && !player.quickUsedThisRound)) ? '本回合免费治疗，不占行动' : '用掉这一步' };
}

function isHealingItem(def) {
  return ['heal', 'soothe', 'restore', 'rations'].includes(def?.effect?.kind);
}

/* 【msg8 §23】快捷治疗：自动挑最合理的治疗道具——
   优先补当前最低的生命值类型；同类型多件时选最低稀有度（不浪费金装）。 */
function bestHealItem(player) {
  const cands = player.inventory.filter(it => itemCategoryOf(it) === 'active' && isHealingItem(ITEMS[it.id]));
  if (!cands.length) return null;
  const vitalOf = it => {
    const k = ITEMS[it.id].effect?.kind;
    if (k === 'heal') return 'health';
    if (k === 'soothe') return 'sanity';
    if (k === 'restore') return ITEMS[it.id].effect.vital === 'all' ? 'all' : ITEMS[it.id].effect.vital;
    if (k === 'rations') return 'stamina';
    return 'health';
  };
  const lowest = ['health', 'stamina', 'sanity'].sort((a, b) => player.stats[a] - player.stats[b])[0];
  const score = it => {
    const v = vitalOf(it);
    const matches = (v === lowest || v === 'all') ? 0 : 1;
    const rarityRank = { common: 0, fine: 1, epic: 2 }[ITEMS[it.id].rarity || 'common'];
    return matches * 10 + rarityRank;
  };
  cands.sort((a, b) => score(a) - score(b));
  for (const it of cands) if (itemUsable(player, it).ok) return it;
  return null;
}
function doQuickHeal(playerIndex) {
  const player = state.players[playerIndex];
  if (!player || player.control !== 'human' || !isSelectPhase() || playerCannotAct(player)) return false;
  const item = bestHealItem(player);
  if (!item) return false;
  if (!openItemPanel(playerIndex, item.uid)) return false;
  return confirmItemUse(playerIndex);
}

/* 行囊格子：前四件主动道具独立热键，其余仍可在行囊中查看。 */
function renderInventory(player) {
  const host = $(`#inventory-${player.index}`);
  const compactCounts = bagCounts(player);
  const gear = player.inventory.filter(item => ITEMS[item.id]?.system).map(item => ITEMS[item.id].name);
  host.innerHTML = `<div class="bag-compact">
    <span><b>体系装备</b> ${gear.length ? gear.slice(0, 2).join('、') : '暂无'}${gear.length > 2 ? `等${gear.length}件` : ''}</span>
    <span><b>主动/被动</b> ${compactCounts.other}件</span>
    <span class="bag-key-line"><b>金钱/关键</b> <i>钥匙 ${player.stats.keys || 0}</i><i>线索 ${player.stats.clues || 0}</i> · ${compactCounts.relic}件</span>
    <button data-bag-open="${player.index}">完整行囊 <kbd>${keyLabel(keyRowOf(player.index).bag)}</kbd></button>
    <button data-quick-heal="${player.index}" ${bestHealItem(player) ? '' : 'disabled title="没有可用的治疗道具"'} class="quick-heal-btn" style="border-color:#7bc997;color:#7bc997">快捷治疗 <kbd>H</kbd></button>
    ${(() => { const a = activeAvailability(player); const act = heroActiveOf(player); if (!act) return ''; const panel = player.turn?.activePanel; if (panel) { const tgts = act.needsTarget ? activeTargetsFor(player).map(t => `<button data-skill-target="${t.id}" data-player-index="${player.index}" class="skill-target ${panel.targetId === t.id ? 'on' : ''}">${t.label}${panel.targetId === t.id ? ' ✓' : ''}</button>`).join('') : ''; return `<span class="skill-panel"><b>${act.name}</b><small>${act.desc}</small>${tgts}<button data-skill-confirm="${player.index}" ${(!act.needsTarget || panel.targetId) ? '' : 'disabled'} >确认释放</button><button data-skill-cancel="${player.index}">取消</button></span>`; } return `<button data-skill-open="${player.index}" ${a.ok ? '' : `disabled title="${a.reason}"`} class="active-skill-btn" style="border-color:#d9b458;color:#d9b458">${act.name}</button>`; })()}
  </div>`;
  const bonusHost = $(`#systemBonuses-${player.index}`);
  if (bonusHost) {
    const owned = Object.keys(GEAR_SYSTEMS).map(key => ({ key, count: systemCount(player, key) })).filter(row => row.count);
    bonusHost.innerHTML = owned.length ? owned.map(({ key, count }) => {
      const tier = systemTier(player, key);
      const bonus = tier ? SYSTEM_TIER_BONUS[key].slice(0, tier).join(' · ') : '单件主属性辅助';
      const next = tier === 3 ? '已成型' : `再得${[2, 4, 6][tier] - count}件升阶`;
      return `<div class="system-bonus-row" style="--system-color:${GEAR_SYSTEMS[key].color}"><b>${GEAR_SYSTEMS[key].name} ${count}/6</b><span>${tier ? `${tier}阶` : '未成套'} · ${bonus}</span><small>${next}</small></div>`;
    }).join('') : '<span class="system-bonus-empty">尚无体系装备</span>';
  }
  const statusBits = [
    ...player.statuses.map(value => ({ value, cls: value.includes('囚禁') || value.includes('受伤') || value.includes('暴露') ? 'alert' : 'good' })),
    ...player.marks.map(value => ({ value: `标记 · ${value}`, cls: '' })),
    ...player.curses.map(value => ({ value: `诅咒 · ${value}`, cls: 'alert' })),
    ...player.injuries.map(value => ({ value: `伤势 · ${value}`, cls: 'alert' }))
  ];
  $(`#statuses-${player.index}`).innerHTML = statusBits.length
    ? statusBits.map(bit => `<span class="status-tag ${bit.cls}" title="${bit.note || bit.value}">${bit.value}</span>`).join('')
    : '<span class="status-tag">平静 · 未留下痕迹</span>';
  return;
}

// 与当前选项池匹配时给出的一句提示：只说"它现在正对路"，不写数值。
function itemMatchSummary(player, item) {
  const def = ITEMS[item.id];
  if (!isSelectPhase()) return '';
  const pool = legalEntries(player);
  const hit = pool.find(entry => getMatchingItems(player, entry).some(candidate => candidate.uid === item.uid));
  if (!hit) return '';
  if (def.category === 'relic' && hit.kind === 'reward') return '深处的机关认得它';
  if (def.effect?.kind === 'heal') return '现在正该止血';
  if (def.effect?.kind === 'soothe') return '现在正该定神';
  return '这一手正对它';
}

function renderRoom(player) {
  const room = ROOM_BY_ID[player.room];
  const hero = HEROES[player.hero];
  const visibleOthers = state.players.filter(other => !other.collapsed && other.id !== player.id && other.room === player.room && player.room !== 'dungeon');
  const stage = $(`#stage-${player.index}`);
  const moved = stage.dataset.room && stage.dataset.room !== player.room;
  if (moved && !reducedMotion && !state.headless) {
    const actor = $(`#actor-${player.index}`);
    const ghost = actor.cloneNode(true);
    ghost.removeAttribute('id');ghost.removeAttribute('data-subject-id');
    ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    ghost.classList.remove('teleport-in');ghost.classList.add('teleport-out');
    ghost.setAttribute('aria-hidden','true');ghost.style.pointerEvents='none';
    actor.parentElement.append(ghost);
    actor.classList.add('teleport-in');
    setTimeout(() => { ghost.remove(); actor.classList.remove('teleport-in'); }, 700);
  }
  stage.dataset.room = player.room;
  applyRoomBg($(`#roomCurrent-${player.index}`), player.room);
  $(`#roomFloor-${player.index}`).textContent = room.floor;
  $(`#roomTitle-${player.index}`).textContent = room.name;
  $(`#roomDesc-${player.index}`).textContent = room.desc;
  /* 原有城堡显示「第几间 / 12」；新阶段房间显示阶段名，不再印出「房间 00 / 12」。 */
  if (room.stage) {
    $(`#stageBadge-${player.index}`).textContent = `${stageById(room.stage).label} · ${room.special ? room.name : '普通房间'}`;
  } else {
    $(`#stageBadge-${player.index}`).textContent = room.special ? room.name : `房间 ${String(NORMAL_ROOM_IDS.indexOf(room.id) + 1).padStart(2, '0')} / 12`;
  }
  $(`#heroName-${player.index}`).textContent = hero.name;
  $(`#heroTitle-${player.index}`).textContent = `${hero.title} · ${room.name}`;
  $(`#controlLabel-${player.index}`).textContent = player.control === 'ai' ? 'AI · 完整规则' : `PLAYER ${player.index + 1}`;
  setHeroClass($(`#portrait-${player.index}`), player.hero);
  applyHeroArt($(`#portrait-${player.index}`), player.hero, 'portrait');
  setHeroClass($(`#actor-${player.index}`), player.hero);
  applyHeroArt($(`#actor-${player.index}`), player.hero, 'full');

  const legacyOpponent = $(`#opponent-${player.index}`);
  legacyOpponent.classList.add('hidden');
  let occupants = $(`#occupants-${player.index}`);
  if (!occupants) {
    occupants = document.createElement('div');
    occupants.id = `occupants-${player.index}`;
    occupants.className = 'room-occupants';
    stage.appendChild(occupants);
  }
  occupants.innerHTML = visibleOthers.map((other, slot) => `
    <div class="actor opponent visible-occupant hero-${other.hero}" data-subject-id="${other.id}" style="--occupant-x:${Math.min(82, 48 + slot * 8)}%">
      <div class="sprite"></div><label>${other.label} · ${HEROES[other.hero].name}</label>
    </div>`).join('');
  $$('.visible-occupant', occupants).forEach((node, slot) => applyHeroArt(node, visibleOthers[slot].hero, 'full'));
  const npc = NPCS[availableNpc(player)];
  let npcStage = $(`#stage-npc-${player.index}`);
  if (!npcStage) {
    npcStage = document.createElement('div');
    npcStage.id = `stage-npc-${player.index}`;
    npcStage.className = 'stage-npc';
    stage.appendChild(npcStage);
  }
  npcStage.innerHTML = npc ? `${npcPortrait(npc)}<span>${npc.name}</span>` : '';
  npcStage.hidden = !npc;
}

function getMatchingItems(player, entry) {
  if (!entry) return [];
  if (entry.itemUid) return player.inventory.filter(item => item.uid === entry.itemUid);
  if (entry.kind === 'item' && entry.itemId) return player.inventory.filter(item => item.id === entry.itemId);
  const tags = entry.tags || [];
  return player.inventory.filter(item => {
    const def = ITEMS[item.id];
    if (def.category === 'passive' || def.category === 'equipment') return false;
    if (entry.kind === 'guard' && def.category !== 'reactive') return false;
    if (entry.kind === 'reward' && def.category !== 'relic') return false;
    // 需要选目标或改变位置的主动道具只能从它自己的行动进入，不能被普通行动暗中消耗。
    if (def.category === 'active' && entry.kind !== 'item' &&
        !['openLock', 'pick', 'light', 'mark', 'shortcut', 'heal', 'soothe'].includes(def.effect?.kind)) return false;
    return def.useTags.some(tag => tags.includes(tag));
  });
}

function getMatchingItemsByTags(player, tags) {
  return player.inventory.filter(item => ITEMS[item.id].useTags.some(tag => (tags || []).includes(tag)));
}

function applyReactiveSuccess(defender, attacker, item, result) {
  const extra = ITEMS[item.id]?.effect?.onGuard;
  if (extra === 'stamina') {
    applyChanges(defender, [['stamina', 1]], result);
    result.consequences.push('回护缎带拉住了你，体力也恢复了一点。');
  } else if (extra === 'expose') {
    attacker.statuses = uniqueAdd(attacker.statuses, '暴露');
    result.consequences.push('刺藤小盾扯掉了来犯者的遮掩。');
  }
}

// 传送/交换类道具的合法目标：必须在场、且不在奖励房与地牢。
function itemTargetsFor(player, def) {
  const effect = def.effect || {};
  return state.players.filter(other => {
    if (other.id === player.id) return false;
    if (other.collapsed || other.stats.health <= 0) return false;
    if ((effect.forbidRooms || []).includes(other.room)) return false;
    if (effect.sameRoomOnly && other.room !== player.room) return false;
    return true;
  });
}

function itemUsable(player, item) {
  const def = ITEMS[item.id];
  const effect = def.effect || {};
  /* 【msg8 §5】焚罪地狱中禁止使用任何道具（主动 / 反应 / 被动治疗均禁用）。 */
  if (player.room === 'hellOfSin') return { ok: false, reason: '地狱中无法使用道具' };
  if (effect.kind === 'shortenJail') return { ok: false, reason: player.chainKeyUsed ? '本局已经自动生效过' : '被送入地牢时自动生效' };
  if (def.quick && player.quickUsedThisRound) return { ok: false, reason: '本回合快速使用次数已用完' };
  if (effect.requiresTarget && !itemTargetsFor(player, def).length) return { ok: false, reason: '当前没有合法目标' };
  if (effect.kind === 'shockBurst' && !state.players.some(other => other.id !== player.id && other.room === player.room && !other.collapsed)) return { ok: false, reason: '同房没有其他人' };
  if (effect.kind === 'inspectCurse' && !player.curses.length) return { ok: false, reason: '你没有诅咒需要查看' };
  if (effect.kind === 'returnHome' && player.room === player.homeRoom) return { ok: false, reason: '你已经在自己的初始房间' };
  if (effect.kind === 'scout' && player.room === 'dungeon') return { ok: false, reason: '地牢没有未知出口' };
  if (effect.kind === 'passive') return { ok: true, reason: '' };
  if (!isSelectPhase()) return { ok: false, reason: '当前阶段不能主动使用道具' };
  const freeHeal = (def.quick || isHealingItem(def)) && !player.quickUsedThisRound;
  if (!freeHeal) {
    const slot = currentSelectSlot();
    if (!slot || player.turn.slots[slot]?.confirmed) return { ok: false, reason: '这一步已经确定，当前不能再使用' };
  }
  const usedIds = new Set(roundSlots().map(slot => player.turn.slots[slot].entry?.id).filter(Boolean));
  if (usedIds.has(`item-${item.uid}`)) return { ok: false, reason: '本回合已经用过这件道具' };
  return { ok: true, reason: '' };
}

function relationOf(player, npcId) {
  const value = player.npcRelation?.[npcId] ?? 0;
  const level = NPC_RELATION_LEVELS.find(entry => value >= entry.min) || NPC_RELATION_LEVELS.at(-1);
  return { value, ...level };
}

function addRelation(player, npcId, delta) {
  if (!delta) return;
  player.npcRelation = player.npcRelation || {};
  const MAX_REL = NPC_RELATION_LEVELS[0].min; // 满好感阈值 = 信任(3)
  let after = (player.npcRelation[npcId] || 0) + delta;
  /* 【msg8 §11】NPC 好感满(>=3)只归属一个玩家：若已被他人占满，自己封顶在 2(亲近)，
     拿不到满好感最终对话，也不会抢走归属。 */
  state.npcMaxedOwner = state.npcMaxedOwner || {};
  const owner = state.npcMaxedOwner[npcId];
  if (after >= MAX_REL && owner && owner !== player.id) after = MAX_REL - 1;
  player.npcRelation[npcId] = after;
  if (after >= MAX_REL && !owner) state.npcMaxedOwner[npcId] = player.id; // 首个拉满者登记为唯一归属
  // 好感首次达到现有体系的最高档 → 该 NPC 赠送时间护符。
  // 每名玩家每局最多通过这条机制拿到一枚，不能靠多个 NPC 或反复对话刷取。
  if (!player.charmGranted && (player.npcRelation[npcId] || 0) >= NPC_RELATION_LEVELS[0].min) {
    player.charmGranted = true;
    player.charms = (player.charms || 0) + 1;
    player.travelNotes.push(`${NPCS[npcId]?.name || '友人'}赠给你一枚时间护符。它不占行囊，在时空房间可使用，也能修补崩溃时钟。`);
  }
}

function choiceTone(entry) {
  if (entry.kind === 'attack') return '#e45b3f';
  if (entry.kind === 'guard') return '#62a6c9';
  if (entry.kind === 'reward') return '#b47bd3';
  if (entry.kind === 'npc') return '#c3a76a';
  if (entry.kind === 'item') return isHealingItem(ITEMS[entry.itemId]) ? '#7bc997' : '#8fa6d8';
  if (entry.kind === 'heal' || entry.kind === 'rest' || entry.kind === 'cleanse') return '#7bc997';
  if (entry.kind === 'search') return '#79c4dc';
  if (entry.kind === 'hide' || entry.kind === 'sneak') return '#9d9bdc';
  if (entry.kind === 'mystery') return '#bd91dc';
  if (entry.kind === 'force' || entry.kind === 'intimidate') return '#df9879';
  if (entry.kind === 'run') return '#d5bc73';
  return entry.risk === 1 ? '#73b28d' : entry.risk === 2 ? '#c19a55' : '#cc5268';
}

function previewChips(player, entry, item, max = 4) {
  return estimateDelta(player, entry, item)
    .filter(([, min, maxValue]) => !(min === 0 && maxValue === 0))
    .slice(0, max)
    .map(([statKey, min, maxValue]) => {
      const label = STAT_LABEL[statKey] || statKey;
      const span = min === maxValue ? `${min > 0 ? '+' : ''}${min}` : `${min > 0 ? '+' : ''}${min}~${maxValue > 0 ? '+' : ''}${maxValue}`;
      return `<span class="preview-chip ${min < 0 && maxValue <= 0 ? 'down' : ''}">${label} ${span}</span>`;
    }).join('');
}

// 选项键位由 keys.js 的 KEYMAP 统一提供（标签、教程与监听同源），这里不再重复定义。
const choiceKeyOf = (playerIndex, index) => keyTextForChoice(playerIndex, index) || '点';

function renderChoiceButton(player, entry, index) {
  const key = keyTextForChoice(player.index, index);
  const tools = getMatchingItems(player, entry);
  const riskNames = ['', '谨慎', '冒险', '凶险'];
  const itemStrip = tools.map(item => itemIconMarkup(item, true)).join('');
  const usedIds = new Set(roundSlots().map(slot => player.turn.slots[slot].entry?.id).filter(Boolean));
  const isPicked = usedIds.has(entry.id);
  const selectPhase = isSelectPhase();
  const currentSlot = slotOfPhase(state.phase, 'select') || (state.phase === TRAVEL_SELECT ? 0 : 0);
  const alreadyConfirmed = currentSlot ? Boolean(player.turn.slots[currentSlot].confirmed) : Boolean(player.turn.travel.confirmed);
  const disabled = entry.disabled || player.collapsed || (selectPhase && alreadyConfirmed) ? 'disabled' : '';

  // 选项上不写数字、不写属性名、不写成功率：只留"你要做什么"和一句氛围短句。
  const hero = HEROES[player.hero];
  const talentHit = hero?.talent && (
    (hero.talent.id === 'lampfoot' && ['stealth', 'agility'].includes(entry.stat))
    || (hero.talent.id === 'bellEcho' && ['strength', 'intimidation'].includes(entry.stat))
  );
  const talentTag = talentHit ? `<span class="choice-talent" title="${hero.talent.detail}">${hero.talent.name}</span>` : '';
  const hints = { attack: '追猎', guard: '防御', search: '搜寻', hide: '潜行', sneak: '潜行', run: '奔跑', mystery: '探秘', force: '破拆', intimidate: '威慑', heal: '治疗', rest: '治疗', cleanse: '治疗', use: '使用', reward: '奖励' };
  const kindTag = entry.kind === 'move' ? ACTION_LABEL[entry.action]
    : entry.kind === 'gearChoice' ? entry.choice === 'stat' ? '属性' : entry.choice === 'rest' ? '治疗' : entry.choice === 'supply' ? '补给' : '线索'
    : entry.kind === 'npc' ? '对话'
      : entry.kind === 'item' ? isHealingItem(ITEMS[entry.itemId]) ? '治疗' : '道具'
        : hints[entry.kind] || '探索';
  const npcNote = entry.npcId ? `<span class="choice-npc">${NPCS[entry.npcId].glyph} ${NPCS[entry.npcId].name}</span>` : '';

  const hintTone = entry.kind === 'gearChoice' && entry.choice === 'supply' ? '#83d7a1'
    : entry.kind === 'gearChoice' && entry.choice === 'loot' ? '#d9aaed'
      : entry.kind === 'gearChoice' && entry.choice === 'stat' ? '#efce78'
        : entry.stat === 'health' || entry.tags?.includes('heal') ? '#83d7a1'
          : entry.stat === 'sanity' ? '#a6bfff' : choiceTone(entry);
  const choiceTitle = entry.hintSystems?.length
    ? `【道具线索·${entry.hintSystems.map(system => `<span class="choice-system" style="--system-color:${GEAR_SYSTEMS[system].color}">${GEAR_SYSTEMS[system].name}</span>`).join(' / ')}】搜寻暗格`
    : entry.conceal ? '◇ 一扇还没打开的门' : entry.text;
  const choiceFlavor = entry.conceal ? '推开它才知道后面是哪一间' : entry.flavor;
  return `<button class="choice ${isPicked ? 'picked' : ''}" data-player="${player.index}" data-choice="${index}" style="--tone:${choiceTone(entry)};--hint-tone:${hintTone}" ${disabled}>
    <span class="choice-key">${isPicked ? '✓' : key}</span>
    <span class="choice-copy"><b>${choiceTitle}</b><span>${choiceFlavor}</span></span>
    <span class="choice-meta"><span class="risk">${kindTag}</span>${npcNote}<span class="choice-items">${itemStrip}</span>${talentTag}</span>
  </button>`;
}

function actionPointRow(player, currentSlot) {  const bits = roundSlots().map(slot => {
    const slotState = player.turn.slots[slot];
    const cls = slotState.result ? 'done' : slotState.confirmed ? 'locked' : (slot === currentSlot ? 'active' : 'open');
    const label = slotState.result ? '已完成' : slotState.confirmed ? '已锁定' : slot === currentSlot ? '进行中' : '未开始';
    return `<i class="${cls}" title="第 ${slot} 行动：${label}"></i>`;
  }).join('');
  const done = roundSlots().filter(slot => player.turn.slots[slot].result).length;
  return `<span class="action-points" title="${slotCountForStage(state.stageId)} 个行动点依次结算，每一步都按最新状态重新生成选项">${bits}<b>${done}/${slotCountForStage(state.stageId)}</b></span>`;
}

/* 被封锁的路线：有对应工具时给出“使用道具通过 / 放弃路线”两个明确选择。 */
function renderBlockedRoutes(player) {
  if (!player.blocked?.length) return '';
  return player.blocked.slice(0, 6).map(route => {
    const tool = player.turn.travel.confirmed ? null : blockedRouteTool(player, route);
    const actions = tool
      ? `<span class="blocked-actions">
          <button class="blocked-use" data-blocked-use="${route.id}" data-player="${player.index}">使用道具通过</button>
          <button class="blocked-drop" data-blocked-drop="${route.id}" data-player="${player.index}">放弃路线</button>
        </span>`
      : '';
    return `<span class="blocked-route ${tool ? 'has-tool' : ''}">⌁ ${ROOM_BY_ID[route.id].name} · <b>${route.reason}</b>${tool ? ` · 可用 ${ITEMS[tool.id].name}` : ''}${actions}</span>`;
  }).join('');
}

function renderItemPanel(player) {
  const panel = player.turn.itemPanel;
  const item = itemByUid(player, panel.itemUid);
  if (!item) { player.turn.itemPanel = null; return ''; }
  const def = ITEMS[item.id];
  const remaining = itemDurability(item);
  const targets = itemTargetsFor(player, def);
  const usable = itemUsable(player, item);
  const selectedTarget = def.effect?.requiresTarget ? (panel.targetId || null) : null;
  const targetRow = def.effect?.requiresTarget
    ? `<div class="ip-row"><span>它能用在谁身上</span><b>${targets.length
      ? targets.map((target, targetIndex) => `<button class="ip-target ${selectedTarget === target.id ? 'active' : ''}" data-item-target="${target.id}" data-player="${player.index}"><span class="ip-key">${targetIndex + 1}</span>${target.label}·${HEROES[target.hero].name}<small>${ROOM_BY_ID[target.room].name}</small></button>`).join('')
      : '此刻没有人能成为它的对象'}</b></div>`
    : '<div class="ip-row"><span>它能用在谁身上</span><b>不用挑人，用就是了</b></div>';
  const targetHint = def.effect?.requiresTarget && targets.length
    ? '<div class="ip-hint">按数字键挑人，Tab 换下一个，回车定下</div>'
    : '';
  const warn = def.effect?.warn ? `<div class="ip-warn">⚠ ${def.effect.warn}</div>` : '';
  const needTarget = Boolean(def.effect?.requiresTarget);
  const canConfirm = usable.ok && (!needTarget || selectedTarget);
  const blockedReason = usable.ok
    ? (needTarget && !selectedTarget ? '先挑一个对象' : '')
    : usable.reason;
  return `<div class="item-panel" data-item-panel="${player.index}">
    <header><span class="item-icon ${def.rare ? 'rare' : ''}" style="--item-a:${def.colors[0]};--item-b:${def.colors[1]}">${def.glyph}</span>
      <div><small>${ITEM_CATEGORY[def.category].label}</small><b>${def.name}</b></div>
      <span class="ip-dur">${def.unbreakable ? '不会损坏' : `耐久 ${'●'.repeat(Math.max(0, remaining))}${'○'.repeat(Math.max(0, (def.durability || 2) - remaining))}`}</span></header>
    <p class="ip-desc">${def.description}</p>
    <div class="ip-row"><span>会发生什么</span><b>${itemEffectText(def)}</b></div>
    ${targetRow}${targetHint}
    <div class="ip-row"><span>代价</span><b>${def.unbreakable ? '持续生效，不会损坏' : def.quick ? '顺手就用，不占这一步' : '占掉这一步，并磨掉一点耐久'}</b></div>
    ${warn}
    ${blockedReason ? `<div class="ip-warn">用不了：${blockedReason}</div>` : ''}
    <div class="ip-actions">
      <button class="ip-confirm" data-item-action="use" data-player="${player.index}" ${canConfirm ? '' : 'disabled'}>用掉它 <kbd>Enter</kbd></button>
      <button class="ip-cancel" data-item-action="cancel" data-player="${player.index}">收起来 <kbd>Esc</kbd></button>
    </div>
  </div>`;
}

// 详情面板里的"实际效果"：只讲会发生什么，不写数字、不写判定过程。
function itemEffectText(def) {
  const e = def.effect || {};
  const cleans = e.removeStatuses || [];
  const cleanNote = cleans.length ? `，顺便把「${cleans.join('、')}」从身上摘掉` : '';
  switch (e.kind) {
    case 'attackDart': return '向同房目标掷出飞刃，削去生命并让其暴露';
    case 'shockBurst': return '震荡同房的其他人，削去体力并使其暴露；自己也会受到惊吓';
    case 'heal': return `喝下去，血就止住了${cleanNote}`;
    case 'restore': return `立即恢复${e.vital === 'all' ? '生命、体力与理智' : STAT_LABEL[e.vital]}${e.amount}点`;
    case 'warpRoom': return `传送到${ROOM_BY_ID[e.dest].name}`;
    case 'huntWarp': return '随机传送到另一名玩家所在的普通房间';
    case 'escapeWarp': return '传送到无人普通房间并留下逃脱掩护';
    case 'currency': return '交易或抽奖时支付，无法主动使用';
    case 'soothe': return `点起来，呼吸重新排好队${cleanNote}`;
    case 'openLock': return '撬开眼前这把旧锁，手里立刻多一把钥匙；钥匙已经够多时，箱底会换出一条线索';
    case 'pick': return '挑开暗格，立刻摸到一条线索，并抹掉你留在明处的痕迹';
    case 'light': return '把这一段黑暗从房间里拎出去：驱散暴露、恐惧、动摇；身上没有这些时，它会照出一条线索';
    case 'mark': return '在墙上留一道只有你认得的星纹：立刻握到一条线索，心也跟着定下来';
    case 'shortcut': return '绳子替你抄近路，直接翻进一间连着这里的房间';
    case 'teleport': return '把自己折叠到所选那个人所在的地方';
    case 'returnHome': return '顺着来时的记忆，回到自己出发的那间房';
    case 'smoke': return '炸开一团浓烟：立刻脱身，也让下一次伸向你的手更难得手';
    case 'scout': return '摇一声铃，换回一个未知出口的名字，以及那里有多危险';
    case 'ward': return '替你站一次：下一次灾祸砸在蜡像身上，而不是你身上';
    case 'shortenJail': return '让牢门提前松一次 —— 一整夜里只有这一回';
    case 'swap': return '与同房的人交换一件各自手里的东西';
    case 'inspectCurse': return '照出附在你身上的东西到底是什么，然后当场把它摘掉';
    case 'passive': return `一直装备着，${PASSIVE_FLAVOR[e.statKey] || '对路的行动更容易成事'}；每次触发磨掉一点耐久`;
    case 'reactive': return '有人扑上来时它会自己挡一下，挡住了就把对方送进地牢';
    case 'relicBonus': return '在奖励房里，它会替你叫醒更深的一层';
    default: return '在匹配的行动里更容易成事';
  }
}

function renderDialogue(player) {
  const dialog = player.turn.npc;
  if (!dialog) return '';
  const npc = NPCS[dialog.npcId];
  const relation = relationOf(player, npc.id);
  const topic = npc.topics.find(entry => entry.id === dialog.topicId);
  const lines = dialog.lines || [];
  const visible = reducedMotion ? lines : lines.slice(0, Math.max(1, dialog.lineIndex + 1));
  const more = !reducedMotion && dialog.lineIndex < lines.length - 1;
  const choices = (dialog.choices || []).map((choice, index) => {
    const itemHit = choice.usesItem?.length ? getMatchingItemsByTags(player, choice.usesItem) : [];
    // 对话选项上也不写属性名与数字：只讲"你会变成什么样"。
    const gain = (choice.gain || []).slice(0, 2).map(([key, min, max]) => `<span class="dl-gain">▲ ${statHint(key, (max ?? min) >= 0 ? 1 : -1)}</span>`).join('');
    const loss = (choice.loss || []).slice(0, 2).map(([key]) => `<span class="dl-loss">▼ ${statHint(key, -1)}</span>`).join('');
    const rel = choice.rel > 0 ? '<span class="dl-rel up">它更愿意搭理你</span>' : choice.rel < 0 ? '<span class="dl-rel down">它往后退了半步</span>' : '';
    const cost = choice.consumesAction === false ? '<span class="dl-cost free">顺口一问，不占这一步</span>' : '<span class="dl-cost">要花掉这一步</span>';
    const itemTag = itemHit.length ? `<span class="dl-item">${itemHit.map(item => itemIconMarkup(item, true)).join('')}${ITEMS[itemHit[0].id].name}正对路</span>` : '';
    const lockReason = npcTopicLock(player, choice);
    const disabled = Boolean(lockReason);
    return `<button class="dl-choice" data-dialogue-choice="${index}" data-player="${player.index}" ${disabled ? 'disabled' : ''} style="--tone:${npc.accent}">
      <span class="dl-key">${index + 1}</span>
      <span class="dl-body"><b>${choice.text}</b><span>${choice.flavor}</span>
        <span class="dl-meta">${gain}${loss}${itemTag}${rel}${cost}</span>
      </span>
      ${lockReason ? `<span class="dl-lock">${lockReason}</span>` : ''}
    </button>`;
  }).join('');
  return `<div class="dialogue" data-npc="${npc.id}" style="--npc-accent:${npc.accent}">
    <header>${npcPortrait(npc)}<div><b>${npc.name}</b><small>${ROOM_BY_ID[npc.room].name} · 关系：${relation.label}</small></div>
      <button class="dl-skip" data-dialogue-skip="1" data-player="${player.index}">跳过 ▸</button></header>
    <div class="dl-lines">${visible.map((line, index) => `<p class="dl-line ${index === visible.length - 1 ? 'current' : ''}">${emphasize(line)}</p>`).join('')}</div>
    ${more ? '<p class="dl-hint">点击或按空格继续显示下一句</p>' : `<div class="dl-choices">${choices}</div>`}
  </div>`;
}

// 关键决策词局部强调，不整段闪烁。
const EMPHASIS_WORDS = ['信任', '敌对', '警惕', '诅咒', '地牢', '契约', '钥匙', '代价', '真话', '谎言'];
function emphasize(text) {
  let output = String(text);
  for (const word of EMPHASIS_WORDS) {
    output = output.split(word).join(`<em class="dl-em">${word}</em>`);
  }
  return output;
}

function renderDecision(player) {
  const decision = $(`#decision-${player.index}`);
  const result = $(`#result-${player.index}`);
  const lockedEl = $(`#locked-${player.index}`);
  const currentSlot = slotOfPhase(state.phase, 'select');
  const resultSlot = slotOfPhase(state.phase, 'result');
  const isResult = Boolean(resultSlot) || state.phase === ROUND_SUMMARY || state.phase === 'end';

  decision.classList.toggle('hidden', isResult);
  result.classList.toggle('hidden', !isResult);
  if (isResult) return renderResult(player, resultSlot);

  const travelPhase = state.phase === TRAVEL_SELECT;
  const skipping = player.skippedThisRound || player.jailedThisRound;
  const entries = legalEntries(player);
  const dialogActive = Boolean(player.turn.npc);
  const panelActive = Boolean(player.turn.itemPanel);
  const confirmed = travelPhase ? player.turn.travel.confirmed : Boolean(player.turn.slots[currentSlot]?.confirmed);

  let eyebrow = travelPhase ? '今夜为你让开的几条路'
    : currentSlot === 1 ? '先走出第一步'
      : `${currentSlot === 2 ? '第二步' : '第三步'} · 按你现在的样子重新摆出来`;
  if (!travelPhase && currentSlot) eyebrow += actionPointRow(player, currentSlot);

  $(`#decisionEyebrow-${player.index}`).innerHTML = eyebrow;
  $(`#decisionTitle-${player.index}`).textContent = skipping
    ? '锁链不允许你在本回合行动'
    : travelPhase ? '选择一条去路'
      : currentSlot === 1 ? `${ROOM_BY_ID[player.room].name}里，先迈出第一步` : `再迈出${currentSlot === 2 ? '第二步' : '第三步'}`;
  $(`#choiceCount-${player.index}`).textContent = skipping ? '这一回合被锁链吃掉了'
    : travelPhase ? '各自挑一条，互不干涉'
      : '挑一条就够了';

  const choicesHost = $(`#choices-${player.index}`);
  const panelHost = $(`#itemPanel-${player.index}`);
  panelHost.classList.add('hidden');          // 详情统一走本侧展开层，旧内联通道只保留给测试
  panelHost.innerHTML = panelActive ? renderItemPanel(player) : '';
  // 常驻只留紧凑入口：对话与行囊都进本侧独立展开层。
  const row = keyRowOf(player.index);
  const bagCount = bagCounts(player);
  const entriesHost = `<div class="layer-entries">
    <button class="layer-entry" data-bag-open="${player.index}">行囊 <b>体系 ${bagCount.system}/${BAG_CAPACITY} · 其他 ${bagCount.other}/${OTHER_ITEM_CAPACITY} · 关键 ${bagCount.relic}</b> <kbd>${keyLabel(row.bag)}</kbd></button>
  </div>`;
  choicesHost.innerHTML = entriesHost + entries.map((entry, index) => renderChoiceButton(player, entry, index)).join('');

  $(`#blocked-${player.index}`).innerHTML = travelPhase
    ? player.blocked.slice(0, 5).map(route => `<span class="blocked-route">⌁ ${ROOM_BY_ID[route.id].name} · <b>${route.reason}</b></span>`).join('')
    : '';

  const ready = isPlayerReady(player);
  const showLocked = !skipping && (ready || state.phase === TRAVEL_RESOLVE);
  lockedEl.classList.toggle('hidden', !showLocked);
  const lockTitle = $('b', lockedEl);
  const lockCopy = $('small', lockedEl);
  if (skipping) {
    lockTitle.textContent = '囚禁中 · 本回合不能行动';
    lockCopy.textContent = `还需等待 ${player.dungeonActionsLeft} 次行动`;
  } else if (ready && player.control === 'human') {
    lockTitle.textContent = '选择已锁定';
    lockCopy.textContent = '内容已遮住，等待另一侧完成决定';
  } else if (ready) {
    lockTitle.textContent = '对面已经拿定主意';
    lockCopy.textContent = '它按自己看见的东西在选，你先忙你的';
  } else {
    lockTitle.textContent = '等待选择';
    lockCopy.textContent = '两边都定下来之后，这一步才会一起发生';
  }
}

/* 每次行动单独结算；道具得失和数值变化先于故事显示。 */
function renderResultStep(player, data, stepSlot) {
  const meta = OUTCOME_META[data.outcome] || OUTCOME_META.special;
  const intensity = feedbackIntensity(data.outcome);
  const feedback = data.feedback || {};
  const activeChanges = data.changes || data.pendingChanges || [];
  const itemChanges = (data.itemChanges || []).map(({ item, direction }) => {
    const def = ITEMS[item.id];
    if (!def) return '';
    const quality = def.category === 'equipment' ? gearQuality(item) : '';
    return `<span class="result-item ${direction} ${quality ? `quality-${quality}` : ''}" style="--item-a:${def.colors[0]};--item-b:${def.colors[1]};--quality-color:${QUALITY_COLORS[quality] || 'transparent'}" title="${direction === 'gain' ? '获得' : '失去'}${def.name}"><span class="result-item-art">${def.glyph}</span><b>${def.name}</b><em>${direction === 'gain' ? '＋' : '－'}</em></span>`;
  }).join('');
  const changes = activeChanges.filter(([, value]) => value).map(([key, value]) =>
    `<span class="result-stat ${value < 0 ? 'negative' : 'positive'}"><b>${STAT_LABEL[key] || key}</b><strong>${value > 0 ? '+' : ''}${value}</strong></span>`).join('');
  const voiceTag = feedback.roomVoice ? `<span class="result-voice">${feedback.roomVoice}</span>` : '';
  const speakerLine = feedback.dialogueMode === 'typed' && feedback.lines?.length
    ? `<p class="result-speech" data-typed data-speaker="${feedback.speaker || ''}" data-duration="${feedback.duration || 0}">${feedback.lines[0]}</p>`
    : '';
  const talentTag = HEROES[player.hero]?.talent
    ? `<span class="result-talent" title="${HEROES[player.hero].talent.detail}">${HEROES[player.hero].talent.name}</span>`
    : '';
  return `<div class="result-step" data-step="${stepSlot}">
    <div class="result-rewards">${itemChanges}${changes || (!itemChanges ? '<span class="result-no-change">没有道具或属性变化</span>' : '')}</div>
    <div class="result-top"><span class="result-rank ${meta.className}">${stepSlot ? `第 ${stepSlot} 行动 · ` : ''}${meta.label}</span><span>${ROOM_BY_ID[player.room].name} · ${meta.icon}${voiceTag}</span></div>
    <h3>${data.title}</h3>${speakerLine}<p>${data.story}</p>
    <div class="consequence">${(data.consequences || []).join(' ')} ${talentTag}</div>
  </div>`;
}

function renderResult(player, slotIndex) {
  const currentSlot = slotIndex || 0;
  const slots = currentSlot ? [currentSlot] : roundSlots();
  const steps = slots.map(slot => player.turn.slots[slot]?.result).filter(Boolean);
  const data = steps.at(-1) || player.result || {
    outcome: 'special', title: '钟声替你记下了沉默', story: '这一回合没有产生新的行动。', changes: [], consequences: ['城堡仍在等待下一次选择。'], feedback: {}
  };

  let footer = '';
  const human = player.control === 'human';
  const confirmKey = keyLabel(keyRowOf(player.index)?.confirm || '');
  if (currentSlot && human && !playerCannotAct(player)
    && player.turn.slots[currentSlot]?.acknowledged === false) {
    const label = currentSlot < slotCountForStage(state.stageId) ? `继续第${currentSlot === 1 ? '二' : '三'}行动` : '查看本回合总结';
    footer = `<button class="result-continue" data-result-continue="${player.index}">${label} <kbd>${confirmKey}</kbd></button>`;
  } else if (currentSlot && human && player.turn.slots[currentSlot]?.acknowledged === true) {
    footer = `<p class="result-wait">你已读完，等待另一侧。 <kbd>${confirmKey}</kbd></p>`;
  }

  const roundReady = !currentSlot && human;
  const readyTag = roundReady
    ? (player.turn.roundReady === state.round
      ? `<p class="result-wait">你已准备好，等待同伴。 <kbd>${confirmKey}</kbd></p>`
      : `<button class="result-continue" data-round-ready="${player.index}">我准备好了 <kbd>${confirmKey}</kbd></button>`)
    : '';

  const summary = !currentSlot
    ? `<div class="round-summary">
        <b>第 ${state.round} 回合总结</b>
        <span>这一回合你迈了 ${cnNumber(steps.length)} 步。${vitalWord('health', player.stats.health)}，${vitalWord('stamina', player.stats.stamina)}，${vitalWord('sanity', player.stats.sanity)}。</span>
        <span>${player.inventory.length ? `行囊里有 ${player.inventory.map(item => ITEMS[item.id].name).join('、')}` : '行囊是空的'}</span>
        ${readyTag}
      </div>`
    : '';

  $(`#result-${player.index}`).innerHTML = steps.map((step, index) => renderResultStep(player, step, currentSlot || index + 1)).join('')
    + (steps.length ? '' : renderResultStep(player, data, currentSlot))
    + summary + footer;
  $(`#result-${player.index}`).dataset.slot = String(currentSlot);

  const lastFeedback = data.feedback || {};
  // 结算资源与数值在故事前立即显示。
  if (lastFeedback.dialogueMode === 'typed') scheduleTypedLine(player.index, lastFeedback);
}

// 延后揭示数值：把变化条先压住，再按 deferMs 放出来。
function setDeferredChanges(playerIndex, deferMs) {
  if (state.headless) return;   // 无头结算直接把数值写在结果里，不做延迟揭示
  const row = $(`#result-${playerIndex} .result-changes`);
  if (!row) return;
  row.classList.add('pending');
  setTimeout(() => row.classList.remove('pending'), reducedMotion ? 0 : Math.max(0, deferMs));
}

// 逐字推进台词，并在说话时压低环境音。
function scheduleTypedLine(playerIndex, feedback) {
  if (state.headless) return;   // 无头模式不逐字打字，台词一次性写在结果里
  const node = $(`#result-${playerIndex} [data-typed]`);
  if (!node) return;
  const full = node.textContent;
  const viewer = state.players.find(candidate => candidate.control === 'human' && candidate.index === playerIndex);
  if (reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  node.textContent = '';
  const frames = speechFrames(full);
  if (audio.speak && viewer) audio.speak(full, playerIndex);
  frames.forEach(frame => setTimeout(() => { node.textContent = frame.text; }, frame.at));
  setTimeout(() => { node.textContent = full; }, (frames.at(-1)?.at || 0) + 60);
}

/* ---------------------------------------------------------------------------
 * 展开层渲染
 * ---------------------------------------------------------------------------
 * 结构固定为三段：常驻头部（身份 + 标题 + 页码 + 收起）、占满剩余高度的
 * 内容区、常驻底部（选项 / 确认 / 翻页）。关闭与确认永远在固定位置，
 * 不需要滚到底部才找得到。内容过长时用分页，不依赖滚轮。
 */
function renderLayer(player) {
  const host = $(`#layer-${player.index}`);
  if (!host) return;
  const layer = layerOf(player.index);
  host.classList.toggle('hidden', !layer);
  if (!layer) { host.innerHTML = ''; return; }

  const row = keyRowOf(player.index);
  const head = layerHead(player, layer, row);
  const body = layer.kind === 'bag' ? renderBagLayer(player, layer, row) : renderTalkLayer(player, layer, row);
  const foot = layerFoot(player, layer, row);
  host.innerHTML = `<div class="layer-card" data-tone="${player.index ? 'two' : 'one'}">
    ${head}<div class="layer-body">${body}</div>${foot}
  </div>`;
}

function layerHead(player, layer, row) {
  const hero = HEROES[player.hero];
  const titles = {
    bag: layer.view === 'detail' ? '行囊 · 这一件' : '行囊',
    talk: layer.view === 'history' ? '对话记录' : '正在交谈'
  };
  const pageCount = layerPageCount(player.index, layer);
  const page = pageCount > 1
    ? `<span class="layer-page">第 <b>${layer.page + 1}</b> / ${pageCount} 页
        <kbd>${keyLabel(row.prevPage)}</kbd><kbd>${keyLabel(row.nextPage)}</kbd></span>`
    : '';
  // 头部常驻的「收起」永远只做一件事：折叠这一层。子页返回由层内底部单独提供，
  // 这样 G/H 在任何深度都保持「收起」语义，不会被悄悄降级成「返回上一页」。
  return `<header class="layer-head">
    <span class="layer-side" aria-hidden="true"></span>
    <span class="layer-avatar hero-${player.hero}">${hero?.glyph || '◈'}</span>
    <div class="layer-id"><small>玩家${player.index ? '二' : '一'} · ${hero?.name || ''}</small><b>${titles[layer.kind] || ''}</b></div>
    ${page}
    <button class="layer-close" data-layer-close="${player.index}">收起 <kbd>${keyLabel(row.back)}</kbd></button>
  </header>`;
}

function layerFoot(player, layer, row) {
  if (layer.kind === 'talk') {
    const dialog = player.turn.npc;
    const atChoices = dialog && !dialog.typing && dialog.lineIndex >= dialog.lines.length - 1;
    const main = atChoices
      ? `<span class="layer-tip">用 <kbd>${row.choices.map(keyLabel).join('</kbd><kbd>')}</kbd> 挑一段说</span>`
      : `<button class="layer-confirm" data-layer-advance="${player.index}">${dialog?.typing ? '把这句话显完' : '听下一句'} <kbd>${keyLabel(row.confirm)}</kbd></button>`;
    return `<footer class="layer-foot">${main}
      <button class="layer-ghost" data-layer-history="${player.index}">${layer.view === 'history' ? '回到对话' : '看对话记录'} <kbd>${keyLabel(row.history)}</kbd></button>
      <button class="layer-ghost" data-dialogue-leave="${player.index}">放弃对话，返回选项 <kbd>${keyLabel(row.back)}</kbd></button>
    </footer>`;
  }
  // 行囊
  if (layer.view === 'detail') {
    const item = itemByUid(player, layer.itemUid);
    const def = item ? ITEMS[item.id] : null;
    const infoOnly = !def || ['passive', 'equipment', 'relic'].includes(def.category) || ['reactive', 'shortenJail'].includes(def.effect?.kind);
    const needTarget = Boolean(def?.effect?.requiresTarget);
    const canUse = !layer.readOnly && !infoOnly && item && itemUsable(player, item).ok && (!needTarget || layer.targetId);
    return `<footer class="layer-foot">
      ${infoOnly
        ? `<span class="layer-tip">${def?.effect?.kind === 'shortenJail' ? '被送入地牢时会自动生效' : def?.category === 'relic' ? '关键遗物主要用于交易和抽奖' : ['passive', 'equipment'].includes(def?.category) ? '装备持续生效，不需要点使用' : '反应道具会在有人扑上来时自己挡一下'}</span>`
        : layer.readOnly ? '<span class="layer-tip">眼下不能动手，先看看就好</span>'
          : `<button class="layer-confirm" data-layer-use="${player.index}" ${canUse ? '' : 'disabled'}>用掉它 <kbd>${keyLabel(row.confirm)}</kbd></button>`}
      ${def?.system && !layer.readOnly ? `<button class="layer-ghost" data-layer-discard="${player.index}">丢弃装备</button>` : ''}
      <button class="layer-ghost" data-layer-back="${player.index}">返回这一页</button>
    </footer>`;
  }
  return `<footer class="layer-foot">
    <span class="layer-tip">前八件可按键选择，其余可点击</span>
    ${layerPageCount(player.index, layer) > 1
      ? `<span class="layer-page">翻页 <kbd>${keyLabel(row.prevPage)}</kbd><kbd>${keyLabel(row.nextPage)}</kbd></span>` : ''}
    <button class="layer-ghost" data-layer-close="${player.index}">收起 <kbd>${keyLabel(row.back)}</kbd></button>
  </footer>`;
}

// 行囊展开层：固定三个分类页；详情为同层子页。
function renderBagLayer(player, layer, row) {
  if (layer.view === 'detail') return renderBagDetail(player, layer, row);
  const items = bagPageItems(player.index, layer);
  const categoryNames = ['体系装备', '主动与被动道具', '金钱与关键道具'];
  const activeItems = player.inventory.filter(item => itemCategoryOf(item) === 'active');
  const keyResources = `<div class="key-resource-row"><span>⚿ 钥匙 <b>${player.stats.keys || 0}</b></span><span>✧ 线索 <b>${player.stats.clues || 0}</b></span></div>`;
  if (layer.page === 2 && !items.length) return `${keyResources}<div class="layer-empty">暂时没有关键道具。</div>`;
  const cells = items.map((item, index) => {
    const def = ITEMS[item.id];
    const remain = itemDurability(item);
    const cap = def.unbreakable ? 0 : def.durability || 2;
    const availability = itemAvailability(player, item);
    const matchBonus = itemMatchSummary(player, item);
    const hotIndex = activeItems.findIndex(candidate => candidate.uid === item.uid);
    const pips = Array.from({ length: cap }, (_, i) => `<i class="${i < remain ? 'on' : 'off'}"></i>`).join('');
    const quality = def.category === 'equipment' ? gearQuality(item) : '';
    const shortEffect = quality ? affixText(itemAffixes(item)[0]) : '';
    return `<button class="layer-cell ${availability.ok ? '' : 'unavailable'} ${def.rare ? 'rare' : ''} ${quality ? `quality-${quality}` : ''}"
        style="--system-color:${def.system ? GEAR_SYSTEMS[def.system].color : 'transparent'};--quality-color:${QUALITY_COLORS[quality] || 'transparent'}"
        data-layer-item="${item.uid}" data-player="${player.index}">
      ${index < 8 ? `<span class="layer-cell-key">${index < 4 ? keyTextForChoice(player.index, index) : keyLabel(row.items[index - 4])}</span>` : ''}
      ${hotIndex >= 0 && hotIndex < 4 ? `<span class="layer-item-hotkey">快捷 ${keyLabel(row.items[hotIndex])}</span>` : ''}
      <span class="item-icon" style="--item-a:${def.colors[0]};--item-b:${def.colors[1]}">${def.glyph}<span class="item-pips">${pips}</span></span>
      <span class="item-name">${def.name}</span>
      <span class="item-badge">${ITEM_CATEGORY[itemCategoryOf(item)].short}${layer.page === 2 ? ` · ${player.inventory.filter(candidate => candidate.id === item.id).length}件` : ''}</span>
      ${shortEffect ? `<span class="item-summary affix-summary" style="--affix-color:${AFFIX_COLORS[itemAffixes(item)[0].tier - 1]}"><i></i>${shortEffect}</span>` : ''}
      ${!quality && matchBonus ? `<span class="item-match">${matchBonus}</span>` : ''}
      ${availability.ok ? '' : `<span class="item-blocked">${availability.reason}</span>`}
    </button>`;
  }).join('');
  const counts = bagCounts(player);
  /* 待定战利品：满背包时新装备先放在这里，让玩家比较后再决定。 */
  const pending = (player.pendingLoot || []);
  const pendingBlock = pending.length ? `<div class="pending-loot">
    <b>待定战利品 ${pending.length}/3</b>
    ${pending.map(item => {
      const def = ITEMS[item.id];
      const worst = weakestGear(player, itemCapacityGroup(item.id));
      const delta = worst ? Math.round((gearScore(item) - gearScore(worst)) * 10) / 10 : 0;
      return `<div class="pending-row">
        <span class="pending-name">${def.name}<i class="pending-quality quality-${gearQuality(item)}">${QUALITY_LABEL[gearQuality(item)]}·成长 ${gearGrowthOf(item)}</i></span>
        ${worst ? `<span class="pending-compare">对比最弱的 ${ITEMS[worst.id].name}：${delta >= 0 ? '强' : '弱'} ${Math.abs(delta)}</span>` : ''}
        <button data-pending-take="${item.uid}" data-player="${player.index}">替换最弱</button>
        <button data-pending-scrap="${item.uid}" data-player="${player.index}">拆成材料</button>
      </div>`;
    }).join('')}</div>` : '';
  const capacityNote = counts.system >= BAG_CAPACITY || counts.other >= OTHER_ITEM_CAPACITY
    ? `<span class="layer-note warn">${counts.system >= BAG_CAPACITY ? '体系装备已满' : ''}${counts.system >= BAG_CAPACITY && counts.other >= OTHER_ITEM_CAPACITY ? '；' : ''}${counts.other >= OTHER_ITEM_CAPACITY ? '其他道具已满' : ''}。关键道具不限量。</span>`
    : '';
  return `<div class="bag-page-heading">${categoryNames[layer.page]}</div>${layer.page === 2 ? keyResources : ''}${pendingBlock}<div class="layer-grid">${cells || '<span class="layer-empty">这一类暂时没有道具。</span>'}</div>
    <span class="layer-note">体系装备 ${counts.system}/${BAG_CAPACITY} · 其他道具 ${counts.other}/${OTHER_ITEM_CAPACITY} · 关键道具 ${counts.relic} · 强化材料 ${Number(player.materials) || 0}（${MATERIAL_UPGRADE_COST} 份可把一件装备推高一档）。</span>
    ${capacityNote}`;
}

function renderBagDetail(player, layer, row) {
  const item = itemByUid(player, layer.itemUid);
  if (!item) return `<div class="layer-empty">这件东西已经不在了。</div>`;
  const def = ITEMS[item.id];
  const remain = itemDurability(item);
  const cap = def.unbreakable ? 0 : def.durability || 2;
  const pips = Array.from({ length: cap }, (_, i) => `<i class="${i < remain ? 'on' : 'off'}"></i>`).join('');
  const usable = itemUsable(player, item);
  const infoOnly = ['passive', 'equipment', 'relic'].includes(def.category) || ['reactive', 'shortenJail'].includes(def.effect?.kind);

  // 目标选择放在同层子页里，显示目标名称与必要状态。
  let targetBlock = '';
  if (def.effect?.requiresTarget && !infoOnly) {
    const targets = itemTargetsFor(player, def);
    targetBlock = targets.length
      ? `<div class="layer-targets">${targets.map((target, index) => `<button class="layer-target ${layer.targetId === target.id ? 'active' : ''}"
            data-layer-target="${target.id}" data-player="${player.index}"><kbd>${keyTextForChoice(player.index, index)}</kbd>${target.label} · ${HEROES[target.hero].name}<small>${ROOM_BY_ID[target.room].name}</small></button>`).join('')}</div>`
      : '<div class="layer-note warn">此刻没有人能成为它的对象。</div>';
  }
  const staleNote = layer.targetStale
    ? '<div class="layer-note warn">刚才选中的对象已经不适用了（离开了这一间，或者状态变了）。请重新挑一个。</div>'
    : '';

  const quality = def.category === 'equipment' ? gearQuality(item) : '';
  const canUpgrade = quality && gearGrowthOf(item) < 5 && (Number(player.materials) || 0) >= MATERIAL_UPGRADE_COST;
  const upgradeNote = quality
    ? `<div class="gear-upgrade">
        <span>成长档 ${gearGrowthOf(item)}/5 · 强化材料 ${Number(player.materials) || 0}</span>
        <button class="layer-ghost" data-layer-upgrade="${item.uid}" data-player="${player.index}" ${canUpgrade ? '' : 'disabled'}>
          ${gearGrowthOf(item) >= 5 ? '已经是最高档' : `用 ${MATERIAL_UPGRADE_COST} 份材料强化`}</button>
      </div>` : '';
  const affixDetail = quality ? `<div class="gear-affix-detail"><b>品质：${{blue:'精良',purple:'史诗',gold:'传奇'}[quality]}</b>
    ${itemAffixes(item).map(affix => `<div class="gear-affix tier-${affix.tier}" style="--affix-color:${AFFIX_COLORS[affix.tier - 1]}"><i></i>${affixText(affix)}</div>`).join('')}
    ${upgradeNote}</div>` : '';
  return `<div class="layer-detail">
    <header class="layer-detail-head">
      <span class="item-icon ${def.rare ? 'rare' : ''}" style="--item-a:${def.colors[0]};--item-b:${def.colors[1]}">${def.glyph}</span>
      <div><small>${ITEM_CATEGORY[itemCategoryOf(item)].label}</small><b>${def.name}</b></div>
      <span class="layer-dur">${def.unbreakable ? '不会损坏' : `耐久 <span class="item-pips">${pips}</span>`}</span>
    </header>
    ${affixDetail}<p class="layer-desc">${def.description}</p>
    <dl class="layer-rows">
      <dt>会发生什么</dt><dd>${itemEffectText(def)}</dd>
      <dt>用在哪</dt><dd>${def.effect?.requiresTarget ? '要挑一个人，用在他身上' : '不用挑人，用就是了'}</dd>
      <dt>代价</dt><dd>${def.unbreakable ? '持续生效，不会损坏' : (def.quick || (isHealingItem(def) && !player.quickUsedThisRound)) ? '本回合免费治疗，不占移动和行动' : '占掉这一步，并磨掉一点耐久'}</dd>
      ${infoOnly ? '' : `<dt>现在能不能用</dt><dd>${usable.ok ? '可以' : usable.reason}</dd>`}
    </dl>
    ${def.effect?.warn ? `<div class="layer-note warn">${def.effect.warn}</div>` : ''}
    ${staleNote}${targetBlock}
  </div>`;
}

// 对话展开层：中部只聚焦当前一段，历史进独立子页。
function renderTalkLayer(player, layer, row) {
  const dialog = player.turn.npc;
  if (!dialog) return `<div class="layer-empty">这段对话已经结束了。</div>`;
  const npc = NPCS[dialog.npcId];
  const relation = relationOf(player, npc.id);
  const lines = dialog.lines || [];

  if (layer.view === 'history') {
    return `<div class="layer-history">
      <div class="layer-history-npc" style="--npc-accent:${npc.accent}"><span class="npc-glyph">${npc.glyph}</span><b>${npc.name}</b><small>关系：${relation.label}</small></div>
      ${lines.map((line, index) => `<p class="layer-history-line ${index === dialog.lineIndex ? 'current' : ''}">${emphasize(line)}</p>`).join('')}
    </div>`;
  }

  const current = lines[dialog.lineIndex] || '';
  const atEnd = !dialog.typing && dialog.lineIndex >= lines.length - 1;
  const shown = reducedMotion ? current : current;
  const choices = atEnd
    ? `<div class="layer-choices">${(dialog.choices || []).map((choice, index) => {
      const itemHit = choice.usesItem?.length ? getMatchingItemsByTags(player, choice.usesItem) : [];
      // 一条选择最多给两个徽章：先讲代价，再讲关系或道具，避免堆成五六种标记。
      const cost = choice.consumesAction === false
        ? '<span class="dl-cost free">不占这一步</span>'
        : '<span class="dl-cost">要花掉这一步</span>';
      const extra = choice.rel > 0 ? '<span class="dl-rel up">它更愿意搭理你</span>'
        : choice.rel < 0 ? '<span class="dl-rel down">它往后退了半步</span>'
          : itemHit.length ? `<span class="dl-item">${effectiveGearSystem(player, itemHit[0]) ? `${GEAR_SYSTEMS[effectiveGearSystem(player, itemHit[0])].name}装备` : '随身道具'}正对路</span>` : '';
      const reason = npcTopicLock(player, choice);
      const disabled = Boolean(reason);
      return `<button class="layer-choice ${disabled ? 'disabled' : ''}"
          data-layer-topic="${index}" data-player="${player.index}" ${disabled ? 'disabled' : ''}>
        <kbd>${keyTextForChoice(player.index, index)}</kbd>
        <span class="layer-choice-body"><b>${choice.text}</b><span>${choice.flavor}</span>
          <span class="dl-meta">${extra}${cost}</span></span>
        ${reason ? `<span class="layer-choice-reason">${reason}</span>` : ''}
      </button>`;
    }).join('')}</div>`
    : '';

  return `<div class="layer-talk" style="--npc-accent:${npc.accent}">
    <div class="layer-talk-npc">${npcPortrait(npc)}<div><b>${npc.name}</b><small>${ROOM_BY_ID[npc.room].name} · 关系：${relation.label}</small></div></div>
    <p class="layer-line current" ${dialog.typing ? 'data-typing' : ''}>${shown}</p>
    ${dialog.lineIndex < lines.length - 1 ? `<span class="layer-note">还有下文，按确认键听下去。</span>` : ''}
    ${choices}
  </div>`;
}

function renderGlobal() {
  if (audio.setRoundProgress) audio.setRoundProgress(state.round, state.maxRounds);
	$('#roundNo').textContent = state.round;
	// 钟楼碎影的时长是隐藏的：不能显示上限，也不能显示能反推上限的进度。用「?」代替。
	$('#roundMax').textContent = state.stageId === 'shard' ? '?' : state.maxRounds;
	$('#phaseText').textContent = phaseName();
	// 音乐在这里一概不动：换阶段、开局、结算各自由 musicEvent() 触发。
	// 以前在渲染函数里调 StageMusic.play()，结算页会被重新拉回探索曲。
	// 阶段标记：沿用原版回合块里的那行小字，不新增界面元素。
	// 初次探索保持原样（就写「回合」），其余阶段写「阶段名 · 回合」。
	const stageCaption = $('.round-block small');
	if (stageCaption) {
		stageCaption.textContent = state.stageId === 'explore'
			? '回合'
			: `${stageById(state.stageId).label} · 回合`;
	}
  const slot = slotOfPhase(state.phase);
  const summaryPhase = state.phase === ROUND_SUMMARY;
  // 全局区只汇总"1/2 已准备"，不再保留可绕过双人确认的「进入下一回合」按钮。
  $('#continueBtn').classList.add('hidden');
  renderRoundReady(summaryPhase);
  const messages = {
    setup: '两个人都只能看见自己此刻所在的那一间房。',
    travel_select: '两边分别挑路；谁也只能看见自己脚下的这一间。',
    travel_resolve: '来时的房间正在退远，新的一个正一层层显出来。',
    round_summary: '这一回合的三步都走完了。看完，就翻到下一页。',
    end: '天亮之前的结局已经落定了。'
  };
  const key = state.phase === TRAVEL_SELECT ? 'travel_select'
    : state.phase === TRAVEL_RESOLVE ? 'travel_resolve'
      : summaryPhase ? 'round_summary'
        : state.phase === 'end' ? 'end' : '';
  const fallback = slot && state.phase.endsWith('_select')
    ? '两边各自定下之后，这一步才会一起发生；走完这一步，才会摆出下一步。'
    : slot && state.phase.endsWith('_resolve')
      ? '门在另一侧合上了。'
      : slot && state.phase.endsWith('_result')
        ? '看完了，就接着往下走。'
        : '两个人都只能看见自己此刻所在的那一间房。';
  $('#globalMessage').textContent = messages[key] || fallback;
  const hint = $('#actionHint');
  if (hint) {
    hint.textContent = isSelectPhase()
      ? (state.phase === TRAVEL_SELECT ? '选择一条去路' : `选择第 ${slotOfPhase(state.phase, 'select')} 个行动`)
      : summaryPhase ? '两边都准备好之后，才会翻到下一回合'
        : state.phase === 'end' ? '对局已结束' : '城堡正在结算…';
  }
}

// 顶栏只汇总准备进度，不暴露内部阶段名。
function renderRoundReady(summaryPhase) {
  const host = $('#readyMeter');
  if (!host) return;
  if (!summaryPhase) { host.classList.add('hidden'); host.textContent = ''; return; }
  const { ready, total } = roundReadyCount();
  host.classList.remove('hidden');
  host.textContent = `${ready}/${total} 已准备`;
  host.classList.toggle('all-ready', total > 0 && ready >= total);
}

function renderAll() {
  if (state.headless) return;
  state.players.filter(player => player.control === 'human').forEach(player => {
    renderRoom(player);
    renderVitals(player);
    renderStats(player);
    renderInventory(player);
    renderDecision(player);
    renderLayer(player);
  });
  renderGlobal();
  window.NightCrownProgress?.onRender();
}

function inventoryItem(player, itemId) {
  return player.inventory.find(item => item.id === itemId);
}

function roomRequirement(player, roomId) {
  const stats = player.stats;
  const withItem = (itemIds, fallbackReason) => {
    const item = itemIds.map(id => inventoryItem(player, id)).find(Boolean);
    return item ? { ok: true, itemUid: item.uid } : { ok: false, reason: fallbackReason };
  };

  switch (roomId) {
    case 'library':
      return state.round >= 2 || stats.clues >= 1 ? { ok: true } : withItem(['lockpick'], '需要线索、撬锁针或等待时机');
    case 'basement':
      return stats.stamina >= 4 ? { ok: true } : withItem(['rustKey', 'lantern'], '体力不足，黑暗铁门无法通过');
    case 'attic':
      return stats.agility >= 5 || player.flags.includes('ladderMark') ? { ok: true } : withItem(['rope'], '梯子断裂，需要攀爬工具');
    case 'secret':
      return stats.clues >= 2 && player.flags.includes('bookshelf') ? { ok: true } : withItem(['chalk', 'starKey'], '需要线索、星纹或书架机关');
    case 'garden':
      return stats.keys >= 1 || player.flags.includes('gardenRoute') ? { ok: true } : withItem(['rustKey', 'rope'], '温室门被锁住，破窗也太高');
    case 'clock':
      return state.round >= 4 && stats.perception >= 4 ? { ok: true } : withItem(['resonance', 'moonCompass'], '钟声尚未指向正确时间');
    case 'chapel':
      return stats.sanity >= 3 ? { ok: true } : withItem(['mirrorCharm'], '低语让你无法靠近');
    default:
      return { ok: true };
  }
}

function optionalRouteTool(player, action) {
  const tags = ACTION_TAGS[action] || [];
  return player.inventory.find(item => ITEMS[item.id].useTags.some(tag => tags.includes(tag)));
}

function makeRoute(player, id, action, requirement = {}, options = {}) {
  const item = requirement.itemUid ? player.inventory.find(entry => entry.uid === requirement.itemUid) : optionalRouteTool(player, action);
  const room = ROOM_BY_ID[id];
  const flavor = action === 'stay' ? '不穿过任何一道门，先把这一间看仔细'
    : room?.special ? '一道只在本回合出现的裂隙'
      : ACTION_LABEL[action] || '向那边走';
  return {
    id: `route-${state.round}-${player.index}-${id}`,
    kind: 'move',
    text: `${room?.icon || '◌'} ${room?.name || id}`,
    flavor,
    /* 未知随机门：确认之前不显示目的地。名字只在转场里揭晓。 */
    conceal: Boolean(options.conceal),
    risk: id === 'reward' ? 3 : 1,
    tags: ACTION_TAGS[action] || [],
    dest: id,
    action,
    itemUid: item?.uid || null
  };
}

/* 被崩溃时钟抹掉的房间：任何移动、传送、NPC 迁移、强制落点都必须先过这一关。
   之前只有部分路径顺手过滤，缓存的随机门更会在房间被毁后继续把人送进去。 */
const destroyedRoomSet = () => new Set((state.destroyedRooms || []).map(String));
const roomIsAlive = (id, doomed = null) => {
  if (id === null || id === undefined) return false;
  if (doomed && doomed.includes(String(id))) return false;
  return !destroyedRoomSet().has(String(id));
};

/* 一个阶段里「普通可进入房间」的出口池。
   初次探索 / 重返探索是原有城堡那十二间房；新阶段是本阶段的普通房间。
   奖励房以前无条件把人送回原有城堡，于是钟楼碎影里会出现
   「碎影 → 旧厨房 → 碎影」这种跨阶段乱跳。 */
function stageExitPool(stageId, excludeId = null) {
  const alive = id => roomIsAlive(id) && id !== excludeId;
  if (stageId === 'explore' || stageId === 'return') return SAFE_DUNGEON_EXITS.filter(alive);
  return stageRoomIds(stageId).filter(id => !ROOM_BY_ID[id]?.special && alive(id));
}

/* 阶段切换后把所有人放回本阶段的合法房间。
   两件事一起挡掉：
     - 有人停在上个阶段（或奖励房这种不属于新阶段的空间）的房间里继续行动；
     - 因为「留在原地」而把本阶段空间继续当成上一段来用。 */
function normalizeRoomsForStage() {
  const pool = stageExitPool(state.stageId);
  if (!pool.length) return;
  for (const player of state.players) {
    const room = ROOM_BY_ID[player.room];
    const legal = (state.stageId === 'explore' || state.stageId === 'return')
      ? Boolean(room) && !room.stage
      : room?.stage === state.stageId;
    if (!legal) player.room = pick(pool);
  }
}

function buildRoutes(player) {
	player.routes = [];
	player.blocked = [];

	/* —— 城堡之巅：唯一随机大门 ——
	   每名玩家每次移动只看见一扇门，确认后才揭示落点，不能选择也不能刷新。
	   门从本阶段 3 个普通房间里抽，优先排除当前房间；焚罪地狱不进普通门池。
	   落点按「玩家 + 本回合」写进 state.stageGates：开背包、翻页、刷新界面都不会重抽。 */
	if (state.stageId === 'summit') {
		state.stageGates = state.stageGates || {};
		const gateKey = `${player.id}:${state.round}`;
		const cached = state.stageGates[gateKey];
		if (!cached || !roomIsAlive(cached)) delete state.stageGates[gateKey];
		if (!state.stageGates[gateKey]) {
			const pool = stageRoomIds('summit').filter(id => !ROOM_BY_ID[id].special && roomIsAlive(id));
			const options = pool.filter(id => id !== player.room);
			state.stageGates[gateKey] = options.length ? pick(options) : (pool[0] || null);
		}
		if (!state.stageGates[gateKey]) return;
		player.routes = [makeRoute(player, state.stageGates[gateKey], 'open', {}, { conceal: true })];
		player.routePlan = player.routes.map(route => route.dest);
		return;
	}

	/* —— 终局之战 / 钟楼碎影：留在原地，或进入一扇随机大门 ——
	   随机门从当前阶段的普通房间里抽，排除当前位置与最后避难所；
	   第一回合任何入口都进不去塔顶钟楼与血染王座（提示词第七节）。
	   落点同样按「玩家 + 阶段 + 回合」写进状态，刷新界面不会重抽。 */
	if (state.stageId === 'finale' || state.stageId === 'shard') {
		state.stageGates = state.stageGates || {};
		const jailKey = `${player.id}:${state.stageId}:${state.round}`;
		const cached = state.stageGates[jailKey];
		if (cached && !roomIsAlive(cached)) delete state.stageGates[jailKey];
		if (!state.stageGates[jailKey]) {
			let pool = stageRoomIds(state.stageId).filter(id => !ROOM_BY_ID[id].special && roomIsAlive(id));
			if (state.stageId === 'finale' && state.round === 1) {
				pool = pool.filter(id => id !== 'bellTower' && id !== 'bloodThrone');
			}
			/* 钟楼碎影：隐藏时长即将走完时，崩溃时钟才会在门池里显形。
			   这是它能被正常走到的入口，不依赖调试传送。
			   （崩溃时钟在 STAGE_ROOMS 里标着 special，普通门池本来一定会把它过滤掉。） */
			if (state.stageId === 'shard' && Number(state.round) >= Math.max(2, Number(state.maxRounds) - 1)) {
				if (Number(state.round) >= Number(state.maxRounds)) {
					/* 最后一圈：钟盘只剩中心可去，门一定通向崩溃时钟。
					   玩家仍然可以选择留在原地，所以这不是强制。 */
					pool = ['collapseClock', ...pool.filter(id => id !== 'collapseClock')];
				} else if (!pool.includes('collapseClock')) {
					pool = [...pool, 'collapseClock'];
				}
			}
			const options = pool.filter(id => id !== player.room);
			state.stageGates[jailKey] = Number(state.round) >= Number(state.maxRounds) && state.stageId === 'shard'
				? 'collapseClock'
				: (options.length ? pick(options) : (pool[0] || null));
		}
		if (!state.stageGates[jailKey]) return;
		/* 钟楼碎影：只有一扇随机门，没有「留在原地」。
		   碎影是不断错位的空间，站着不动本身就不成立；
		   而且奖励房异常一旦把人送进来，「留在原地」会让他一直待在奖励房里刷行动。
		   终局之战保留「留在原地」——那是它自己的通行规则，和碎影不是一回事。 */
		player.routes = state.stageId === 'shard'
			? [makeRoute(player, state.stageGates[jailKey], 'open', {}, { conceal: true })]
			: [
				makeRoute(player, player.room, 'stay'),
				makeRoute(player, state.stageGates[jailKey], 'open', {}, { conceal: true })
			];
		player.routePlan = player.routes.map(route => route.dest);
		return;
	}

	if (player.room === 'dungeon') {
    if (player.dungeonActionsLeft > 0) return;
    /* 注意用箭头包一层：直接 .filter(roomIsAlive) 会把下标当成 doomed 传进去。 */
    const exits = shuffle(SAFE_DUNGEON_EXITS.filter(id => roomIsAlive(id))).slice(0, rand(2, 4));
    if (!exits.length) exits.push('bedroom');
    player.routes = exits.map(id => makeRoute(player, id, 'escape'));
    player.routePlan = player.routes.map(route => route.dest);
    player.blocked = [{ id: 'secret', reason: '地牢出口不会通向特殊区域' }];
    return;
  }

  if (player.room === 'reward') {
    /* 出口跟着当前阶段走，不再无条件把人送回原有城堡。 */
    let exits = shuffle(stageExitPool(state.stageId, player.room)).slice(0, rand(2, 4));
    if (!exits.length) exits = shuffle(stageExitPool('explore')).slice(0, 2);
    if (!exits.length) exits = ['bedroom'];
    player.routes = exits.map((id, index) => makeRoute(player, id, ['open', 'sneak', 'run', 'down'][index] || 'open'));
    player.routePlan = player.routes.map(route => route.dest);
    return;
  }

  const eligible = [];
  const blocked = [];
  for (const [id, action] of shuffle(GRAPH[player.room] || [])) {
    if (!roomIsAlive(id)) {
      blocked.push({ id, action, reason: '那间房已经被从地图上抹掉了' });
      continue;
    }
    const requirement = roomRequirement(player, id);
    if (requirement.ok) eligible.push(makeRoute(player, id, action, requirement));
    else blocked.push({ id, action, reason: requirement.reason });
  }

  if (eligible.length < 2) {
    const emergency = shuffle(['corridor', 'hall', 'bedroom', 'storage'].filter(id => id !== player.room
      && roomIsAlive(id) && !eligible.some(route => route.dest === id)));
    while (eligible.length < 2 && emergency.length) {
      const id = emergency.shift();
      eligible.push(makeRoute(player, id, pick(['sneak', 'run', 'open'])));
    }
  }

  const count = Math.min(eligible.length, rand(2, 4));
  const selected = shuffle(eligible).slice(0, count);
  const selectedIds = new Set(selected.map(route => route.dest));
  for (const route of eligible) {
    if (!selectedIds.has(route.dest)) blocked.push({ id: route.dest, action: route.action, reason: pick(['黑暗暂时遮住了道路', '门后传来堵塞声', '这条路改变了方向', '某种东西正守在门后']) });
  }
  player.routes = selected;
  player.blocked = blocked;
  player.routePlan = selected.map(route => route.dest);
}

function attackStyle(player) {
  const scores = [
    ['force', player.stats.strength * .7 + player.stats.intimidation * .2 + player.stats.agility * .1],
    ['ambush', player.stats.agility * .45 + player.stats.stealth * .4 + player.stats.perception * .15],
    ['menace', player.stats.intimidation * .6 + player.stats.sanity * .25 + player.stats.strength * .15]
  ].sort((a, b) => b[1] - a[1]);
  return rng.next() < .72 ? scores[0][0] : pick(scores).at(0);
}

function makeAttackOption(player, target) {
  const room = ROOM_BY_ID[player.room];
  const style = attackStyle(player);
  const estimate = calculateAttackChance(player, target, { style }, null).finalChance;
  const shield = findDefenseItem(target);
  const autoBlock = shield && ITEMS[shield.id].autoProtect ? calculateGuardChance(target, player, shield, false) : 0;
  const effective = Math.round(estimate * (1 - autoBlock) * 1000) / 10;
  const variants = {
    force: [`冲过去夺取${target.label}的行囊`, `借${room.name}的狭窄地势正面逼近`],
    ambush: [`从阴影里扑向${target.label}的行囊`, `等${target.label}转身时突然夺取`],
    menace: [`堵住退路逼${target.label}交出物品`, `压低声音向${target.label}发出最后警告`]
  };
  return {
    id: `attack-${state.round}-${player.index}-${target.id}-${style}`,
    kind: 'attack', style, targetId: target.id, stat: style === 'force' ? 'strength' : style === 'ambush' ? 'stealth' : 'intimidation',
    risk: 3, tags: style === 'force' ? ['force', 'intimidate'] : style === 'ambush' ? ['stealth', 'dark'] : ['intimidate', 'guard'],
    text: pick(variants[style]), flavor: `预计实际夺取率约${effective.toFixed(1)}%；防护和现场变化会改变结果，失败者入地牢`
  };
}

function makeGuardOption(player) {
  const room = ROOM_BY_ID[player.room];
  return {
    id: `guard-${state.round}-${player.index}-${rng.next()}`,
    kind: 'guard', stat: 'perception', risk: 1, tags: ['guard', 'curse'],
    text: pick([`守住${room.name}最窄的退路`, '把防护物扣在胸前等待袭击', '背靠墙面观察对方的手']),
    flavor: '若遭到攻击，防护成功会把对方送入地牢'
  };
}

function contextualActions(player) {
  const pool = [];
  if (player.stats.health <= 2) pool.push(option('靠着墙压住伤口', '先活下来，再向房间索取答案', 'sanity', 1, 'use', ['heal', 'guard']));
  if (player.stats.sanity <= 2) pool.push(option('重复自己的名字保持清醒', '某个音节正在慢慢变陌生', 'sanity', 1, 'mystery', ['curse', 'mystery']));
  if (player.inventory.length) pool.push(option('拿出最合适的随身物试探房间', '旧东西也可能找到新的用途', 'luck', 2, 'use', ['mechanism', 'search']));
  // 末段节奏按所选赛程等比缩放：6 局从第 5 回合起，12 局从第 10 回合起。
  if (state.round >= FINAL_ROUND()) pool.push(option('抢在钟声前完成危险尝试', '城堡留给你的时间越来越少', 'agility', 3, 'run', ['escape', 'clock']));
  if (player.curses.length) pool.push(option('顺着诅咒的刺痛寻找源头', '疼痛正在替你指路', 'sanity', 3, 'mystery', ['curse', 'rune']));
  // 恢复手段必须比"濒死"更早出现，否则局势无法挽回。生命/体力偏低时就应当能看到。
  if (player.stats.health <= 3 || player.stats.stamina <= 2) {
    pool.push(option('停下脚步按住伤口', '先把血流止住，再考虑今晚的输赢', 'stamina', 1, 'use', ['heal', 'guard']));
  }
  if (player.stats.sanity <= 3) {
    pool.push(option('数着墙上的砖块稳住呼吸', '有些数字还认得你', 'perception', 1, 'mystery', ['heal', 'mystery']));
  }
  const negativeStates = player.statuses.filter(status => ['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧'].includes(status));
  if (negativeStates.length || player.curses.length) {
    pool.push(option('进入鸦羽疗愈龛接受净化', '清除阴影，也可能发现前人留下的装备', 'sanity', 1, 'cleanse', ['heal', 'curse']));
  }
  return pool;
}

function cloneAction(entry, id) {
  return { ...entry, tags: [...entry.tags], id };
}

// 主动道具选项：把「可以用哪件道具」变成可读、可点、需要确认的行动。
function makeItemOptions(player) {
  return player.inventory
    .filter(item => itemCategoryOf(item) === 'active')
    .filter(item => item.id !== 'smokeVial')
    .filter(item => itemUsable(player, item).ok)
    .map(item => {
      const def = ITEMS[item.id];
      return {
        id: `item-${item.uid}`,
        kind: 'item',
        itemId: item.id,
        itemUid: item.uid,
        stat: 'luck',
        risk: def.quick ? 1 : 2,
        tags: [...def.useTags],
        text: `${def.glyph} 使用${def.name}`,
        flavor: itemUseFlavor(def.id)
      };
    });
}

function makeNpcOption(player) {
  const npcId = availableNpc(player);
  if (!npcId) return [];
  const npc = NPCS[npcId];
  const relation = relationOf(player, npcId);
  return [{
    id: `npc-${npcId}-${state.round}-${player.turn.activeSlot}`,
    kind: 'npc', npcId, stat: 'perception', risk: 1, tags: ['mystery'],
    text: `${npc.glyph} 与${npc.name}对话`,
    flavor: `${relation.label} · ${npc.intro}`
  }];
}

// 上一条行动已经用掉的 id 不再出现；最近三回合重复过的行动也会被排除。
function recentIds(player) {
  return player.history.slice(-18);
}

function usedEntryIds(player, exceptSlot = 0) {
  return roundSlots().filter(slot => slot !== exceptSlot).map(slot => player.turn.slots[slot].entry?.id).filter(Boolean);
}

/* 选项条数模型：默认 3 条，最多 4 条，最少 2 条。
 *   · 4 条是低概率事件（硬上限 15%），只在"处境复杂"时解锁：同房多名对手 / 身上有能用上的道具 /
 *     身处特殊房间 / 状态很差需要恢复手段。
 *   · 2 条由"处境压迫"触发：重伤、在地牢、被仇恨盯着。
 *   · 感知与运气越高，越容易看见别人看不见的第 4 条；属性越低，条数越少且偏向保守。
 */
const OPTION_MIN = 2, OPTION_DEFAULT = 3, OPTION_MAX = 4, OPTION_FOUR_RATE_CAP = .15;

function optionSituation(player, targets, itemPool) {
  const weak = player.stats.health <= 2 || player.stats.stamina <= 2 || player.stats.sanity <= 2;
  const specialRoom = ['reward', 'secret', 'dungeon'].includes(player.room);
  const hunted = state.players.some(other => other.id !== player.id && other.room === player.room
    && (other.hatred?.[player.id] || 0) >= 2);
  return {
    weak, specialRoom, hunted,
    complexity: (targets.length >= 2 ? 1 : 0) + (itemPool.length ? 1 : 0) + (specialRoom ? 1 : 0) + (weak ? 1 : 0),
    pressure: (weak ? 1 : 0) + (player.room === 'dungeon' ? 1 : 0) + (hunted ? 1 : 0)
  };
}

function optionBudget(player, situation) {
  // 洞察 = 感知（主）+ 运气（次），归一化到 -1 … +1。
  const insight = clamp(((player.stats.perception * .7 + player.stats.luck * .3) - 5.5) / 4.5, -1, 1);
  const four = clamp(.02 + situation.complexity * .03 + insight * .045, 0, OPTION_FOUR_RATE_CAP);
  const two = clamp(.10 + situation.pressure * .17 - insight * .03, .04, .70);
  const roll = rng.next();
  if (roll < two) return OPTION_MIN;
  if (roll > 1 - four) return OPTION_MAX;
  return OPTION_DEFAULT;
}

/* 两个行动点各自独立成池：
 *   · 另一格已经选定的那条按 id 与文本双重排除 —— 同一回合绝不会出现同一条行动。
 *   · 与另一格同类型 / 同做法的行动降权，尽量不再出现（而非硬删，避免池子枯竭）。
 *   · 最近用过的行动同样降权，跨回合去重继续生效。
 */
function generateOptions(player, slot = 1) {
  /* 【msg8 §5】焚罪地狱：固定展示全部 6 个考验选项（含 1 个必然失败陷阱），
     禁用道具与通用 / 事件 / NPC 选项；玩家在两行动点里各选其一依次尝试（即「选 2」）。 */
  if (player.room === 'hellOfSin') {
    const hellPool = (ROOM_ACTIONS.hellOfSin || []).map((entry, index) => cloneAction(entry, `hell-${index}`));
    if ((player.hellFails || 0) >= 2) {
      hellPool.push(cloneAction(option(HELL_GUARANTEE_TEXT, HELL_GUARANTEE_FLAVOR, 'sanity', 1, 'mystery', ['memory', 'leave']), 'hell-guarantee'));
    }
    player.options = hellPool;
    player.turn.slots[slot].options = hellPool;
    return hellPool;
  }
  if (player.stats.stamina <= 0 && player.room !== 'dungeon') {
    const emergency = [
      { id: `exhausted-rest-${state.round}-${slot}`, kind: 'gearChoice', choice: 'rest', stat: 'sanity', risk: 1,
        tags: ['heal', 'guard'], text: '力竭：立刻休整', flavor: '恢复体力；若下回合仍未恢复，将被城堡吞没' },
      { id: `exhausted-desperate-${state.round}-${slot}`, kind: 'gearChoice', choice: 'desperate', stat: 'strength', risk: 2,
        tags: ['heal', 'force'], text: '以生命换回一口气', flavor: '失去一点生命，恢复三点体力' }
    ];
    player.options = emergency;
    player.turn.slots[slot].options = emergency;
    return emergency;
  }
  const targets = state.players.filter(other => other.id !== player.id && other.room === player.room
    && other.room !== 'dungeon' && other.room !== 'reward' && other.stats.health > 0 && !other.collapsed);
	const roomPool = (ROOM_ACTIONS[player.room] || []).map((entry, index) => cloneAction(entry, `${player.room}-${index}`));
	// 焚罪地狱：连续失败两次后追加保底选项（提示词第四节第 6 条）。
	if (player.room === 'hellOfSin' && (player.hellFails || 0) >= 2) {
		roomPool.push(cloneAction(
			option(HELL_GUARANTEE_TEXT, HELL_GUARANTEE_FLAVOR, 'sanity', 1, 'mystery', ['memory', 'leave']),
			'hell-guarantee'));
	}
  const generic = GENERIC_ACTIONS.map((entry, index) => cloneAction(entry, `generic-${index}`));
  const context = contextualActions(player).map((entry, index) => cloneAction(entry, `context-${state.round}-${index}`));
  const events = rng.next() < .48 ? EVENT_ACTIONS.map((entry, index) => cloneAction(entry, `event-${state.round}-${index}`)) : [];
  const npcPool = makeNpcOption(player);
  const itemPool = makeItemOptions(player);
  const situation = optionSituation(player, targets, itemPool);

  const otherSlotId = new Set(usedEntryIds(player, slot));
  const otherEntry = roundSlots().filter(other => other !== slot).map(other => player.turn.slots[other].entry).find(Boolean) || null;
  const otherText = otherEntry ? otherEntry.text : '';
  const recent = new Set(recentIds(player));
  const banned = entry => otherSlotId.has(entry.id) || (otherText && entry.text === otherText);
  // 与另一格越像，权重越低：同类型 > 同做法 > 同主属性。
  const affinityPenalty = entry => {
    if (!otherEntry) return 0;
    let penalty = 0;
    if (entry.kind === otherEntry.kind) penalty += 2.2;
    if (otherEntry.action && entry.action === otherEntry.action) penalty += 1.6;
    if (entry.stat === otherEntry.stat) penalty += .6;
    return penalty;
  };

  let pool = shuffle([...roomPool, ...generic, ...context, ...events])
    .filter(entry => !banned(entry))
    .map(entry => ({ entry, weight: rng.next() * 3 - (recent.has(entry.id) ? 1.8 : 0) - affinityPenalty(entry) }))
    .sort((a, b) => b.weight - a.weight)
    .map(row => row.entry);
  // 池子不足时允许复用最近用过的，但仍然排除另一格已经选定的那条。
  if (pool.length < 3) {
    pool = shuffle([...roomPool, ...generic, ...context]).filter(entry => !banned(entry));
  }

  // 每个行动点提供道具线索和确定的恢复道具；线索允许混合体系与遗物。
  const forced = [];
  const possibleLoot = chooseRoomLoot(player);
  const roomHints = ROOM_SYSTEM_BIAS[player.room] || ['astral', 'fate'];
  const hintNames = roomHints.map(system => GEAR_SYSTEMS[system].name).join(' / ');
  forced.push({ rank: 0, entry: {
    id: `loot-clue-${state.round}-${slot}-${possibleLoot}`, kind: 'gearChoice', choice: 'loot', itemId: possibleLoot, hintSystems: roomHints,
    stat: 'perception', risk: 2, tags: ['search', 'mystery'],
    text: `【道具线索·${hintNames}】搜寻暗格`,
    flavor: '可能获得对应体系装备、其他道具或关键筹码；高阶暗物会收取额外代价'
  } });
  const supplyId = pick(RECOVERY_IDS);
  forced.push({ rank: .5, entry: {
    id: `supply-${state.round}-${slot}-${supplyId}`, kind: 'gearChoice', choice: 'supply', itemId: supplyId,
    stat: 'sanity', risk: 1, tags: ['heal', 'taste'], text: '【必得恢复道具】打开补给箱',
    flavor: '一定获得一件恢复生命、体力或理智的道具；大小随机，不扣体力'
  } });
  forced.push({ rank: 1, entry: {
    id: `random-stat-${state.round}-${slot}`, kind: 'gearChoice', choice: 'stat', stat: 'luck', risk: 1,
    tags: ['mystery', 'search'], text: '【随机属性】锤炼自身', flavor: '随机一项基础属性 +1；结果在结算时揭晓'
  } });
  if (player.room === 'reward') forced.push({ rank: .1, entry: cloneAction(pick(ROOM_ACTIONS.reward), `reward-${state.round}-${slot}`) });
  if (player.room === 'dungeon' && !player.dungeonRelicSeen && state.round - player.lastDungeonSearchRound >= 3 && rng.next() < .22) forced.push({ rank: .1, entry: {
    id: `dungeon-search-${state.round}-${slot}`, kind: 'dungeonSearch', stat: 'perception', risk: 2,
    tags: ['search', 'curse'], text: '【地牢专属】探查旧锁链', flavor: '可能找到狱影锁环、关键筹码或逃生线索'
  } });
  if (Math.min(player.stats.health, player.stats.stamina, player.stats.sanity) <= 2) forced.push({ rank: 1.2, entry: {
    id: `loot-rest-${state.round}-${slot}`, kind: 'gearChoice', choice: 'rest', stat: 'sanity', risk: 1,
    tags: ['heal', 'guard'], text: '【生存恢复】停下休整', flavor: '恢复最低的一项生存资源2点，并清除一项负面状态'
  } });
  if (targets.length) {
    // 同房对手再多也只保留最值得下手的两名，避免强制项把选项撑破上限。
    [...targets]
      .sort((a, b) => (a.stats.health + a.stats.stamina) - (b.stats.health + b.stats.stamina))
      .slice(0, 2)
      .forEach(target => forced.push({ rank: .4, entry: makeAttackOption(player, target) }));
    forced.push({ rank: .35, entry: makeGuardOption(player) });
  }
  npcPool.filter(entry => !banned(entry)).slice(0, 1).forEach(entry => forced.push({ rank: .4, entry }));
  itemPool.filter(entry => !banned(entry)).slice(0, 1).forEach(entry => forced.push({ rank: 4, entry }));

  // 强制项同样不许重复另一格已经选过的那条（v6 §3：同一回合不能出现重复行动）。
  const usableForced = forced.filter(row => !banned(row.entry));
  const budget = Math.max(targets.length ? 3 : OPTION_MIN, optionBudget(player, situation));
  const options = usableForced.sort((a, b) => a.rank - b.rank).map(row => row.entry).slice(0, budget);
  for (const entry of pool) {
    if (options.length >= budget) break;
    if (options.some(existing => existing.text === entry.text)) continue;
    options.push(entry);
  }
  // 兜底同步收紧：最低 2 条，绝不为了凑数回到 5 条。
  let fillerGuard = 0;
  while (options.length < Math.min(OPTION_MIN, budget) && fillerGuard++ < 8) {
    const filler = cloneAction(pick(GENERIC_ACTIONS), `fallback-${state.round}-${slot}-${rng.next()}`);
    if (!options.some(existing => existing.text === filler.text)) options.push(filler);
  }

  player.options = options.slice(0, OPTION_MAX);
  player.turn.slots[slot].options = player.options;
  return player.options;
}

function routeScore(player, route) {
  const occupants = state.players.filter(other => other.id !== player.id && other.room === route.dest && other.room !== 'dungeon');
  let score = rng.next() * 3;
  if (occupants.length) {
    const healthy = player.stats.health + player.stats.stamina;
    const power = player.stats.strength + player.stats.intimidation + player.stats.stealth;
    const weakest = occupants.reduce((best, target) => target.stats.health < best.stats.health ? target : best, occupants[0]);
    score += healthy >= 11 && power >= 15 ? 3 + Math.max(0, 6 - weakest.stats.health) : -8;
  }
  const preferences = {
    strength: ['basement', 'storage', 'hall'], agility: ['attic', 'clock', 'garden'], perception: ['library', 'secret', 'storage'],
    sanity: ['chapel', 'secret', 'library'], luck: ['garden', 'kitchen', 'clock'], intimidation: ['hall', 'chapel', 'corridor'], stealth: ['attic', 'storage', 'basement']
  };
  const bestStat = ['strength', 'agility', 'perception', 'sanity', 'luck', 'intimidation', 'stealth'].sort((a, b) => player.stats[b] - player.stats[a])[0];
  if ((preferences[bestStat] || []).includes(route.dest)) score += 4;
  if (route.itemUid) score += 2;
  return score;
}

function actionScore(player, entry) {
  const target = entry.targetId ? state.players.find(other => other.id === entry.targetId) : null;
  const itemBonus = getMatchingItems(player, entry).length ? 3.5 : 0;
  const lowHealth = player.stats.health <= 2 || player.stats.stamina <= 2;
let score = (statOr(player.stats[entry.stat], statOr(player.stats.luck, 5))) * .65 - entry.risk * .8 + itemBonus + rng.next() * 3;
  if (entry.kind === 'attack') {
    if (!target || target.room !== player.room || target.collapsed) return -Infinity;
    const advantage = player.stats.strength + player.stats.agility + player.stats.stealth - target.stats.strength - target.stats.agility - target.stats.perception;
    const hatred = player.hatred[target.id] || 0;
    const crowd = player.room === 'ruinConvergence' ? 0 : Math.max(0, state.players.filter(candidate => !candidate.collapsed && candidate.room === player.room && candidate.room !== 'dungeon' && !candidate.skippedThisRound).length - 2);
    const expectedChance = calculateAttackChance(player, target, entry, chooseBestItem(player, entry), { spectatorCount: crowd }).chance;
    score += lowHealth ? -12 : 2 + expectedChance * 12 + advantage * .35 + (target.stats.health <= 2 ? 5 : 0) + hatred * .8 - crowd * 1.5;
  }
  if (entry.kind === 'guard') score += lowHealth ? 10 : 2 + (player.inventory.some(item => ITEMS[item.id].category === 'reactive') ? 5 : 0);
  if (entry.kind === 'gearChoice') {
    if (entry.choice === 'rest') score += Math.max(0, 8 - Math.min(player.stats.health, player.stats.stamina, player.stats.sanity)) * 2.6;
    else if (entry.choice === 'stat') score += 8 + (bagCounts(player).system >= BAG_CAPACITY && bagCounts(player).other >= OTHER_ITEM_CAPACITY ? 4 : 0);
    else if (entry.choice === 'gear' || entry.choice === 'loot' || entry.choice === 'supply') score += (bagCounts(player).system < BAG_CAPACITY || bagCounts(player).other < OTHER_ITEM_CAPACITY) ? 9 + (state.round >= 3 ? 3 : 0) : -20;
    else score += (bagCounts(player).system < BAG_CAPACITY || bagCounts(player).other < OTHER_ITEM_CAPACITY) && player.stats.health >= 5 ? 11 : -20;
  }
  if (entry.kind === 'reward') score += 11 + (getMatchingItems(player, entry).length ? 8 : 0);
  if (entry.kind === 'cleanse') score += (player.curses.length + player.statuses.filter(status => ['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧'].includes(status)).length) * 6;
  if (entry.kind === 'npc') {
    // 人机也会去对话，但会规避关系已经很差的对象。
    const relation = relationOf(player, entry.npcId);
    score += 6 + (relation.value >= 1 ? 3 : relation.value <= -2 ? -6 : 0);
  }
  if (entry.kind === 'item') {
    const item = itemByUid(player, entry.itemUid);
    if (!item || !itemUsable(player, item).ok) return -Infinity;   // 人机不会选择不可用道具
    const effect = ITEMS[item.id].effect || {};
    if (effect.kind === 'heal') score += lowHealth ? 16 : -4;
    else if (effect.kind === 'soothe') score += player.stats.sanity <= 2 ? 14 : -2;
    else if (effect.kind === 'teleport') score += 5;
    else if (effect.kind === 'returnHome') score += 2;
    else if (effect.kind === 'smoke') score += 3;
    else if (effect.kind === 'scout') score += 4;
    else if (effect.kind === 'ward') score += lowHealth ? 9 : 4;
    else if (effect.kind === 'shortenJail') score += player.room === 'dungeon' ? 14 : 0;
    else if (effect.kind === 'swap') score += 2;
    else if (effect.kind === 'inspectCurse') score += player.curses.length ? 6 : -6;
    else score += 1;
  }
  if (lowHealth && entry.risk >= 3) score -= 6;
  if (lowHealth && entry.tags?.includes('heal')) score += 12;
  /* 【msg8 §25】人机目标驱动：按 bot.goal 给匹配项加权，让 AI 不再纯随机。 */
  if (player.control === 'ai' && player.goal) {
    const g = player.goal;
    if (g === '搜集遗物' && entry.kind === 'gearChoice') score += 6;
    else if (g === '夺取资源' && entry.kind === 'attack') score += 6;
    else if (g === '破解密室' && (entry.kind === 'mystery' || entry.tags?.includes('mystery'))) score += 5;
    else if (g === '追逐高收益' && entry.kind === 'reward') score += 9;
    else if (g === '保存实力' && ['heal', 'rest', 'cleanse', 'rewardHeal'].includes(entry.kind)) score += 8;
    // 生命任一项 ≤2 时主动用治疗 / 净化 / 反应，不再硬刚。
    if (Math.min(player.stats.health, player.stats.stamina, player.stats.sanity) <= 2
      && ['heal', 'rest', 'cleanse', 'rewardHeal', 'item'].includes(entry.kind)) score += 11;
  }
  return score;
}

/* ---------------------------------------------------------------------------
 * 选择阶段：锁定 → 就绪 → 推进
 * ---------------------------------------------------------------------------
 * 就绪判定的唯一来源是 isPlayerReady()。被囚禁、本回合已经无法行动、或者
 * 根本没有合法选项的玩家一律视为就绪 —— 这是逻辑上的“无事可做”，
 * 不是用超时兜底掩盖死锁。
 */
// 每个行动点都有自己的选项列表，就绪判定必须读"当前这一格"的，而不是全局 player.options。
function legalEntries(player) {
  if (state.phase === TRAVEL_SELECT) return player.routes || [];
  const slot = slotOfPhase(state.phase, 'select');
  if (!slot) return [];
  const own = player.turn.slots[slot]?.options;
  return own && own.length ? own : (player.options || []);
}

function playerCannotAct(player) {
  if (!player || player.collapsed) return true;
  if (player.skippedThisRound || player.jailedThisRound) return true;
  if (player.room === 'dungeon') {
    return player.dungeonActionsLeft > 0;
  }
  return false;
}

function hasLegalAction(player) {
  if (playerCannotAct(player)) return false;
  return legalEntries(player).length > 0;
}

function isPlayerReady(player) {
  const phase = state.phase;
  if (phase === TRAVEL_SELECT) {
    if (playerCannotAct(player)) return true;
    if (!(player.routes || []).length) return true;
    return Boolean(player.turn.travel.confirmed);
  }
  const selectSlot = slotOfPhase(phase, 'select');
  if (selectSlot) {
    if (playerCannotAct(player)) return true;
    if (!legalEntries(player).length) return true;
    return Boolean(player.turn.slots[selectSlot].confirmed);
  }
  const resultSlot = slotOfPhase(phase, 'result');
  if (resultSlot) {
    if (playerCannotAct(player)) return true;
    const slotState = player.turn.slots[resultSlot];
    return !slotState || slotState.acknowledged !== false;
  }
  return true;
}

function buildIntent(player, entry) {
  const matched = chooseBestItem(player, entry);
  return {
    entry,
    itemUid: entry.kind === 'item' ? entry.itemUid : (matched?.uid || null),
    targetId: entry.targetId || null,
    confirmed: true, resolved: false, result: null, cancelled: false, cancelReason: ''
  };
}

function scheduleAIChoice() {
  const phase = state.phase;
  if (!isSelectPhase(phase)) return;
  const bots = state.players.filter(player => player.control === 'ai'
    && !playerCannotAct(player) && !isPlayerReady(player));
  if (!bots.length) return;
  const token = state.token;
  bots.forEach((ai, order) => {
    const pause = state.headless ? 0 : 280 + order * 40;
    setTimeout(() => {
      if (token !== state.token || state.phase !== phase) return;
      if (ai.collapsed || isPlayerReady(ai) || playerCannotAct(ai)) return;
      const entries = legalEntries(ai);
      if (!entries.length) { maybeAdvance(); return; }
      const scoring = phase === TRAVEL_SELECT ? routeScore : actionScore;
      const ranked = entries
        .map((entry, index) => ({ index, score: scoring(ai, entry) + (rng.next() - .5) * 1.4 }))
        .filter(candidate => Number.isFinite(candidate.score))
        .sort((a, b) => b.score - a.score);
      const pickIndex = ranked.length ? ranked[0].index : 0;
      commitChoice(ai.index, pickIndex, 'ai');
    }, pause);
  });
}

function chooseBestItem(player, entry) {
  return getMatchingItems(player, entry).sort((a, b) => ITEMS[b.id].bonus - ITEMS[a.id].bonus)[0] || null;
}

const INPUT_DEBOUNCE_MS = 200;

function commitChoice(playerIndex, choiceIndex, source = 'human') {
  if (state.resolving) return false;
  if (!isSelectPhase()) return false;
  const player = state.players[playerIndex];
  if (!player || player.collapsed) return false;
  if (source === 'human') {
    if (player.control !== 'human') return false;
    const now = Date.now();
    if (!state.headless && now - (player.lastCommitAt || 0) < INPUT_DEBOUNCE_MS) return false;
    player.lastCommitAt = now;
  }
  if (playerCannotAct(player)) return false;
  if (isPlayerReady(player)) return false;
  let entry = legalEntries(player)[choiceIndex];
  if (!entry) return false;
  if (source === 'ai' && entry.kind === 'npc') {
    const topic = autoPickNpcTopic(player, entry.npcId);
    if (topic) entry = { ...entry, id: `${entry.id}-${topic.id}`, topicId: topic.id };
  }
  if (entry.kind === 'item' && !itemUsable(player, itemByUid(player, entry.itemUid)).ok) return false;
  if (entry.kind === 'attack') {
    const target = state.players.find(candidate => candidate.id === entry.targetId);
    if (!target || target.room !== player.room || target.collapsed) return false;
  }

  const travel = state.phase === TRAVEL_SELECT;
  const slot = travel ? 0 : slotOfPhase(state.phase, 'select');
  const slotState = travel ? player.turn.travel : player.turn.slots[slot];
  if (!slotState || slotState.confirmed) return false;
  const intent = buildIntent(player, entry);
  slotState.entry = intent.entry;
  slotState.itemUid = intent.itemUid;
  slotState.targetId = intent.targetId;
  slotState.confirmed = true;
  if (!travel) {
    player.history.push(entry.id);
    player.history = player.history.slice(-40);
  }
  // 第一格一锁定就重算第二格的候选池，不等结算：第二格从一开始就不含刚用过的那条。
  // legalEntries() 按当前阶段读取对应格子的列表，所以这里不会影响第一格的可选项。
  if (!travel && slot === 1) generateOptions(player, 2);
  if (source === 'human' && audio.action) audio.action('lock', playerIndex);
  renderAll();
  scheduleAIChoice();
  maybeAdvance();
  return true;
}

// 结果确认：人类必须点“继续”，AI 与无法行动者自动通过。
function acknowledgeResult(playerIndex) {
  const slot = slotOfPhase(state.phase, 'result');
  if (!slot) return false;
  const player = state.players[playerIndex];
  if (!player) return false;
  if (playerCannotAct(player)) return false;
  const slotState = player.turn.slots[slot];
  if (!slotState || slotState.acknowledged !== false) return false;
  slotState.acknowledged = true;
  if (audio.action) audio.action('lock', playerIndex);
  if (!state.headless) {
    renderResult(player, slot);
    renderGlobal();
    window.NightCrownProgress?.onRender();
  }
  maybeAdvance();
  return true;
}

function markResultAcks(slot) {
  for (const player of state.players) {
    const slotState = player.turn.slots[slot];
    if (!slotState || !slotState.result) { slotState.acknowledged = true; continue; }
    slotState.acknowledged = player.control === 'ai' || playerCannotAct(player) ? true : false;
  }
}

function anythingReady() {
  return state.players.length > 0 && state.players.every(isPlayerReady);
}

function maybeAdvance() {
  if (state.resolving) return;
  if (!['travel_select', 'round_summary', 'end', 'setup'].includes(state.phase)
    && !slotOfPhase(state.phase)) return;
  if (state.phase === ROUND_SUMMARY || state.phase === 'end' || state.phase === 'setup') return;
  if (!anythingReady()) return;
  state.resolving = true;
  const phase = state.phase;
  const token = state.token;
  renderAll();
  const wait = state.headless ? 0 : phase === TRAVEL_SELECT ? 380 : slotOfPhase(phase, 'select') ? 330 : 200;
  const run = async () => {
    if (token !== state.token) return;
    let failure = null;
    try {
      if (phase === TRAVEL_SELECT) await runTravelResolve();
      else {
        const selectSlot = slotOfPhase(phase, 'select');
        const resultSlot = slotOfPhase(phase, 'result');
        if (selectSlot) await runActionResolve(selectSlot);
        else if (resultSlot) enterAfterResult(resultSlot);
      }
    } catch (error) {
      failure = error;
      reportRuntimeError(error, phase);
    } finally {
      state.resolving = false;
      renderAll();
      if (!failure) {
        // 新阶段可能当场就全部就绪（例如所有人都被囚禁）：继续推进，但不递归。
        if (state.phase !== 'end' && state.phase !== ROUND_SUMMARY) {
          if (state.headless) maybeAdvance();
          else setTimeout(() => maybeAdvance(), 30);
        }
      }
    }
  };
  if (state.headless) run(); else setTimeout(run, wait);
}

/* 死锁诊断：只有当“没有任何玩家能产生合法输入，也没有全部就绪”时才判定为卡死。
   这是真死锁的定义式，不会误伤正在思考的玩家。检测到之后记录诊断并让局面
   重新可推进，而不是靠超时静默跳转 —— 自动化测试会对 state.stalls 断言为 0。 */
function detectStall() {
  if (state.resolving || state.headless) return;
  if (!isSelectPhase() && !slotOfPhase(state.phase, 'result')) return;
  if (anythingReady()) return;
  const canInput = state.players.some(player => player.control === 'human' && hasLegalAction(player) && !isPlayerReady(player));
  if (canInput) return;
  const diagnostic = {
    round: state.round,
    phase: state.phase,
    players: state.players.map(player => ({
      id: player.id, room: player.room, skipTurns: player.skipTurns,
      skippedThisRound: player.skippedThisRound, jailedThisRound: player.jailedThisRound,
      entries: legalEntries(player).length, ready: isPlayerReady(player),
      slot1: player.turn.slots[1].confirmed, slot2: player.turn.slots[2].confirmed
    }))
  };
  state.stalls.push(diagnostic);
  console.error('[夜冠] 检测到阶段死锁，已记录诊断：', diagnostic);
  for (const player of state.players) {
    if (isPlayerReady(player)) continue;
    if (playerCannotAct(player) || !hasLegalAction(player)) continue;
    player.turn.slots[slotOfPhase(state.phase, 'select') || 1].confirmed = true;
  }
  for (const player of state.players) {
    if (isPlayerReady(player)) continue;
    player.skippedThisRound = true;
    player.turn.travel.confirmed = true;
    for (const slot of roundSlots()) player.turn.slots[slot].confirmed = true;
  }
  const banner = $('#stallBanner');
  if (banner) {
    banner.classList.remove('hidden');
    banner.textContent = `⚠ 第 ${state.round} 回合「${phaseName()}」出现无法推进的状态，已记录诊断并继续。如果你看到这条提示，请把控制台里的诊断信息反馈给开发者。`;
  }
  maybeAdvance();
}

function reportRuntimeError(error, phase) {
  console.error('[夜冠] 结算异常：', error);
  state.stalls.push({ round: state.round, phase: phase || state.phase, error: String(error && error.stack || error) });
  const banner = $('#stallBanner');
  if (banner) {
    banner.classList.remove('hidden');
    banner.textContent = `⚠ 结算时发生异常（已恢复，界面不会锁死）：${String(error && error.message || error)}`;
  }
}

/* ---------------------------------------------------------------------------
 * 阶段入口
 * ---------------------------------------------------------------------------
 */
function resetTurnState(player) {
  player.turn = makeTurnState(state.round);
  player.options = [];
  player.routes = [];
  player.blocked = [];
  player.roundDeltas = {};
  player.quickUsedThisRound = false;
  player.talentUsedThisRound = false;
  /* 【msg8 §4】主动技能冷却每回合递减一次。 */
  player.activeCooldown = Math.max(0, (player.activeCooldown || 0) - 1);
  player.actionPoints = slotCountForStage(state.stageId);
}

function enterTravelSelect() {
  state.phase = TRAVEL_SELECT;
  state.resolving = false;
  state.token++;
  for (const player of state.players) {
    resetTurnState(player);
    player.result = null;
    player.roundResult = null;
    player.jailedThisRound = false;
    player.skippedThisRound = false;
    if (player.room === 'dungeon' && player.dungeonActionsLeft > 0) {
      player.turn.travel.confirmed = true;
      if (player.control === 'human') setNarrative(player.index, `锁链还会限制你 ${player.dungeonActionsLeft} 次行动，之后便能寻找出口。`, '▦');
    } else {
      buildRoutes(player);
      if (!player.routes.length) {
        // 出口不得为空：任何原因导致空出口都在这里兜住并留档。
        const fallback = shuffle(SAFE_DUNGEON_EXITS).slice(0, rand(2, 4));
        player.routes = fallback.map(id => makeRoute(player, id, player.room === 'dungeon' ? 'escape' : pick(['open', 'sneak', 'run'])));
        state.stalls.push({ round: state.round, phase: 'empty_routes', player: player.id, room: player.room, recovered: fallback.length });
      }
      if (player.control === 'human') {
        setNarrative(player.index, player.room === 'dungeon'
          ? '牢门终于裂开一条缝，只通往随机的普通房间。'
          : ROOM_BY_ID[player.room].desc, ROOM_BY_ID[player.room].icon);
      }
    }
  }
  renderAll();
  scheduleAIChoice();
  if (state.headless) maybeAdvance(); else setTimeout(() => { detectStall(); maybeAdvance(); }, 700);
}

function enterActionSelect(slot) {
  state.phase = PHASES.actionSelect(slot);
  state.resolving = false;
  state.token++;
  for (const player of state.players) {
    player.turn.activeSlot = slot;
    player.turn.itemPanel = null;
    player.turn.npc = null;
    player.turn.layer = null;
    const slotState = player.turn.slots[slot];
    slotState.entry = null; slotState.confirmed = false; slotState.resolved = false;
    slotState.cancelled = false; slotState.cancelReason = ''; slotState.acknowledged = true;
    if (playerCannotAct(player)) {
      slotState.confirmed = true;
      slotState.cancelled = true;
      slotState.cancelReason = player.room === 'dungeon' ? '被囚禁，本回合无法行动' : '已经无法继续行动';
      continue;
    }
    // 第二行动读取第一行动之后的最新状态：道具损坏、目标离场、状态变化都会反映在这里。
    // generateOptions 内部已经按另一格的选定条目排除，这里再按 id 兜一道。
    const before = new Set(roundSlots().filter(other => other !== slot).map(other => player.turn.slots[other].entry?.id).filter(Boolean));
    const fresh = generateOptions(player, slot).filter(entry => !before.has(entry.id));
    player.options = fresh.length ? fresh : generateOptions(player, slot);
    player.turn.slots[slot].options = player.options;
    if (!player.options.length) {
      slotState.confirmed = true;
      slotState.cancelled = true;
      slotState.cancelReason = '当前状态下没有合法行动';
    }
  }
  renderAll();
  scheduleAIChoice();
  if (state.headless) maybeAdvance(); else setTimeout(() => { detectStall(); maybeAdvance(); }, 650);
}

function enterAfterResult(slot) {
  if (slot < slotCountForStage(state.stageId)) return enterActionSelect(slot + 1);
  return enterRoundSummary();
}

function enterRoundSummary() {
  state.phase = ROUND_SUMMARY;
  state.resolving = false;
  state.token++;
  state.players.forEach(player => { player.result = player.turn.slots[3].result || player.turn.slots[2].result || player.turn.slots[1].result; });
  renderAll();
}

function waitForTransition(stage) {
  if (reducedMotion || state.headless) return delay(state.headless ? 0 : 140);
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stage.removeEventListener('animationend', onEnd);
      clearTimeout(fallback);
      resolve();
    };
    const onEnd = event => {
      if (event.animationName === 'roomIn') finish();
    };
    const fallback = setTimeout(finish, 2450);
    stage.addEventListener('animationend', onEnd);
  });
}

async function playTransition(player, route) {
  if (!route || route.kind === 'skip' || !route.dest) return;
  const originalDest = route.dest;
  // 后期奖励房加成同样按赛程缩放，不把 8 回合的节奏硬套到 6 / 12 回合上。
  const rewardChance = clamp(.06 + player.stats.luck * .01 + player.stats.clues * .015 + (state.round >= LATE_ROUND() ? .035 : 0)
    + (hasGear(player, 'gear_compass') ? .04 : 0) + (gearPieceSystems(player, 5).length ? .025 : 0), .06, .28);
  /* 奖励房是「这座城堡」的夹层，只属于两段探索：
     初次探索与重返探索。在城堡之巅 / 终局之战 / 钟楼碎影里，
     路线失控会把人从本阶段的空间里拽出去，也给了「留在奖励房刷行动」的机会。 */
  const rewardStage = state.stageId === 'explore' || state.stageId === 'return';
  const rewardEligible = rewardStage
    && originalDest !== 'reward' && player.room !== 'dungeon' && player.room !== 'reward'
    && !ROOM_BY_ID[player.room]?.stage
    && !ROOM_BY_ID[originalDest]?.stage
    && state.round >= 2 && state.round - player.lastRewardRound > 2;
  const rewardTriggered = rewardEligible && rng.next() < rewardChance;
  const destination = rewardTriggered ? 'reward' : originalDest;
  route.actualDest = destination;
  if (player.control === 'ai' || state.headless) {
    window.NightCrownWorld.relocate(player, destination, 'gate');
    if (rewardTriggered) player.lastRewardRound = state.round;
    return;
  }
  const action = route.action === 'escape' ? 'run' : route.action;
  const stage = $(`#stage-${player.index}`);
  const actor = $(`#actor-${player.index}`);
  const incoming = $(`#roomIncoming-${player.index}`);
  applyRoomBg(incoming, originalDest);
  stage.classList.add('transitioning');
  actor.classList.remove('emotion-sad','emotion-happy','emotion-sprite-active','emotion-tall-sheet','teleport-in','teleport-out');
  actor.classList.add(`act-${action}`);
  $(`#transitionCaption-${player.index} b`).textContent = `${ACTION_LABEL[route.action]} · ${ROOM_BY_ID[originalDest].name}`;
  setNarrative(player.index, `${HEROES[player.hero].name}${ACTION_LABEL[route.action]}，光影和环境声从门缝另一侧涌来。`, '➜');
  if (audio.transition) audio.transition(action, player.index);
  if (rewardTriggered) {
    await delay(reducedMotion ? 90 : 760);
    stage.classList.add('reward-anomaly');
    actor.classList.add('surprised');
    $(`#transitionCaption-${player.index} small`).textContent = '路线正在失控';
    $(`#transitionCaption-${player.index} b`).textContent = '强光裂隙撕开了原定去路';
    setNarrative(player.index, '心跳骤然加速，金属闪光与升调回声把原定目的地从门后抹去。', '✦');
    applyRoomBg(incoming, 'reward');
    if (audio.reward) audio.reward(player.index, true);
  }
  await waitForTransition(stage);
  window.NightCrownWorld.relocate(player, destination, 'gate');
  if (rewardTriggered) {
    player.lastRewardRound = state.round;
    stage.classList.add('reward-burst');
    setTimeout(() => stage.classList.remove('reward-burst'), reducedMotion ? 240 : 1700);
  }
  applyRoomBg($(`#roomCurrent-${player.index}`), destination);
  stage.dataset.room = destination;
  incoming.style.backgroundImage = '';
  stage.classList.remove('transitioning', 'reward-anomaly');
  actor.classList.remove(`act-${action}`, 'surprised', 'teleport-out');
  $(`#transitionCaption-${player.index} small`).textContent = '正在前往';
}

function appendTravelToolResult(player, intent) {
  if (!intent?.itemUid) return;
  const item = player.inventory.find(entry => entry.uid === intent.itemUid);
  if (!item) return;
  const def = ITEMS[item.id];
  player.statuses = uniqueAdd(player.statuses, '路线优势');
  const broken = useAndMaybeBreakItem(player, item, null, true);
  if (player.control === 'human') player.travelNotes.push(`${def.name}帮助你安全完成转场，并留下“路线优势”。${broken ? '它在途中损坏了。' : '它经受住了这次使用。'}`);
}

// 被封锁的路线：如果行囊里有能对应这扇门的工具，就给出“使用道具通过 / 放弃路线”。
function blockedRouteTool(player, route) {
  const tags = ACTION_TAGS[route.action] || [];
  return player.inventory.find(item => {
    const def = ITEMS[item.id];
    if (def.category !== 'active') return false;
    if (itemDurability(item) <= 0) return false;
    return def.useTags.some(tag => tags.includes(tag));
  }) || null;
}

function commitBlockedRoute(playerIndex, routeId) {
  const player = state.players[playerIndex];
  if (!player || state.phase !== TRAVEL_SELECT || state.resolving) return false;
  if (playerCannotAct(player) || player.turn.travel.confirmed) return false;
  const route = player.blocked.find(entry => entry.id === routeId);
  if (!route) return false;
  const tool = blockedRouteTool(player, route);
  if (!tool) return false;
  const built = makeRoute(player, route.id, route.action);
  built.itemUid = tool.uid;
  built.flavor = `使用${ITEMS[tool.id].name}强行通过（消耗 1 点耐久）`;
  player.turn.travel.entry = built;
  player.turn.travel.itemUid = tool.uid;
  player.turn.travel.confirmed = true;
  if (audio.action) audio.action('lock', playerIndex);
  renderAll();
  scheduleAIChoice();
  maybeAdvance();
  return true;
}

function discardBlockedRoute(playerIndex, routeId) {
  const player = state.players[playerIndex];
  if (!player) return;
  player.blocked = player.blocked.filter(entry => entry.id !== routeId);
  renderDecision(player);
}

async function runTravelResolve() {
  if (state.phase !== TRAVEL_SELECT) return;
  state.phase = TRAVEL_RESOLVE;
  state.token++;
  const intents = state.players.map(player => player.turn.travel);
  await Promise.all(state.players.map((player, index) => {
    const intent = intents[index];
    if (!intent || !intent.confirmed || !intent.entry) return Promise.resolve();
    intent.resolved = true;
    return playTransition(player, intent.entry);
  }));
  state.players.forEach((player, index) => appendTravelToolResult(player, intents[index]));
  if (audio.setRooms) audio.setRooms(state.players.filter(player => player.control === 'human').map(player => player.room));
  enterActionSelect(1);
}

function emptyResult(outcome = 'success', title = '房间记住了这个选择') {
  return {
    outcome, title, story: '', changes: [], consequences: [],
    // 统一反馈结构：渲染层、音效层、跳过逻辑都读这里，不再各自推断。
    feedback: {
      animationId: '', sfxProfile: '', dialogueMode: 'none', speaker: '',
      lines: [], emphasisSegments: [], duration: 0,
      skipBehavior: 'instant', affectedStats: [], maxDelta: 0,
      changesPending: false, deferMs: 0
    },
    pendingChanges: null
  };
}

// 把一次行动的反馈画像写进结果。所有字段都可在渲染/音效/跳过处直接读取。
function sealFeedback(result, patch = {}) {
  result.feedback = { ...result.feedback, ...patch };
  return result.feedback;
}

function feedbackForAction(kind) {
  const direct = ACTION_FEEDBACK[kind];
  if (direct && Array.isArray(direct.lines) && direct.lines.length) return direct;
  // 门动作（open/close/push/up/down/window/ladder/escape）与未知 kind 回落到移动。
  return ACTION_FEEDBACK.move;
}

const realFeedbackIntensity = outcome => OUTCOME_FEEDBACK[outcome] || OUTCOME_FEEDBACK.success;
const feedbackIntensity = realFeedbackIntensity;

// 逐字对话时长估算：中文每字 28–36ms，标点额外留白。
function estimateSpeechMs(text) {
  if (!text) return 0;
  const chars = [...String(text)];
  let total = 0;
  for (const ch of chars) {
    if (SPEECH.punctuation.includes(ch)) total += SPEECH.punctuationMs;
    else total += (SPEECH.charMs[0] + SPEECH.charMs[1]) / 2;
  }
  return Math.round(total);
}

// 逐字推进：返回 [可见片段, 累计毫秒]，供渲染层按序显示。
function speechFrames(text) {
  if (!text) return [];
  const frames = [];
  let elapsed = 0;
  let visible = '';
  for (const ch of [...String(text)]) {
    if (SPEECH.punctuation.includes(ch)) {
      elapsed += SPEECH.punctuationMs;
      visible += ch;
      continue;
    }
    elapsed += rand(SPEECH.charMs[0], SPEECH.charMs[1]);
    visible += ch;
    frames.push({ text: visible, at: elapsed });
  }
  return frames;
}

function addChange(result, key, value) {
  const existing = result.changes.find(change => change[0] === key);
  if (existing) existing[1] += value;
  else result.changes.push([key, value]);
}

function applyChanges(player, changes, result = null) {
  player.roundDeltas = player.roundDeltas || {};
  player.gainRemainder = player.gainRemainder || {};
  for (const [key, value] of changes) {
    const vital = VITAL_KEYS.includes(key);
    const core = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth'].includes(key);
    const max = vital ? MAX_VITAL : ['keys', 'clues'].includes(key) ? 99 : core ? CORE_STAT_SOFT_CAP : 100;
    const before = player.stats[key] || 0;
    let adjusted = value;
    if (value > 0 && (core || vital)) {
      /* 「获得」这条线只吃 gain_stat 固定额外值。
         百分比强化（gain_pct）改走常驻属性那条线（见 standingStat），
         同一件装备不会再被乘一遍，也不会出现「补到某个值」被再放大的问题。 */
      const flat = core ? affixTotal(player, 'gain_stat', key) : 0;
      const healPct = vital ? affixTotal(player, 'heal_pct') : 0;
      const raw = (value + flat) * (1 + healPct) + (player.gainRemainder[key] || 0);
      adjusted = Math.floor(raw + 1e-8);
      player.gainRemainder[key] = raw - adjusted;
    }
    player.stats[key] = clamp(before + adjusted, 0, max);
    const actual = player.stats[key] - before;
    if (actual) player.roundDeltas[key] = (player.roundDeltas[key] || 0) + actual;
    if (actual > 0) recordPeak(player, key);
    /* 恢复按「实际恢复量」触发，满血治疗不会刷层。 */
    if (vital && actual > 0 && player.buffs) gearMechanicEvent(player, 'heal_actual', { key, amount: actual });
    if (result) addChange(result, key, actual);
  }
}

/* 本局峰值：结算页要同时展示「常驻最终值」和「本局峰值」，
   临时加成不能靠结算前开一下就把总分刷上去，所以峰值只作为展示，不参与评分。 */
function recordPeak(player, key) {
  player.peakStats = player.peakStats || {};
  const current = Number(player.stats[key] || 0);
  if (!(key in player.peakStats) || current > player.peakStats[key]) player.peakStats[key] = current;
}

/* ---------------------------------------------------------------------------
 * 直接设值 / 补齐
 * ---------------------------------------------------------------------------
 * 与 applyChanges 的区别是「不经过收益放大」：
 *   - raiseStatTo：把属性抬到某个目标值，只补差额；
 *   - setStatFloor：给一个下限，不改变已经更高的值。
 * 镜像圣所、保底校准这类「补到某个数」的规则必须走这里，
 * 否则 gain_stat / gain_pct 会把差额再放大一次，结果超过描述里的数字。
 * ------------------------------------------------------------------------- */
function raiseStatTo(player, key, target, result = null) {
  const before = Number(player.stats[key] || 0);
  const wanted = Number(target);
  if (!Number.isFinite(wanted)) return 0;
  const max = VITAL_KEYS.includes(key) ? MAX_VITAL : ['keys', 'clues'].includes(key) ? 99
    : CORE_STAT_KEYS.includes(key) ? CORE_STAT_SOFT_CAP : 100;
  const after = clamp(Math.max(before, wanted), 0, max);
  if (after === before) return 0;
  player.stats[key] = after;
  player.roundDeltas = player.roundDeltas || {};
  player.roundDeltas[key] = (player.roundDeltas[key] || 0) + (after - before);
  recordPeak(player, key);
  if (result) addChange(result, key, after - before);
  return after - before;
}

function setStatFloor(player, key, floor, result = null) {
  return raiseStatTo(player, key, Number(floor || 0), result);
}

function resultSeverity(result, outcome) {
  if ((OUTCOME_META[outcome]?.severity || 0) >= (OUTCOME_META[result.outcome]?.severity || 0)) result.outcome = outcome;
}

function itemByUid(player, uid) {
  return player.inventory.find(item => item.uid === uid) || null;
}

function useAndMaybeBreakItem(player, item, result = null, routeUse = false) {
  if (!item || !player.inventory.some(entry => entry.uid === item.uid)) return false;
  const def = ITEMS[item.id];
  if (def.unbreakable) return false;
  const visibleViewer = state.players.find(viewer => viewer.control === 'human' && viewer.room === player.room);
  if (visibleViewer && audio.action) audio.action('use', visibleViewer.index);

  // 角色天赋「孢子调和」：莫斯消耗道具时有几率不扣耐久。
  const hero = HEROES[player.hero];
  const painterSave = hero?.talent?.id === 'colorKeeper' && !player.talentUsedThisRound;
  if (painterSave) player.talentUsedThisRound = true;
  const spared = painterSave || (hero?.talent?.id === 'sporeBlend' && rng.next() < .55);
  if (!spared) item.wear = (item.wear || 0) + 1;
  const remaining = itemDurability(item);
  const broken = remaining <= 0;

  if (broken) {
    const icon = $(`[data-item-uid="${item.uid}"]`);
    if (icon) icon.classList.add('breaking');
    player.inventory = player.inventory.filter(entry => entry.uid !== item.uid);
    if (visibleViewer && audio.itemBreak) audio.itemBreak(visibleViewer.index);
  } else {
    const icon = $(`[data-item-uid="${item.uid}"]`);
    if (icon) {
      icon.classList.add('wearing');
      setTimeout(() => icon.classList.remove('wearing'), 620);
    }
  }

  if (result && !routeUse) {
    const total = def.durability || 2;
    // 耐久用点子说话，不用分数：剩余几个点就画几个 ●。
    const dots = n => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, (def.durability || 2) - n));
    const note = spared
      ? `${hero.talent.name}吸收了这次消耗，${def.name}的耐久没有下降。`
      : broken
        ? `${def.name}的耐久耗尽（${dots(0)}），从行囊移除。`
        : `${def.name}留下了一道磨损，耐久还剩 ${dots(remaining)}。`;
    result.consequences.push(`${def.name}确实强化了这次行动；${note}`);
  }
  return broken;
}

const QUALITY_MATERIALS = { blue: 1, purple: 2, gold: 3 };
const MATERIAL_UPGRADE_COST = 3;

function bumpQuality(quality) {
  return quality === 'blue' ? 'purple' : 'gold';
}

/* 装备强度粗评：用于「新旧比较」与「哪一件最该换掉」。
   只看常驻维度（固定值 / 百分比 / 触发加成），不掺临时状态。 */
function gearScore(item) {
  const affixes = itemAffixes(item);
  const flat = affixes.filter(a => ['flat_stat', 'gain_stat', 'attack_stat'].includes(a.kind))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
  const percent = affixes.filter(a => a.kind.endsWith('_pct')).reduce((sum, a) => sum + Number(a.value || 0), 0);
  const unique = affixes.filter(a => a.kind === 'unique').length * 6;
  return Math.round((flat + percent * 20 + unique) * 10) / 10;
}

function weakestGear(player, group) {
  const pool = player.inventory.filter(item => itemCapacityGroup(item.id) === group);
  if (!pool.length) return null;
  return pool.reduce((worst, item) => (gearScore(item) < gearScore(worst) ? item : worst), pool[0]);
}

/* ---------------------------------------------------------------------------
 * 强化 / 待定战利品
 * ---------------------------------------------------------------------------
 * 重复装备拆出来的材料不是摆设：攒够 3 份可以把一件装备的成长档推高一档，
 * 词条按新的档位重掷。满背包时新装备进「待定区」，界面给新旧比较与替换，
 * 而不是只丢一句「装不下」。
 * ------------------------------------------------------------------------- */
function upgradeGear(player, item) {
  if (!player || !item || ITEMS[item.id]?.category !== 'equipment') return false;
  if (gearGrowthOf(item) >= 5) return false;
  if ((Number(player.materials) || 0) < MATERIAL_UPGRADE_COST) return false;
  player.materials = clamp(Number(player.materials) - MATERIAL_UPGRADE_COST, 0, 99);
  item.growth = clamp(gearGrowthOf(item) + 1, 1, 5);
  item.affixes = gearAffixesFor(item.id, gearQuality(item), item.growth);
  refreshCorruption(player);
  return true;
}

function takePendingLoot(player, uid) {
  const item = (player.pendingLoot || []).find(entry => entry.uid === uid);
  if (!item) return false;
  if (!canCarryItem(player, item.id)) {
    const worst = weakestGear(player, itemCapacityGroup(item.id));
    if (!worst) return false;
    player.inventory = player.inventory.filter(entry => entry.uid !== worst.uid);
    player.materials = clamp((Number(player.materials) || 0) + (QUALITY_MATERIALS[gearQuality(worst)] || 1), 0, 99);
  }
  player.inventory.push(item);
  player.pendingLoot = (player.pendingLoot || []).filter(entry => entry.uid !== uid);
  refreshCorruption(player);
  return true;
}

function scrapPendingLoot(player, uid) {
  const item = (player.pendingLoot || []).find(entry => entry.uid === uid);
  if (!item) return false;
  player.materials = clamp((Number(player.materials) || 0) + (QUALITY_MATERIALS[gearQuality(item)] || 1), 0, 99);
  player.pendingLoot = (player.pendingLoot || []).filter(entry => entry.uid !== uid);
  return true;
}

/* 掉一件东西进来。这里同时负责：
   - 重复装备 → 转成强化材料（不再无声消失）；
   - 满背包 → 记成待定战利品，界面给出新旧比较与替换，而不是只提示「装不下」；
   - 商誉满了 → 下一件装备直接提升一个成长档。 */
function giveItem(player, itemId, result = null, options = {}) {
  const def = ITEMS[itemId];
  if (!def) return null;
  const equipment = def.category === 'equipment';
  const group = itemCapacityGroup(itemId);

  if (equipment && !options.duplicate) {
    const existing = player.inventory.find(item => item.id === itemId);
    if (existing) {
      const gained = QUALITY_MATERIALS[gearQuality(existing)] || 1;
      player.materials = clamp((Number(player.materials) || 0) + gained, 0, 99);
      if (result) result.consequences.push(`重复的${def.name}被拆成 ${gained} 份强化材料（现有 ${player.materials} 份）。`);
      return null;
    }
  }

  const creditReady = equipment && (Number(player.counters?.credit) || 0) >= 3;
  const item = makeItem(itemId, creditReady ? { quality: 'gold', growth: gearGrowthTier() + 1 } : (options.item || {}));
  if (creditReady) {
    player.counters.credit = 0;
    if (result) result.consequences.push(`商誉兑现：${def.name}以金色品质与更高成长档落到你手里。`);
  }

  if (!canCarryItem(player, itemId)) {
    player.pendingLoot = Array.isArray(player.pendingLoot) ? player.pendingLoot : [];
    if (player.pendingLoot.length < 3) {
      player.pendingLoot.push(item);
      const worst = weakestGear(player, group);
      if (result) {
        result.consequences.push(`${fullBagReason(itemId)}：${def.name}先放在一边等你决定。`);
        if (worst) {
          const delta = Math.round((gearScore(item) - gearScore(worst)) * 10) / 10;
          result.consequences.push(`和行囊里最弱的一件（${ITEMS[worst.id].name}）相比，${delta >= 0 ? '强' : '弱'} ${Math.abs(delta)} 点；可以在行囊里替换或拆成材料。`);
        }
      }
      return item;
    }
    const gained = QUALITY_MATERIALS[gearQuality(item)] || 1;
    player.materials = clamp((Number(player.materials) || 0) + gained, 0, 99);
    if (result) {
      result.consequences.push(`${fullBagReason(itemId)}，待定区也满了：${def.name}被拆成 ${gained} 份强化材料。`);
    }
    return null;
  }

  player.inventory.push(item);
  if (equipment) {
    player.dryPulls = 0;
    player.lootStreak = (Number(player.lootStreak) || 0) + 1;
  } else if (def.category !== 'relic') {
    player.dryPulls = clamp((Number(player.dryPulls) || 0) + 1, 0, 9);
  }
  refreshCorruption(player);
  player.lootReceived ||= { equipment: 0, active: 0, passive: 0, reactive: 0, relic: 0 };
  player.lootReceived[def.category] = (player.lootReceived[def.category] || 0) + 1;
  if (result) {
    const qualityText = equipment ? `（${QUALITY_LABEL[gearQuality(item)]}·成长 ${gearGrowthOf(item)}）` : '';
    result.consequences.push(`获得道具“${def.name}”${qualityText}。`);
  }
  return item;
}

function chooseSystemLoot(player, premium = false) {
  const ids = Object.values(GEAR_IDS).flat();
  const universal = Object.keys(UNIVERSAL_GEAR);
  const favored = ROOM_SYSTEM_BIAS[player.room] || [];
  const round = state.round || 1;
  const pool = [...ids, ...universal].filter(id => {
    const def = ITEMS[id];
    if (round < 4 && def.rarity === 'epic') return false;
    return !player.inventory.some(item => item.id === id);
  });
  if (!pool.length) return pick([...ids, ...universal]);
  const rows = pool.map(id => {
    const def = ITEMS[id];
    const rarity = def.rarity === 'epic' ? (round >= 6 ? 1.1 : .5) : def.rarity === 'fine' ? 2 : 3;
    const focus = def.system && favored.includes(def.system) ? 3 : 1;
    const local = ROOM_LOOT[player.room]?.some(existing => ITEMS[existing]?.useTags.some(tag => def.useTags.includes(tag))) ? 1.4 : 1;
    return { id, weight: rarity * focus * local * (premium && def.rarity === 'epic' ? 2.5 : 1) };
  });
  let roll = rng.next() * rows.reduce((sum, row) => sum + row.weight, 0);
  return rows.find(row => (roll -= row.weight) <= 0)?.id || rows.at(-1).id;
}
const ROOM_SYSTEM_BIAS = {
  attic: ['hunt', 'fate'], storage: ['hunt', 'market'], basement: ['breach', 'eclipse'],
  library: ['astral', 'fate'], chapel: ['dawn', 'eclipse'], hall: ['breach', 'market'],
  garden: ['dawn', 'astral'], clock: ['fate', 'astral'], secret: ['eclipse', 'hunt'],
  corridor: ['hunt', 'market'], kitchen: ['breach', 'dawn'], bedroom: ['fate', 'dawn'], dungeon: ['eclipse', 'hunt']
};
function chooseGearFromSystem(player, system, premium = false) {
  const ids = GEAR_IDS[system] || GEAR_IDS.astral;
  const missing = ids.filter(id => !hasGear(player, id));
  const pool = missing.length ? missing : ids;
  const preferred = premium ? pool.filter(id => ITEMS[id].rarity === 'epic') : pool.filter(id => ITEMS[id].rarity !== 'epic');
  return pick(preferred.length ? preferred : pool);
}

function chooseVisibleSystemGear(player, slot) {
  const selected = roundSlots().map(n => player.turn.slots[n]?.entry?.itemId).filter(Boolean);
  const available = Object.keys(GEAR_SYSTEMS).filter(system => GEAR_IDS[system].some(id => !hasGear(player, id)
    && !selected.includes(id) && (state.round >= 4 || ITEMS[id].rarity !== 'epic')));
  const local = available.filter(system => (ROOM_SYSTEM_BIAS[player.room] || []).includes(system));
  const system = local.length && rng.next() < .72 ? pick(local) : pick(available.length ? available : Object.keys(GEAR_SYSTEMS));
  const pool = GEAR_IDS[system].filter(id => !hasGear(player, id) && !selected.includes(id)
    && (state.round >= 4 || ITEMS[id].rarity !== 'epic'));
  const fallback = GEAR_IDS[system].filter(id => !hasGear(player, id) && !selected.includes(id));
  return pick(pool.length ? pool : fallback.length ? fallback : GEAR_IDS[system]);
}

// 房间决定主要战利品，重复道具降权；让路线选择影响装备构筑。
const ROOM_LOOT = {
  bedroom: ['tonic', 'ironRation', 'returnFeather', 'wardRibbon'], corridor: ['glassMoth', 'smokeVial', 'rope', 'silkMantle'],
  hall: ['royalSeal', 'rustKey', 'waxDouble', 'shadowDart', 'thornBuckler'], kitchen: ['ironRation', 'tonic', 'calmIncense', 'thunderFlask'],
  library: ['dreamThread', 'chalk', 'curseLens', 'starLens'], basement: ['graveSalt', 'lantern', 'chainKey', 'thornBuckler'],
  attic: ['rope', 'glassMoth', 'moonBoots', 'silkMantle'], secret: ['paintVial', 'dreamThread', 'moonCompass', 'shadowDart'],
  garden: ['thornSeed', 'tonic', 'calmIncense', 'wardRibbon'], clock: ['clockSpring', 'echoBell', 'resonance', 'starLens'],
  storage: ['rustKey', 'paintVial', 'lockpick', 'thunderFlask'], chapel: ['graveSalt', 'royalSeal', 'mirrorCharm', 'wardRibbon']
};
/* 确定性保底：连续几次没有拿到有效装备收益之后，下一次正常奖励直接给
   一件匹配当前主方向的体系装备。不靠「提高掉率」，而是走到就一定有。 */
const PITY_DRY_THRESHOLD = 3;
function pityGear(player) {
  const system = growthDirection(player);
  const owned = new Set(player.inventory.filter(item => ITEMS[item.id]?.system === system).map(item => item.id));
  const missing = (GEAR_IDS[system] || []).filter(id => !owned.has(id));
  return missing.length ? pick(missing) : chooseGearFromSystem(player, system, true);
}

function chooseRoomLoot(player) {
  if ((Number(player.dryPulls) || 0) >= PITY_DRY_THRESHOLD) {
    return pityGear(player);
  }
  const lootRoll = rng.next();
  if (lootRoll < .38) return chooseVisibleSystemGear(player, 0);
  if (lootRoll < .72) return pick(Object.keys(ITEMS).filter(id => ITEMS[id].category === 'relic'));
  if (lootRoll < .84) return pick([...RECOVERY_IDS, ...WARP_IDS, 'hunterBeacon', 'escapeBeacon', 'riftStep', 'mirrorFerry', 'windBeacon', 'hourglassEscape']);
  if (lootRoll < .93) return chooseSystemLoot(player);
  const local = ROOM_LOOT[player.room] || ROOM_LOOT.corridor;
  const received = player.lootReceived || {};
  const base = { active: 3, equipment: 2.4, passive: 2.2, reactive: 3.2, relic: 2.5 };
  const leastReceived = Math.min(...Object.keys(base).map(category => received[category] || 0));
  const ordinaryIds = Object.keys(ITEMS).filter(id => !id.startsWith('npc_gear_') && id !== 'dungeonShackle'
    && !(state.round < 4 && ITEMS[id].system && ITEMS[id].rarity === 'epic'));
  const categorySize = ordinaryIds.reduce((counts, id) => {
    const def = ITEMS[id];
    counts[def.category] = (counts[def.category] || 0) + 1;
    return counts;
  }, {});
  const candidates = ordinaryIds.map(id => {
    const def = ITEMS[id];
    const count = received[def.category] || 0;
    const weight = (count === leastReceived ? 1 : 0) * base[def.category] / categorySize[def.category]
      * (local.includes(id) ? 2.3 : 1)
      * (player.inventory.some(item => item.id === id) ? .12 : 1)
      * (def.rare ? .68 : 1);
    return { id, weight };
  });
  let roll = rng.next() * candidates.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of candidates) if ((roll -= entry.weight) <= 0) return entry.id;
  return candidates[candidates.length - 1].id;
}

function resolveGearChoice(player, entry, result) {
  if (entry.choice === 'stat') {
    const stats = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth'];
    const available = stats.filter(key => player.stats[key] < CORE_STAT_SOFT_CAP);
    const key = pick(available.length ? available : stats);
    /* 锤炼给的是「基础值 + 永久成长」，不经过 coreDelta 截断，也不吃百分比放大。 */
    applyChanges(player, [[key, 2]], result);
    result.outcome = 'success'; result.title = `锤炼提升了${STAT_LABEL[key]}`;
    result.story = `你在城堡里磨练了${STAT_LABEL[key]}。`;
    return;
  }
  if (entry.choice === 'desperate') {
    applyChanges(player, [['health', -1], ['stamina', 3]], result);
    result.outcome = 'success'; result.title = '你透支生命重新站起';
    result.story = '体力回来了，代价落在生命上。';
    return;
  }
  if (entry.choice === 'rest') {
    const vital = ['health', 'stamina', 'sanity'].sort((a, b) => player.stats[a] - player.stats[b])[0];
    applyChanges(player, [[vital, hasGear(player, 'gear_pouch') && vital === 'stamina' ? 3 : 2]], result);
    const bad = ['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧'].find(status => player.statuses.includes(status));
    if (bad) player.statuses = player.statuses.filter(status => status !== bad);
    result.outcome = 'success';
    result.title = '你选择保住自己';
    result.story = `你放下了装备匣，恢复了${STAT_LABEL[vital]}。${bad ? `“${bad}”也暂时退去。` : ''}`;
    return;
  }
  const premium = entry.choice === 'premium';
  const id = entry.itemId || chooseSystemLoot(player, premium);
  const def = ITEMS[id];
  if (!canCarryItem(player, id)) {
    result.outcome = 'fail'; result.title = fullBagReason(id);
    result.story = '先处理同类道具，才能拿走这件东西。';
    return;
  }
  const cost = entry.choice === 'supply' || def.category === 'relic' ? []
    : def.system === 'eclipse' ? [['sanity', -1]]
      : def.category === 'equipment' && def.rarity === 'epic' ? [['health', -1]]
        : premium ? [['health', -2]] : [];
  if (cost.some(([key, amount]) => player.stats[key] <= -amount)) {
    result.outcome = 'fail'; result.title = '代价付不起'; result.story = '这件东西仍留在暗格里。'; return;
  }
  applyChanges(player, cost, result);
  giveItem(player, id, result);
  result.outcome = def.rarity === 'epic' ? 'great' : 'success';
  result.title = entry.choice === 'supply' ? '补给箱里确实有东西' : '暗格里藏着一件道具';
  result.story = `你拿到了${def.name}。${cost.length ? `它收走了你的${STAT_LABEL[cost[0][0]]}。` : '这次没有额外代价。'}`;
}

function resolveDungeonSearch(player, result) {
  if (player.room !== 'dungeon') { result.outcome = 'fail'; result.title = '牢门已经不在这里'; return; }
  player.lastDungeonSearchRound = state.round;
  const roll = rng.next();
  if (roll < .08 && !player.dungeonRelicSeen && !hasGear(player, 'dungeonShackle')) {
    giveItem(player, 'dungeonShackle', result);
    player.dungeonRelicSeen = true;
    result.outcome = 'great'; result.title = '旧锁链里藏着狱影锁环';
  } else if (roll < .38) {
    giveItem(player, pick(['silverScrip', 'goldScrip', 'crownScrip']), result);
    result.outcome = 'success'; result.title = '墙缝里留下交易筹码';
  } else if (roll < .70) {
    giveItem(player, pick(['escapeBeacon', 'chainKey', 'supply_all_2']), result);
    result.outcome = 'success'; result.title = '你找到了离开的准备';
  } else {
    applyChanges(player, [['clues', 1]], result);
    result.outcome = 'success'; result.title = '你记住了牢门的裂缝';
  }
  result.story = '你选择继续探索地牢。这里的收获不稳定，但每次都有可能改变出路。';
}

function animateActor(playerIndex, className, duration = 1100) {
  // 无头模式（自动化测试 / 批量仿真）不做任何动画等待，结算只走逻辑。
  if (state.headless) return Promise.resolve();
  const subject = state.players[playerIndex];
  const nodes = visualNodesForSubject(playerIndex);
  if (!nodes.length || !subject) return Promise.resolve();
  nodes.forEach(actor => {
    actor.classList.remove('emotion-sad','emotion-happy','emotion-sprite-active','emotion-tall-sheet','teleport-in','teleport-out');
    actor.querySelector('.emotion-face')?.remove();
    actor.classList.add(className);
  });
  return delay(duration).then(() => nodes.forEach(actor => actor.classList.remove(className)));
}

function visualNodesForSubject(subjectIndex) {
  const subject = state.players[subjectIndex];
  if (!subject) return [];
  return $$(`[data-subject-id="${subject.id}"]`).filter(node => {
    const view = node.closest('.player-view');
    if (!view) return false;
    const viewer = state.players[Number(view.dataset.player)];
    return viewer?.control === 'human' && viewer.room === subject.room;
  });
}

function addStageEffect(index, className, duration = 1300) {
  const stage = $(`#stage-${index}`);
  if (!stage) return;
  stage.classList.add(className);
  setTimeout(() => stage.classList.remove(className), duration);
}

async function animateCombat(attackerIndex, defenderIndex, mode = 'attack', hit = true) {
  if (state.headless) return;
  const attackerNodes = visualNodesForSubject(attackerIndex);
  const defenderNodes = visualNodesForSubject(defenderIndex);
  [...attackerNodes,...defenderNodes].forEach(actor=>{
    actor.classList.remove('emotion-sad','emotion-happy','emotion-sprite-active','emotion-tall-sheet','teleport-in','teleport-out');
    actor.querySelector('.emotion-face')?.remove();
  });
  const room = state.players[attackerIndex].room;
  const viewers = state.players.filter(player => player.control === 'human' && player.room === room);
  viewers.forEach(player => addStageEffect(player.index, mode === 'guard' ? 'guard-flash' : 'combat', 1450));
  if (!viewers.length) return;
  attackerNodes.forEach(node => node.classList.add('attacking'));
  if (audio.attack) audio.attack(viewers[0].index);
  else if (audio.action) audio.action('attack', viewers[0].index);
  await delay(510);
  if (mode === 'guard') {
    defenderNodes.forEach(node => node.classList.add('guarding'));
    if (audio.guard) audio.guard(viewers[0].index);
  } else {
    defenderNodes.forEach(node => node.classList.add(hit ? 'hit' : 'guarding'));
    if (hit && audio.hurt) audio.hurt(viewers[0].index);
  }
  await delay(720);
  [...attackerNodes, ...defenderNodes].forEach(node => node.classList.remove('attacking', 'guarding', 'hit'));
}

async function animateMutualAttack(firstIndex, secondIndex) {
  if (state.headless) return;
  const room = state.players[firstIndex].room;
  const viewers = state.players.filter(player => player.control === 'human' && player.room === room);
  if (!viewers.length) return;
  viewers.forEach(player => addStageEffect(player.index, 'combat', 1500));
  [firstIndex, secondIndex].forEach(index => visualNodesForSubject(index).forEach(node => node.classList.add('attacking')));
  if (audio.attack) audio.attack(viewers[0].index);
  await delay(560);
  [firstIndex, secondIndex].forEach(index => visualNodesForSubject(index).forEach(node => node.classList.add('hit')));
  if (audio.hurt) audio.hurt(viewers[0].index);
  await delay(760);
  $$('.actor').forEach(node => node.classList.remove('attacking', 'hit'));
}

async function sendToDungeon(player, result, reason) {
  // 替身蜡像：下一次失败不会进入地牢，但蜡像必定碎掉。
  if (player.wardCharges > 0) {
    player.wardCharges -= 1;
    // 文案说“当场碎成粉末”，它就必须真的从行囊里消失；否则叙述和状态互相打脸。
    const wardIndex = player.inventory.findIndex(item => ITEMS[item.id]?.effect?.kind === 'ward');
    if (wardIndex >= 0) player.inventory.splice(wardIndex, 1);
    result.consequences.push('替身蜡像替你承受了这一次失败：你没有进入地牢，蜡像当场碎成粉末。');
    if (player.control === 'human' && audio.itemBreak) audio.itemBreak(player.index);
    return;
  }
  const nodes = visualNodesForSubject(player.index);
  nodes.forEach(node => node.classList.add('dungeoning'));
  const viewers = state.players.filter(viewer => viewer.control === 'human' && viewer.room === player.room);
  viewers.forEach(viewer => addStageEffect(viewer.index, 'dungeon-shift', 1450));
  if (viewers.length && audio.dungeon) audio.dungeon(viewers[0].index);
  // 入狱代价只扣一次；接下来两次行动由 dungeonActionsLeft 逐次消耗。
  const key = player.stats.stamina > 1 ? 'stamina' : pick(['health', 'stamina', 'sanity']);
  const loss = 1;
  applyChanges(player, [[key, -loss]], result);
  resultSeverity(result, 'critical');
  // 文案只说"发生了什么"：不写扣了几点、不写扣在哪一项上。
  result.consequences.push(`${reason} 锁链会限制接下来的两次行动；解除后只能从普通出口离开。`);
  player.skipTurns = 0;
  player.dungeonActionsLeft = 2;
  player.jailedThisRound = true;
  player.dungeonHistory.push({ round: state.round, reason });
  player.statuses = uniqueAdd(player.statuses.filter(status => status !== '路线优势'), '囚禁');
  player.room = 'dungeon';
  const chainKey = player.inventory.find(item => item.id === 'chainKey');
  if (chainKey && !player.chainKeyUsed && shortenJail(player, result, '锁链钥匙')) {
    useAndMaybeBreakItem(player, chainKey, result);
  }
  await delay(state.headless ? 0 : 1200);
  nodes.forEach(node => node.classList.remove('dungeoning'));
}

// 离开地牢时彻底清理残留状态，避免“囚禁”跟着角色回到普通房间。
function clearJailState(player) {
  player.skipTurns = 0;
  player.dungeonActionsLeft = 0;
  player.skippedThisRound = false;
  player.jailedThisRound = false;
  player.statuses = player.statuses.filter(status => status !== '囚禁');
}

function consumeDungeonAction(player, result) {
  if (player.room !== 'dungeon' || player.dungeonActionsLeft <= 0) return false;
  player.dungeonActionsLeft -= 1;
  result.outcome = 'special';
  result.title = '锁链消耗了一次行动';
  result.story = player.dungeonActionsLeft
    ? `还需等待 ${player.dungeonActionsLeft} 次行动。`
    : '锁链松开了；本回合剩余行动可以探索，下一次旅行可选普通出口。';
  if (player.dungeonActionsLeft === 0) {
    player.jailedThisRound = false;
    player.statuses = player.statuses.filter(status => status !== '囚禁');
  }
  return true;
}

// 锁链钥匙 / 锁链看守：少限制一次行动。
function shortenJail(player, result, source) {
  if (player.chainKeyUsed) {
    if (result) result.consequences.push('本局已经用过一次提前离开的机会，无法再次缩短。');
    return false;
  }
  player.chainKeyUsed = true;
  player.dungeonActionsLeft = Math.max(0, player.dungeonActionsLeft - 1);
  if (player.dungeonActionsLeft === 0) {
    player.jailedThisRound = false;
    player.statuses = player.statuses.filter(status => status !== '囚禁');
  }
  player.statuses = uniqueAdd(player.statuses, '减刑');
  if (result) result.consequences.push(`${source}使锁链少限制一次行动。`);
  return true;
}

function effectiveAttackScores(attacker, defender, style = 'force') {
  const a = key => effectiveStat(attacker, key) + affixTotal(attacker, 'attack_stat', key);
  const d = key => effectiveStat(defender, key);
  const defenseBoost = 1 + Math.min(1.5, affixTotal(defender, 'guard_pct'));
  if (style === 'ambush') {
    return {
      attack: a('agility') * .45 + a('stealth') * .4 + a('perception') * .15,
      defense: (d('agility') * .4 + d('perception') * .4 + d('stealth') * .2) * defenseBoost
    };
  }
  if (style === 'menace') {
    return {
      attack: a('intimidation') * .6 + a('sanity') * .25 + a('strength') * .15,
      defense: (d('intimidation') * .35 + d('sanity') * .4 + d('strength') * .25) * defenseBoost
    };
  }
  return {
    attack: a('strength') * .7 + a('intimidation') * .2 + a('agility') * .1,
    defense: (d('strength') * .35 + d('agility') * .4 + d('intimidation') * .25) * defenseBoost
  };
}

function calculateAttackChance(attacker, defender, entry, item = null, context = {}) {
  const scores = effectiveAttackScores(attacker, defender, entry.style || 'force');
  // baseChance 保留为原版语义的“属性基准分”，供既有测试与文案引用。
  const baseChance = .55 + (scores.attack - scores.defense) * .05;
  const itemModifier = item ? ITEMS[item.id].bonus * .015 : 0;
  let statusModifier = 0;
  if (attacker.statuses.includes('专注')) statusModifier += .03;
  if (attacker.statuses.includes('路线优势')) statusModifier += .02;
  if (attacker.statuses.includes('受伤')) statusModifier -= .04;
  if (attacker.statuses.includes('疲惫')) statusModifier -= .025;
  if (attacker.statuses.includes('动摇')) statusModifier -= .025;
  if (attacker.statuses.includes('暴露') && entry.style === 'ambush') statusModifier -= .05;
  if (defender.statuses.includes('戒备')) statusModifier -= .04;
  statusModifier += context.guardModifier || 0;

  // 诺克斯天赋「无灯脚步」：未被任何人看见时额外提升夺取率。
  const hero = HEROES[attacker.hero];
  const unwatched = !state.players.some(other => other.id !== attacker.id && other.room === attacker.room);
  const talentModifier = hero?.talent?.id === 'lampfoot' && unwatched ? .08 : 0;

  const sceneRoom = context.room || attacker.room;
  const sceneModifier = entry.style === 'force' && sceneRoom === 'hall' ? .01
    : entry.style === 'ambush' && ['attic', 'storage'].includes(sceneRoom) ? .01
      : entry.style === 'menace' && sceneRoom === 'chapel' ? .01 : 0;
  const spectatorCount = context.spectatorCount ?? Math.max(0, state.players.filter(player => player.room === attacker.room && player.room !== 'dungeon' && !player.skippedThisRound).length - 2);
  const crowdPenalty = sceneRoom === 'ruinConvergence' ? 0 : spectatorCount * .05;

  /* 最终夺取率：同值基准 40%，属性差走饱和曲线。
     旧版是「每 1 点差 ±4 个百分点」，上限 65%。属性进入几十上百之后，
     这条线会在几点差距内就顶死，成长在对抗里完全看不出来。
     现在差距按 1-exp(-gap/12) 平滑逼近上限：小差距手感与原来接近，
     大差距继续加分但永远到不了必中，防守方的反应道具仍然有价值。 */
  const attributeGap = scores.attack - scores.defense;
  const gapTerm = (1 - Math.exp(-Math.max(0, attributeGap) / 12)) - (1 - Math.exp(-Math.max(0, -attributeGap) / 12));
  /* 血染王冠：佩戴者发起夺取时 +20 个百分点。加成写进同一个最终值，
     不再出现「预览用 chance、实际判定读 finalChance」两套数字。 */
  const crownBonus = String(state.crownHolder || '') === String(attacker.id) ? .20 : 0;
  const rawFinal = .40
    + gapTerm * .70
    + itemModifier
    + statusModifier
    + sceneModifier
    + talentModifier
    + crownBonus
    + (entry.style === 'ambush' ? systemTier(attacker, 'hunt') * .06 + systemPower(attacker, 'hunt') * .015 : 0)
    + (entry.style === 'force' ? systemTier(attacker, 'breach') * .04 + systemPower(attacker, 'breach') * .012 : 0)
    + (entry.style === 'menace' ? systemTier(attacker, 'eclipse') * .04 : 0)
    + (gearPieceSystems(attacker, 1).some(system => ({hunt:'ambush',eclipse:'menace',breach:'force',astral:'ambush',dawn:'force',fate:'ambush',market:'menace'})[system] === entry.style) ? .025 : 0)
    - crowdPenalty;
  const baseCeiling = systemTier(attacker, 'hunt') >= 3 && entry.style === 'ambush' ? .90 : .78;
  const ceiling = crownBonus ? Math.max(baseCeiling, .95) : baseCeiling;
  let finalChance = clamp(rawFinal, .20, ceiling);
  /* 【msg8 §20】无体系加成 = 随机夺取：未带进攻体系(夜猎/破城/蚀冠<2件)且非王冠持有者时，
     夺取率退化为纯随机掷骰(约 42%)，忽略属性优势；带体系或王冠才走确定性公式。 */
  const hasOffensiveSystem = systemTier(attacker, 'hunt') >= 2 || systemTier(attacker, 'breach') >= 2 || systemTier(attacker, 'eclipse') >= 2;
  if (!hasOffensiveSystem && !crownBonus) finalChance = clamp(.42, .20, .95);

  return {
    /* chance 与 finalChance 永远同一个值：预览、人机评估、实际判定、
       结算全部读这里，不再有第二条最终概率来源。 */
    chance: finalChance,
    finalChance,
    baseChance,
    attributeGap,
    gapTerm,
    crownBonus,
    attackScore: scores.attack,
    defenseScore: scores.defense,
    spectatorCount,
    crowdPenalty,
    itemModifier,
    statusModifier,
    sceneModifier,
    talentModifier
  };
}

function calculateGuardChance(defender, attacker, item, activeGuard) {
  if (!activeGuard && (!item || ITEMS[item.id].category !== 'reactive')) return 0;
  const defense = (effectiveStat(defender, 'agility') * .35 + effectiveStat(defender, 'perception') * .35
    + effectiveStat(defender, 'intimidation') * .2 + effectiveStat(defender, 'stealth') * .1)
    * (1 + Math.min(1.5, affixTotal(defender, 'guard_pct')));
  const offense = effectiveStat(attacker, 'strength') * .4 + effectiveStat(attacker, 'agility') * .3
    + effectiveStat(attacker, 'stealth') * .2 + effectiveStat(attacker, 'intimidation') * .1;
  const itemBoost = item ? ITEMS[item.id].bonus * .012 : 0;
  return clamp(.45 + (defense - offense) * .025 + itemBoost + (activeGuard ? .12 : 0)
    + systemTier(defender, 'dawn') * .02
    + (gearPieceSystems(defender, 2).length ? .015 : 0)
    - (systemTier(attacker, 'breach') >= 3 ? .08 : 0), .18, .72);
}

function seizeResource(attacker, defender, attackerResult, defenderResult) {
  // 夺取只碰关键遗物、线索、钥匙和数值；体系与通用装备始终安全。
  const protectedKey = hasGear(defender, 'gear_guardbox');
  const relic = defender.inventory.find(item => ITEMS[item.id].category === 'relic');
  /* transfer 记录「这一次真正转移了什么」，供终局双倍规则按实际结果复制。
     旧实现是夺取完成后再回头查受害者身上还剩什么，最后一份资源被取走时
     会漏翻倍，而且补发的种类可能和实际战利品不是一回事。 */
  let transfer = { kind: 'none', stat: null, amount: 0, relicId: null, value: 0 };
  if (!protectedKey && relic) {
    defender.inventory = defender.inventory.filter(item => item.uid !== relic.uid);
    attacker.inventory.push(relic);
    transfer = { kind: 'relic', stat: null, amount: 1, relicId: relic.id, value: ITEMS[relic.id].value || 1 };
    attackerResult.consequences.push(`夺得关键遗物${ITEMS[relic.id].name}。`);
    defenderResult.consequences.push(`关键遗物${ITEMS[relic.id].name}被夺走。`);
  } else {
    const key = defender.stats.keys > 0 ? 'keys' : defender.stats.clues > 0 ? 'clues' : null;
    if (key && !protectedKey) {
      applyChanges(defender, [[key, -1]], defenderResult);
      applyChanges(attacker, [[key, 1]], attackerResult);
      transfer = { kind: 'stat', stat: key, amount: 1, relicId: null, value: 1 };
      attackerResult.consequences.push(`夺得一份${STAT_LABEL[key]}。`);
    } else if (protectedKey) attackerResult.consequences.push('守护匣保住了对方的关键道具。');
  }
  const weaponSystem = ['breach', 'eclipse', 'hunt'].sort((a, b) => systemCount(attacker, b) - systemCount(attacker, a))[0];
  const vital = systemCount(attacker, weaponSystem) > 0
    ? ({ breach: 'health', eclipse: 'sanity', hunt: 'stamina' })[weaponSystem]
    : attacker.stats.strength >= attacker.stats.stealth && attacker.stats.strength >= attacker.stats.intimidation ? 'health'
      : attacker.stats.intimidation >= attacker.stats.stealth ? 'sanity' : 'stamina';
  const core = vital === 'health' ? 'strength' : vital === 'sanity' ? 'intimidation' : 'stealth';
  const vitalLoss = vital === 'health' && defender.stats.health <= 3 && hasGear(defender, 'gear_anchor') ? 0 : -1;
  applyChanges(defender, [[vital, vitalLoss], [core, -1]], defenderResult);
  attackerResult.consequences.push(`还使目标${STAT_LABEL[vital]}与${STAT_LABEL[core]}各下降一点；体系装备没有受影响。`);
  if (systemTier(attacker, 'eclipse') >= 2 && !hasGear(defender, 'gear_flame')) {
    const penalty = systemTier(attacker, 'eclipse') >= 3 ? 2 : 1;
    applyChanges(defender, [['sanity', -penalty]], defenderResult);
    applyChanges(attacker, [['sanity', hasGear(attacker, 'gear_wash') ? 0 : -1]], attackerResult);
    defender.curses = uniqueAdd(defender.curses, '耳语');
    attackerResult.consequences.push(`蚀冠留下债印，额外削去目标${penalty}点理智。${hasGear(attacker, 'gear_wash') ? '洗印匣抵消了你的代价。' : '你也付出一点理智。'}`);
  } else if (systemTier(attacker, 'eclipse') >= 2) {
    defenderResult.consequences.push('孤灯挡住了蚀冠的额外诅咒。');
  }
  return transfer;
}

function findDefenseItem(player, preferredUid = null) {
  const preferred = preferredUid ? itemByUid(player, preferredUid) : null;
  if (preferred && ITEMS[preferred.id].type === 'defense') return preferred;
  return player.inventory.filter(item => ITEMS[item.id].type === 'defense').sort((a, b) => ITEMS[b.id].bonus - ITEMS[a.id].bonus)[0] || null;
}

async function resolveMutualAttack(results, intents, firstIndex, secondIndex) {
  await animateMutualAttack(firstIndex, secondIndex);
  const first = state.players[firstIndex];
  const second = state.players[secondIndex];
  const attackEntries = intents.map(intent => intent.entry);

  // 一次对抗判定：双方各自用真实夺取公式求值，胜负由属性优势决定。
  const firstData = calculateAttackChance(first, second, intents[0].entry, itemByUid(first, intents[0].itemUid), { room: first.room, spectatorCount: 0 });
  const secondData = calculateAttackChance(second, first, intents[1].entry, itemByUid(second, intents[1].itemUid), { room: second.room, spectatorCount: 0 });
  const margin = firstData.finalChance - secondData.finalChance;
  const edge = Math.abs(margin);
  // 对外只讲"谁占上风、占多少"，不给任何数字。
  const strongEdge = edgeNote(edge);     // 占上风的一方
  const weakEdge = edgeNote(-edge);      // 处下风的一方

  [firstIndex, secondIndex].forEach((index, pairIndex) => {
    const player = state.players[index];
    const selected = itemByUid(player, intents[pairIndex].itemUid);
    const used = selected && getMatchingItems(player, intents[pairIndex].entry).some(item => item.uid === selected.uid)
      ? selected
      : chooseBestItem(player, intents[pairIndex].entry);
    if (used) useAndMaybeBreakItem(player, used, results[index]);
  });

  // 优势极小（< 8 个百分点）→ 双方各失 1 点体力，无人夺取、无人入狱。
  if (edge < .08) {
    [firstIndex, secondIndex].forEach(index => {
      const player = state.players[index];
      applyChanges(player, [['stamina', -1]], results[index]);
      results[index].outcome = 'fail';
      results[index].title = '两次攻击在同一瞬间撞在一起';
      results[index].story = '谁也没有退让，谁也没有真正赢。武器与影子同时碰撞，双方各退一步，各自留下一处钝痛。';
      results[index].consequences.push(`${weakEdge}：你们撞在一处，各自留下一处钝痛，谁也没能带走东西，也没有人被送进地牢。`);
      player.statuses = uniqueAdd(player.statuses, '疲惫');
    });
    first.hatred[second.id] = (first.hatred[second.id] || 0) + 1;
    second.hatred[first.id] = (second.hatred[first.id] || 0) + 1;
    return;
  }

  // 优势明显 → 优势方夺取成功，劣势方按单方失败的规则处理。
  const winnerIndex = margin > 0 ? firstIndex : secondIndex;
  const loserIndex = margin > 0 ? secondIndex : firstIndex;
  const winner = state.players[winnerIndex];
  const loser = state.players[loserIndex];
  const loserIntent = intents[margin > 0 ? 1 : 0];

  const activeGuard = loserIntent?.entry?.kind === 'guard';
  const defenseItem = findDefenseItem(loser, loserIntent?.itemUid);
  const autoGuard = !activeGuard && defenseItem && ITEMS[defenseItem.id].autoProtect;

  if (activeGuard || autoGuard) {
    const guardChance = calculateGuardChance(loser, winner, defenseItem, activeGuard);
    if (defenseItem) useAndMaybeBreakItem(loser, defenseItem, results[loserIndex]);
    if (rng.next() < guardChance) {
      results[loserIndex].outcome = 'great';
      results[loserIndex].title = '防护纹路把双人夹击拆成两次落空';
      results[loserIndex].story = `${defenseItem ? ITEMS[defenseItem.id].name : '防守姿态'}在两人交错前展开。${loser.label}没有受伤、没有丢失道具，也没有得到任何人的属性。`;
      results[loserIndex].consequences.push(`${weakEdge}，但这一次你把它挡了回去 —— 反制把对方送进了地牢。`);
      if (defenseItem) applyReactiveSuccess(loser, winner, defenseItem, results[loserIndex]);
      results[winnerIndex].outcome = 'critical';
      results[winnerIndex].title = '你的优势撞上了准备好的反制';
      results[winnerIndex].story = '清脆的反制音切开低鸣，脚下的地面随即翻转。';
      results[winnerIndex].consequences.push('对方的防护成功反制了这次优势攻势。');
      if (String(state.crownHolder || '') === String(state.players[winnerIndex].id)) state.players[winnerIndex].crownFailedAttack = true;
      await sendToDungeon(winner, results[winnerIndex], '防护反制成功。');
      return;
    }
    results[loserIndex].consequences.push(`${weakEdge}，这一次没能挡住。`);
  }

  results[winnerIndex].outcome = 'great';
  results[winnerIndex].title = '对抗中你抢到了唯一的那一步';
  results[winnerIndex].story = '此刻占到的那点上风，在正面撞上的一瞬间被放大了。你没有把对方的长处吸收过来，只能带走他身上实实在在的东西。';
  results[winnerIndex].consequences.push(`${strongEdge}，你抢到了那一步。`);
  results[loserIndex].outcome = 'critical';
  results[loserIndex].title = '退路在一次正面对抗中被截断';
  results[loserIndex].story = '两股力量同时落下，较小的一方先松开。地板随战斗声裂开。';
  results[loserIndex].consequences.push(`${weakEdge}，你成了被带走的那一个。`);
  seizeResource(winner, loser, results[winnerIndex], results[loserIndex]);
  loser.hatred[winner.id] = (loser.hatred[winner.id] || 0) + 3;
  if (String(state.crownHolder || '') === String(loser.id)) loser.crownFailedAttack = true;
  await sendToDungeon(loser, results[loserIndex], '正面对抗处于劣势，成为失败者。');
}

async function resolveSingleAttack(attackerIndex, defenderIndex, intent, defenderIntent, results, spectatorCount = 0) {
  const attacker = state.players[attackerIndex];
  const defender = state.players[defenderIndex];
  const attackEntry = intent.entry;
  const attackerResult = results[attackerIndex];
  const defenderResult = results[defenderIndex];
  const selectedAttackItem = itemByUid(attacker, intent.itemUid);
  const attackerItem = selectedAttackItem && getMatchingItems(attacker, attackEntry).some(item => item.uid === selectedAttackItem.uid)
    ? selectedAttackItem
    : chooseBestItem(attacker, attackEntry);
  const activeGuard = defenderIntent?.entry?.kind === 'guard';
  const defenseItem = findDefenseItem(defender, defenderIntent?.itemUid);
  const autoGuard = !activeGuard && defenseItem && ITEMS[defenseItem.id].autoProtect;

  if (activeGuard || autoGuard) {
    const guardChance = calculateGuardChance(defender, attacker, defenseItem, activeGuard);
    const guarded = rng.next() < guardChance;
    if (defenseItem) useAndMaybeBreakItem(defender, defenseItem, defenderResult);
    if (guarded) {
      await animateCombat(attackerIndex, defenderIndex, 'guard', false);
      defenderResult.outcome = 'great';
      defenderResult.title = '防护纹路把攻击完整弹回';
      defenderResult.story = `${defenseItem ? ITEMS[defenseItem.id].name : '防守姿态'}在命中前展开。${defender.label}没有受伤、没有丢失道具。`;
      defenderResult.consequences.push(`${edgeNote(guardChance - .5)}，这一挡把它顶了回去 —— 反制把对方送进了地牢。`);
      if (defenseItem) applyReactiveSuccess(defender, attacker, defenseItem, defenderResult);
      attackerResult.outcome = 'critical';
      attackerResult.title = '攻击撞上了准备好的反制';
      attackerResult.story = '清脆的反制音切开低鸣，脚下地面随即翻转。';
      if (attackerItem) useAndMaybeBreakItem(attacker, attackerItem, attackerResult);
      if (String(state.crownHolder || '') === String(attacker.id)) attacker.crownFailedAttack = true;
      await sendToDungeon(attacker, attackerResult, '防护反制成功。');
      return { jailed: attackerIndex, consumed: new Set([attackerIndex, defenderIndex]) };
    }
    defenderResult.consequences.push('这一下没挡住，但它卸掉了大半力道，后面那一下会更难落到你身上。');
  }

  const guardModifier = (activeGuard ? -.035 : 0) + ((activeGuard || autoGuard) && defenseItem ? -.025 : 0);
  const attackData = calculateAttackChance(attacker, defender, attackEntry, attackerItem, { spectatorCount, guardModifier, room: attackEntry.snapshotRoom });
  const chance = clamp(attackData.finalChance - (defender.incomingStealPenalty || 0), .15,
    systemTier(attacker, 'hunt') >= 3 && attackEntry.style === 'ambush' ? .82 : .70);
  const success = rng.next() < chance;
  await animateCombat(attackerIndex, defenderIndex, 'attack', success);
  if (attackerItem) useAndMaybeBreakItem(attacker, attackerItem, attackerResult);
  if (defender.incomingStealPenalty) {
    defenderResult.consequences.push('残留的烟雾还没散，伸过来的那只手在半空里抓了个空。');
    defender.incomingStealPenalty = 0;
  }

  // 对外只讲"谁占上风、占多少"，不给任何数字。
  const attackEdge = edgeNote(chance - .5);
  const defendEdge = edgeNote(.5 - chance);
  const crowdNote = attackData.spectatorCount ? '旁边还站着别的眼睛，这一手施展不开。' : '';
  const talentNote = attackData.talentModifier ? `${HEROES[attacker.hero].talent.name}也帮上了忙。` : '';

  if (success) {
    attackerResult.outcome = 'great';
    attackerResult.title = '夺取在对方退开前完成';
    attackerResult.story = '你借着此刻占到的那点上风切进了对方的防线。你没有把对方的长处吸收过来，只能带走他身上实实在在的东西。';
    attackerResult.consequences.push(`${attackEdge}，你抢到了那一步。${crowdNote}${talentNote}`);
    defenderResult.outcome = 'critical';
    defenderResult.title = '退路在最后一步被截断';
    defenderResult.story = '那一下结结实实落在你身上，脚下的地板随战斗声裂开。接下来是地牢。';
    seizeResource(attacker, defender, attackerResult, defenderResult);
    await sendToDungeon(defender, defenderResult, '单方攻击命中，防守者成为失败者。');
    defender.hatred[attacker.id] = (defender.hatred[attacker.id] || 0) + 3;
    return { jailed: defenderIndex, consumed: new Set([attackerIndex, defenderIndex]) };
  }

  attackerResult.outcome = 'critical';
  attackerResult.title = '夺取落空，地牢选择了攻击者';
  attackerResult.story = '对方从你挥出的那条线旁边全身退开。你没有留下任何能被夺走的东西，只听见牢门在脚下开启。';
  attackerResult.consequences.push(`${attackEdge}，可这一次你还是慢了半步。${crowdNote}`);
  /* 【msg8 §19】戴冠者发起夺取却失败 → 标记，结算时总分 ×0.85。 */
  if (String(state.crownHolder || '') === String(attacker.id)) attacker.crownFailedAttack = true;
  defenderResult.outcome = 'great';
  defenderResult.title = '你从攻击边缘全身而退';
  defenderResult.story = '那一下擦过你的衣角，撞进黑暗里。你没有受伤，也没有凭空多得什么。';
  defenderResult.consequences.push(`${defendEdge}，但你全身退开了 —— 对方什么也没能从你身上拿走。`);
  attacker.hatred[defender.id] = (attacker.hatred[defender.id] || 0) + 1;
  await sendToDungeon(attacker, attackerResult, '单方攻击失败，攻击者成为失败者。');
  return { jailed: attackerIndex, consumed: new Set([attackerIndex, defenderIndex]) };
}

// 每场景普通行动对核心属性的累计变化上限（提示词硬要求）。
// 溢出部分由 toNonCoreChanges() 转译为生命/体力/理智/线索/钥匙/状态，避免数值翻倍。
const CORE_STAT_KEYS = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth'];
/* 单个普通行动对同一项核心属性的净变化上限。
   这一轮要求后期属性明显膨胀，所以从 1 提到 2；超过部分仍然转译成生存资源，
   保证「一次行动不会跳过整个成长档」。阶段奖励、装备词条与保底校准不走这条截断。 */
const CORE_DELTA_CAP = 2;
/* 核心属性的上限。
   旧版把核心属性硬截在 100，这一轮明确要求「后期属性明显膨胀、核心能力值可以到数百」，
   所以软上限抬到 999，真正的平衡交给检定曲线与分数递减，而不是靠一刀切的天花板。
   生命 / 体力 / 理智不跟着放大：它们是生存资源，仍然按原来的 10 点尺度单独平衡。 */
const CORE_STAT_SOFT_CAP = 999;

function clampCoreDelta(changes, player = null) {
  const totals = new Map();
  for (const [key, value] of changes) {
    if (!CORE_STAT_KEYS.includes(key)) continue;
    totals.set(key, (totals.get(key) || 0) + value);
  }
  const overflow = [];
  for (const [key, total] of totals) {
    const allowed = clamp(total, -CORE_DELTA_CAP, CORE_DELTA_CAP);
    if (allowed === total) continue;
    overflow.push([key, total - allowed]);
  }
  if (!overflow.length) return changes;
  const adjusted = [];
  const remaining = new Map(overflow);
  for (const [key, value] of changes) {
    if (!CORE_STAT_KEYS.includes(key)) {
      adjusted.push([key, value]);
      continue;
    }
    const excess = remaining.get(key) || 0;
    if (!excess) {
      adjusted.push([key, value]);
      continue;
    }
    const consume = Math.sign(excess) === Math.sign(value) ? Math.sign(excess) * Math.min(Math.abs(excess), Math.abs(value)) : 0;
    remaining.set(key, excess - consume);
    adjusted.push([key, value - consume]);
  }
  // 被截掉的点数按方向转译为次级资源，保证玩家仍有可感知的得失。
  const compensation = new Map();
  for (const [key, excess] of overflow) {
    if (!excess) continue;
    if (excess > 0) {
      compensation.set('stamina', (compensation.get('stamina') || 0) + excess);
      compensation.set('clues', (compensation.get('clues') || 0) + (excess >= 2 ? 1 : 0));
    } else {
      compensation.set('health', (compensation.get('health') || 0) + Math.max(-2, excess));
      compensation.set('sanity', (compensation.get('sanity') || 0) + (excess <= -2 ? -1 : 0));
    }
  }
  for (const [key, value] of compensation) {
    if (!value) continue;
    const existing = adjusted.find(entry => entry[0] === key);
    if (existing) existing[1] += value;
    else adjusted.push([key, value]);
  }
  return adjusted.filter(([, value]) => value !== 0);
}

/* ---------------------------------------------------------------------------
 * 检定：属性 / 难度 的比值曲线
 * ---------------------------------------------------------------------------
 * 原来 score 直接就是属性原值，判定阈值却是 1.6 / 4.7 / 8.4 这样的个位数绝对值。
 * 属性一旦长到几十上百，所有行动都会稳定变成大成功 —— 成长反而取消了玩法。
 * 现在：
 *   - 难度按阶段给固定基准（同一间旧房间的难度不随玩家变），后期回来明显轻松；
 *   - 新阶段基准更高，成长才有意义；
 *   - 属性与难度做对数比值，60 与 120 的差距仍然可感知，但不会无限放大；
 *   - 成功率、奖励档次是两个独立判断，不全部压进同一个概率。
 * ------------------------------------------------------------------------- */
const STAGE_DIFFICULTY = { explore: 6, summit: 16, return: 26, finale: 45, shard: 40 };
const DIFFICULTY_FLOOR = 6;
const CHECK_GREAT = 1.6;
const CHECK_SUCCESS = 0.3;
const CHECK_FAIL = -1.2;

function roomDifficulty(player, entry) {
  const stage = String(state.stageId || 'explore');
  const base = STAGE_DIFFICULTY[stage] || STAGE_DIFFICULTY.explore;
  const risk = clamp(Number(entry?.risk) || 0, 0, 3);
  const room = ROOM_BY_ID[player.room] || {};
  const specialRoom = room.special ? 1.25 : 1;
  const darkRoom = ['basement', 'dungeon', 'secret', 'hellOfSin', 'collapseClock'].includes(String(player.room)) ? 1.15 : 1;
  return Math.max(DIFFICULTY_FLOOR, base * (1 + risk * 0.18) * specialRoom * darkRoom);
}

/* 以 2 为底的对数比值：属性等于难度时是 0，翻倍是 +1，减半是 -1。
   0 属性不会被当成「缺失」抬到 5，只会得到很低的分。 */
function ratioScore(value, difficulty, weight = 1) {
  const safeValue = Math.max(0.1, Number(value) || 0);
  const safeDifficulty = Math.max(1, Number(difficulty) || 1);
  return weight * Math.log2(safeValue / safeDifficulty);
}

function rollOutcome(player, entry, item = null) {
  if (rng.next() < .08) return { outcome: 'special', talentNote: '' };
  const hero = HEROES[player.hero];
  const talent = hero?.talent;
  const skillBonus = (
    (talent?.id === 'lampfoot' && ['stealth', 'agility'].includes(entry.stat)) ||
    (talent?.id === 'redVeil' && ['stealth', 'agility'].includes(entry.stat)) ||
    (talent?.id === 'crownOath' && entry.stat === 'intimidation') ||
    (talent?.id === 'dreamShepherd' && ['sanity', 'perception'].includes(entry.stat) && entry.tags?.includes('mystery'))
  ) ? 1 : 0;
  const itemBonus = item ? ITEMS[item.id].bonus : 0;
  const passive = player.inventory.find(gear => {
    const def = ITEMS[gear.id];
    return ['passive', 'equipment'].includes(def.category) && def.effect?.statKey === entry.stat
      && (!def.effect.requiresTag || entry.tags?.includes(def.effect.requiresTag));
  });
  const passiveBonus = passive ? 1 + ITEMS[passive.id].effect.chanceBonus * 10 : 0;
  // 负面惩罚有上限：原版每条状态各扣一次、再叠加诅咒，会形成无法翻盘的死亡螺旋。
  const rawPenalty = (player.statuses.includes('受伤') ? .8 : 0)
    + (player.statuses.includes('疲惫') && ['strength', 'agility'].includes(entry.stat) ? .9 : 0)
    + (player.statuses.includes('动摇') && ['sanity', 'intimidation'].includes(entry.stat) ? .9 : 0)
    + (player.statuses.includes('暴露') && entry.stat === 'stealth' ? 1.1 : 0)
    + Math.min(1.2, player.curses.length * .35);
  let debuffPenalty = Math.max(0, Math.min(2.2, rawPenalty) - (hasGear(player, 'gear_veil') ? .5 : 0));
  /* 【msg8 §4-A】眠羊织梦的「沉迷」：被打上的对手本回合逃脱 / 潜行一再失手。 */
  const dazed = (player.buffs || []).some(b => b.tag === 'dazed');
  if (dazed && ['stealth', 'agility'].includes(entry.stat)) debuffPenalty += 1.4;
  const mitigation = item && ITEMS[item.id].useTags.some(tag => ['heal', 'curse', 'guard'].includes(tag)) ? Math.min(debuffPenalty, ITEMS[item.id].bonus * .45) : 0;
  const systemBonus = Math.min(2.4, Object.keys(GEAR_SYSTEMS).reduce((total, key) => {
    const spec = GEAR_SYSTEMS[key];
    if (entry.stat !== spec.stat && !spec.tags.some(tag => entry.tags?.includes(tag))) return total;
    return total + systemTier(player, key) * (.45 + systemPower(player, key) * .12);
  }, 0));
  /* 所有平面修正都换算到「对数比值」的同一量纲上再相加。 */
  const difficulty = roomDifficulty(player, entry);
  const attributeScore = ratioScore(effectiveStat(player, entry.stat), difficulty, 3);
  const luckScore = ratioScore(effectiveStat(player, 'luck'), difficulty, .8);
  const score = attributeScore + luckScore
    + itemBonus * .12 + passiveBonus * .12 + mitigation * .25 + skillBonus * .35 + systemBonus * .3
    + (hasGear(player, 'gear_echo') && systemBonus > 0 ? .15 : 0)
    - debuffPenalty * .3 + rand(-4, 4) / 10
    + (player.statuses.includes('专注') ? .25 : 0) + (player.statuses.includes('路线优势') ? .25 : 0)
    - (player.statuses.includes('疲惫') ? .2 : 0);
  let outcome;
  if (score >= CHECK_GREAT) outcome = 'great';
  else if (score >= CHECK_SUCCESS) outcome = 'success';
  else if (score >= CHECK_FAIL) outcome = 'fail';
  else outcome = 'critical';

  // 皮普天赋「铁钟回响」：正面行动的大失败被钟声卸掉一半，降级为普通失败。
  if (outcome === 'critical' && talent?.id === 'bellEcho' && !player.talentUsedThisRound
    && ['strength', 'intimidation'].includes(entry.stat) && entry.kind !== 'move') {
    player.talentUsedThisRound = true;
    return { outcome: 'fail', score, difficulty, passiveUid: passive?.uid || null, talentNote: `铁钟回响替你挡下最重的一击，这次的大失败被降级为普通失败。` };
  }
  // 低生命/低理智时给一个内在的稳定加成：让"快输了"不至于立刻变成"必输"。
  if (outcome === 'critical' && (player.stats.health <= 2 || player.stats.sanity <= 2) && rng.next() < .45) {
    return { outcome: 'fail', score, difficulty, passiveUid: passive?.uid || null, talentNote: '求生的本能压住了最坏的结果，这次只算失败。' };
  }
  return { outcome, score, difficulty, passiveUid: passive?.uid || null, talentNote: skillBonus ? `${talent.name}让这一步走得更稳。` : '' };
}

function applyTalentAfterAction(player, entry, outcome, result, healthBefore) {
  const talent = HEROES[player.hero]?.talent?.id;
  if (!talent || player.talentUsedThisRound) return;
  const succeeded = outcome === 'great' || outcome === 'success';
  let note = '';
  if (talent === 'flowerTrace' && succeeded && entry.tags?.includes('search')) {
    applyChanges(player, [['clues', 1]], result);
    note = '花径留痕：你在这次搜寻外又记下一条线索。';
  } else if (talent === 'embraceWard' && player.stats.health < healthBefore) {
    applyChanges(player, [['health', 1]], result);
    removeStatuses(player, ['疲惫'], result);
    note = '共担微光：同伴扶住你，伤害减轻了一分。';
  } else if (talent === 'redVeil' && !succeeded && entry.tags?.includes('stealth')) {
    removeStatuses(player, ['暴露'], result);
    applyChanges(player, [['stamina', 1]], result);
    note = '赤影换位：即使失手，你也沿暗处抹去踪迹。';
  } else if (talent === 'roseBloom' && entry.tags?.includes('heal')) {
    applyChanges(player, [['stamina', 1]], result);
    player.flags = uniqueAdd(player.flags, 'gardenRoute');
    note = '蔷薇再生：花藤替你撑起一口气，花园也认下这条路。';
  } else if (talent === 'crownOath' && succeeded && entry.stat === 'intimidation') {
    /* 【msg8 §4-A】赤冠号令：控场压制——标记一名在场对手，本回合对其夺取 / 攻击获得加成。 */
    const foes = state.players.filter(other => other.id !== player.id && !other.collapsed && other.room === player.room);
    const target = foes.sort((a, b) => (b.stats.intimidation || 0) - (a.stats.intimidation || 0))[0];
    if (target) {
      target.marks = uniqueAdd(target.marks, `赤冠号令·${player.label}`);
      player.activeMarked = target.id;
      note = `赤冠号令：${target.label}被你的威慑压住，行动风险陡增。`;
    } else {
      player.protection = Math.max(1, player.protection);
      note = '冠誓：这次压制让你建立了一层防护。';
    }
  } else if (talent === 'dreamShepherd' && succeeded && entry.tags?.includes('mystery')) {
    /* 【msg8 §4-A】眠羊织梦：干扰预知——使一名对手沉迷，并暴露一条线索。 */
    const foes = state.players.filter(other => other.id !== player.id && !other.collapsed);
    const target = foes.sort((a, b) => (player.room === a.room ? -1 : 1) - (player.room === b.room ? -1 : 1))[0];
    if (target) {
      target.buffs = [...(target.buffs || []), { id: `dream-${state.turnSerial}`, name: '沉迷', rounds: 1, tag: 'dazed', delta: -2, source: '眠羊织梦' }];
      applyChanges(player, [['clues', 1]], result);
      note = `眠羊织梦：${target.label}陷入沉迷，你也摸到了一条线索。`;
    } else {
      removeStatuses(player, ['动摇', '恐惧'], result);
      applyChanges(player, [['sanity', 1]], result);
      note = '梦羊低语：惊惧退去，你的心神回到原处。';
    }
  }
  if (note) { player.talentUsedThisRound = true; result.consequences.push(note); }
}

function buildRandomChanges(outcome, entry) {
  const secondary = pick(['health', 'stamina', 'sanity']);
  const tertiary = pick(CORE_STAT_KEYS);
  const changes = [];
  if (outcome === 'great') {
    changes.push([entry.stat, rand(2, 3)], [secondary, rand(1, 2)]);
    if (rng.next() < .32) changes.push([tertiary, -1]);
  } else if (outcome === 'success') {
    changes.push([entry.stat, rand(1, 2)]);
    changes.push(rng.next() < .52 ? [secondary, -1] : [tertiary, 1]);
  } else if (outcome === 'fail') {
    // 失败是"没拿到"，不该同时重罚——原来的 -1~-2 叠加快照会加速螺旋。
    changes.push([entry.stat, -1]);
    if (rng.next() < .28) changes.push([tertiary, 1]);
  } else if (outcome === 'critical') {
    changes.push([entry.stat, -rand(1, 2)], [secondary, -1]);
  } else {
    changes.push([entry.stat, pick([-2, -1, 1, 2])], [secondary, pick([-1, 1])]);
  }
  const merged = new Map();
  changes.forEach(([key, value]) => merged.set(key, (merged.get(key) || 0) + value));
  // 单场景普通行动的核心属性变化合计不超过 ±1，溢出转译为生命/体力/理智/线索。
  return clampCoreDelta([...merged.entries()]);
}

/* 塔顶钟楼的奇偶倍率。
   统计的是「成功敲钟的不同玩家人数」，不是点击次数：
     奇数 → 所有敲过钟的人 ×1.25；偶数 → ×0.8；没敲过钟的人不受影响；零人时没人受罚。 */
function bellMultiplierFor(player) {
	if (!player.rangBell) return 1;
	const ringers = state.players.filter(other => other.rangBell).length;
	return ringers % 2 === 1 ? 1.25 : 0.8;
}

function consequenceFor(player, outcome, result, entry = null) {
	/* 塔顶钟楼：成功敲响就记一次，每人每局最多记一次。
	   界面只报「本局已有 N 次有效钟声」这个公共计数，不给完整名单。 */
	if (String(player.room) === 'bellTower' && entry?.kind === 'roomMechanism' && entry.mechanism === 'bell') {
		const succeeded = outcome === 'great' || outcome === 'success';
		if (succeeded && !player.rangBell) {
			player.rangBell = true;
			const ringers = state.players.filter(other => other.rangBell).length;
			result.consequences.push(`钟声记下了。本局已有 ${ringers} 次有效钟声。`);
		} else if (player.rangBell) {
			result.consequences.push('钟已经记过你的名字，再敲也不会改变什么。');
		}
		return;
	}
	/* 焚罪地狱（城堡之巅）：三条考验的代价与保底。
	   失败 → 按 HELL_COSTS 落账、连续失败计数 +1，继续留在地狱；
	   成功 → 清空计数、给一次小额补偿，并把他送去本阶段的另一个普通房间。
	   只在城堡之巅的地狱房里生效，原有地牢惩罚一行没动。 */
	/* 最后避难所（终局）：禁锢这一次行动，结算完立刻强制离开。
	   本阶段第一次进入还回 1 点最低生存资源；后续进入不再恢复，避免故意刷补给。 */
	/* —— 钟楼碎影：五个时空房间各自的效果（提示词第八节）—— */
	if (player.room === 'hellOfSin' && ['summit','shard'].includes(state.stageId) && entry
      && (ROOM_ACTIONS.hellOfSin.some(e=>e.text===entry.text) || entry.text===HELL_GUARANTEE_TEXT)) {
		/* 【msg8 §5】必然失败陷阱：「向审判者求饶」永远是伪赦令，求饶不会被答应。 */
		if (entry.hellTrap) {
			player.hellFails = (player.hellFails || 0) + 1;
			applyChanges(player, HELL_COSTS['向审判者求饶'] || [['sanity', -1]], result);
			result.consequences.push('你跪下的瞬间，锁链笑出了声——求饶永不会被答应。');
			return;
		}
		// 保底：交出一段记忆 —— 扣当前最高基础属性 1 点后离开；已无可扣就免费离开。
		if (String(entry.text) === HELL_GUARANTEE_TEXT) {
			const cores = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth'];
			let heaviest = null;
			for (const key of cores) {
				const value = Number(player.stats[key] || 0);
				if (value > 1 && (heaviest === null || value > Number(player.stats[heaviest] || 0))) heaviest = key;
			}
			if (heaviest) {
				applyChanges(player, [[heaviest, -1]], result);
				result.consequences.push('你交出一段记忆，灰烬终于放你走。');
			} else {
				result.consequences.push('你已经没有可交出的东西，门自己开了。');
			}
			player.hellFails = 0;
			const doors = stageRoomIds('summit').filter(id => !ROOM_BY_ID[id].special && id !== player.room);
			if (doors.length) window.NightCrownWorld.relocate(player, pick(doors), 'forced');
			return;
		}
		const failed = outcome === 'fail' || outcome === 'critical';
		if (failed) {
			player.hellFails = (player.hellFails || 0) + 1;
			applyChanges(player, HELL_COSTS[String(entry.text)] || [['stamina', -1]], result);
			result.consequences.push(`地狱记住了这一次：连续失败 ${player.hellFails} 次。`);
			return;
		}
		player.hellFails = 0;
		applyChanges(player, [['clues', 1]], result);
		const exits = stageRoomIds('summit').filter(id => !ROOM_BY_ID[id].special && id !== player.room);
		if (exits.length) {
			const dest = pick(exits);
			window.NightCrownWorld.relocate(player, dest, 'forced');
			result.consequences.push(`灰烬让开一条缝，你被送进${ROOM_BY_ID[dest].name}。`);
		}
		return;
	}
	if (outcome === 'great') {
    const itemId = chooseRoomLoot(player);
    giveItem(player, itemId, result);
    const mark = pick(['门缝记号', '星图印记', '被注视']);
    player.marks = uniqueAdd(player.marks, mark);
    player.flags = uniqueAdd(player.flags, pick(['bookshelf', 'ladderMark', 'gardenRoute']));
    result.consequences.push(`留下标记“${mark}”，它可能改变后续道路。`);
  } else if (outcome === 'success') {
    const find = rng.next();
    if (find < .36 + (hasGear(player, 'gear_lens') ? .10 : 0) + (gearPieceSystems(player, 4).length ? .08 : 0) + Math.min(.25, affixTotal(player, 'loot_pct'))) {
      giveItem(player, chooseRoomLoot(player), result);
      result.consequences.push('你顺着房间的细节找到一件能带走的东西。');
    } else if (find < .50) {
      player.stats.clues++;
      addChange(result, 'clues', 1);
      result.consequences.push('你留下了一条能打开后续道路的线索。');
    } else {
      player.statuses = uniqueAdd(player.statuses, '专注');
      result.consequences.push('获得“专注”，下一次再动手时手会更稳。');
    }
  } else if (outcome === 'fail') {
    const mark = pick(['泥水脚印', '可疑刮痕', '残留气味']);
    const status = pick(['暴露', '疲惫', '动摇']);
    player.statuses = uniqueAdd(player.statuses, status);
    player.marks = uniqueAdd(player.marks, mark);
    result.consequences.push(`留下“${mark}”并获得“${status}”，之后的危险更容易找到你。`);
  } else if (outcome === 'critical') {
    // 大失败不再同时奉送诅咒 + 受伤 + 伤势三件套；改为二选一，避免状态堆叠造成螺旋。
    if (rng.next() < .5) {
      const curse = pick(['耳语', '倒影', '空腹']);
      player.curses = uniqueAdd(player.curses, curse);
      result.consequences.push(`获得诅咒“${curse}”。`);
    } else {
      player.statuses = uniqueAdd(player.statuses, '受伤');
      player.injuries = uniqueAdd(player.injuries, pick(['暗创', '裂伤', '寒毒']));
      result.consequences.push('获得状态“受伤”并留下伤势。');
    }
    if (player.inventory.length && rng.next() < .22) {
      const lost = pick(player.inventory);
      player.inventory = player.inventory.filter(item => item.uid !== lost.uid);
      result.consequences.push(`混乱中失去道具“${ITEMS[lost.id].name}”。`);
    }
  } else {
    if (rng.next() < .48) {
      const rareId = pick(['resonance', 'moonCompass', 'starKey']);
      giveItem(player, rareId, result);
    } else {
      player.flags = uniqueAdd(player.flags, pick(['bookshelf', 'ladderMark', 'gardenRoute']));
      result.consequences.push('一个前置事件被意外完成，新的路线可能在之后出现。');
    }
  }
}

async function resolveNormalAction(player, intent, result) {
  const entry = intent.entry;
  /* 临时状态按全局行动序号过期；再把积累层数折成本次行动真正生效的加成。 */
  expireBuffs(player);
  prepareGearMechanics(player, entry, result);
  const healthBefore = player.stats.health;
  const item = itemByUid(player, intent.itemUid);
  const feedback = feedbackForAction(entry.kind);
  const roomVoice = ROOM_VOICE[player.room] || ROOM_VOICE.corridor;
  const viewer = state.players.find(candidate => candidate.control === 'human' && candidate.room === player.room);
  if (viewer && audio.action) audio.action(feedback.sfx, viewer.index);
  sealFeedback(result, {
    animationId: feedback.animation,
    sfxProfile: feedback.sfx,
    roomVoice: roomVoice.tone,
    affectedStats: estimateDelta(player, entry, item).map(([key]) => key),
    maxDelta: 1
  });
  await animateActor(player.index, feedback.animation, reducedMotion || state.headless ? 0 : 760);
  const rolled = rollOutcome(player, entry, item);
  let outcome = rolled.outcome;
  if (outcome === 'fail' && systemTier(player, 'fate') >= 3 && !player.fateUsedThisRound && player.stats.sanity > 1) {
    player.fateUsedThisRound = true;
    applyChanges(player, [['sanity', -1]], result);
    outcome = 'success';
    result.consequences.push('断针怀表改写了失败，但取走了一点理智。');
  }
  result.outcome = outcome;
  /* 体系独特机制：成功走猎意 / 碎壁 / 星迹 / 商誉，失败走逆命。 */
  gearMechanicForOutcome(player, entry, outcome, result);
  result.title = {
    great: pick(['黑暗先眨了眼', '你抓住了最短的一瞬']),
    success: pick(['房间让出了一点秘密', '代价没有立刻追上来']),
    fail: pick(['某个细节背叛了你', '脚步声突然多了一次']),
    critical: pick(['陷阱合拢了', '你把东西留在了黑暗里']),
    special: pick(['规则临时改变', '另一个故事插了进来'])
  }[outcome];
  const voiceLine = pick(feedback.lines);
  result.story = `${voiceLine}${pick(STORY[outcome])} 你选择了“${entry.text}”。${roomVoice.note}`;
  if (rolled.talentNote) result.consequences.push(rolled.talentNote);
  if (rolled.passiveUid) {
    const passive = itemByUid(player, rolled.passiveUid);
    if (passive) {
      result.consequences.push(`${ITEMS[passive.id].name}在这一步替你稳住了身形。`);
      useAndMaybeBreakItem(player, passive, result);
    }
  }
consequenceFor(player, outcome, result, entry);
  // 数值延后落账：先出故事，约 0.6 秒后才允许变化条出现（renderResult 读 pendingChanges）。
  const staged = buildRandomChanges(outcome, entry);
  applyChanges(player, staged, null);
  applyTalentAfterAction(player, entry, outcome, result, healthBefore);
  if (['success', 'great'].includes(outcome)) {
    if (systemTier(player, 'astral') >= 2 && entry.tags?.includes('search') && !player.astralUsedThisRound) {
      player.astralUsedThisRound = true;
      applyChanges(player, [['clues', 1]], result);
      result.consequences.push('星迹指出另一条线索。');
    }
    if (systemTier(player, 'market') >= 1 && entry.tags?.includes('search') && !player.marketUsedThisRound) {
      player.marketUsedThisRound = true;
      applyChanges(player, [['clues', 1]], result);
      result.consequences.push('商会装备将搜寻所得折成一条可交易的线索。');
    }
    if (systemTier(player, 'dawn') >= 2 && entry.tags?.includes('heal')) {
      applyChanges(player, [['sanity', 1]], result);
      result.consequences.push('晨誓稳住了一点理智。');
    }
    if (systemTier(player, 'breach') >= 2 && entry.tags?.includes('force')) {
      applyChanges(player, [['stamina', 1]], result);
      result.consequences.push('破城的势头让你回了一点体力。');
    }
    /* 【msg8 §9】探索成功也给金币，且随回合略增，呼应「探索金钱获得会多」。 */
    if (['search', 'sneak', 'mystery', 'explore'].some(t => entry.tags?.includes(t))) {
      const goldGain = 8 + Math.floor((state.round || 1) / 2);
      player.gold = (player.gold || 0) + goldGain;
      result.consequences.push(`探索中你摸到 ${goldGain} 枚散落的金币（将计入总分）。`);
    }
  }
  result.pendingChanges = staged;
  result.feedback.changesPending = true;
  result.feedback.deferMs = 600;
  if (item) useAndMaybeBreakItem(player, item, result);
  if (player.travelNotes.length) {
    result.consequences.unshift(...player.travelNotes);
    player.travelNotes = [];
  }
  if (outcome === 'great' || outcome === 'success') {
    if (viewer && audio.success) audio.success(viewer.index);
  } else if (outcome === 'fail' || outcome === 'critical') {
    if (viewer && audio.fail) audio.fail(viewer.index);
  }
}

async function resolveCleanseAction(player, intent, result) {
  const entry = intent.entry;
  const viewer = state.players.find(candidate => candidate.control === 'human' && candidate.room === player.room);
  const item = itemByUid(player, intent.itemUid) || chooseBestItem(player, entry);
  const hero = HEROES[player.hero];
  // 莫斯天赋「孢子调和」：净化时额外多清除一个负面状态或诅咒。
  const extraCleanse = hero?.talent?.id === 'sporeBlend' ? 1 : 0;
  const negative = new Set(['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧']);
  const removedStatuses = player.statuses.filter(status => negative.has(status));
  const removedCurses = player.curses.slice(0, 2 + extraCleanse);
  player.statuses = player.statuses.filter(status => !negative.has(status));
  player.curses = player.curses.slice(removedCurses.length);
  player.injuries = [];
  applyChanges(player, [['health', 2], ['stamina', 1]], result);
  result.outcome = 'great';
  result.title = '鸦羽疗愈龛收走了附着的阴影';

  // 黑羽医师的逐字对话：中文每字 28–36ms，标点留白，说话时环境音压低。
  const healerLines = [
    '把呼吸放慢。这里不接受急的人。',
    '银线缝不上你自己扯开的裂口。',
    `你已经背着${removedCurses.length || '几'}样东西走了很久。`
  ];
  const healerLine = pick(healerLines);
  result.story = `${healerLine}黑羽医师用银线缝合看不见的裂口。大部分负面状态与诅咒从呼吸中脱落。`;
  sealFeedback(result, {
    animationId: 'using',
    sfxProfile: 'use',
    dialogueMode: 'typed',
    speaker: '黑羽医师',
    lines: [healerLine],
    emphasisSegments: removedCurses.map(curse => `诅咒 · ${curse}`),
    duration: estimateSpeechMs(healerLine),
    skipBehavior: 'instant',
    affectedStats: ['health', 'stamina'],
    maxDelta: 2,
    changesPending: true,
    deferMs: 600
  });
  result.pendingChanges = [['health', 2], ['stamina', 1]];
  if (extraCleanse) result.consequences.push(`${hero.talent.name}额外清除了 1 项附着物。`);
  result.consequences.push(`净化 ${removedStatuses.length} 个负面状态与 ${removedCurses.length} 个诅咒，并恢复生命与体力。`);
  if (rng.next() < .28) {
    const recoveredGear = chooseSystemLoot(player);
    if (giveItem(player, recoveredGear, result)) result.consequences.push(`疗愈龛的灰烬里还藏着${ITEMS[recoveredGear].name}。`);
  }
  if (item && item.uid !== intent.itemUid) {
    result.consequences.push(`${ITEMS[item.id].name}抵消了净化过程中的残余负面影响。`);
    useAndMaybeBreakItem(player, item, result);
  } else if (item) {
    result.consequences.push(`${ITEMS[item.id].name}在净化中被消耗。`);
    useAndMaybeBreakItem(player, item, result);
  }
  if (viewer) {
    if (audio.action) audio.action('use', viewer.index);
    if (audio.speak) audio.speak(healerLine, viewer.index);
    await animateActor(player.index, 'using', reducedMotion || state.headless ? 0 : 620);
    if (audio.success) audio.success(viewer.index);
  }
}

async function resolveRewardAction(player, intent, result) {
  const item = itemByUid(player, intent.itemUid);
  const validRelic = item && ITEMS[item.id].category === 'relic' && ITEMS[item.id].useTags.includes('reward');
  const viewer = state.players.find(candidate => candidate.control === 'human' && candidate.room === player.room);
  if (viewer) addStageEffect(viewer.index, 'reward-burst', 1200);
  if (viewer && audio.reward) audio.reward(viewer.index);
  await animateActor(player.index, 'rewarding', reducedMotion || state.headless ? 0 : 900);
  /* 【msg8 §9】金币类奖励真正累积金币（此前全文件从未给 player.gold 赋值，导致金币永远计 0 分）。 */
  if (intent.entry.tags && intent.entry.tags.includes('gold')) {
    /* 【msg8 §9】不同金钱来源给不同加值：流金密室最丰，其它 gold 标记来源次之。 */
    const GOLD_BY_ENTRY = { '取走流金': 40 };
    const goldGain = GOLD_BY_ENTRY[intent.entry.text] || 25;
    player.gold = (player.gold || 0) + goldGain;
    result.consequences.push(`流金顺着指缝淌进怀里，你攒下 ${goldGain} 枚金币（将计入总分）。`);
  }
  if (validRelic) {
    result.outcome = 'great';
    result.title = `${ITEMS[item.id].name}叫醒了更深的那一层`;
    result.story = '第一层光芒退开之后，真正的机关从墙体里升起来。遗物与这间房认出了彼此，金光顺着符文一路淌进你的行囊。';
    const main = pick(['strength', 'agility', 'perception', 'sanity', 'luck', 'intimidation', 'stealth']);
    const secondary = pick(['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth'].filter(key => key !== main));
    // 大型奖励池：一项核心属性大幅跃升 + 一项副属性 + 生命 / 理智 + 钥匙与线索各一份 + 一件遗物。
    // 奖励房依旧是全场景唯一允许同一核心属性一次抬两格的地方 —— 但文案里只说"房间在给你"。
    const changes = [[main, rand(1, 2)], [secondary, 1], ['health', rand(1, 2)], ['sanity', 1], ['keys', 1], ['clues', 2]];
    applyChanges(player, changes, result);
    giveItem(player, pick(['resonance', 'moonCompass', 'starKey']), result);
    const washed = player.statuses.filter(status => ['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧'].includes(status));
    if (washed.length) {
      player.statuses = player.statuses.filter(status => !washed.includes(status));
      result.consequences.push(`顺带把「${washed.join('、')}」从你身上摘了下来。`);
    }
    result.consequences.push('它认得这里，所以最深的一层为你打开了。');
    sealFeedback(result, {
      animationId: 'rewarding', sfxProfile: 'reward', roomVoice: ROOM_VOICE.reward.tone,
      affectedStats: changes.map(([key]) => key), maxDelta: 2,
      changesPending: true, deferMs: 600
    });
    result.pendingChanges = changes;
    useAndMaybeBreakItem(player, item, result);
  } else {
    // 没有遗物也必须"值得绕这一趟"：至少两项变化（一项属性 + 一项资源），并且必定带走一件实物。
    result.outcome = 'success';
    result.title = '最外面的一层还是让了步';
    result.story = '深处的机关没有认出任何遗物，可它似乎也不愿意让走到这里的人空着手离开。金光收拢成一小束，落进你怀里。';
    const statKey = pick(['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth']);
    const resourceKey = pick(['keys', 'clues']);
    const changes = [[statKey, 1], [resourceKey, 1]];
    const gift = chooseRoomLoot(player);
    if (canCarryItem(player, gift)) {
      giveItem(player, gift, result);
      result.consequences.push(`墙上的凹槽里还留着一件${ITEMS[gift].name}，像是替你留的。`);
    } else {
      changes.push(['keys', 1]);
      result.consequences.push(`${fullBagReason(gift)}，房间把这份心意折成一把钥匙塞进你手心。`);
    }
    applyChanges(player, changes, result);
    const washed = player.statuses.filter(status => ['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧'].includes(status));
    if (washed.length) {
      const gone = washed[0];
      player.statuses = player.statuses.filter(status => status !== gone);
      result.consequences.push(`顺带把「${gone}」从你身上摘了下来。`);
    } else if (player.curses.length) {
      const curse = player.curses[0];
      player.curses = player.curses.slice(1);
      result.consequences.push(`顺带把附着在身上的「${curse}」洗掉了。`);
    }
    result.consequences.push('最里面那一层仍然沉默着 —— 它需要一件认得这里的遗物。');
    sealFeedback(result, {
      animationId: 'rewarding', sfxProfile: 'reward', roomVoice: ROOM_VOICE.reward.tone,
      affectedStats: changes.map(([key]) => key), maxDelta: 1, changesPending: true, deferMs: 600
    });
    result.pendingChanges = changes;
  }
}

/* 【msg8 §6】奖励房固定三选项之一：在泉眼边直接回满 3 点体力，并顺手摘掉一项负面状态。 */
async function resolveRewardHealAction(player, intent, result) {
  const viewer = state.players.find(candidate => candidate.control === 'human' && candidate.room === player.room);
  if (viewer && audio.reward) audio.reward(viewer.index);
  await animateActor(player.index, 'rewarding', reducedMotion || state.headless ? 0 : 700);
  const changes = [['stamina', 3]];
  applyChanges(player, changes, result);
  const bad = ['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧'].find(status => player.statuses.includes(status));
  if (bad) {
    player.statuses = player.statuses.filter(status => status !== bad);
    result.consequences.push(`顺带把「${bad}」从你身上摘了下来。`);
  }
  result.outcome = 'success';
  result.title = '泉水漫过伤口，三口气回来了';
  result.story = '你在泉眼边坐下，水流漫过伤口，三口气一点点回到了胸口。';
  result.pendingChanges = changes;
  sealFeedback(result, {
    animationId: 'rewarding', sfxProfile: 'reward', roomVoice: ROOM_VOICE.reward.tone,
    affectedStats: ['stamina'], maxDelta: 3, changesPending: true, deferMs: 600
  });
  const used = itemByUid(player, intent.itemUid);
  if (used) useAndMaybeBreakItem(player, used, result);
}

function resolveQuietGuard(player, intent, result) {
  player.statuses = uniqueAdd(player.statuses, '戒备');
  player.protection = Math.max(player.protection, 1);
  const defenseItem = findDefenseItem(player, intent?.itemUid);
  result.outcome = 'success';
  result.title = '防线建立，但这一刻无人出手';
  result.story = '你让呼吸与墙后的滴水同步，守住每一个可能接近的角度。防护道具一直扣在掌心，没有真正用出去，也就没有留下磨损。';
  result.consequences.push('获得“戒备”状态；未遭到攻击，防护道具既未消耗也未损坏。');
  if (defenseItem) result.consequences.push(`${ITEMS[defenseItem.id].name}已经扣在掌心，随时可以反制下一次攻击。`);
  sealFeedback(result, { animationId: 'using', sfxProfile: 'guard', roomVoice: (ROOM_VOICE[player.room] || ROOM_VOICE.corridor).tone, affectedStats: ['perception'], maxDelta: 1 });
}

/* ---------------------------------------------------------------------------
 * 主动道具的真实结算
 * ---------------------------------------------------------------------------
 */
function removeStatuses(player, list, result) {
  const removed = player.statuses.filter(status => list.includes(status));
  player.statuses = player.statuses.filter(status => !list.includes(status));
  if (removed.length) result.consequences.push(`移除状态：${removed.join('、')}。`);
  return removed;
}

function roomDanger(roomId) {
  const order = ['bedroom', 'corridor', 'storage', 'kitchen', 'hall', 'attic', 'basement', 'garden', 'library', 'chapel', 'clock', 'secret'];
  const index = order.indexOf(roomId);
  return index < 0 ? '未知' : ['极低', '低', '低', '中等', '中等', '中等', '偏高', '偏高', '偏高', '高', '极高', '极高'][index];
}

function applyItemEffect(player, item, result, opts = {}) {
  const def = ITEMS[item.id];
  const effect = def.effect || {};
  const target = opts.targetId ? state.players.find(candidate => candidate.id === opts.targetId) : null;
  switch (effect.kind) {
    case 'attackDart':
      if (!target || target.room !== player.room || target.collapsed) return false;
      if (target.protection > 0) {
        target.protection--;
        result.consequences.push(`${target.label}的防护挡住飞刃，但消耗了一层保护。`);
        return true;
      }
      const shield = findDefenseItem(target);
      if (shield && ITEMS[shield.id].autoProtect) {
        useAndMaybeBreakItem(target, shield, null);
        applyReactiveSuccess(target, player, shield, result);
        result.consequences.push(`${target.label}的${ITEMS[shield.id].name}挡开飞刃。`);
        return true;
      }
      applyChanges(target, [['health', -2]], null);
      target.statuses = uniqueAdd(target.statuses, '暴露');
      result.consequences.push(`飞刃击中${target.label}，其生命受损，行踪也暴露了。`);
      return true;
    case 'shockBurst': {
      const victims = state.players.filter(other => other.id !== player.id && other.room === player.room && !other.collapsed);
      if (!victims.length) return false;
      victims.forEach(other => {
        if (other.protection > 0) {
          other.protection--;
          applyChanges(other, [['stamina', -1]], null);
        } else applyChanges(other, [['stamina', -2], ['health', -1]], null);
        other.statuses = uniqueAdd(other.statuses, '暴露');
      });
      applyChanges(player, [['sanity', -1]], result);
      result.consequences.push(`雷鸣震倒了同房的${victims.map(other => other.label).join('、')}；你的耳中也响了很久。`);
      return true;
    }
    case 'gardenPath':
      player.flags = uniqueAdd(player.flags, 'gardenRoute');
      applyChanges(player, [['stamina', 2]], result);
      result.consequences.push('种子攀上门框，花园的路从此向你敞开；枝叶替你缓了一口气。');
      return true;
    case 'fortify':
      player.protection = Math.max(player.protection, 1);
      player.statuses = uniqueAdd(player.statuses, '戒备');
      removeStatuses(player, ['动摇'], result);
      result.consequences.push('赤色封印立起一层防护，你定住了慌乱。');
      return true;
    case 'paintPath':
      applyChanges(player, [['clues', 1]], result);
      player.flags = uniqueAdd(player.flags, 'bookshelf');
      result.consequences.push('彩墨在墙上流出一条线索，书架背后的暗路被记下。');
      return true;
    case 'dreamMend':
      if (player.curses.length) {
        const curse = player.curses.shift();
        result.consequences.push(`丝线缠住「${curse}」，把这道诅咒带走。`);
      } else {
        applyChanges(player, [['sanity', 2]], result);
        result.consequences.push('你在梦里找回平稳的呼吸，理智得到恢复。');
      }
      return true;
    case 'rations':
      applyChanges(player, [['stamina', 3], ['health', 1]], result);
      result.consequences.push('口粮让你重新站稳，伤口也不再发冷。');
      return true;
    case 'mothGuide':
      applyChanges(player, [['clues', 1]], result);
      player.statuses = uniqueAdd(player.statuses, '路线优势');
      result.consequences.push('玻璃蛾撞向一处细缝，留下一条线索；下一步你知道该从哪里靠近。');
      return true;
    case 'saltWard':
      if (player.curses.length) {
        const curse = player.curses.shift();
        result.consequences.push(`盐圈吸走「${curse}」。`);
      }
      removeStatuses(player, ['暴露', '恐惧'], result);
      player.statuses = uniqueAdd(player.statuses, '戒备');
      result.consequences.push('盐粒在脚边围成一圈，你的踪迹和惧意淡了下去。');
      return true;
    case 'springWind':
      applyChanges(player, [['stamina', 2]], result);
      player.statuses = uniqueAdd(player.statuses, '专注');
      result.consequences.push('发条重新咬合。你恢复体力，下一步更能抓准时机。');
      return true;
    case 'heal':
      applyChanges(player, [['health', effect.health]], result);
      removeStatuses(player, effect.removeStatuses || [], result);
      result.consequences.push(`${def.name}让血止住了。`);
      return true;
    case 'restore': {
      const vitals = effect.vital === 'all' ? ['health', 'stamina', 'sanity'] : [effect.vital];
      applyChanges(player, vitals.map(key => [key, effect.amount]), result);
      result.consequences.push(`${def.name}恢复了${vitals.map(key => STAT_LABEL[key]).join('、')}。`);
      return true;
    }
    case 'soothe':
      applyChanges(player, [['sanity', effect.sanity]], result);
      removeStatuses(player, effect.removeStatuses || [], result);
      result.consequences.push(`${def.name}把呼吸压回正常频率。`);
      return true;
    // —— 六件基础道具的"当场看得见"的效果 ——
    case 'openLock': {
      // 立刻撬开一只旧锁：拿到一把钥匙；钥匙够多时换成一条线索。
      if (player.stats.keys < 4) {
        player.stats.keys++;
        addChange(result, 'keys', 1);
        result.consequences.push(`${def.name}在锁孔里崩掉一颗锈齿，锁舌还是弹开了。你手里多了一把钥匙。`);
      } else {
        player.stats.clues++;
        addChange(result, 'clues', 1);
        result.consequences.push(`${def.name}撬开的是一只空箱，箱底压着一条别人留下的线索。`);
      }
      return true;
    }
    case 'pick': {
      player.stats.clues++;
      addChange(result, 'clues', 1);
      const cleared = removeStatuses(player, ['暴露'], result);
      result.consequences.push(`${def.name}挑开一只暗格，里头藏着一条线索${cleared.length ? '，顺手把你留在明处的痕迹抹掉了' : ''}。`);
      return true;
    }
    case 'light': {
      const cleared = removeStatuses(player, ['暴露', '恐惧', '动摇'], result);
      if (cleared.length) {
        result.consequences.push(`${def.name}亮起来，${cleared.join('、')}被光从你身上赶了出去。`);
        return true;
      }
      player.stats.clues++;
      addChange(result, 'clues', 1);
      result.consequences.push(`${def.name}把房间角落照亮，你看见一条之前一直没注意到的线索。`);
      return true;
    }
    case 'mark': {
      player.stats.clues++;
      addChange(result, 'clues', 1);
      player.statuses = uniqueAdd(player.statuses, '专注');
      result.consequences.push(`${def.name}在墙上留下一道星纹，房间替你记住了这条路。你握到一条线索，心也跟着定了下来。`);
      return true;
    }
    case 'shortcut': {
      const reachable = (GRAPH[player.room] || []).map(([dest]) => dest)
        .filter(dest => NORMAL_ROOM_IDS.includes(dest) && dest !== player.room);
      if (!reachable.length) {
        result.consequences.push(`${def.name}甩出去却没勾住任何东西，这次没有跨过去。`);
        return false;
      }
      const from = player.room;
      const dest = pick(reachable);
      window.NightCrownWorld.relocate(player, dest, 'forced');
      result.consequences.push(`${def.name}勾住高处，把你从${ROOM_BY_ID[from].name}直接拽进了${ROOM_BY_ID[dest].name}。`);
      sealFeedback(result, { animationId: 'searching', sfxProfile: 'use' });
      return true;
    }
    case 'teleport': {
      if (!target || effect.forbidRooms?.includes(target.room)) {
        result.consequences.push('传送目标已经不在合法位置，卷轴原地烧尽。');
        return false;
      }
      const from = player.room;
      window.NightCrownWorld.relocate(player, target.room, 'forced');
      result.consequences.push(`${def.name}把你从${ROOM_BY_ID[from].name}直接拽到${ROOM_BY_ID[target.room].name}，${target.label}的位置同时暴露。`);
      sealFeedback(result, { animationId: 'searching', sfxProfile: 'use' });
      return true;
    }
    case 'warpRoom': {
      const from = player.room;
      window.NightCrownWorld.relocate(player, effect.dest, 'forced');
      result.consequences.push(`${def.name}把你从${ROOM_BY_ID[from].name}带到${ROOM_BY_ID[player.room].name}。`);
      return true;
    }
    case 'huntWarp': {
      const targets = state.players.filter(other => other.id !== player.id && !other.collapsed && NORMAL_ROOM_IDS.includes(other.room));
      if (!targets.length) { result.consequences.push('罗盘没有找到仍在场的目标。'); return false; }
      const target = pick(targets);
      window.NightCrownWorld.relocate(player, target.room, 'forced');
      result.consequences.push(`${def.name}把你送到${target.label}附近的${ROOM_BY_ID[target.room].name}。`);
      return true;
    }
    case 'escapeWarp': {
      const occupied = new Set(state.players.filter(other => other.id !== player.id && !other.collapsed).map(other => other.room));
      const pool = NORMAL_ROOM_IDS.filter(id => id !== player.room && !occupied.has(id));
      const dest = pick(pool.length ? pool : NORMAL_ROOM_IDS.filter(id => id !== player.room));
      window.NightCrownWorld.relocate(player, dest, 'forced');
      player.incomingStealPenalty = Math.max(player.incomingStealPenalty || 0, .18);
      result.consequences.push(`${def.name}让你脱身，来到${ROOM_BY_ID[dest].name}。`);
      return true;
    }
    /* 【msg8 §24】风信标 / 时砂漏：本回合脱身护持。 */
    case 'windWard': {
      const gain = effect.agility || 1;
      player.stats.agility = (player.stats.agility || 0) + gain;
      addChange(result, 'agility', gain);
      player.incomingStealPenalty = Math.max(player.incomingStealPenalty || 0, effect.lowerIncoming || .5);
      result.consequences.push(`${def.name}扬起一阵风：下次被夺更难得手，敏捷 +${gain}。`);
      return true;
    }
    case 'clockEscape': {
      const occupied = new Set(state.players.filter(other => other.id !== player.id && !other.collapsed).map(other => other.room));
      const pool = NORMAL_ROOM_IDS.filter(id => id !== player.room && !occupied.has(id));
      const dest = pick(pool.length ? pool : NORMAL_ROOM_IDS.filter(id => id !== player.room));
      window.NightCrownWorld.relocate(player, dest, 'forced');
      player.incomingStealPenalty = Math.max(player.incomingStealPenalty || 0, effect.lowerIncoming || .6);
      result.consequences.push(`${def.name}让你离开${ROOM_BY_ID[player.room].name}，来到${ROOM_BY_ID[dest].name}；本回合被夺更难下手。`);
      return true;
    }
    case 'returnHome': {
      const from = player.room;
      window.NightCrownWorld.relocate(player, player.homeRoom, 'forced');
      result.consequences.push(`${def.name}把你送回${ROOM_BY_ID[player.homeRoom].name}（原在${ROOM_BY_ID[from].name}）。`);
      return true;
    }
    case 'smoke':
      player.incomingStealPenalty = Math.max(player.incomingStealPenalty || 0, effect.lowerIncoming);
      player.flags = uniqueAdd(player.flags, 'smokeCover');
      if (player.room !== 'dungeon' && player.room !== 'reward' && state.players.some(other => other.id !== player.id && other.room === player.room && !other.collapsed)) {
        const occupied = new Set(state.players.filter(other => other.id !== player.id && !other.collapsed).map(other => other.room));
        const destinations = NORMAL_ROOM_IDS.filter(id => id !== player.room && !occupied.has(id));
        const destination = pick(destinations.length ? destinations : NORMAL_ROOM_IDS.filter(id => id !== player.room));
        window.NightCrownWorld.relocate(player, destination, 'forced');
        result.consequences.push(`${def.name}掩护你离开同房冲突，来到${ROOM_BY_ID[destination].name}；下一次被夺取也更难得手。`);
      } else result.consequences.push(`${def.name}遮住行踪，下一次伸向你的手更难得手。`);
      return true;
    case 'scout': {
      const unknown = (player.blocked || [])[0] || null;
      const pickRoom = unknown ? unknown.id : pick(NORMAL_ROOM_IDS.filter(id => id !== player.room));
      player.scoutInfo = { room: pickRoom, danger: roomDanger(pickRoom) };
      result.consequences.push(`${def.name}回传了一声很轻的回响：${ROOM_BY_ID[pickRoom].name} · 危险等级 ${roomDanger(pickRoom)}。`);
      sealFeedback(result, { animationId: 'using', sfxProfile: 'search' });
      return true;
    }
    case 'ward':
      player.wardCharges += effect.preventsJail;
      result.consequences.push(`${def.name}立在你身后：下一次失败不会把你送进地牢。`);
      return true;
    case 'shortenJail':
      shortenJail(player, result, `使用${def.name}`);
      return true;
    case 'swap': {
      if (!target || target.room !== player.room) {
        result.consequences.push('交换契约需要一名同房目标，这次没有成立。');
        return false;
      }
      const mine = player.inventory.filter(candidate => ITEMS[candidate.id].category !== 'relic')[0];
      const theirs = target.inventory.filter(candidate => ITEMS[candidate.id].category !== 'relic')[0];
      if (!mine || !theirs) {
        result.consequences.push('双方必须各有一件非遗物道具，交换契约这次没能成立。');
        return false;
      }
      const canSwap = (receiver, outgoing, incoming) => {
        const group = itemCapacityGroup(incoming.id);
        return group === 'relic' || bagCounts(receiver)[group] - (itemCapacityGroup(outgoing.id) === group ? 1 : 0)
          < (group === 'system' ? BAG_CAPACITY : OTHER_ITEM_CAPACITY);
      };
      if (!canSwap(player, mine, theirs) || !canSwap(target, theirs, mine)) {
        result.consequences.push('交换后有一方的同类道具会超出上限，契约没有成立。');
        return false;
      }
      player.inventory = player.inventory.filter(candidate => candidate.uid !== mine.uid);
      target.inventory = target.inventory.filter(candidate => candidate.uid !== theirs.uid);
      player.inventory.push(theirs);
      target.inventory.push(mine);
      result.consequences.push(`与${target.label}交换：你付出${ITEMS[mine.id].name}，换得${ITEMS[theirs.id].name}。`);
      return true;
    }
    case 'inspectCurse': {
      const curse = player.curses[0];
      if (!curse) { result.consequences.push('你没有诅咒需要查看。'); return false; }
      const info = CURSE_TABLE[curse] || { note: '效果不明。' };
      player.curses = player.curses.slice(1);
      result.consequences.push(`${def.name}照出「${curse}」的真实效果：${info.note} 镜片当场烧毁，诅咒随之解除。`);
      return true;
    }
    case 'passive':
      result.consequences.push(`${def.name}是装备类道具，持续生效，不需要主动使用。`);
      return false;
    default:
      result.consequences.push(`${def.name}在当前情境下没有产生额外效果。`);
      return false;
  }
}

async function resolveItemAction(player, intent, result) {
  const item = itemByUid(player, intent.itemUid);
  const viewer = state.players.find(candidate => candidate.control === 'human' && candidate.room === player.room);
  if (!item) {
    result.outcome = 'fail';
    result.title = '道具已经不在行囊里';
    result.story = '你伸手去拿，只摸到空的布面——它在上一个行动里已经碎掉了。';
    result.consequences.push('同一次行动里损坏的道具不会被第二次消耗。');
    return;
  }
  const def = ITEMS[item.id];
  if (viewer && audio.action) audio.action('use', viewer.index);
  await animateActor(player.index, 'using', reducedMotion || state.headless ? 0 : 560);
  const ok = applyItemEffect(player, item, result, { targetId: intent.targetId });
  result.outcome = ok ? 'great' : 'fail';
  result.title = ok ? `你使用了${def.name}` : `${def.name}没有生效`;
  result.story = ok
    ? `${def.name}的效果立刻发生，房间对这次改变做出了反应。`
    : '道具被取出，但条件没有满足，它又回到了行囊里。';
  sealFeedback(result, {
    animationId: 'using', sfxProfile: 'use',
    roomVoice: (ROOM_VOICE[player.room] || ROOM_VOICE.corridor).tone,
    affectedStats: [], maxDelta: 2
  });
  if (ok) {
    if (HEROES[player.hero]?.talent?.id === 'colorKeeper' && item.id === 'paintVial') {
      applyChanges(player, [['clues', 1]], result);
      result.consequences.push('调色匣让画中的暗线变得更清楚，你又发现一条线索。');
    }
    useAndMaybeBreakItem(player, item, result);
  }
}

/* ---------------------------------------------------------------------------
 * NPC 对话结算
 * ---------------------------------------------------------------------------
 */
function npcCheckTarget(player, choice) {
  const hero = HEROES[player.hero];
  const itemHit = getMatchingItemsByTags(player, choice.usesItem || []);
  const itemBonus = itemHit.length ? Math.max(...itemHit.map(entry => ITEMS[entry.id].bonus)) : 0;
  const relation = relationOf(player, choice.npcId);
  const relationBonus = relation.value >= 3 ? 1.2 : relation.value >= 1 ? .6 : relation.value <= -2 ? -1.2 : 0;
  const penalty = player.statuses.includes('受伤') ? .7 : 0;
  const talkGear = gearPieceSystems(player, 3).some(system => GEAR_SYSTEMS[system].stat === choice.stat) ? .6 : 0;
  const darkAccess = choice.id?.includes('gear-offer-eclipse') && player.inventory.length <= 3 && player.stats.intimidation <= 6 ? 2 : 0;
  /* 对话检定与普通检定用同一套「属性 / 难度」曲线，
     否则属性长大之后所有话题都会自动成功。关系、道具、话题装备仍然各自加分。 */
  const difficulty = roomDifficulty(player, { risk: choice.risk }) * 1.05;
  const score = ratioScore(effectiveStat(player, choice.stat), difficulty, 3)
    + ratioScore(effectiveStat(player, 'luck'), difficulty, .6)
    + itemBonus * .12 + relationBonus * .15 + talkGear * .12 + darkAccess * .2
    - penalty * .15 + rand(-3, 3) / 10;
  const threshold = Number.isFinite(Number(choice.check)) ? Number(choice.check) : CHECK_SUCCESS;
  return { success: score >= threshold, score, threshold, itemHit, relation };
}

function resolveGearNpcTrade(player, npc, topic, result) {
  result.title = `${npc.name}：${topic.text}`;
  if (npcTopicLock(player, topic)) {
    result.outcome = 'fail'; result.story = '条件尚未满足，交易没有发生。'; return;
  }
  if (topic.id === 'market-contract') {
    if (player.stats.clues < 2) { result.outcome = 'fail'; result.story = '线索不够，商人没有签字。'; return; }
    applyChanges(player, [['clues', -2]], result);
    player.flags = uniqueAdd(player.flags, 'nightMarketContract');
    result.outcome = 'great'; result.story = '四件商会装备在契约上留下同一枚印记。秘密商店向你开放。';
    return;
  }
  if (topic.id === 'market-currency') {
    const payment = player.inventory.find(item => ITEMS[item.id]?.category === 'relic');
    if (!payment) { result.outcome = 'fail'; result.story = '行囊中没有可支付的关键遗物。'; return; }
    const system = Object.keys(GEAR_SYSTEMS).sort((a, b) => systemCount(player, b) - systemCount(player, a))[0];
    const id = chooseGearFromSystem(player, system, (ITEMS[payment.id].value || 1) >= 2);
    if (!canCarryItem(player, id)) { result.outcome = 'fail'; result.story = `${fullBagReason(id)}，商人暂时不收筹码。`; return; }
    player.inventory = player.inventory.filter(item => item.uid !== payment.uid);
    giveItem(player, id, result);
    result.outcome = 'great'; result.story = `你交出${ITEMS[payment.id].name}，商人交给你一件偏向${GEAR_SYSTEMS[system].name}的装备。`;
    return;
  }
  if (topic.id === 'market-epic' || topic.id === 'market-universal' || topic.id === 'market-relic') {
    let price = topic.id === 'market-epic' ? [['health', -2], ['clues', -3]]
      : topic.id === 'market-universal' ? [['sanity', -2], ['clues', -2]] : [['health', -3], ['keys', -1]];
    if (hasGear(player, 'gear_ledger')) price = price.map(([key, delta]) => [key, key === 'clues' ? Math.min(0, delta + 1) : delta]);
    if (systemTier(player, 'market') >= 3) price = price.map(([key, delta]) => [key, key === 'health' ? Math.min(0, delta + 1) : delta]);
    let id;
    if (topic.id === 'market-universal') id = hasGear(player, 'gear_prism') ? 'gear_dual' : 'gear_prism';
    else if (topic.id === 'market-relic') id = pick(['resonance', 'moonCompass', 'starKey']);
    else {
      const other = Object.keys(GEAR_SYSTEMS).filter(key => key !== 'market').sort((a, b) => systemCount(player, b) - systemCount(player, a))[0];
      id = chooseGearFromSystem(player, other, true);
    }
    if (!canCarryItem(player, id)) { result.outcome = 'fail'; result.story = `${fullBagReason(id)}，无法完成交易。`; return; }
    if (price.some(([key, delta]) => player.stats[key] < -delta)) { result.outcome = 'fail'; result.story = '支付不起价签上写的代价。'; return; }
    applyChanges(player, price, result);
    giveItem(player, id, result);
    result.outcome = 'great'; result.story = `夜市密柜收走了代价，交给你${ITEMS[id].name}。`;
    return;
  }
  const system = topic.id.slice('gear-offer-'.length);
  const check = npcCheckTarget(player, topic);
  if (!check.success) { result.outcome = 'fail'; result.story = '你听懂了线索，但还不足以让对方交出装备。'; return; }
  const exclusive = NPC_EXCLUSIVE_IDS[system];
  const id = exclusive && !hasGear(player, exclusive) && rng.next() < (systemCount(player, system) >= 3 ? .55 : .25)
    ? exclusive : chooseGearFromSystem(player, system, systemTier(player, system) >= 2);
  if (!canCarryItem(player, id)) { result.outcome = 'fail'; result.story = `${fullBagReason(id)}，无法收下装备。`; return; }
  const price = player.stats.clues > 0 ? [['clues', -1]] : [['health', -1]];
  applyChanges(player, price, result);
  giveItem(player, id, result);
  result.outcome = 'great';
  result.story = `${npc.name}看出你的${STAT_LABEL[GEAR_SYSTEMS[system].stat]}和装备正在形成${GEAR_SYSTEMS[system].name}路线，交给你${ITEMS[id].name}。`;
}

async function resolveNpcAction(player, intent, result) {
  const entry = intent.entry;
  const npc = NPCS[entry.npcId];
  const topic = npcTopicChoices(player, npc.id).find(candidate => candidate.id === entry.topicId);
  const viewer = state.players.find(candidate => candidate.control === 'human' && candidate.room === player.room);
  if (!topic) {
    result.outcome = 'fail';
    result.title = '对方把话题收了回去';
    result.story = `${npc.name}没有回应这个问题。`;
    return;
  }
  if (topic.id === 'dealer-lottery') {
    const payment = player.inventory.find(item => ITEMS[item.id]?.category === 'relic');
    result.title = `${npc.name}：关键遗物抽奖`;
    if (!payment) { result.outcome = 'fail'; result.story = '没有关键遗物作筹码。'; return; }
    const roll = Math.max(0, rng.next() - ((ITEMS[payment.id].value || 1) - 1) * .06);
    const id = roll < .16 ? chooseGearFromSystem(player, pick(Object.keys(GEAR_SYSTEMS)), true)
      : roll < .50 ? chooseVisibleSystemGear(player, player.turn.activeSlot)
        : roll < .80 ? pick(RECOVERY_IDS) : pick(['rustKey', 'ironRation', 'glassMoth']);
    if (!canCarryItem(player, id)) { result.outcome = 'fail'; result.story = `${fullBagReason(id)}，抽奖暂停，关键遗物没有扣除。`; return; }
    player.inventory = player.inventory.filter(item => item.uid !== payment.uid);
    giveItem(player, id, result);
    result.outcome = roll < .16 ? 'great' : roll >= .80 ? 'fail' : 'success';
    result.story = `你付出${ITEMS[payment.id].name}，抽中了${ITEMS[id].name}。抽奖可能赚，也可能亏。`;
    return;
  }
  if (topic.id.startsWith('gear-offer-') || topic.id.startsWith('market-')) {
    resolveGearNpcTrade(player, npc, topic, result);
    return;
  }
  const choice = { ...topic, npcId: npc.id };
  const check = npcCheckTarget(player, choice);
  // 有几条“结束对话”型话题只写了 success 分支。缺分支时必须回落到已有分支，
  // 绝不能让一条数据缺失把一整个行动点变成运行时异常。
  const branch = (check.success ? choice.success : choice.failure)
    || choice.success || choice.failure || { text: '', changes: [] };
  const lines = npc.greet;

  result.outcome = check.success ? 'great' : 'fail';
  result.title = `${npc.name}：${topic.text}`;
  result.story = [
    pick(lines),
    branch.text || ''
  ].filter(Boolean).join(' ');

  if (branch.changes?.length) {
    applyChanges(player, branch.changes, result);
    result.pendingChanges = branch.changes;
    result.feedback.changesPending = true;
    result.feedback.deferMs = 520;
  }
  if (branch.statuses?.length) for (const status of branch.statuses) player.statuses = uniqueAdd(player.statuses, status);
  if (branch.curses?.length) for (const curse of branch.curses) player.curses = uniqueAdd(player.curses, curse);
  if (branch.flags?.length) for (const flag of branch.flags) player.flags = uniqueAdd(player.flags, flag);
  if (branch.items?.length) for (const itemId of branch.items) giveItem(player, itemId, result);
  if (check.success && player.stats[choice.stat] >= 10) {
    const highStatReward = { healer: 'health', archivist: 'clues', cook: 'stamina', timekeeper: 'luck',
      jailer: 'stamina', gardener: 'health', mirrorChild: 'clues', relicDealer: 'clues' }[npc.id] || 'clues';
    applyChanges(player, [[highStatReward, 1]], result);
    result.consequences.push(`${STAT_LABEL[choice.stat]}足够突出，${npc.name}在原有结果外又给你一份${STAT_LABEL[highStatReward]}。`);
  }
  if (check.success && player.stats[choice.stat] >= 8 && NPC_SYSTEM[npc.id]) {
    const related = NPC_SYSTEM[npc.id];
    const tier = systemTier(player, related);
    if (tier >= 1) {
      const gain = tier >= 2 ? ['clues', 1] : ['stamina', 1];
      applyChanges(player, [gain], result);
      result.consequences.push(`${GEAR_SYSTEMS[related].name}装备让这段谈话多换来一份${STAT_LABEL[gain[0]]}。`);
    }
  }
  if (choice.cleanse) {
    const negative = new Set(['受伤', '疲惫', '动摇', '暴露', '虚弱', '恐惧']);
    const removed = player.statuses.filter(status => negative.has(status));
    player.statuses = player.statuses.filter(status => !negative.has(status));
    if (removed.length) result.consequences.push(`黑羽医师顺手带走了：${removed.join('、')}。`);
  }
  if (choice.shortenJail) shortenJail(player, result, npc.name);
  if (choice.trade) {
    const { give, take, cost } = choice.trade;
    if (give === 'relic') { /* 不可能出现，保留防御性分支 */ }
    let paid = false;
    if (check.success && cost && player.stats[give] >= cost) {
      player.stats[give] -= cost;
      addChange(result, give, -cost);
      paid = true;
    }
    if (paid) {
      const relicId = pick(['resonance', 'moonCompass', 'starKey']);
      giveItem(player, relicId, result);
      result.consequences.push(`交易成立：你交出了一部分${STAT_LABEL[give]}，换得${ITEMS[relicId].name}。`);
    } else {
      result.consequences.push(`交易没有成：${!check.success ? '对方没有同意' : `${STAT_LABEL[give]}不足`}。`);
    }
  }
  if (check.itemHit.length) {
    result.consequences.push(`${check.itemHit[0].id ? ITEMS[check.itemHit[0].id].name : ''}为这次对话提供了加成。`);
  }
  addRelation(player, npc.id, choice.rel || 0);
  const relationNow = relationOf(player, npc.id);
  result.consequences.push(`与${npc.name}的关系现在是「${relationNow.label}」。`);

  // 结算只讲结果，不讲判定过程：不写属性、不写修正、不写目标值。
  const judgeNote = check.success
    ? '这一句话你说到了它心里。'
    : (check.itemHit.length ? '它听完只是眨了眨眼，没有接话。' : '这句话落在了空处，它没有接。');
  result.consequences.push(judgeNote);
  sealFeedback(result, {
    animationId: 'using',
    sfxProfile: 'use',
    roomVoice: (ROOM_VOICE[player.room] || ROOM_VOICE.corridor).tone,
    dialogueMode: 'typed',
    speaker: npc.name,
    lines: [branch.text],
    duration: estimateSpeechMs(branch.text),
    affectedStats: (branch.changes || []).map(([key]) => key),
    maxDelta: 2
  });
  if (viewer) {
    if (audio.speak) audio.speak(branch.text, viewer.index);
    if (check.success) { if (audio.success) audio.success(viewer.index); }
    else if (audio.fail) audio.fail(viewer.index);
  }
}

/* ---------------------------------------------------------------------------
 * 一次行动点的结算（slot = 1 或 2）
 * ---------------------------------------------------------------------------
 * 明确队列顺序：先战斗，再非战斗；每个角色的行动只执行一次，
 * 绝不把同一角色的两次行动丢进同一个 Promise.all。
 */
async function runActionResolve(slot) {
  if (state.phase !== PHASES.actionSelect(slot)) return;
  /* 全局行动序号：持续效果、冷却、宽限期都按它计时，避免阶段内回合归 1 造成的错位。 */
  state.turnSerial = (state.turnSerial || 0) + 1;
  const dungeonAtStart = new Set(state.players.filter(player => player.room === 'dungeon' && player.dungeonActionsLeft > 0).map(player => player.id));
  state.phase = PHASES.actionResolve(slot);
  state.token++;
  renderAll();

  const completedBefore = new Set(state.players.filter(p => p.turn.slots[slot].resolved).map(p=>p.id));
  const results = state.players.map(player => {
    if (completedBefore.has(player.id)) return player.turn.slots[slot].result;
    const result = emptyResult('success', `${ROOM_BY_ID[player.room].name}留下了新的回声`);
    result.slot = slot;
    return result;
  });
  const inventoryBefore = state.players.map(player => player.inventory.map(item => ({ ...item, affixes: itemAffixes(item).map(affix => ({ ...affix })) })));
  const statsBefore = state.players.map(player => ({ ...player.stats }));

  const roomSnapshot = {};
  const activeSnapshot = {};
  for (const player of state.players) {
    roomSnapshot[player.id] = player.room;
    activeSnapshot[player.id] = !playerCannotAct(player);
  }

  // 1) 战斗：按 id 匹配目标，绝不用数组下标做身份。
  const combatIntents = [];
  for (const player of state.players) {
    const slotState = player.turn.slots[slot];
    if (!slotState?.confirmed || slotState.resolved || slotState.cancelled || !slotState.entry) continue;
    if (!activeSnapshot[player.id] || slotState.entry.kind !== 'attack') continue;
    const defender = state.players.find(candidate => candidate.id === slotState.entry.targetId);
    if (!defender || !activeSnapshot[defender.id]) {
      results[player.index].consequences.push('目标已经不在这一间房里，这次夺取没有发生。');
      continue;
    }
    if (roomSnapshot[player.id] !== roomSnapshot[defender.id]) {
      results[player.index].consequences.push('目标在你出手前已经离开，这次夺取没有发生。');
      continue;
    }
    slotState.entry.snapshotRoom = roomSnapshot[player.id];
    const spectatorCount = state.players.filter(candidate => activeSnapshot[candidate.id]
      && roomSnapshot[candidate.id] === roomSnapshot[player.id]
      && candidate.id !== player.id && candidate.id !== defender.id).length;
    combatIntents.push({ attackerId: player.id, defenderId: defender.id, intent: slotState, defenderIntent: defender.turn.slots[slot], spectatorCount });
  }

  const combatConsumed = new Set();
  if (slot === 3) for (const intent of combatIntents) {
    const attacker = state.players.find(player => player.id === intent.attackerId);
    if (attacker) {
      applyChanges(attacker, [['stamina', -1]], results[attacker.index]);
      results[attacker.index].consequences.push('第三次行动发起袭击，额外消耗一点体力。');
    }
  }
  const mutualIds = new Set();
  for (const intent of combatIntents) {
    if (mutualIds.has(intent.attackerId)) continue;
    const reverse = combatIntents.find(other => other.attackerId === intent.defenderId && other.defenderId === intent.attackerId);
    if (!reverse) continue;
    mutualIds.add(intent.attackerId);
    mutualIds.add(intent.defenderId);
    combatConsumed.add(intent.attackerId);
    combatConsumed.add(intent.defenderId);
    const firstIndex = state.players.findIndex(player => player.id === intent.attackerId);
    const secondIndex = state.players.findIndex(player => player.id === intent.defenderId);
    await resolveMutualAttack(results, [intent.intent, reverse.intent], firstIndex, secondIndex);
  }
  for (const intent of combatIntents) {
    if (mutualIds.has(intent.attackerId) || mutualIds.has(intent.defenderId)) continue;
    if (combatConsumed.has(intent.attackerId) || combatConsumed.has(intent.defenderId)) continue;
    const attackerIndex = state.players.findIndex(player => player.id === intent.attackerId);
    const defenderIndex = state.players.findIndex(player => player.id === intent.defenderId);
    const outcome = await resolveSingleAttack(attackerIndex, defenderIndex, intent.intent, intent.defenderIntent, results, intent.spectatorCount);
    outcome.consumed.forEach(index => combatConsumed.add(state.players[index].id));
  }

  // 2) 非战斗行动：严格串行，每个角色只结算当前这个行动点。
  for (const player of state.players) {
    const index = player.index;
    const slotState = player.turn.slots[slot];
    const result = results[index];
    if (player.skippedThisRound) {
      result.outcome = 'special';
      result.title = '这次行动未能进行';
      result.story = '局面暂时没有变化。';
      continue;
    }
    if (!slotState || slotState.resolved || player.collapsed) continue;
    if (!slotState.confirmed) {
      result.outcome = 'special';
      result.title = '你没有做出选择';
      result.story = '这一段时间在沉默里过去了。';
      continue;
    }
    if (slotState.cancelled) {
      result.outcome = 'special';
      result.title = '这个行动被取消了';
      result.story = '局面在中途改变，原定的计划不再成立。';
      result.consequences.push(slotState.cancelReason || '状态变化导致行动取消。');
      continue;
    }
    if (combatConsumed.has(player.id)) {
      if (slotState.entry.kind !== 'attack') result.consequences.push(`战斗打断了本行动点原定的计划（${slotState.entry.text}），它没有发生。`);
      continue;
    }
    const entry = slotState.entry;
    if (entry.kind === 'item' && !itemByUid(player, slotState.itemUid)) {
      result.outcome = 'fail';
      result.title = '道具在出手前已经损坏';
      result.story = '你摸到的是空的布面。';
      result.consequences.push('同一件道具不会被两次行动重复消耗。');
      continue;
    }
    try {
      if (slot === 3 && (entry.kind === 'attack' || ['force', 'run', 'search', 'sneak', 'hide'].includes(entry.kind))) {
        applyChanges(player, [['stamina', -1]], result);
        result.consequences.push('第三次高强度行动额外消耗一点体力。');
      }
      if (entry.kind === 'roomMechanism') {
        await window.NightCrownWorld.resolve(player, entry, result);
      } else if (entry.kind === 'attack') {
        result.outcome = 'fail';
        result.title = '目标已经不在了';
        result.story = '你挥出的动作落进空气。';
      } else if (entry.kind === 'guard') {
        resolveQuietGuard(player, slotState, result);
      } else if (entry.kind === 'reward') {
        await resolveRewardAction(player, slotState, result);
      } else if (entry.kind === 'rewardHeal') {
        await resolveRewardHealAction(player, slotState, result);
      } else if (entry.kind === 'cleanse') {
        await resolveCleanseAction(player, slotState, result);
      } else if (entry.kind === 'item') {
        await resolveItemAction(player, slotState, result);
      } else if (entry.kind === 'gearChoice') {
        await animateActor(player.index, entry.choice === 'rest' ? 'guarding' : 'searching', state.headless || reducedMotion ? 0 : 760);
        resolveGearChoice(player, entry, result);
      } else if (entry.kind === 'dungeonSearch') {
        resolveDungeonSearch(player, result);
      } else if (entry.kind === 'npc') {
        await resolveNpcAction(player, slotState, result);
      } else {
        await resolveNormalAction(player, slotState, result);
      }
    } catch (error) {
      reportRuntimeError(error, `resolve:${entry.kind}`);
      result.outcome = 'special';
      result.title = '这一步结算时出现了异常';
      result.consequences.push(`已跳过这个行动并继续对局：${String(error && error.message || error)}`);
    }
  }

  // 3) 写回结果：每条行动独立成一步，不在回合末重复夹逼。
  window.NightCrownWorld.afterBatch();
  state.players.forEach((player, index) => {
    if (completedBefore.has(player.id)) return;
    const before = inventoryBefore[index];
    const after = player.inventory;
    results[index].itemChanges = [
      ...after.filter(item => !before.some(previous => previous.uid === item.uid)).map(item => ({ item, direction: 'gain' })),
      ...before.filter(item => !after.some(current => current.uid === item.uid)).map(item => ({ item, direction: 'loss' }))
    ];
    results[index].changes = Object.keys(player.stats)
      .map(key => [key, player.stats[key] - (statsBefore[index][key] || 0)])
      .filter(([, value]) => value !== 0);
    if (dungeonAtStart.has(player.id)) consumeDungeonAction(player, results[index]);
    if (player.travelNotes.length) {
      results[index].consequences.unshift(...player.travelNotes);
      player.travelNotes = [];
    }
    player.turn.slots[slot].result = results[index];
    player.turn.slots[slot].resolved = true;
    player.result = results[index];
    if (slot === 1) player.roundResult = results[index];
    else player.roundSteps = [...(player.roundSteps || []), results[index]];
  });

  if (audio.setRooms) audio.setRooms(state.players.filter(player => player.control === 'human').map(player => player.room));
  markResultAcks(slot);
  state.phase = PHASES.actionResult(slot);
  state.resolving = false;
  if (window.NightCrownWorld.checkEntries({phase:'result',slot})) return;
  renderAll();
  window.ClassicVisuals.playResultEmotions(state.players, results);
}

function decayStatuses(player) {
  // 负面状态必须能自然退潮，否则会形成"失败 -> 掉属性 -> 更容易失败"的死亡螺旋，
  // 让 16 回合的赛程在第 5 回合就崩掉。负面状态用 62% 退场率，普通状态 55%。
  const negative = ['疲惫', '动摇', '暴露', '虚弱', '恐惧'];
  player.statuses = player.statuses.filter(status => {
    if (negative.includes(status)) return rng.next() >= .62;
    if (['路线优势', '占据先机', '戒备', '专注'].includes(status)) return rng.next() >= .55;
    return status !== '囚禁' || player.dungeonActionsLeft > 0;
  });
  // 受伤是需要主动处理的重伤，但也不该永久挂住；给一个较低的自动愈合率。
  if (player.statuses.includes('受伤') && rng.next() < .40) {
    player.statuses = player.statuses.filter(status => status !== '受伤');
    if (player.injuries.length) player.injuries = player.injuries.slice(1);
  }
  if (player.curses.length && rng.next() < .3) {
    const key = pick(['sanity', 'luck', 'stamina']);
    player.stats[key] = Math.max(0, player.stats[key] - 1);
  }
  // 每回合的自然恢复：生命与体力回一点，避免全队在第 5 回合前集体归零。
  // 只在未崩溃时恢复，且不越过初始值，保证"输"仍然是真实的。
  if (player.stats.health > 0 && player.stats.health < 10 && rng.next() < .15) {
    player.stats.health = Math.min(10, player.stats.health + 1);
  }
  if (player.stats.stamina > 0 && player.stats.stamina < 10 && rng.next() < .35) {
    player.stats.stamina = Math.min(10, player.stats.stamina + 1);
  }
  // 理智更难自然恢复（它是本作的核心压力条），但至少不该单调归零。
  if (player.stats.sanity > 0 && player.stats.sanity < 10 && rng.next() < .10) {
    player.stats.sanity = Math.min(10, player.stats.sanity + 1);
  }
}

/* ---------------------------------------------------------------------------
 * 血染王冠（终局）
 * ---------------------------------------------------------------------------
 * 全局唯一、可转移。佩戴者发起夺取时，在所有普通修正之后 +20 个百分点，上限 95%。
 * 这里用包装函数叠加在原有的 calculateAttackChance 之上 —— 原有公式一行没改。
 */
/* ---------------------------------------------------------------------------
 * 终局双倍夺取（提示词第六节）
 * ---------------------------------------------------------------------------
 * 「双倍」只指夺取成功时攻击者拿到的战利品价值，不指惩罚翻倍。
 * 这里用包装函数叠在原来的 seizeResource 之上 —— 原函数一行没改。
 *   1. 原规则先把战利品正常转给攻击者（由被包装的原函数完成）
 *   2. 系统再补发一份等值奖励；受害者不会被多扣第二份
 *   3. 目标没有可转移资源时，不凭空制造奖励
 */
/* 调试跳关：包一层 makeState，把选好的阶段与回合套到新建的对局上。
   没选阶段就原样返回，正式玩法一点都不受影响。 */
const _baseMakeState = makeState;
makeState = function (...args) {
	const created = _baseMakeState(...args);
	if (setupDebugStage) {
		const target = stageById(setupDebugStage);
		created.stageIndex = STAGES.indexOf(target);
		created.stageId = target.id;
		created.round = Math.max(1, Number(setupDebugRound) || 1);
		if (target.id === 'shard') created.maxRounds = Math.max(created.round, 5 + Math.floor(rng.next() * 6));
		else if (target.rounds > 0) created.maxRounds = target.rounds;
		// 直接跳终局时，把分支也定下来，免得再被二选一逻辑改写。
		if (target.id === 'finale' || target.id === 'shard') created.finaleBranch = target.id;
	}
	return created;
};

const _baseSeizeResource = seizeResource;
seizeResource = function (attacker, defender, attackerResult, defenderResult) {
	const transfer = _baseSeizeResource(attacker, defender, attackerResult, defenderResult);
	/* 终局双倍：严格按「这一次真正转移了什么」复制一份给攻击者，受害者不再被多扣。
	   旧实现是取完再回头查受害者剩余资源，最后一份被取走时翻不了倍，
	   而且会把遗物夺取补发成钥匙/线索。 */
	if ((state.stageId === 'finale' || state.stageId === 'shard') && transfer && transfer.kind !== 'none') {
		if (transfer.kind === 'stat') {
			applyChanges(attacker, [[transfer.stat, transfer.amount]], attackerResult);
			attackerResult.consequences.push(`终局规则把这一份翻倍：再多一份${STAT_LABEL[transfer.stat]}。`);
		} else if (transfer.kind === 'relic') {
			/* 关键遗物是唯一的，不能凭空复制一件。按它的价值给等值补偿。 */
			const extraKeys = transfer.value >= 2 ? 1 : 0;
			const extraClues = transfer.value >= 2 ? 1 : 2;
			applyChanges(attacker, [['keys', extraKeys], ['clues', extraClues]], attackerResult);
			attackerResult.consequences.push(`终局规则把这一件的价值翻倍：额外折成${extraKeys ? '一把钥匙与' : ''}${extraClues}条线索。`);
		}
	} else if ((state.stageId === 'finale' || state.stageId === 'shard') && transfer) {
		attackerResult.consequences.push('对方身上已经没有可翻倍的资源，这一次只按原样结算。');
	}
	// 血染王冠：佩戴者得手时，受害者先失去战利品（上面已完成），再冻结快照并淘汰。
	if (String(state.crownHolder || '') === String(attacker.id) && !defender.eliminatedByCrown) {
		eliminateByCrown(defender);
		attackerResult.consequences.push('血染王冠认下了这一次：对手被直接淘汰。');
		defenderResult.consequences.push('血染王冠把你留在了原地。');
	}
	return transfer;
};

/* 王冠的归属与淘汰：戴冠者夺取成功时受害者直接淘汰（记冻结快照 + 0.85 罚则）；
   被普通玩家夺走时王冠转移给攻击者，且不追溯淘汰原持有者。 */
function crownHolderId() {
	return String(state.crownHolder || '');
}
function crownHolderPlayer() {
	const id = crownHolderId();
	return id ? state.players.find(player => String(player.id) === id) || null : null;
}
function giveCrownTo(player) {
	state.crownHolder = player ? String(player.id) : null;
}
/* 被王冠淘汰：先记冻结快照（战利品转移已经完成），再标淘汰原因与 0.85 罚则。 */
function eliminateByCrown(victim) {
	if (!victim) return;
	victim.scoreSnapshot = scorePlayer(victim);
	victim.eliminatedByCrown = true;
	victim.collapsed = true;
	victim.eliminatedReason = '被血染王冠淘汰';
}

/* 分数拆成四项，结算页要能展开说明「分是从哪来的」。
   核心属性走递减增长（log），所以 100 与 150 有可辨认差距，但单项不会线性支配排名。
   这里只读常驻有效值；临时 Buff 不写回 player.stats，因此刷不进总分。 */
function scoreBreakdown(player) {
  /* 只读常驻值：临时 Buff 可以在行动里生效，但不能靠结算前开一下就抬高总分。 */
  const core = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth']
    .reduce((sum, key) => sum + Math.log1p(Math.max(0, standingStat(player, key))) / Math.log(101), 0) / 6 * 60;
  /* 【msg8 §7】生命值上限改 5 后，满分基数 = 3×5 = 15，保持满值≈28 分的同尺度。 */
  const vitals = ['health', 'stamina', 'sanity'].reduce((sum, key) => sum + player.stats[key], 0) / (MAX_VITAL * 3) * 28;
  const keyItems = Math.min(9, player.stats.keys * 2.5 + player.stats.clues * .7
    + player.inventory.filter(item => ITEMS[item.id].category === 'relic')
      .reduce((sum, item) => sum + (ITEMS[item.id].value || 1) * 2.5, 0));
  const build = Math.min(3, Object.keys(GEAR_SYSTEMS).reduce((sum, key) => sum + (systemTier(player, key) === 3 ? 1.5 : systemTier(player, key) === 2 ? .5 : 0), 0));
  return { core, vitals, keyItems, build };
}

function scorePlayer(player) {
	// 被淘汰的人用冻结的得分快照；0.85 只作用于「被血染王冠淘汰」的人。
	if (player.scoreSnapshot !== undefined && player.scoreSnapshot !== null) {
		const penalty = (player.eliminatedByCrown ? 0.85 : 1) * (player.crownFailedAttack ? 0.85 : 1);
		return Math.round(player.scoreSnapshot * bellMultiplierFor(player) * penalty * 10) / 10;
	}
	if (player.stats.health <= 0 || player.stats.sanity <= 0 || player.collapsed) return -1;
  const { core, vitals, keyItems, build, gold } = scoreBreakdown(player);
	// 塔顶钟楼的奇偶倍率在这里生效。倍率全部算完再统一四舍五入（提示词第六节）。
	return Math.round((core + vitals + keyItems + build + gold) * bellMultiplierFor(player) * 10) / 10;
}

// 崩溃只处理对应角色：真人崩溃结束对局，隐藏人机崩溃仅被移除并广播叙事。
// 原版"任一人归零即全局结束"会让一个人机把真人的整局比赛提前终止。
function processCollapses() {
  const removed = [];
  for (const player of state.players) {
    if (player.collapsed) continue;
    if (!player.dawnRescueUsed && systemTier(player, 'dawn') >= 3
      && (player.stats.health <= 0 || player.stats.sanity <= 0 || player.stats.stamina <= 0)) {
      player.dawnRescueUsed = true;
      for (const key of ['health', 'stamina', 'sanity']) if (player.stats[key] <= 0) player.stats[key] = 1;
      player.exhaustedSince = null;
      player.statuses = uniqueAdd(player.statuses, '晨誓庇护已用');
      continue;
    }
    if (player.stats.health > 0 && player.stats.sanity > 0) {
      if (player.stats.stamina > 0) { player.exhaustedSince = null; continue; }
      /* 宽限期用全局回合序号，而不是阶段内的 state.round ——
         阶段切换会把 state.round 归 1，跨阶段时原写法会算错长短。 */
      if (player.exhaustedSince == null) { player.exhaustedSince = state.roundSerial; continue; }
      if (state.roundSerial <= player.exhaustedSince) continue;
    }
    if (player.control === 'human') { player.collapsed = true; player.statuses = uniqueAdd(player.statuses, '退场'); removed.push(player); continue; }
    player.collapsed = true;
    player.statuses = uniqueAdd(player.statuses, '退场');
    removed.push(player);
  }
  if (removed.length) {
    state.eliminatedIds = state.players.filter(player => player.collapsed).map(player => player.id);
    // 只重排 index，不动 id / label —— 它们是对外身份，必须稳定。
    state.players.forEach((player, index) => { player.index = index; });
    if (typeof renderPlayerShells === 'function') renderPlayerShells();
  }
  return { humanCollapsed: null, removed };
}

/* 一句话讲清这一局怎么结束的：结算页要能回答「我经历了什么」。 */
function endReasonText(player) {
  if (player.eliminatedByCrown) return '被血染王冠淘汰';
  if (player.collapsed || player.stats.health <= 0 || player.stats.sanity <= 0) return '倒在了夜里';
  if (player.room === 'reward') return '还在奖励房里整理收获';
  return '走出城堡';
}

/* 最有贡献的词条：按实际生效的类型汇总。
   这里只报「哪几类词条在推着这一局走」，不虚报单件装备的具体触发次数。 */
function topAffixLines(player, max = 3) {
  const totals = new Map();
  for (const affix of activeAffixes(player)) {
    const name = affixText(affix);
    if (!name) continue;
    const key = name.replace(/[\d.]+%?/g, '').trim() || name;
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([name, count]) => `${name}${count > 1 ? ` ×${count}` : ''}`);
}

function endGame(reason = 'dawn') {
  state.phase = 'end';
  state.token++;
  const safeName = player => `${player?.label || '未知角色'}·${HEROES[player?.hero]?.name || '无名'}`;
  const safeTalent = player => HEROES[player?.hero]?.talent?.name || '无';
  const scores = state.players.map(scorePlayer);
  const names = state.players.map(safeName);
  const fallen = state.players.find(player => player.stats.health <= 0 || player.stats.sanity <= 0 || player.collapsed);
  /* 特殊胜利优先级最高：用时间护符修好钟楼的人就是赢家。
     旧版把 mendedBy 写进状态却没人读，结算永远按普通得分挑人。 */
  const mendedPlayer = reason === 'mended'
    ? state.players.find(player => String(player.id) === String(state.mendedBy)) || null
    : null;
  const best = scores.length ? Math.max(...scores) : -Infinity;
  const ranked = state.players.map((player, index) => ({ player, score: scores[index], index }))
    .sort((a, b) => b.score - a.score);
  const winnerIndex = mendedPlayer
    ? state.players.indexOf(mendedPlayer)
    : (scores.length ? scores.indexOf(best) : -1);
  const tiedIndexes = mendedPlayer || winnerIndex < 0
    ? new Set(winnerIndex >= 0 ? [winnerIndex] : [])
    : new Set(state.players.map((player, index) => (scores[index] === best ? index : -1)).filter(index => index >= 0));
  const isTie = !mendedPlayer && tiedIndexes.size > 1;
  const resultKind = mendedPlayer ? 'mended'
    : reason === 'collapse' && fallen ? 'defeat'
      : isTie ? 'tie' : 'dawn';

  $('#endTitle').textContent = mendedPlayer
    ? `${names[winnerIndex]}把钟楼合上了`
    : fallen
      ? `${fallen.label}的名字被城堡收走`
      : isTie ? '数道影子在黎明前并列' : `${names[winnerIndex]}带走了夜冠`;
  $('#endText').textContent = mendedPlayer
    ? '时间护符被按进钟盘，碎裂的塔身重新合拢。钟声停下来，这一夜第一次安静下来。'
    : reason === 'collapse'
      ? `钟声尚未走到黎明，${fallen?.label || '一位冒险者'}倒在了城堡的最后一道阴影里。这一夜的足迹和代价，仍被逐一记下。`
      : isTie
        ? '天光落下时，几个人的名字一起留在同一行上。城堡没有替你们分出先后。'
        : '天光从破碎的彩窗落下，城堡终于停止移动。你们带出的线索、完好的道具与尚未熄灭的心火，决定了夜冠归谁。';

  const winner = winnerIndex >= 0 ? state.players[winnerIndex] : ranked[0]?.player;
  const hero = winner && HEROES[winner.hero];
  const skin = winner && heroArtUrl(winner.hero);
  const art = skin
    ? `<span class="end-portrait fresh" style="background-image:url('${skin}')"></span>`
    : `<span class="end-portrait legacy hero-${winner?.hero || 0}"></span>`;
  const headline = mendedPlayer ? '修好钟楼的人' : isTie ? '并列的名字' : '今夜留下名字的人';
  $('#endHeroLine').innerHTML = winner ? `${art}<div class="end-hero-copy"><small>${headline}</small>
    <b>${isTie ? tiedIndexes.size + ' 人并列' : `${winner.label} · ${hero.name}`}</b><span>${hero.title} · ${hero.talent.name}</span>
    <p>${mendedPlayer ? '特殊胜利：钟楼是被你合上的，普通得分不再改写这个结果。'
      : reason === 'collapse' ? '黎明尚远，但这一段旅途已经有了见证。'
        : '当最后一声钟响散开，胜者从门口带走了自己的故事。'}</p></div>` : '';

  /* 每个名次都展开「分数从哪来、成长到哪一步、什么装备在推」。
     并列的名次全部标上冠记，不再文字说并列、却只给第一条加冠军标识。 */
  $('#endLedger').innerHTML = ranked.map(({ player, score, index }) => {
    const character = HEROES[player.hero];
    const parts = scoreBreakdown(player);
    const cores = ['strength', 'agility', 'perception', 'luck', 'intimidation', 'stealth']
      .map(key => [STAT_LABEL[key], standingStat(player, key)])
      .sort((a, b) => b[1] - a[1]);
    const peak = player.peakStats || {};
    const peakValue = Object.values(peak).length ? Math.max(...Object.values(peak).filter(Number.isFinite)) : cores[0][1];
    const sets = Object.keys(GEAR_SYSTEMS)
      .map(key => ({ key, tier: systemTier(player, key) }))
      .filter(row => row.tier >= 2)
      .map(row => `${GEAR_SYSTEMS[row.key].name}${['', '·两件', '·四件', '·六件'][row.tier]}`);
    const gear = player.inventory.filter(item => ITEMS[item.id]?.system)
      .slice(0, 3).map(item => ITEMS[item.id].name).join('、') || '空行囊';
    const affixes = topAffixLines(player, 3);
    const isLeader = tiedIndexes.has(index);
    return `<article class="end-record ${isLeader ? 'leader' : ''}">
      <div class="end-rank">${isLeader ? '♛' : String(ranked.findIndex(row => row.index === index) + 1).padStart(2, '0')}</div>
      <div class="end-record-main"><b>${player.label} · ${character.name}</b>
        <span>${endReasonText(player)} · ${character.talent.name}</span>
        <small>到达 ${stageById(state.stageId).label} 第 ${state.round} 回合 · 金币 ${player.gold || 0}（计分 ${parts.gold || 0}） · 线索 ${player.stats.clues} · 钥匙 ${player.stats.keys} · 道具 ${player.inventory.length} 件</small>
        <small class="end-gear">主属性：${cores[0][0]} ${cores[0][1]} · 本局峰值 ${peakValue}</small>
        <small class="end-gear">行囊记忆：${gear}</small>
        <small class="end-gear">套装：${sets.join('、') || '未成型'}</small>
        ${affixes.length ? `<small class="end-gear">关键成长词条：${affixes.join('、')}</small>` : ''}
        <details class="end-detail"><summary>分数从哪来</summary>
          <span>核心成长 ${Math.round(parts.core * 10) / 10} · 生存状态 ${Math.round(parts.vitals * 10) / 10} · 关键物品 ${Math.round(parts.keyItems * 10) / 10} · 构筑完成度 ${Math.round(parts.build * 10) / 10}</span>
        </details></div><strong>${score}<em>夜冠印记</em></strong>
    </article>`;
  }).join('');

  const modal = $('#endModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  /* 先给结局演出，再展开成绩。点一下可以立刻展开，不必等计数动画。 */
  modal.classList.remove('ledger-open');
  clearTimeout(endGameRevealTimer);
  endGameRevealTimer = setTimeout(() => modal.classList.add('ledger-open'), 900);
  /* 结局音乐按结局选择。旧版无论胜负都调 audio.fail(0)。 */
  musicEvent('end', { kind: resultKind, playerIndex: winnerIndex >= 0 ? winnerIndex : 0 });
  renderGlobal();
  return resultKind;
}

let endGameRevealTimer = null;
$('#endModal').addEventListener('click', () => {
  clearTimeout(endGameRevealTimer);
  $('#endModal').classList.add('ledger-open');
});

/* 回合收尾：囚禁惩罚在这里只递减一次，并彻底清理残留状态。 */
function finishRound() {
  if (state.phase !== ROUND_SUMMARY) return;
  state.roundSerial = (state.roundSerial || 0) + 1;
  const { humanCollapsed, removed } = processCollapses();
  if (!state.players.some(player => !player.collapsed)) return endGame('collapse');
  if (removed.length && !state.headless) {
    $('#globalMessage').textContent = `${removed.map(player => player.label).join('、')}的生命、体力或理智已经耗尽，被移出本局；其余角色继续。`;
  }
  for (const player of state.players) {
    // 地牢惩罚在每个行动点结算，回合结束不重复扣除。
    // 已经离开地牢的角色不再保留任何囚禁痕迹。
    if (player.room !== 'dungeon') clearJailState(player);
    if (!player.collapsed) decayStatuses(player);
    player.skippedThisRound = false;
    player.jailedThisRound = false;
    player.talentUsedThisRound = false;
    player.fateUsedThisRound = false;
    player.astralUsedThisRound = false;
    player.marketUsedThisRound = false;
    player.actionPoints = slotCountForStage(state.stageId);
    player.roundDeltas = {};
    player.roundSteps = [];
  }
	if (!state.players.some(player => !player.collapsed)) return endGame('collapse');
	// 本阶段打满 → 切到下一个阶段；只有最后一个阶段打满才结束整局。
	if (state.round >= state.maxRounds) {
		/* 最后一个阶段打满就是整局结束；否则先走一次阶段成长，再换阶段。 */
		if (state.stageId === 'finale' || state.stageId === 'shard') return endGame('dawn');
		return openStageGrowth();
	}
	state.round++;
	enterTravelSelect();
}

function continueRound() {
  if (state.phase !== ROUND_SUMMARY) return;
  const now = Date.now();
  if (!state.headless && now - (state.lastRoundAdvanceAt || 0) < 220) return;
  state.lastRoundAdvanceAt = now;
  if (audio.action) audio.action('lock', 0);
  finishRound();
}

/* ---------------------------------------------------------------------------
 * 阶段成长：一个阶段打满之后、真正换阶段之前
 * ---------------------------------------------------------------------------
 * 真人玩家在这里三选一；人机自己选一张。
 * 双方都选完之后才提交阶段推进，保证「状态变更只提交一次」。
 * ------------------------------------------------------------------------- */
function openStageGrowth() {
  state.phase = 'stage_growth';
  state.token++;
  state.growthLog = [];
  /* 重返探索结束前的一次性校准先执行：主属性不足 20 的直接补足。 */
  if (state.stageId === 'return') {
    state.players.filter(player => !player.collapsed).forEach(player => applyCalibration(player, state.growthLog));
  }
  state.players.forEach(player => {
    if (player.collapsed) { player.growthReady=true; player.growthOffers=[]; return; }
    player.growthOffers = growthOffers(player);
    if (player.control === 'ai') {
      const offer = pick(player.growthOffers);
      state.growthLog.push(applyGrowthOffer(player, offer));
      player.growthReady = true;
    } else {
      player.growthReady = false;
    }
  });
  renderAll();
  renderGrowthModal();
  $('#growthModal').classList.add('open');
  $('#growthModal').setAttribute('aria-hidden', 'false');
  if (state.players.every(p=>p.growthReady)) finishStageGrowth();
}

function renderGrowthModal() {
  const host = $('#growthBody');
  if (!host) return;
  const stage = stageById(state.stageId);
  $('#growthTitle').textContent = `${stage.label} · 阶段成长`;
  const cards = state.players.filter(player => player.control === 'human').map(player => `
    <section class="growth-player" data-player="${player.index}">
      <header><b>${player.label} · ${HEROES[player.hero].name}</b>
        <small>主方向：${GEAR_SYSTEMS[growthDirection(player)].name} · 当前最高常驻 ${Math.max(...CORE_STAT_KEYS.map(key => standingStat(player, key)))}</small></header>
      <div class="growth-offers">
        ${player.growthReady
          ? `<p class="growth-done">已选择。${(state.growthLog || []).filter(Boolean).slice(-1)[0] || ''}</p>`
          : player.growthOffers.map(offer => `
            <button data-growth="${offer.id}" data-growth-player="${player.index}">
              <b>${offer.title}</b><span>${offer.detail}</span></button>`).join('')}
      </div>
    </section>`).join('');
  const log = (state.growthLog || []).filter(Boolean);
  host.innerHTML = cards + (log.length
    ? `<div class="growth-log">${log.map(line => `<span>${line}</span>`).join('')}</div>`
    : '');
}

function chooseGrowth(playerIndex, offerId) {
  if (state.phase !== 'stage_growth') return false;
  const player = state.players[playerIndex];
  if (!player || player.control !== 'human' || player.growthReady) return false;
  const offer = (player.growthOffers || []).find(candidate => candidate.id === offerId);
  if (!offer) return false;
  const note = applyGrowthOffer(player, offer);
  player.growthReady = true;
  player.growthChoices.push({ stage: state.stageId, offer: offer.id, note });
  state.growthLog.push(note);
  if (audio.action) audio.action('use', playerIndex);
  renderAll();
  renderGrowthModal();
  const humans = state.players.filter(candidate => candidate.control === 'human');
  if (humans.every(candidate => candidate.growthReady)) finishStageGrowth();
  return true;
}

function finishStageGrowth() {
  if (state.phase !== 'stage_growth') return;
  $('#growthModal').classList.remove('open');
  $('#growthModal').setAttribute('aria-hidden', 'true');
  state.players.forEach(player => {
    player.growthOffers = [];
    player.growthReady = false;
    player.buffs = [];
    player.claimedEvents = new Set();
  });
  const from = state.stageId;
  if (!advanceStage()) return endGame('dawn');
  /* 阶段真的变了才换音乐：由事件触发，不在渲染函数里。 */
  musicEvent('stage');
  /* 演出层不持有状态：它只是把已经提交好的结果演出来。
     重开会在 resetToSetup 里改掉 phase，回调随即作废。 */
  state.phase = 'stage_transition';
  state.token++;
  const transitionToken = state.token;
  playStageTransition(from, state.stageId).then(() => {
    if (state.phase === 'stage_transition' && state.token === transitionToken) enterTravelSelect();
  });
}

/* ---------------------------------------------------------------------------
 * 阶段切换演出
 * ---------------------------------------------------------------------------
 * 四条连接各有自己的画面语言，标题只写阶段名 + 一句短叙事，不塞规则说明。
 * 跳过和看完进入完全相同的结果 —— 演出层不持有任何状态。
 * 减少动态模式只留 0.25 秒淡化，取消晃动、强闪和碎裂运动。
 * ------------------------------------------------------------------------- */
const STAGE_TRANSITIONS = {
  'explore>summit': {
    caption: '第一段 · 上升',
    line: '烛火被风压低，石阶一节节抬高，云雾从塔顶散开。',
    tone: 'summit'
  },
  'summit>return': {
    caption: '第二段 · 回望',
    line: '星光熄灭，镜头沿着城堡内部下沉；熟悉的房间已经不太一样。',
    tone: 'return'
  },
  'return>finale': {
    caption: '第三段 · 终局',
    line: '王座纹章从石缝里亮起，暗红沿着裂缝延伸，远处的战钟开始响。',
    tone: 'finale'
  },
  'return>shard': {
    caption: '第三段 · 碎影',
    line: '画面像玻璃一样错位，钟针短暂倒转，碎片在静止的空间里展开。',
    tone: 'shard'
  }
};
let stageTransitionResolver = null;

function finishStageTransition() {
  const node = $('#stageTransition');
  if (node) {
    node.classList.remove('open');
    node.setAttribute('aria-hidden', 'true');
  }
  clearTimeout(stageTransitionTimer);
  if (stageTransitionResolver) {
    const resolve = stageTransitionResolver;
    stageTransitionResolver = null;
    resolve();
  }
}

let stageTransitionTimer = null;

function playStageTransition(from, to) {
  const spec = STAGE_TRANSITIONS[`${from}>${to}`];
  const node = $('#stageTransition');
  if (!spec || !node) return Promise.resolve();
  /* 自动化与无头模式不等待演出：状态层面完全一致，只是不占用时间。 */
  if (state.headless) return Promise.resolve();
  const stage = stageById(to);
  $('#stCaption').textContent = spec.caption;
  $('#stTitle').textContent = stage.label;
  $('#stLine').textContent = spec.line;
  const keep = [...node.classList].filter(name => !name.startsWith('st-tone-'));
  node.className = [...keep, `st-tone-${spec.tone}`].join(' ');
  node.classList.add('open');
  node.setAttribute('aria-hidden', 'false');
  return new Promise(resolve => {
    stageTransitionResolver = resolve;
    stageTransitionTimer = setTimeout(finishStageTransition, reducedMotion ? 320 : 2600);
  });
}

$('#stSkip').addEventListener('click', finishStageTransition);

function resetToSetup() {
  if (state.resolving) return;
  if (window.NightRoam?.active) window.NightRoam.stop();
  musicEvent('title');
  const nextToken = state.token + 1;
  state = makeState(setupMode, setupBotCount);
  state.token = nextToken;
  renderPlayerShells();
  $('#setup').classList.remove('closed');
  $('#titleScreen').classList.add('closed');
  $('#endModal').classList.remove('open');
  $('#endModal').classList.remove('ledger-open');
  $('#helpModal').classList.remove('open');
  $('#settingsModal').classList.remove('open');
  $('#settingsModal').setAttribute('aria-hidden', 'true');
  $('#growthModal').classList.remove('open');
  $('#growthModal').setAttribute('aria-hidden', 'true');
  /* 取消还没走完的阶段演出：重开绝不能把新对局拉回旧场景。 */
  finishStageTransition();
  renderHeroSetup();
  renderAll();
  if (audio.setRooms) audio.setRooms(state.players.filter(player => player.control === 'human').map(player => player.room));
}

async function enterGame() {
  const button = $('#enterBtn');
  button.disabled = true;
  try {
    if (!audio.ctx) await audio.start();
    else if (audio.ctx.state !== 'running') await audio.ctx.resume();
    if (audio.ctx?.state !== 'running') throw new Error('浏览器未能启动声音');
  } catch (error) {
    console.warn('声音暂时不可用，继续静音游戏：', error.message);
  }
  if (window.NightRoam?.selected) {
    window.NightRoam.start(setupSelection[0], audio);
    button.disabled = false;
    button.innerHTML = '开始游戏 <span>→</span>';
    return;
  }
  const nextGameToken = state.token + 1;
  state = makeState(setupMode, setupBotCount, setupRounds);
  state.token = nextGameToken;
  state.phase = TRAVEL_SELECT;
  /* 开局、调试跳关、重开都走同一条路：音乐只在这里跟一次阶段。 */
  if (typeof StageMusic !== 'undefined') StageMusic.unlock?.();
  musicEvent('stage');
  /* 调试跳关会直接把阶段设成后面的阶段，这里把人收回该阶段的合法房间。 */
  normalizeRoomsForStage();
  renderPlayerShells();
  $('#titleScreen').classList.add('closed');
  state.players.filter(player => player.control === 'human').forEach(player => applyRoomBg($(`#roomCurrent-${player.index}`), player.room));
  $('#setup').classList.add('closed');
  $('#endModal').classList.remove('open');
  if (audio.setRooms) audio.setRooms(state.players.filter(player => player.control === 'human').map(player => player.room));
  enterTravelSelect();
  button.disabled = false;
  button.innerHTML = '开始游戏 <span>→</span>';
}

/* ---------------------------------------------------------------------------
 * 主动道具交互：点击 → 详情面板 → 确认 → 才真正消耗
 * ---------------------------------------------------------------------------
 */
function currentSelectSlot() {
  if (state.phase === TRAVEL_SELECT) return 0;
  return slotOfPhase(state.phase, 'select');
}

function openItemPanel(playerIndex, itemUid) {
  const player = state.players[playerIndex];
  if (!player || !isSelectPhase() || state.resolving) return false;
  if (playerCannotAct(player)) return false;
  const slot = currentSelectSlot();
  if (!slot) return false;
  if (player.turn.slots[slot]?.confirmed) return false;
  const item = itemByUid(player, itemUid);
  if (!item) return false;
  const def = ITEMS[item.id];
  if (['passive', 'equipment', 'relic'].includes(def.category)) {
    // 被动与遗物不主动使用，但仍然给出说明面板。
    player.turn.itemPanel = { slot, itemUid, targetId: null, infoOnly: true };
    renderAll();
    return true;
  }
  if (def.effect?.kind === 'reactive') {
    player.turn.itemPanel = { slot, itemUid, targetId: null, infoOnly: true };
    renderAll();
    return true;
  }
  player.turn.itemPanel = { slot, itemUid, targetId: null, infoOnly: false };
  renderAll();
  return true;
}

function closeItemPanel(playerIndex) {
  const player = state.players[playerIndex];
  if (!player?.turn?.itemPanel) return false;
  player.turn.itemPanel = null;
  renderAll();
  return true;
}

function selectItemTarget(playerIndex, targetId) {
  const panel = state.players[playerIndex]?.turn?.itemPanel;
  if (!panel) return false;
  panel.targetId = targetId;
  renderAll();
  return true;
}

function confirmItemUse(playerIndex) {
  const player = state.players[playerIndex];
  const panel = player?.turn?.itemPanel;
  if (!panel) return false;
  if (panel.infoOnly) { closeItemPanel(playerIndex); return false; }
  const item = itemByUid(player, panel.itemUid);
  if (!item) { closeItemPanel(playerIndex); return false; }
  const def = ITEMS[item.id];
  const usable = itemUsable(player, item);
  if (!usable.ok) return false;
  const targets = itemTargetsFor(player, def);
  let chosenTarget = null;
  if (def.effect?.requiresTarget) {
    chosenTarget = targets.find(target => target.id === panel.targetId);
    if (!chosenTarget) return false;   // 必须显式选择合法目标
  }

  // 每回合一次免费治疗；原有快速治疗也共用这次机会。
  if (def.quick || (isHealingItem(def) && !player.quickUsedThisRound)) {
    const quickResult = emptyResult('success', `快速使用${def.name}`);
    const roomBefore = player.room;
    const ok = applyItemEffect(player, item, quickResult, { targetId: chosenTarget?.id || null });
    if (ok) player.quickUsedThisRound = true;
    if (ok) useAndMaybeBreakItem(player, item, null);
    if (ok && player.room !== roomBefore) {
      const currentSlot = currentSelectSlot();
      if (currentSlot && !player.turn.slots[currentSlot]?.confirmed) generateOptions(player, currentSlot);
    }
    player.turn.itemPanel = null;
    player.turn.notice = ok
      ? `${def.name}已快速使用（本回合快速次数已用完）。${quickResult.consequences.join(' ')}`
      : `${def.name}没有生效：${quickResult.consequences.join(' ')}`;
    renderAll();
    return ok;
  }

  const slot = panel.slot;
  if (!slot) return false;
  if (player.turn.slots[slot]?.confirmed) return false;
  // 行囊快捷键走的是"没有对应选项"这条路径：直接就地构造该道具的行动，不依赖选项池里有没有它。
  const entry = {
    id: `item-${item.uid}`, kind: 'item', itemId: item.id, itemUid: item.uid,
    stat: 'luck', risk: def.quick ? 1 : 2, tags: [...def.useTags],
    text: `${def.glyph} 使用${def.name}`, flavor: itemUseFlavor(item.id)
  };
  const slotState = player.turn.slots[slot];
  slotState.entry = entry;
  slotState.itemUid = item.uid;
  slotState.targetId = chosenTarget?.id || null;
  slotState.confirmed = true;
  player.turn.itemPanel = null;
  player.turn.notice = '';
  if (audio.action) audio.action('use', playerIndex);
  renderAll();
  scheduleAIChoice();
  maybeAdvance();
  return true;
}

/* 【msg8 §4】主动技能面板：与道具面板同构，但独立于行动槽（不占这一步）。 */
function openActivePanel(playerIndex, targetId = null) {
  const player = state.players[playerIndex];
  if (!player || player.control !== 'human' || state.resolving) return false;
  const avail = activeAvailability(player);
  if (!avail.ok) { player.turn.notice = `技能不可用：${avail.reason}`; renderAll(); return false; }
  player.turn.activePanel = { targetId: targetId || null };
  renderAll();
  return true;
}
function closeActivePanel(playerIndex) {
  const player = state.players[playerIndex];
  if (!player?.turn?.activePanel) return false;
  player.turn.activePanel = null;
  renderAll();
  return true;
}
function selectActiveTarget(playerIndex, targetId) {
  const panel = state.players[playerIndex]?.turn?.activePanel;
  if (!panel) return false;
  panel.targetId = targetId;
  renderAll();
  return true;
}
function confirmActiveSkill(playerIndex) {
  const player = state.players[playerIndex];
  const panel = player?.turn?.activePanel;
  if (!panel) return false;
  const active = heroActiveOf(player);
  const avail = activeAvailability(player);
  if (!active || !avail.ok) { closeActivePanel(playerIndex); return false; }
  let target = null;
  if (active.needsTarget) {
    target = activeTargetsFor(player).find(t => t.id === panel.targetId);
    if (!target) return false;
  }
  const result = emptyResult('special', active.name);
  applyActiveSkill(player, active, target, result);
  player.turn.activePanel = null;
  player.quickUsedThisRound = false; // 技能不消耗本回合快速次数
  player.turn.notice = result.consequences.join(' ');
  if (typeof audio !== 'undefined' && audio.action) audio.action('use', playerIndex);
  renderAll();
  return true;
}

/* ---------------------------------------------------------------------------
 * NPC 对话交互：逐字显示 → 第一次点击补全，第二次点击下一句，可选跳过
 * ---------------------------------------------------------------------------
 */
const NPC_SYSTEM = { healer: 'dawn', archivist: 'astral', cook: 'breach', timekeeper: 'fate', jailer: 'eclipse', gardener: 'dawn', mirrorChild: 'hunt', relicDealer: 'market' };
function npcTopicLock(player, topic) {
  if (topic.requiresRelic && !player.inventory.some(item => ITEMS[item.id]?.category === 'relic')) return '需要关键遗物作筹码';
  if (topic.talentOnly && HEROES[player.hero].talent.id !== topic.talentOnly) return '需专属天赋';
  if (topic.requiresRelation !== undefined && relationOf(player, topic.npcId).value < topic.requiresRelation) return '关系不足';
  if (topic.requiresStat && player.stats[topic.requiresStat] < topic.minStat) return `${STAT_LABEL[topic.requiresStat]}需达到${topic.minStat}`;
  if (topic.requiresSystem && player.inventory.filter(item => ITEMS[item.id]?.system === topic.requiresSystem).length < topic.requiresCount) return `需${GEAR_SYSTEMS[topic.requiresSystem].name}${topic.requiresCount}件`;
  if (topic.secretOnly && !secretMarketOpen(player)) return '没有夜市资格';
  return '';
}
function npcTopicChoices(player, npcId) {
  const npc = NPCS[npcId];
  const talentId = HEROES[player.hero].talent.id;
  const system = NPC_SYSTEM[npcId] || 'astral';
  const spec = GEAR_SYSTEMS[system];
  let list = npc.topics.slice(0, 3);
  if (npcId === 'relicDealer') {
    list = [npc.topics[0], { id: 'gear-offer-market', text: '请商人引荐商会装备',
      flavor: '受运气、随身装备与关系影响；成功后支付一条线索或一点生命', stat: 'luck', risk: 1,
      gain: [], loss: [['health', -1]],
      success: { text: '商人从账本后取出一件商会装备。' }, failure: { text: '商人收起账本，让你改日再来。' } }];
    list.push({ id: 'market-contract', text: '签订夜市契约', flavor: '需四件商会装备，支付两条线索', stat: 'luck', risk: 1,
      requiresSystem: 'market', requiresCount: 4, gain: [], loss: [['clues', -2]], success: { text: '商人在你的装备上按下了夜市印记。' }, failure: { text: '契约还没有承认你。' } });
    list.push({ id: 'dealer-lottery', text: '用一件关键遗物抽奖', flavor: '用筹码或遗物支付，可能抽到好货，也可能只换回普通补给',
      stat: 'luck', risk: 1, requiresRelic: true, gain: [], loss: [], success: { text: '抽奖箱转了一圈。' } });
    if (secretMarketOpen(player)) {
      list = [
        { id: 'market-epic', text: '买一件缺失的史诗装备', flavor: '夜市密柜：支付二点生命与三条线索', stat: 'luck', risk: 1, secretOnly: true, success: { text: '密柜交出了一件与你的道路相合的装备。' } },
        { id: 'market-universal', text: '买一件改系通用装备', flavor: '夜市密柜：支付二点理智与两条线索', stat: 'luck', risk: 1, secretOnly: true, success: { text: '柜中那件器物能改写装备的归属。' } },
        { id: 'market-relic', text: '以生命换夜市遗物', flavor: '夜市密柜：支付三点生命与一把钥匙', stat: 'luck', risk: 1, secretOnly: true, success: { text: '商人把最深处的遗物推到你面前。' } },
        { id: 'market-currency', text: '用关键遗物支付专属装备', flavor: '交出一件遗物，换取偏向当前体系的装备',
          stat: 'luck', risk: 1, secretOnly: true, requiresRelic: true, success: { text: '商人把遗物放上秤盘。' } }
      ];
    }
  } else {
    if (npc.talentTopic?.[talentId]) list = [...npc.topics.slice(0, 2), npc.talentTopic[talentId]];
    list.push({ id: `gear-offer-${system}`, text: `向${npc.name}打听${spec.name}传闻`,
      flavor: `偏向${spec.name}，受${STAT_LABEL[spec.stat]}、随身装备与关系影响；可能换到稀有秘仪`, stat: spec.stat, risk: 2,
      usesItem: spec.tags, gain: [], loss: [['health', -1]],
      success: { text: `${npc.name}看出你走的是${spec.name}的路，拿出一件适合你的装备。` },
      failure: { text: `${npc.name}找到了线索，但装备仍藏在更深处。` } });
  }
  return list.map(topic => ({ ...topic, npcId }));
}

function openDialogue(playerIndex, npcId) {
  const player = state.players[playerIndex];
  if (!player || !isSelectPhase() || state.resolving) return false;
  if (playerCannotAct(player)) return false;
  const slot = currentSelectSlot();
  if (!slot || player.turn.slots[slot]?.confirmed) return false;
  const npc = NPCS[npcId];
  if (!npc) return false;
  const lines = [pick(npc.greet), npc.intro];
  player.turn.itemPanel = null;
  player.turn.npc = { npcId, lines, lineIndex: lines.length - 1, typing: false, fullText: lines.at(-1), choices: npcTopicChoices(player, npcId), typeToken: 0 };
  player.turn.layer = { kind: 'talk', page: 0, view: 'main', itemUid: null, targetId: null, readOnly: false };
  renderAll();
  return true;
}

function startTyping(playerIndex, text) {
  const dialog = state.players[playerIndex]?.turn?.npc;
  if (!dialog) return;
  dialog.fullText = text;
  const node = $(`#layer-${playerIndex} .layer-line.current`);
  if (!node) return;
  node.textContent = text;
  if (reducedMotion || state.headless) { dialog.typing = false; return; }
  dialog.typing = true;
  dialog.typeToken = (dialog.typeToken || 0) + 1;
  const myToken = dialog.typeToken;
  node.textContent = '';
  const frames = speechFrames(text);
  frames.forEach((frame, index) => setTimeout(() => {
    if (dialog.typeToken !== myToken) return;
    node.textContent = frame.text;
    if (index % 3 === 0 && audio.typeTick) audio.typeTick(playerIndex);
  }, frame.at));
  setTimeout(() => {
    if (dialog.typeToken !== myToken) return;
    node.textContent = text;
    dialog.typing = false;
    renderAll();
  }, (frames.at(-1)?.at || 0) + 40);
}

// 收起草稿：停掉本侧未完成的打字定时器，但保留已揭示的文字与进度。
function pauseTyping(playerIndex) {
  const dialog = state.players[playerIndex]?.turn?.npc;
  if (!dialog) return false;
  dialog.typeToken = (dialog.typeToken || 0) + 1;   // 让在途的 setTimeout 全部失效
  if (dialog.typing) {
    dialog.typing = false;
    dialog.pausedAt = dialog.lineIndex;
  }
  return true;
}

function advanceDialogue(playerIndex) {
  const player = state.players[playerIndex];
  const dialog = player?.turn?.npc;
  if (!dialog) return false;
  if (dialog.typing) {
    dialog.typeToken = (dialog.typeToken || 0) + 1;
    dialog.typing = false;
    const node = $(`#layer-${playerIndex} .layer-line.current`);
    if (node) node.textContent = dialog.fullText;
    renderAll();
    return true;
  }
  if (dialog.lineIndex < dialog.lines.length - 1) {
    dialog.lineIndex += 1;
    renderAll();
    startTyping(playerIndex, dialog.lines[dialog.lineIndex]);
    if (audio.speak) audio.speak(dialog.lines[dialog.lineIndex], playerIndex);
    return true;
  }
  return false;
}

function skipDialogue(playerIndex) {
  const player = state.players[playerIndex];
  const dialog = player?.turn?.npc;
  if (!dialog) return false;
  dialog.typeToken = (dialog.typeToken || 0) + 1;
  dialog.typing = false;
  dialog.lineIndex = dialog.lines.length - 1;
  renderAll();
  return true;
}

function closeDialogue(playerIndex) {
  const player = state.players[playerIndex];
  if (!player?.turn?.npc) return false;
  player.turn.npc = null;
  if (player.turn.layer?.kind === 'talk') player.turn.layer = null;
  renderAll();
  return true;
}

function chooseDialogueTopic(playerIndex, index) {
  const player = state.players[playerIndex];
  const dialog = player?.turn?.npc;
  if (!dialog) return false;
  if (dialog.typing) return advanceDialogue(playerIndex);
  if (dialog.lineIndex < dialog.lines.length - 1) return advanceDialogue(playerIndex);
  const topic = dialog.choices[index];
  if (!topic) return false;
  if (npcTopicLock(player, topic)) return false;
  const slot = currentSelectSlot();
  if (!slot) return false;
  const base = legalEntries(player).find(candidate => candidate.kind === 'npc' && candidate.npcId === dialog.npcId);
  if (!base) return false;
  const entry = { ...base, id: `${base.id}-${topic.id}`, topicId: topic.id };
  const slotState = player.turn.slots[slot];
  slotState.entry = entry;
  slotState.itemUid = null;
  slotState.targetId = null;
  slotState.confirmed = true;
  player.turn.npc = null;
  if (player.turn.layer?.kind === 'talk') player.turn.layer = null;
  player.history.push(entry.id);
  if (audio.action) audio.action('lock', playerIndex);
  renderAll();
  scheduleAIChoice();
  maybeAdvance();
  return true;
}

function autoPickNpcTopic(player, npcId) {
  const list = npcTopicChoices(player, npcId).filter(topic => !topic.talentOnly || HEROES[player.hero].talent.id === topic.talentOnly);
  const relation = relationOf(player, npcId);
  const usable = list.filter(topic => !npcTopicLock(player, topic));
  const pool = usable.length ? usable : list;
  const scored = pool
    .map(topic => ({
      topic,
      score: (topic.gain || []).reduce((total, [, , max]) => total + (max || 0), 0) * 2
        + (topic.rel || 0) * 1.5
        - (topic.loss || []).reduce((total, [, min]) => total + Math.abs(min || 0), 0) * 1.5
        + (topic.talentOnly ? 3 : 0) + rng.next() * 2
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.topic || pool[0] || null;
}

/* 设计期校验：把问题收集成列表返回，绝不 throw。
   原实现在脚本加载时直接抛错——任何一处数据写错都会让整局游戏白屏，
   也就是把一个"数据质量问题"升级成"玩家完全打不开"。校验的执法点应该在
   自动化测试里（tests/ 会断言这个列表恒为空），而不是在玩家的加载路径上。 */
function validateItemLinks() {
  const problems = [];
  const templateTags = new Set([
    ...Object.values(ROOM_ACTIONS).flat(), ...GENERIC_ACTIONS, ...EVENT_ACTIONS,
    option('', '', 'luck', 1, 'guard', ['guard']), option('', '', 'luck', 1, 'reward', ['reward']),
    option('', '', 'luck', 1, 'route', Object.values(ACTION_TAGS).flat()),
    option('', '', 'luck', 1, 'special', ['curse', 'intimidate', 'stealth', 'force', 'heal', 'taste', 'search', 'mechanism'])
  ].flatMap(entry => entry.tags));
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.useTags.length < 2 || def.useTags.filter(tag => templateTags.has(tag)).length < 2) {
      problems.push(`道具 ${id} 没有关联至少两类有效选项`);
    }
    if (!def.unbreakable && ![1, 2, 3].includes(def.durability)) {
      problems.push(`道具 ${id} 的可见耐久必须是 1、2 或 3，当前为 ${def.durability}`);
    }
    if (!ITEM_CATEGORY[def.category]) problems.push(`道具 ${id} 的分类无效：${def.category}`);
    if (!def.effect || !def.effect.kind) problems.push(`道具 ${id} 缺少真实结算效果`);
  }
  return problems;
}

/* 键位分工全部由 keys.js 的 KEYMAP 提供（标签、教程与监听同源）：
 *   玩家一：选项 Q W E R · 确认 F · 收起 G · 行囊 T · 继续 C · 翻页 A/D · 历史 V
 *   玩家二：选项 U I O P · 确认 J · 收起 H · 行囊 Y · 继续 N · 翻页 K/L · 历史 M
 *   两侧按键完全不相交；空格 / 回车 / 小键盘回车不再替任何玩家提交或确认。
 *   任何不在可用时机的按键一律静默失效，不报错、不提示。 */
const keyRowOf = playerIndex => (typeof KEYMAP !== 'undefined' ? KEYMAP[playerIndex] : null);
const codeOwnerOf = code => (typeof playerOfCode === 'function' ? playerOfCode(code) : { playerIndex: -1, role: '' });
const keyCodeForChoice = (playerIndex, choiceIndex) => (typeof choiceKeyCode === 'function' ? choiceKeyCode(playerIndex, choiceIndex) : '');
const keyTextForChoice = (playerIndex, choiceIndex) => (typeof choiceKeyLabel === 'function' ? choiceKeyLabel(playerIndex, choiceIndex) : String(choiceIndex + 1));

// 行囊快捷键：按下本侧行囊键 = 打开 / 收起行囊展开层。
function toggleBagPanel(playerIndex) {
  const layer = layerOf(playerIndex);
  if (!layer) return false;
  if (layer.kind === 'bag') return closeLayer(playerIndex);
  return openLayer(playerIndex, 'bag');
}

function cycleItemTarget(playerIndex, direction = 1) {
  const player = state.players[playerIndex];
  const panel = player?.turn?.itemPanel;
  if (!panel) return false;
  const def = ITEMS[itemByUid(player, panel.itemUid)?.id || ''];
  if (!def?.effect?.requiresTarget) return false;
  const targets = itemTargetsFor(player, def);
  if (!targets.length) return false;
  const at = targets.findIndex(target => target.id === panel.targetId);
  const next = targets[(at + direction + targets.length) % targets.length];
  selectItemTarget(playerIndex, next.id);
  return true;
}

/* ---------------------------------------------------------------------------
 * 展开层内部操作
 * ---------------------------------------------------------------------------
 * 行囊：三类固定分页，选项键和道具键可直选前八件；选中后进入详情子页；需要目标的道具在子页里
 *       选目标，确认前重验合法性，目标失效时保留面板并说明原因。
 * 对话：选项键选择当前一段；确认键 = 补全当前文字 / 翻下一段 / 定下话题。
 */
function layerSelect(playerIndex, layer, index) {
  if (layer.kind === 'bag') {
    if (layer.view === 'detail') {
      const player = state.players[playerIndex];
      const item = itemByUid(player, layer.itemUid);
      const def = item && ITEMS[item.id];
      if (def?.effect?.requiresTarget) {
        const target = itemTargetsFor(player, def)[index];
        return target ? bagSelectTarget(playerIndex, target.id) : false;
      }
      return false;
    }
    return bagSelectIndex(playerIndex, layer, index);
  }
  if (layer.kind === 'talk') return talkSelectIndex(playerIndex, index);
  return false;
}

function bagPageItems(playerIndex, layer) {
  const player = state.players[playerIndex];
  const page = layer.page || 0;
  const items = (player.inventory || []).filter(item => {
    const category = itemCategoryOf(item);
    return page === 0 ? category === 'equipment' : page === 1 ? ['active', 'passive', 'reactive'].includes(category) : category === 'relic';
  });
  return page === 2 ? items.filter((item, index) => items.findIndex(other => other.id === item.id) === index) : items;
}

function bagSelectIndex(playerIndex, layer, index) {
  const items = bagPageItems(playerIndex, layer);
  const item = items[index];
  if (!item) return false;
  const player = state.players[playerIndex];
  layer.itemUid = item.uid;
  layer.targetId = null;
  layer.view = 'detail';
  // 需要目标的道具：默认不预选，强制玩家显式挑一个。
  const def = ITEMS[item.id];
  if (def?.effect?.requiresTarget) {
    const targets = itemTargetsFor(player, def);
    layer.targetAlternatives = targets.map(target => target.id);
  }
  renderAll();
  return true;
}

function talkSelectIndex(playerIndex, index) {
  const player = state.players[playerIndex];
  const dialog = player?.turn?.npc;
  if (!dialog) return false;
  if (dialog.typing) return advanceDialogue(playerIndex);
  if (dialog.lineIndex < dialog.lines.length - 1) return advanceDialogue(playerIndex);
  return chooseDialogueTopic(playerIndex, index);
}

// 展开层里的【确认】：行囊详情页 = 用掉它；对话页 = 补全 / 下一段。
function layerConfirm(playerIndex, layer) {
  if (layer.kind === 'talk') return advanceDialogue(playerIndex);
  if (layer.kind !== 'bag') return false;
  if (layer.view !== 'detail') return false;
  return confirmBagUse(playerIndex, layer);
}

// 从展开层提交道具：与选项池路径共用 confirmItemUse 的结算逻辑，不重复实现。
function confirmBagUse(playerIndex, layer) {
  const player = state.players[playerIndex];
  const item = itemByUid(player, layer.itemUid);
  if (!item) { layer.view = 'main'; renderAll(); return false; }
  const def = ITEMS[item.id];
  if (layer.readOnly || !isSelectPhase() || playerCannotAct(player)) return false;
  if (['passive', 'equipment', 'relic'].includes(def.category) || def.effect?.kind === 'reactive') return false;
  if (def.effect?.requiresTarget) {
    // 确认前重验：目标可能已经离开、被囚禁或不再合法。
    const targets = itemTargetsFor(player, def);
    const chosen = targets.find(target => target.id === layer.targetId);
    if (!chosen) { layer.targetStale = true; renderAll(); return false; }
    layer.targetStale = false;
  }
  // 复用既有面板通道：把选择写进 itemPanel 再走同一条确认路径。
  player.turn.itemPanel = { slot: currentSelectSlot(), itemUid: layer.itemUid, targetId: layer.targetId, infoOnly: false };
  const ok = confirmItemUse(playerIndex);
  if (ok) player.turn.layer = null;
  renderAll();
  return ok;
}

function discardSystemGear(playerIndex, layer = layerOf(playerIndex)) {
  const player = state.players[playerIndex];
  const item = player && layer?.kind === 'bag' && itemByUid(player, layer.itemUid);
  if (!item || !ITEMS[item.id]?.system || layer.readOnly) return false;
  player.inventory = player.inventory.filter(entry => entry.uid !== item.uid);
  layer.itemUid = null;
  layer.view = 'main';
  renderAll();
  return true;
}

function bagSelectTarget(playerIndex, targetId) {
  const layer = layerOf(playerIndex);
  if (!layer || layer.kind !== 'bag') return false;
  layer.targetId = targetId;
  layer.targetStale = false;
  renderAll();
  return true;
}

function layerToggleHistory(playerIndex) {
  const layer = layerOf(playerIndex);
  if (!layer) return false;
  if (layer.kind !== 'talk') return false;
  layer.view = layer.view === 'history' ? 'main' : 'history';
  renderAll();
  return true;
}

function openHumanItemPanelIndex() {
  for (const player of state.players) {
    if (player.control === 'human' && player.turn.itemPanel?.itemUid) return player.index;
  }
  return -1;
}

/* ---------------------------------------------------------------------------
 * 每侧独立展开层：一个玩家同一时刻只呈现一个主层，详情作为其内部子页。
 * 层状态挂在 player.turn.layer 上，两侧完全独立，互不阻塞、互不关闭。
 * ---------------------------------------------------------------------------
 *   kind: 'bag'    行囊（三个分类页与道具详情子页）
 *         'talk'   NPC 对话（含历史记录子页）
 *   page: 网格/对话的当前页，从 0 开始
 *   view: 'main' | 'detail' | 'history'
 *   itemUid / targetId：行囊详情子页的选中道具与目标
 */
function layerOf(playerIndex) {
  return state.players[playerIndex]?.turn?.layer || null;
}

function openLayer(playerIndex, kind) {
  const player = state.players[playerIndex];
  if (!player || player.control !== 'human') return false;
  const infoOnly = !isSelectPhase() || playerCannotAct(player);
  // 非选择阶段仍然允许查看行囊与已发生的对话，只是不可提交。
  const current = player.turn.layer;
  if (current && current.kind === kind && current.view === 'main') return true;
  player.turn.layer = {
    kind,
    page: current && current.kind === kind ? current.page : 0,
    view: 'main',
    itemUid: null,
    targetId: null,
    readOnly: infoOnly && kind === 'bag'
  };
  if (kind === 'talk') pauseTyping(playerIndex);
  renderAll();
  return true;
}

// 层内「返回上一页」：只在子页里退回主网格页，不清理已选道具与对话进度。
// 注意语义分工 —— 收起草整层是 G/H 与头部常驻按钮的职责（closeLayer），
// 这里的「返回」只服务于层内底部按钮，两者不可混用。
function layerBack(playerIndex) {
  const player = state.players[playerIndex];
  const layer = player?.turn?.layer;
  if (!layer) return false;
  if (layer.view === 'main') return closeLayer(playerIndex);
  return layerBackToMain(playerIndex);
}

// 从详情子页返回主网格页，保留已选道具。
function layerBackToMain(playerIndex) {
  const layer = layerOf(playerIndex);
  if (!layer) return false;
  layer.view = 'main';
  layer.targetStale = false;
  renderAll();
  return true;
}

function closeLayer(playerIndex) {
  const player = state.players[playerIndex];
  if (!player?.turn?.layer) return false;
  // 收起对话不提交、不消耗行动，只停掉本侧未完成的打字定时器。
  if (player.turn.layer.kind === 'talk') pauseTyping(playerIndex);
  player.turn.layer = null;
  renderAll();
  return true;
}

function layerNextPage(playerIndex, direction = 1) {
  const layer = layerOf(playerIndex);
  if (!layer) return false;
  const total = layerPageCount(playerIndex, layer);
  if (total <= 1) return false;
  if (layer.kind === 'bag') {
    layer.view = 'main';
    layer.itemUid = null;
    layer.targetId = null;
  }
  layer.page = ((layer.page + direction) % total + total) % total;
  renderAll();
  return true;
}

// 行囊固定三页：体系装备、主动与被动、金钱与关键道具。
function layerPageCount(playerIndex, layer) {
  if (!layer) return 1;
  if (layer.kind === 'bag') return 3;
  return 1;
}

/* 事件路由：键位所属玩家 → 该玩家顶层界面 → 当前允许操作。
   每次事件最多触发一次；本侧层打开时拦截自己的底层行动，另一侧继续可操作。 */
function handleKeydown(event) {
  if (window.NightRoam?.active) return;
  const target = event.target;
  // 输入法 composition 期间、以及输入框里打字时不触发玩法键。
  if (event.isComposing || (target && (target.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))) return;

  /* 开发者入口：Ctrl+Shift+D 打开跳关面板。 */
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
    event.preventDefault();
    toggleDevPanel();
    return;
  }

  /* 【msg8 §22】选人界面键盘导航：setup 阶段整键盘交给选人逻辑。 */
  if (state.phase === 'setup' && !$('#setup').classList.contains('closed')) {
    if (setupKeyboardNav(event.code)) event.preventDefault();
    return;
  }

  /* 【msg8 §23】快捷治疗：选择阶段按 H 用最合理的治疗道具。作用于当前可行动的人类玩家。 */
  if (event.code === 'KeyH' && isSelectPhase()) {
    const pidx = state.players.findIndex(p => p.control === 'human' && !playerCannotAct(p) && isSelectPhase());
    if (pidx >= 0) {
      event.preventDefault();
      doQuickHeal(pidx);
    }
    return;
  }

  /* 【msg8 §4】主动技能：选择阶段按 R 打开技能面板 / 再次按 R 关闭。 */
  if (event.code === 'KeyR' && isSelectPhase()) {
    const pidx = state.players.findIndex(p => p.control === 'human' && !playerCannotAct(p) && isSelectPhase());
    if (pidx >= 0) {
      event.preventDefault();
      const player = state.players[pidx];
      if (player.turn?.activePanel) closeActivePanel(pidx); else openActivePanel(pidx);
    }
    return;
  }

  /* 阶段演出期间只认「跳过」：空格 / 回车都走和看完一样的出口，
     其它输入一律不穿透到下面的玩法层。 */
  if (state.phase === 'stage_transition') {
    if (['Space', 'Enter', 'Escape'].includes(event.code)) {
      event.preventDefault();
      finishStageTransition();
    }
    return;
  }

  // Esc 只关全局帮助 / 设置，不猜测属于哪个玩家；本侧关闭始终是 G / H。
  if (event.code === 'Escape') {
    $('#helpModal').classList.remove('open');
    $('#helpModal').setAttribute('aria-hidden', 'true');
    $('#settingsModal').classList.remove('open');
    $('#settingsModal').setAttribute('aria-hidden', 'true');
    $('#creditsModal').classList.remove('open');
    $('#creditsModal').setAttribute('aria-hidden', 'true');
    return;
  }

  const { playerIndex, role } = codeOwnerOf(event.code);
  if (playerIndex < 0) return;              // 不属于任何一侧的玩法键：静默失效
  const player = state.players[playerIndex];
  if (!player || player.control !== 'human') return;

  // 确认、使用、开关与已读一律忽略长按重复。
  if (event.repeat) return;

  if (role === 'bonus') {
    event.preventDefault();
    return void toggleSystemBonus(playerIndex);
  }

  const layer = layerOf(playerIndex);

  // 本侧展开层打开时，本侧按键只作用于这一层。
  if (layer) {
    event.preventDefault();
    return handleLayerKey(playerIndex, role, layer, event);
  }

  if (role === 'item') {
    event.preventDefault();
    return void useActiveShortcut(playerIndex, keyRowOf(playerIndex).items.indexOf(event.code));
  }

  // 层未打开：先处理本侧的通用键。
  if (role === 'bag') { event.preventDefault(); return void openLayer(playerIndex, 'bag'); }
  if (role === 'advance') { event.preventDefault(); return void advanceOnSide(playerIndex); }
  if (role === 'confirm') { event.preventDefault(); return void confirmOnSide(playerIndex); }
  if (role === 'back') { event.preventDefault(); return; }
  if (role === 'history') { event.preventDefault(); return; }
  if (role === 'prevPage' || role === 'nextPage') { event.preventDefault(); return; }

  if (role !== 'choice') return;
  event.preventDefault();
  const choiceIndex = keyRowOf(playerIndex).choices.indexOf(event.code);
  if (choiceIndex < 0) return;
  handleChoiceInput(playerIndex, choiceIndex);
}

function toggleSystemBonus(playerIndex) {
  const strip = $(`#infoStrip-${playerIndex}`);
  if (!strip) return false;
  if (layerOf(playerIndex)) closeLayer(playerIndex);
  const open = strip.classList.toggle('bonus-focus');
  const button = $('.system-bonus-toggle', strip);
  if (button) button.textContent = `体系加成 · ${playerIndex ? ';' : 'B'} ${open ? '收起' : '展开'}`;
  return open;
}

function useActiveShortcut(playerIndex, slot) {
  const player = state.players[playerIndex];
  if (!player || !isSelectPhase() || playerCannotAct(player) || player.turn.itemPanel) return false;
  const item = player.inventory.filter(candidate => itemCategoryOf(candidate) === 'active')[slot];
  if (!item || !itemUsable(player, item).ok) return false;
  const def = ITEMS[item.id];
  if (def.effect?.requiresTarget) {
    openLayer(playerIndex, 'bag');
    const layer = layerOf(playerIndex);
    layer.view = 'detail'; layer.itemUid = item.uid; layer.targetId = null;
    renderAll();
    return true;
  }
  if (!openItemPanel(playerIndex, item.uid)) return false;
  return confirmItemUse(playerIndex);
}

// 展开层内部的按键分发：四条选项键 = 当前页第 1–4 项，A/D 或 K/L 翻页。
function handleLayerKey(playerIndex, role, layer, event) {
  const row = keyRowOf(playerIndex);
  if (!row) return;
  // 玩家二的 M 在行动页是主动道具，在对话层仍保留原来的历史记录语义。
  if (layer.kind === 'talk' && event.code === row.history) return void layerToggleHistory(playerIndex);
  // G/H 在本侧展开层里始终是「收起整层」，任何子页深度都一样。
  // 子页的「返回」由层内底部按钮承担，避免同一个键在深层悄悄换意思。
  if (role === 'back') return void (layer.kind === 'talk' ? closeDialogue(playerIndex) : closeLayer(playerIndex));
  if (role === 'bag') return void toggleBagPanel(playerIndex);
  if (role === 'prevPage') return void layerNextPage(playerIndex, -1);
  if (role === 'nextPage') return void layerNextPage(playerIndex, 1);
  if (role === 'history') return void layerToggleHistory(playerIndex);
  if (role === 'item' && layer.kind === 'bag' && layer.view === 'main') {
    const index = row.items.indexOf(event.code);
    if (index >= 0) return void bagSelectIndex(playerIndex, layer, index + 4);
  }
  if (role === 'advance' || role === 'confirm') {
    return void layerConfirm(playerIndex, layer);
  }
  if (role !== 'choice') return;
  const index = row.choices.indexOf(event.code);
  if (index < 0) return;
  layerSelect(playerIndex, layer, index);
}

// 【确认 / 继续】在无层状态下的语义：结果页=我已读完，总结页=我准备好了，选择页=锁定当前高亮项。
function advanceOnSide(playerIndex) {
  const resultSlot = slotOfPhase(state.phase, 'result');
  if (resultSlot) return acknowledgeResult(playerIndex);
  if (state.phase === ROUND_SUMMARY) return markRoundReady(playerIndex);
  const layer = layerOf(playerIndex);
  if (!layer) return openFirstAvailableLayer(playerIndex);
  return false;
}
const confirmOnSide = advanceOnSide;

// 无层时按【继续】：对话中优先继续对话，否则展开行囊。
function openFirstAvailableLayer(playerIndex) {
  const player = state.players[playerIndex];
  if (!player) return false;
  if (player.turn.npc) return openLayer(playerIndex, 'talk');
  if (isSelectPhase() && !playerCannotAct(player)) return openLayer(playerIndex, 'bag');
  return false;
}

/* ---------------------------------------------------------------------------
 * 双人推进：三个状态彼此独立
 *   1. 本侧行动确认  player.turn.slots[n].confirmed
 *   2. 结果已读      player.turn.slots[n].acknowledged
 *   3. 回合准备      player.turn.roundReady（round_summary 阶段专用）
 * 甲确认之后乙仍能看完自己的内容；甲无法替乙确认。全部确认后只推进一次。
 * ---------------------------------------------------------------------------
 */
function markRoundReady(playerIndex) {
  const player = state.players[playerIndex];
  if (!player || player.control !== 'human') return false;
  if (state.phase !== ROUND_SUMMARY) return false;
  if (player.turn.roundReady === state.round) return false;   // 幂等：同一回合只记一次
  player.turn.roundReady = state.round;
  if (audio.action) audio.action('lock', playerIndex);
  if (!state.headless) {
    renderResult(player, 0);
    renderGlobal();
    window.NightCrownProgress?.onRender();
  }
  maybeAdvanceRound();
  return true;
}

function roundReadyCount() {
  const humans = state.players.filter(player => player.control === 'human' && !player.collapsed);
  const ready = humans.filter(player => player.turn.roundReady === state.round);
  return { ready: ready.length, total: humans.length };
}

function maybeAdvanceRound() {
  if (state.phase !== ROUND_SUMMARY) return false;
  const { ready, total } = roundReadyCount();
  if (ready < total) return false;
  continueRound();
  return true;
}

// 单一入口：键位、鼠标点击都走这里，避免两条路径行为不一致。
function handleChoiceInput(playerIndex, choiceIndex) {
  const player = state.players[playerIndex];
  if (!player || !isSelectPhase()) return false;
  if (player.turn.itemPanel) return false;
  if (player.turn.npc) return false;
  if (player.turn.layer) return false;      // 展开层打开时由层自己接管选项键
  if (playerCannotAct(player)) return false;
  const slot = currentSelectSlot();
  if (slot && player.turn.slots[slot]?.confirmed) return false;   // 本格已锁定，不再重复提交
  const entries = legalEntries(player);
  const entry = entries[choiceIndex];
  if (!entry) return false;
  // 无目标道具直接执行；需要目标的道具仍打开目标选择面板。
  if (entry.kind === 'item') {
    const item = itemByUid(player, entry.itemUid);
    if (!item || !itemUsable(player, item).ok) return false;
    if (!ITEMS[item.id].effect?.requiresTarget) {
      // 无目标道具：选项本身就是使用决定，不强迫玩家再开背包并确认一遍。
      if (!openItemPanel(playerIndex, item.uid)) return false;
      return confirmItemUse(playerIndex);
    }
    openLayer(playerIndex, 'bag');
    const layer = layerOf(playerIndex);
    layer.view = 'detail'; layer.itemUid = item.uid; layer.targetId = null;
    renderAll();
    return true;
  }
  if (entry.kind === 'npc') return openDialogue(playerIndex, entry.npcId);
  return commitChoice(playerIndex, choiceIndex, 'human');
}

renderPlayerShells();
renderHeroSetup();

// 数据校验只在控制台报警，绝不阻断加载：玩家的开局不能被一条数据断言毁掉。
const itemLinkProblems = validateItemLinks();
if (itemLinkProblems.length) {
  window.__nightCrownValidationErrors = itemLinkProblems;
  console.error('[夜冠] 道具数据校验未通过（游戏仍可运行，请在 tests/ 中修复）：', itemLinkProblems);
}
state.players.filter(player => player.control === 'human').forEach(player => applyRoomBg($(`#roomCurrent-${player.index}`), player.room));
state.players.filter(player => player.control === 'human').forEach(player => setNarrative(player.index, ROOM_BY_ID[player.room].desc, ROOM_BY_ID[player.room].icon));
renderAll();

$('#splitBoard').addEventListener('click', event => {
  const target = event.target;
  const playerIndexOf = node => {
    const owner = node.closest('.player-view');
    const value = node.dataset.player ?? owner?.dataset.player;
    return value === undefined ? -1 : Number(value);
  };
  const humanAt = index => state.players[index]?.control === 'human';

  /* ── 本侧展开层：归属完全由 data-player 决定，绝不触碰另一侧 ── */
  const layerClose = target.closest('[data-layer-close]');
  if (layerClose) {
    const index = playerIndexOf(layerClose);
    if (humanAt(index)) layerOf(index)?.kind === 'talk' ? closeDialogue(index) : closeLayer(index);
    return;
  }
  const dialogueLeave = target.closest('[data-dialogue-leave]');
  if (dialogueLeave) {
    const index = playerIndexOf(dialogueLeave);
    if (humanAt(index)) closeDialogue(index);
    return;
  }
  const layerBack = target.closest('[data-layer-back]');
  if (layerBack) {
    const index = playerIndexOf(layerBack);
    if (humanAt(index)) layerBackToMain(index);
    return;
  }
  const layerItem = target.closest('[data-layer-item]');
  if (layerItem) {
    const index = playerIndexOf(layerItem);
    const layer = layerOf(index);
    if (humanAt(index) && layer?.kind === 'bag') bagSelectIndex(index, layer, bagPageItems(index, layer).findIndex(item => item.uid === layerItem.dataset.layerItem));
    return;
  }
  const layerTarget = target.closest('[data-layer-target]');
  if (layerTarget) {
    const index = playerIndexOf(layerTarget);
    if (humanAt(index)) bagSelectTarget(index, layerTarget.dataset.layerTarget);
    return;
  }
  const layerUse = target.closest('[data-layer-use]');
  if (layerUse) {
    const index = playerIndexOf(layerUse);
    const layer = layerOf(index);
    if (humanAt(index) && layer) confirmBagUse(index, layer);
    return;
  }
const layerDiscard = target.closest('[data-layer-discard]');
if (layerDiscard) {
  const index = playerIndexOf(layerDiscard);
  if (humanAt(index)) discardSystemGear(index);
  return;
}
const layerUpgrade = target.closest('[data-layer-upgrade]');
if (layerUpgrade) {
  const index = playerIndexOf(layerUpgrade);
  if (!humanAt(index)) return;
  const player = state.players[index];
  const item = itemByUid(player, layerUpgrade.dataset.layerUpgrade);
  if (item && upgradeGear(player, item)) {
    if (audio.itemConfirm) audio.itemConfirm(index);
    renderAll();
  }
  return;
}
const pendingTake = target.closest('[data-pending-take]');
if (pendingTake) {
  const index = playerIndexOf(pendingTake);
  if (humanAt(index) && takePendingLoot(state.players[index], pendingTake.dataset.pendingTake)) {
    if (audio.itemConfirm) audio.itemConfirm(index);
    renderAll();
  }
  return;
}
const pendingScrap = target.closest('[data-pending-scrap]');
if (pendingScrap) {
  const index = playerIndexOf(pendingScrap);
  if (humanAt(index) && scrapPendingLoot(state.players[index], pendingScrap.dataset.pendingScrap)) {
    if (audio.itemConfirm) audio.itemConfirm(index);
    renderAll();
  }
  return;
}
const layerAdvance = target.closest('[data-layer-advance]');
  if (layerAdvance) {
    const index = playerIndexOf(layerAdvance);
    if (humanAt(index)) advanceDialogue(index);
    return;
  }
  const layerTopic = target.closest('[data-layer-topic]');
  if (layerTopic) {
    const index = playerIndexOf(layerTopic);
    if (humanAt(index)) chooseDialogueTopic(index, Number(layerTopic.dataset.layerTopic));
    return;
  }
  const layerHistory = target.closest('[data-layer-history]');
  if (layerHistory) {
    const index = playerIndexOf(layerHistory);
    if (humanAt(index)) layerToggleHistory(index);
    return;
  }
  const bagOpen = target.closest('[data-bag-open]');
  if (bagOpen) {
    const index = playerIndexOf(bagOpen);
    if (humanAt(index)) openLayer(index, 'bag');
    return;
  }
  const quickHeal = target.closest('[data-quick-heal]');
  if (quickHeal) {
    const index = playerIndexOf(quickHeal);
    if (humanAt(index)) doQuickHeal(index);
    return;
  }
  const skillOpen = target.closest('[data-skill-open]');
  if (skillOpen) {
    const index = playerIndexOf(skillOpen);
    if (humanAt(index)) openActivePanel(index);
    return;
  }
  const skillTarget = target.closest('[data-skill-target]');
  if (skillTarget) {
    const index = playerIndexOf(skillTarget);
    if (humanAt(index)) selectActiveTarget(index, skillTarget.dataset.skillTarget);
    return;
  }
  const skillConfirm = target.closest('[data-skill-confirm]');
  if (skillConfirm) {
    const index = playerIndexOf(skillConfirm);
    if (humanAt(index)) confirmActiveSkill(index);
    return;
  }
  const skillCancel = target.closest('[data-skill-cancel]');
  if (skillCancel) {
    const index = playerIndexOf(skillCancel);
    if (humanAt(index)) closeActivePanel(index);
    return;
  }
  const talkOpen = target.closest('[data-talk-open]');
  if (talkOpen) {
    const index = playerIndexOf(talkOpen);
    if (humanAt(index)) openLayer(index, 'talk');
    return;
  }
  const roundReady = target.closest('[data-round-ready]');
  if (roundReady) {
    const index = playerIndexOf(roundReady);
    if (humanAt(index)) markRoundReady(index);
    return;
  }

  const itemOpen = target.closest('[data-item-open]');
  if (itemOpen) {
    const index = playerIndexOf(itemOpen);
    if (humanAt(index)) {
      openLayer(index, 'bag');
      const layer = layerOf(index);
      layer.view = 'detail'; layer.itemUid = itemOpen.dataset.itemOpen; layer.targetId = null;
      renderAll();
    }
    return;
  }
  const itemAction = target.closest('[data-item-action]');
  if (itemAction) {
    const index = playerIndexOf(itemAction);
    if (!humanAt(index)) return;
    if (itemAction.dataset.itemAction === 'use') confirmItemUse(index);
    else closeItemPanel(index);
    return;
  }
  const itemTarget = target.closest('[data-item-target]');
  if (itemTarget) {
    const index = playerIndexOf(itemTarget);
    if (humanAt(index)) selectItemTarget(index, itemTarget.dataset.itemTarget);
    return;
  }
  const skip = target.closest('[data-dialogue-skip]');
  if (skip) {
    const index = playerIndexOf(skip);
    if (state.players[index]?.control === 'human') skipDialogue(index);
    return;
  }
  const topic = target.closest('[data-dialogue-choice]');
  if (topic) {
    const index = playerIndexOf(topic);
    if (state.players[index]?.control === 'human') chooseDialogueTopic(index, Number(topic.dataset.dialogueChoice));
    return;
  }
  const dialogHost = target.closest('.dialogue');
  if (dialogHost) {
    const index = playerIndexOf(dialogHost);
    if (state.players[index]?.control === 'human') advanceDialogue(index);
    return;
  }
  const resultContinue = target.closest('[data-result-continue]');
  if (resultContinue) {
    const index = playerIndexOf(resultContinue);
    if (state.players[index]?.control === 'human') acknowledgeResult(index);
    return;
  }
  const blockedTool = target.closest('[data-blocked-use]');
  if (blockedTool) {
    const index = playerIndexOf(blockedTool);
    if (state.players[index]?.control === 'human') commitBlockedRoute(index, blockedTool.dataset.blockedUse);
    return;
  }
  const blockedDrop = target.closest('[data-blocked-drop]');
  if (blockedDrop) {
    const index = playerIndexOf(blockedDrop);
    if (state.players[index]?.control === 'human') discardBlockedRoute(index, blockedDrop.dataset.blockedDrop);
    return;
  }
  // 侧栏信息可折叠：收起后房间舞台进一步放大。
  const stripToggle = target.closest('[data-strip-toggle]');
  if (stripToggle) {
    const strip = stripToggle.closest('.info-strip');
    if (strip) {
      const collapsed = strip.classList.toggle('collapsed');
      stripToggle.setAttribute('aria-expanded', String(!collapsed));
      stripToggle.textContent = collapsed ? '展开 ▸' : '收起 ▾';
    }
    return;
  }
  const systemToggle = target.closest('[data-system-toggle]');
  if (systemToggle) {
    const index = playerIndexOf(systemToggle);
    if (humanAt(index)) toggleSystemBonus(index);
    return;
  }
  const button = target.closest('[data-choice]');
  if (!button) return;
  const playerIndex = playerIndexOf(button);
  if (state.players[playerIndex]?.control !== 'human') return;
  handleChoiceInput(playerIndex, Number(button.dataset.choice));
});

$('.setup-controls').addEventListener('click', event => {
  const modeButton = event.target.closest('[data-mode]');
  if (modeButton) {
    setupMode = modeButton.dataset.mode;
    $$('.mode-switch button').forEach(button => button.classList.toggle('active', button === modeButton));
    $('#p2ModeLabel').textContent = setupMode === 'ai' ? 'TACTICAL AI' : 'PLAYER TWO';
    $('#p2HeroTitle').textContent = setupMode === 'ai' ? '人机角色' : '玩家二角色';
    $('.hero-columns').classList.toggle('single-player-setup', setupMode === 'ai');
    return;
  }
		// 调试跳关的两个按钮组。各自只切换自己那一组的高亮，
		// 不去动赛程按钮的状态（它们共用 .round-buttons 样式）。
		const debugStageButton = event.target.closest('[data-stage]');
		if (debugStageButton) {
			setupDebugStage = debugStageButton.dataset.stage || '';
			$$('#debugStageButtons button').forEach(button => button.classList.toggle('active', button === debugStageButton));
			return;
		}
		const debugRoundButton = event.target.closest('[data-debug-round]');
		if (debugRoundButton) {
			setupDebugRound = Number(debugRoundButton.dataset.debugRound) || 1;
			$$('#debugRoundButtons button').forEach(button => button.classList.toggle('active', button === debugRoundButton));
			return;
		}
		const roundButton = event.target.closest('[data-rounds]');
  if (roundButton) {
    const picked = Number(roundButton.dataset.rounds);
    setupRounds = ROUND_PRESETS.some(preset => preset.rounds === picked) ? picked : 8;
    $$('.round-buttons button').forEach(button => {
      const active = button === roundButton;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const hint = $('#roundHint');
    if (hint) hint.textContent = ROUND_PRESETS.find(preset => preset.rounds === setupRounds)?.hint || '';
    return;
  }
  const botButton = event.target.closest('[data-bot-count]');
  if (botButton) {
    setupBotCount = clamp(Number(botButton.dataset.botCount), 2, 5);
    $$('.bot-count-buttons button').forEach(button => {
      const active = button === botButton;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    return;
  }
  const heroPageButton = event.target.closest('[data-hero-page]');
  if (heroPageButton) {
    heroCatalogPage[Number(heroPageButton.dataset.player)] = Number(heroPageButton.dataset.heroPage);
    renderHeroSetup();
    return;
  }
  const heroButton = event.target.closest('[data-setup-player]');
  if (heroButton) {
    const playerIndex = Number(heroButton.dataset.setupPlayer);
    setupSelection[playerIndex] = Number(heroButton.dataset.hero);
    renderHeroSetup();
  }
});

$('#enterBtn').addEventListener('click', enterGame);
// 全局不再提供「进入下一回合」：两边都准备好之后由 maybeAdvanceRound 自动推进。
$('#continueBtn').addEventListener('click', () => {});
$('#soundBtn').addEventListener('click', event => {
  /* 一个按钮管全部：总音量节点是所有声音的必经之路，
     所以阶段文件音乐、环境声、事件音效会一起静音或恢复。 */
  const muted = audio.toggle();
  syncSoundButton();
  event.currentTarget.classList.remove('audio-error');
  if (!muted) StageMusic.unlock?.();
});

function syncSoundButton() {
  const button = $('#soundBtn');
  if (!button) return;
  const muted = Boolean(audio.muted);
  button.classList.toggle('muted', muted);
  button.textContent = muted ? '×' : '♫';
  button.setAttribute('aria-pressed', muted ? 'true' : 'false');
  button.title = muted ? '声音已关闭（点一下恢复）' : '声音开启';
}

/* ---------------------------------------------------------------------------
 * 设置面板
 * ---------------------------------------------------------------------------
 * 四档音量落盘；「重新载入声音素材」是任务书要求的可见恢复入口：
 * 素材缺失或解码失败时，玩家不需要重开游戏就能再试一次。
 * ------------------------------------------------------------------------- */
function renderSettings() {
  const settings = audio.getSettings();
  const rows = [['master', 'volMaster'], ['music', 'volMusic'], ['ambient', 'volAmbient'], ['fx', 'volFx']];
  for (const [bus, id] of rows) {
    const input = $(`#${id}`);
    const out = $(`#${id}Out`);
    const value = Math.round((bus === 'master' ? settings.master : settings[bus]) * 100);
    if (input) {
      input.value = String(value);
      input.setAttribute('aria-valuetext', `${value}%`);
    }
    if (out) out.textContent = String(value);
  }
  const motion = $('#settingsMotion');
  if (motion) {
    motion.setAttribute('aria-pressed', reducedMotion ? 'true' : 'false');
    motion.classList.toggle('active', reducedMotion);
  }
  const seed = $('#seedLine');
  if (seed) seed.textContent = `本局种子：${state.seed || '—'}（同一个种子会复现同一局）`;
  renderAudioStatus();
}

function renderAudioStatus() {
  const host = $('#audioStatus');
  if (!host) return;
  if (typeof StageMusic === 'undefined' || !StageMusic.diagnostics) {
    host.textContent = '音乐调度器未加载。';
    host.className = 'settings-status bad';
    return;
  }
  const info = StageMusic.diagnostics();
  const failed = Object.entries(info.failed || {});
  if (failed.length) {
    host.textContent = `有 ${failed.length} 首背景音乐没能载入：${failed.map(([key, message]) => `${key}（${message}）`).join('、')}。点下面的按钮再试一次。`;
    host.className = 'settings-status bad';
    return;
  }
  if (info.missing.length) {
    host.textContent = `还有 ${info.missing.length} 首背景音乐在载入中。`;
    host.className = 'settings-status';
    return;
  }
  if (!info.ready.length) {
    host.textContent = audio.ctx ? '音乐尚未开始载入。' : '浏览器还没有解锁声音：点一下页面任意按钮即可。';
    host.className = 'settings-status';
    return;
  }
  host.textContent = `已就绪：${info.ready.join('、')}${info.current ? ` · 当前 ${info.current}` : ''}`;
  host.className = 'settings-status good';
}

function openSettings() {
  renderSettings();
  $('#settingsModal').classList.add('open');
  $('#settingsModal').setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  $('#settingsModal').classList.remove('open');
  $('#settingsModal').setAttribute('aria-hidden', 'true');
}

$('#growthBody').addEventListener('click', event => {
  const button = event.target.closest('[data-growth]');
  if (!button) return;
  chooseGrowth(Number(button.dataset.growthPlayer), button.dataset.growth);
});

/* ---------------------------------------------------------------------------
 * 标题页 → 配置页
 * ---------------------------------------------------------------------------
 * 打开游戏先看主视觉与四个菜单项：开始游戏 / 玩法说明 / 设置 / 制作名单。
 * 「继续游戏」不做：这一版没有存档系统，放一个按不动的按钮只会误导。
 * 运行方式这类说明放在制作名单页脚，不再占据主视觉。
 * ------------------------------------------------------------------------- */
function showTitle() {
  musicEvent('title');
  $('#titleScreen').classList.remove('closed');
  $('#setup').classList.add('closed');
  renderAudioStatus();
  window.NightCrownProgress?.refreshContinue();
  window.NightRoam?.refreshContinue?.();
}

function showSetup() {
  $('#titleScreen').classList.add('closed');
  $('#setup').classList.remove('closed');
  /* 【msg8 §22】每次进入选人界面重置键盘光标与确认状态。 */
  setupCursor.side = 0; setupCursor.hero = setupSelection[0];
  setupConfirmed[0] = false; setupConfirmed[1] = false;
  renderHeroSetup();
  const hint = $('#roundHint');
  if (hint) hint.textContent = ROUND_PRESETS.find(preset => preset.rounds === setupRounds)?.hint || '';
}

$('#titleStart').addEventListener('click', showSetup);
$('#backToTitle').addEventListener('click', showTitle);
$('#titleHelp').addEventListener('click', () => {
  renderControlTable();
  $('#helpModal').classList.add('open');
  $('#helpModal').setAttribute('aria-hidden', 'false');
});
$('#titleSettings').addEventListener('click', openSettings);
$('#titleCredits').addEventListener('click', () => {
  $('#creditsModal').classList.add('open');
  $('#creditsModal').setAttribute('aria-hidden', 'false');
});
$('#closeCredits').addEventListener('click', () => {
  $('#creditsModal').classList.remove('open');
  $('#creditsModal').setAttribute('aria-hidden', 'true');
});

/* 调试跳关只在开发入口里出现：默认隐藏，Ctrl+Shift+D 或点按钮打开。 */
function toggleDevPanel(force = null) {
  const panel = $('#devPanel');
  const button = $('#devToggle');
  if (!panel) return;
  const open = force === null ? panel.classList.contains('closed') : Boolean(force);
  panel.classList.toggle('closed', !open);
  if (button) button.setAttribute('aria-pressed', open ? 'true' : 'false');
}

$('#devToggle').addEventListener('click', () => toggleDevPanel());

$('#settingsBtn').addEventListener('click', openSettings);
$('#closeSettings').addEventListener('click', closeSettings);
$('#settingsModal').addEventListener('click', event => {
  if (event.target === $('#settingsModal')) closeSettings();
});
$('#volMaster').addEventListener('input', event => audio.setMasterVolume(Number(event.target.value) / 100));
for (const [bus, id] of [['music', 'volMusic'], ['ambient', 'volAmbient'], ['fx', 'volFx']]) {
  $(`#${id}`).addEventListener('input', event => audio.setBusVolume(bus, Number(event.target.value) / 100));
}
$('#audioRetry').addEventListener('click', async () => {
  const host = $('#audioStatus');
  if (host) { host.textContent = '正在重新载入…'; host.className = 'settings-status'; }
  try {
    if (!audio.ctx) await audio.start();
    else if (audio.ctx.state !== 'running') await audio.ctx.resume();
    StageMusic.attach(audio);
    await StageMusic.preload();
    StageMusic.unlock?.();
    $('#soundBtn').classList.remove('audio-error');
  } catch (error) {
    if (host) { host.textContent = `重新载入失败：${error && error.message || error}`; host.className = 'settings-status bad'; }
  }
  renderAudioStatus();
});
$('#audioMute').addEventListener('click', () => {
  audio.toggle();
  syncSoundButton();
  renderSettings();
});
$('#settingsMotion').addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  document.body.classList.toggle('reduce-motion', reducedMotion);
  const button = $('#motionBtn');
  if (button) {
    button.setAttribute('aria-pressed', reducedMotion ? 'true' : 'false');
    button.classList.toggle('active', reducedMotion);
  }
  try { localStorage.setItem('nightcrown.reduceMotion', reducedMotion ? '1' : '0'); } catch (error) { /* 忽略 */ }
  renderSettings();
});
$('#helpBtn').addEventListener('click', () => {
  renderControlTable();
  $('#helpModal').classList.add('open');
  $('#helpModal').setAttribute('aria-hidden', 'false');
});

// 帮助面板的按键表从 keys.js 的 KEYMAP 生成，标签、教程与实现永远一致。
function renderControlTable() {
  const host = $('#controlTable');
  if (!host || typeof controlTableRows !== 'function') return;
  const rows = controlTableRows();
  host.innerHTML = `<span class="ct-head">操作</span><b class="ct-head">玩家一（左区）</b><b class="ct-head">玩家二（右区）</b>`
    + rows.map(row => `<span>${row.action}</span><b>${row.left}</b><b>${row.right}</b>`).join('')
    + '<span>全局</span><b>Esc 关掉规则面板</b><b>空格 / 回车不代替任何一方确认</b>';
}
$('#motionBtn').addEventListener('click', event => {
  const reduced = document.body.classList.toggle('reduce-motion');
  event.currentTarget.setAttribute('aria-pressed', reduced ? 'true' : 'false');
  event.currentTarget.classList.toggle('active', reduced);
  reducedMotion = reduced;
  try { localStorage.setItem('nightcrown.reduceMotion', reduced ? '1' : '0'); } catch (error) { /* 本地存储不可用时忽略 */ }
});
$('#closeHelp').addEventListener('click', () => {
  $('#helpModal').classList.remove('open');
  $('#helpModal').setAttribute('aria-hidden', 'true');
});
$('#restartBtn').addEventListener('click', resetToSetup);
$('#endRestart').addEventListener('click', resetToSetup);
document.addEventListener('keydown', handleKeydown);

/* ---------------------------------------------------------------------------
 * 本地测试接口：供 tests/ 下的自动化用例直接驱动状态机
 * ---------------------------------------------------------------------------
 */
window.__nightCrownTest = {
  get state() { return state; },
  get reducedMotion() { return reducedMotion; },
  PHASES,
  ITEMS, ITEM_CATEGORY, NPCS, ITEM_CATEGORY_ORDER, BAG_CAPACITY, OTHER_ITEM_CAPACITY, GEAR_SYSTEMS, GEAR_IDS,
  bagCounts, canCarryItem, giveItem,
  systemCount, systemTier, secretMarketOpen, chooseSystemLoot,
  createState(mode, botCount, rounds) { return makeState(mode, botCount, rounds); },
  ROUND_PRESETS, OPTION_MIN, OPTION_DEFAULT, OPTION_MAX,
  setupRounds: () => setupRounds,
  setSetupRounds(value) {
    const picked = Number(value);
    setupRounds = [6, 8, 12].includes(picked) ? picked : 8;
    return setupRounds;
  },
  statHint, edgeTier, edgeNote, itemUseFlavor,
  statOr,
  // 独立操作与双确认专项（提示词第六节验收用例）
  KEYMAP: typeof KEYMAP !== 'undefined' ? KEYMAP : null,
  controlTableRows: typeof controlTableRows === 'function' ? controlTableRows : null,
  keyLabel: typeof keyLabel === 'function' ? keyLabel : null,
  playerOfCode: typeof playerOfCode === 'function' ? playerOfCode : null,
  openLayer, closeLayer, layerOf, layerBack, layerBackToMain, layerNextPage, layerToggleHistory,
  bagPageItems, bagSelectIndex, bagSelectTarget, confirmBagUse, toggleBagPanel,
  markRoundReady, roundReadyCount, maybeAdvanceRound,
  dismissItemPanel: playerIndex => closeItemPanel(playerIndex),
  pauseTyping,
  setState(next) {
    state = next;
    state.headless = true;
    renderPlayerShells();
    renderAll();
  },
  setHeadless(flag) { state.headless = Boolean(flag); renderAll(); },
  setRngSequence(values) { rng.set(values); },
  set reducedMotion(value) { reducedMotion = Boolean(value); },
  buildRoutes(playerIndex) { buildRoutes(state.players[playerIndex]); return state.players[playerIndex].routes; },
  generateOptions(playerIndex, slot = 1) { return generateOptions(state.players[playerIndex], slot); },
  startTravelPhase: enterTravelSelect,
  enterTravelSelect,
  enterActionSelect,
  enterActionResolve: runActionResolve,
  startActionPhase(slot = 1) { enterActionSelect(slot); return runActionResolve(slot); },
  isPlayerReady: playerRef => isPlayerReady(playerRef),
  ready(index) { return isPlayerReady(state.players[index]); },
  commitChoice,
  lockChoice(playerIndex, choiceIndex) { return handleChoiceInput(playerIndex, choiceIndex); },
  acknowledgeResult,
  continueRound,
  finishRound,
  maybeAdvance,
  legalEntries(index) { return legalEntries(state.players[index]); },
  hasLegalAction(index) { return hasLegalAction(state.players[index]); },
  playerCannotAct(index) { return playerCannotAct(state.players[index]); },
  itemUsable(index, uid) { const item = itemByUid(state.players[index], uid); return item ? itemUsable(state.players[index], item) : { ok: false, reason: '没有这件道具' }; },
  openItemPanel,
  confirmItemUse,
  selectItemTarget,
  closeItemPanel,
  openDialogue,
  advanceDialogue,
  skipDialogue,
  chooseDialogueTopic,
  npcTopicChoices(index) { return npcTopicChoices(state.players[index], NPC_BY_ROOM[state.players[index].room]); },
  useItemForTest(playerIndex, uid) {
    const item = uid ? itemByUid(state.players[playerIndex], uid) : state.players[playerIndex].inventory[0] || null;
    if (!item) return null;
    const result = emptyResult('success', 'test');
    applyItemEffect(state.players[playerIndex], item, result, {});
    useAndMaybeBreakItem(state.players[playerIndex], item, result);
    return result;
  },
  calculateAttackChance(a, b, style, spectators) {
    const attacker = typeof a === 'number' ? state.players[a] : a;
    const defender = typeof b === 'number' ? state.players[b] : b;
    return calculateAttackChance(attacker, defender, { style: style || 'force' }, null, { spectatorCount: spectators || 0 });
  },
  resolveActions() { return runActionResolve(1).then(() => runActionResolve(2)); },
  resolveRewardForTest(playerIndex, relicId) {
    const player = state.players[playerIndex];
    const intent = { entry: { kind: 'reward', tags: ['reward'] }, itemUid: null };
    if (relicId) {
      const item = makeItem(relicId);
      player.inventory.push(item);
      intent.itemUid = item.uid;
    }
    const result = emptyResult('success', 'test');
    return resolveRewardAction(player, intent, result).then(() => result);
  },
  playTransitionForTest(playerIndex, route) { return playTransition(state.players[playerIndex], route); },
  processCollapses,
  clampCoreDelta,
  /* 成长与构筑（任务书第六节）的验证入口。 */
  standingStat: (playerIndex, key) => standingStat(state.players[playerIndex], key),
  effectiveStat: (playerIndex, key) => effectiveStat(state.players[playerIndex], key),
  maxStandingStat(playerIndex = 0) {
    const player = state.players[playerIndex];
    return Math.max(...CORE_STAT_KEYS.map(key => standingStat(player, key)));
  },
  growthDirection: playerIndex => growthDirection(state.players[playerIndex]),
  gearQuality: uid => {
    for (const player of state.players) {
      const item = itemByUid(player, uid);
      if (item) return gearQuality(item);
    }
    return null;
  },
  gearScoreOf: uid => {
    for (const player of state.players) {
      const item = itemByUid(player, uid);
      if (item) return gearScore(item);
    }
    return null;
  },
  itemAffixesOf: uid => {
    for (const player of state.players) {
      const item = itemByUid(player, uid);
      if (item) return itemAffixes(item).map(affix => ({ ...affix, text: affixText(affix) }));
    }
    return null;
  },
  applyCalibration: playerIndex => applyCalibration(state.players[playerIndex], []),
  upgradeGearByUid: (playerIndex, uid) => {
    const player = state.players[playerIndex];
    const item = itemByUid(player, uid);
    return item ? upgradeGear(player, item) : false;
  },
  giveItemForTest: (playerIndex, itemId) => giveItem(state.players[playerIndex], itemId),
  pendingLoot: playerIndex => (state.players[playerIndex].pendingLoot || []).map(item => item.uid),
  takePendingLoot, scrapPendingLoot,
  materials: playerIndex => Number(state.players[playerIndex].materials) || 0,
  setMaterials(playerIndex, value) {
    state.players[playerIndex].materials = clamp(Number(value) || 0, 0, 99);
    return state.players[playerIndex].materials;
  },
  visualRegistry: () => (window.ClassicVisuals?.registry ? window.ClassicVisuals.registry() : null),
  roomArt: (roomId, stageId) => (window.ClassicVisuals?.roomArt ? window.ClassicVisuals.roomArt(roomId, stageId) : null),
  openStageGrowth,
  chooseGrowth,
  growthOffers: playerIndex => growthOffers(state.players[playerIndex]),
  growthLog: () => state.growthLog || [],
  scoreBreakdown: playerIndex => scoreBreakdown(state.players[playerIndex]),
  seed: () => state.seed,
  setSeed(value) { setupSeed = value ? String(value) : ''; return setupSeed; },
  musicDiagnostics: () => (typeof StageMusic !== 'undefined' && StageMusic.diagnostics ? StageMusic.diagnostics() : null),
  preloadAllMusic: () => (typeof StageMusic !== 'undefined' ? StageMusic.preload() : Promise.resolve()),
  musicPlay: (stage, options) => (typeof StageMusic !== 'undefined' ? StageMusic.play(stage, options || {}) : false),
  musicEvent,
  audioSettings: () => audio.getSettings(),
  setAudioBus: (bus, value) => audio.setBusVolume(bus, value),
  audioState: () => ({
    ctx: audio.ctx ? audio.ctx.state : 'none',
    muted: audio.muted,
    master: audio.ctx && audio.master ? Number(audio.master.gain.value.toFixed(4)) : null,
    fileMusic: audio.ctx && audio.fileMusic ? Number(audio.fileMusic.gain.value.toFixed(4)) : null
  }),
  estimateDelta(playerIndex, entryIndex, itemUid) {
    const player = state.players[playerIndex];
    const entry = legalEntries(player)[entryIndex];
    const item = itemUid ? itemByUid(player, itemUid) : null;
    return estimateDelta(player, entry, item);
  },
  rooms: ROOMS,
  npcs: NPCS,
  HEROES,
  ART_SKINS,
  heroArtUrl,
  heroArtStyle,
  applyHeroArt,
  heroArtFailures: () => [...heroArtFailures],
  renderHeroSetup,
  stalls() { return state.stalls; }
};
// 验收用例需要直接读取素材表与角色表，因此在 window 上也放一份只读引用。
window.HEROES = HEROES;
window.ART_SKINS = ART_SKINS;
applyStoredMotionPreference();
/* 声音按钮 / 设置面板与真实状态对齐；音量改动后所有入口同步刷新。 */
audio.onSettingsChange = () => { syncSoundButton(); };
syncSoundButton();
renderAudioStatus();

/* ---------------------------------------------------------------------------
 * Test bridge extension.
 * The legacy file used to assign window.__nightCrownTest twice; the second
 * (older) assignment silently overwrote the new one and still wrote
 * player.locked as a plain object. It has been removed. The helpers below are
 * the still-useful ones, folded into the single authoritative bridge above.
 * ---------------------------------------------------------------------------
 */
Object.assign(window.__nightCrownTest, {
  snapshot() { return JSON.parse(JSON.stringify(state)); },
  getState() { return state; },
  isReducedMotion() { return reducedMotion; },
  setReducedMotion(value) { reducedMotion = !!value; document.body.classList.toggle('reduce-motion', reducedMotion); },
  setBotCount(count) { setupBotCount = clamp(Number(count), 2, 5); return setupBotCount; },
  forceRoom(playerIndex, roomId) { const p = state.players[playerIndex]; p.room = roomId; buildRoutes(p); renderAll(); return p.room; },
  forceStats(playerIndex, values) { Object.assign(state.players[playerIndex].stats, values); renderAll(); return state.players[playerIndex].stats; },
  forceInventory(playerIndex, itemIds) { state.players[playerIndex].inventory = (itemIds || []).map(makeItem); renderAll(); return state.players[playerIndex].inventory; },
  giveItemToPlayer(playerIndex, itemId) { return giveItem(state.players[playerIndex], itemId); },
  enterDungeonForTest(playerIndex) { return sendToDungeon(state.players[playerIndex], emptyResult('fail', 'test'), 'test'); },
  clearJailForTest(playerIndex) { clearJailState(state.players[playerIndex]); return state.players[playerIndex]; },
  itemDurabilityOf(playerIndex, uid) { const item = itemByUid(state.players[playerIndex], uid); return item ? itemDurability(item) : 0; },
  scorePlayer(playerIndex) { return scorePlayer(state.players[playerIndex]); },
  setMaxRounds(n) { state.maxRounds = clamp(Number(n), 1, 99); renderAll(); return state.maxRounds; },
  roundOf() { return state.round; },
  phaseOf() { return state.phase; },
  playerPhase(playerIndex) { return state.players[playerIndex].phase; },
  turnOf(playerIndex) { return state.players[playerIndex].turn; },
  resolving() { return state.resolving; },
  OUTCOME_FEEDBACK, ACTION_FEEDBACK, ROOM_VOICE, SPEECH, HEROES, ROOMS, NORMAL_ROOM_IDS, NPC_BY_ROOM,
  estimateSpeechMs
});
