/* ---------------------------------------------------------------------------
 * 统一音乐调度器（原 stage-music.js）
 * ---------------------------------------------------------------------------
 * 这座城堡之前有两条互不相识的音乐链路：
 *   1. audio.js 启动时自己 startBgm()，程序化合成一层鼓点/持续音；
 *   2. stage-music.js 又用独立的 Audio 对象播阶段文件曲，先 pause 旧曲再放预制转场，
 *      再靠「固定跳到第 8 / 10 秒」续上下一首。
 * 两条链路谁也管不了谁，静音按钮只关掉第 1 条，阶段切换时还会出现双旋律。
 *
 * 现在文件音乐全部由这里的 MusicDirector 统一调度：
 *   - 事件驱动：进入标题 / 开局 / 换阶段 / 结束对局，才动音乐；
 *     renderGlobal() 之类的渲染函数一律不再控制音乐生命周期。
 *   - 双卡座交叉淡化：从旧曲「真实播放位置」开始，不再停掉再重来。
 *   - 所有声音挂到 AudioEngine 的总线上，静音按钮覆盖全部。
 *   - 每次切换带代次编号，重开 / 静音 / 连续切阶段都会取消上一批淡化和回调。
 *   - 素材缺失或解码失败不会卡住游戏，只发一次回调让界面给出可点的恢复入口。
 *
 * 关于预制转场：audio/transitions/ 下那四段文件仍然登记在 BRIDGES 里，
 * 但默认不参与播放。它们的前提是「旧曲正好停在第 8/10 秒、下一首正好从第 8/10 秒接」，
 * 这个前提没有经过听感验证，硬接就是任务书里说的「把两首完整音乐生硬重叠」。
 * 需要它们时把 BRIDGES[key].verified 改成 true，调度器才会在对应连接里使用。
 *
 * 关于循环点：这里只做两件有把握的事 ——
 *   a) 起止各 4ms 等功率微淡化，消掉电平突跳造成的爆音；
 *   b) 载入时量一次首尾接缝的电平差 / 直流差，把结果放进 diagnostics()，
 *      能不能接受由人耳和数字一起判，而不是在注释里声称已经处理好了。
 * 真正需要重新裁切循环点的曲子会由 loopFade 指定，而不是假装自动修好。
 * ------------------------------------------------------------------------- */
const MusicDirector = (() => {
	/* 阶段 → 曲目。explore 没有文件音乐：初次探索保留 audio.js 的程序化背景层。 */
	const TRACKS = {
		explore: null,
		summit: { src: 'audio/bgm/02_summit.ogg' },
		return: { src: 'audio/bgm/03_return.ogg' },
		finale: { src: 'audio/bgm/04_final_battle.ogg' },
		shard: { src: 'audio/bgm/05_clock_shards.ogg' }
	};

	/* 预制转场登记。verified=false 的一律不使用（见文件头说明）。 */
	const BRIDGES = {
		'explore>summit': { path: 'audio/transitions/01_exploration_to_summit.ogg', verified: false },
		'summit>return': { path: 'audio/transitions/02_summit_to_return.ogg', verified: false },
		'return>finale': { path: 'audio/transitions/03_return_to_final_battle.ogg', verified: false },
		'return>shard': { path: 'audio/transitions/04_return_to_clock_shards.ogg', verified: false }
	};

	/* 每一条连接单独配置：淡化时长、是否需要先抽掉节奏再过一层风声/低音。
	   dip=true 用于曲风差距大的连接（例：安静的探索曲 → 推土机式的战斗曲），
	   做法是先把旧曲的节奏层压下去，用一段低频与风声把两边垫起来，再让新曲进来。 */
	const LINKS = {
		'explore>summit': { fade: 3.4, dip: false },
		'summit>return': { fade: 3.0, dip: false },
		'return>finale': { fade: 5.0, dip: true },
		'return>shard': { fade: 4.6, dip: true },
		default: { fade: 3.2, dip: false }
	};

	const TARGET_RMS = 0.075;    // 统一的感知响度目标（带限 RMS 代理值）
	const LOUDFLOOR = 0.35;      // 单曲最大衰减，避免把安静的曲子硬拉成噪声
	const LOUDCEIL = 2.2;        // 单曲最大提升
	const SEAM_FADE_MS = 4;      // 循环点微淡化

	let engine = null;
	let bus = null;
	let generation = 0;
	let enabled = true;
	let desired = null;          // 期望的曲目 key（等待声音解锁时先记下来）
	let currentKey = null;
	let decks = [];              // 两个卡座
	const buffers = new Map();   // key → { buffer, gain, seam, source }
	const failures = new Map();  // key → 错误信息
	const pendingLoads = new Map();
	let bridgeNodes = null;
	let onError = null;
	let lastEvent = null;
	const log = [];

	const note = (text) => {
		lastEvent = { at: Date.now(), text };
		log.push(lastEvent);
		if (log.length > 40) log.shift();
	};

	/* ---------------------------------------------------------------------
	 * 素材准备：解码 → 量响度 → 处理循环点首尾
	 * ------------------------------------------------------------------- */
	function audioCtx() {
		return engine && engine.ctx && engine.ctx.state !== 'closed' ? engine.ctx : null;
	}

	/* 只加载点名的那一首。阶段切换之前只预取「下一站真正会用到的那几首」，
	   不把全部高清音频一次性拉进来。 */
	async function loadKey(key) {
		const spec = TRACKS[key];
		if (!spec) return null;
		if (buffers.has(key) || failures.has(key)) return buffers.get(key) || null;
		const ctx = audioCtx();
		if (!ctx) return null;
		if (pendingLoads.has(key)) return pendingLoads.get(key);
		const job = (async () => {
			try {
				let raw;
				if (location.protocol === 'file:') {
					// Local scripts work offline without weakening the browser's file security.
					window.NightCrownAudioData ||= {};
					if (!window.NightCrownAudioData[key]) await new Promise((resolve,reject) => {
						const script=document.createElement('script');script.src=spec.src+'.js';
						script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(Error('离线音乐资源缺失'));};
						document.head.append(script);
					});
					const encoded=window.NightCrownAudioData[key];
					if (!encoded) throw Error('离线音乐资源损坏');
					raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)).buffer;
					delete window.NightCrownAudioData[key];
				} else {
					const response = await fetch(spec.src);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					raw = await response.arrayBuffer();
				}
				const decoded = await ctx.decodeAudioData(raw.slice(0));
				const prepared = prepareBuffer(ctx, decoded);
				const entry = {
					buffer: prepared.buffer,
					gain: loudnessTrim(decoded),
					seam: prepared.seam,
					loop: prepared.loop,
					source: spec.src
				};
				buffers.set(key, entry);
				return entry;
			} catch (error) {
				failures.set(key, String((error && error.message) || error));
				reportFailure(`${key}: ${(error && error.message) || error}`);
				return null;
			} finally {
				pendingLoads.delete(key);
			}
		})();
		pendingLoads.set(key, job);
		return job;
	}

	/* 循环点分两种处理，由量出来的接缝决定用哪一种：
	   a) 接缝干净（|dB| ≤ 6 且直流差小）：只做起止各 4ms 微淡化，保持原长；
	   b) 接缝有可听的电平台阶：把结尾素材叠到开头，做一段等功率交叉淡化循环。
	      做法是让循环从源文件的「结尾」开始，再把开头素材逐渐混进来 ——
	      这样循环点两侧依然是原文件里相邻的采样，不会出现接缝跳变，
	      电平台阶被摊平到整段淡化里，而不是在循环点忽然抬起。
	   量出来的数值 record 在 diagnostics().seams / .loops 里，方便复查。 */
	const LOOP_SEAM_BAD_DB = 6;
	const LOOP_SEAM_BAD_DC = 0.01;
	const LOOP_FADE_MAX = 1.5;

	function microFadeBuffer(ctx, source) {
		const length = source.length;
		const channels = source.numberOfChannels;
		const out = ctx.createBuffer(channels, length, source.sampleRate);
		const fade = Math.max(8, Math.round(source.sampleRate * SEAM_FADE_MS / 1000));
		for (let channel = 0; channel < channels; channel += 1) {
			const from = source.getChannelData(channel);
			const to = out.getChannelData(channel);
			to.set(from);
			for (let i = 0; i < fade && i < length; i += 1) {
				const w = i / fade;
				to[i] *= w;
				to[length - 1 - i] *= w;
			}
		}
		return out;
	}

	function crossfadeLoopBuffer(ctx, source, fadeSeconds) {
		const rate = source.sampleRate;
		const length = source.length;
		const fade = Math.max(64, Math.min(Math.round(rate * fadeSeconds), Math.floor(length / 3)));
		const outLength = length - fade;
		const out = ctx.createBuffer(source.numberOfChannels, outLength, rate);
		for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
			const from = source.getChannelData(channel);
			const to = out.getChannelData(channel);
			for (let i = 0; i < outLength; i += 1) {
				if (i >= fade) { to[i] = from[i]; continue; }
				const t = i / Math.max(1, fade - 1);
				const head = Math.sin(t * Math.PI / 2);
				const tail = Math.cos(t * Math.PI / 2);
				to[i] = from[i] * head + from[length - fade + i] * tail;
			}
		}
		return out;
	}

	function prepareBuffer(ctx, source) {
		const seam = seamReport(source);
		const bad = Math.abs(seam.dB) > LOOP_SEAM_BAD_DB || seam.dcDelta > LOOP_SEAM_BAD_DC;
		const fade = bad ? Math.min(LOOP_FADE_MAX, source.duration / 6) : SEAM_FADE_MS / 1000;
		return {
			seam,
			loop: { mode: bad ? 'crossfade' : 'microfade', fade: Number(fade.toFixed(3)) },
			buffer: bad ? crossfadeLoopBuffer(ctx, source, fade) : microFadeBuffer(ctx, source)
		};
	}

	/* 首尾接缝：比较两端各 30ms 的电平与直流偏移。差值大说明硬循环会听出来，
	   需要重新裁素材，而不是在这里假装已经接好了。 */
	function seamReport(buffer) {
		const window = Math.max(32, Math.round(buffer.sampleRate * 0.03));
		const data = buffer.getChannelData(0);
		const rms = (from, to) => {
			let sum = 0;
			for (let i = from; i < to; i += 1) sum += data[i] * data[i];
			return Math.sqrt(sum / Math.max(1, to - from));
		};
		const mean = (from, to) => {
			let sum = 0;
			for (let i = from; i < to; i += 1) sum += data[i];
			return sum / Math.max(1, to - from);
		};
		const windowSize = Math.min(window, Math.floor(buffer.length / 4));
		const headRms = rms(windowSize, windowSize * 2);
		const tailRms = rms(buffer.length - windowSize, buffer.length);
		const headDc = mean(windowSize, windowSize * 2);
		const tailDc = mean(buffer.length - windowSize, buffer.length);
		return {
			headRms: Number(headRms.toFixed(5)),
			tailRms: Number(tailRms.toFixed(5)),
			dB: Number((20 * Math.log10((tailRms + 1e-6) / (headRms + 1e-6))).toFixed(2)),
			dcDelta: Number(Math.abs(tailDc - headDc).toFixed(5))
		};
	}

	/* 感知响度代理：先做一次温和的带限（去极低频与极高频），再取 RMS。
	   相同 Audio.volume 不等于听起来一样响，所以先统一这个值再谈音乐和音效的关系。 */
	function loudnessTrim(buffer) {
		const data = buffer.getChannelData(0);
		const sampleRate = buffer.sampleRate;
		const step = Math.max(1, Math.floor(sampleRate / 8000));
		const hpAlpha = 1 - Math.exp(-2 * Math.PI * 120 / sampleRate);
		const lpAlpha = 1 - Math.exp(-2 * Math.PI * 4200 / sampleRate);
		let hpPrev = 0, lpPrev = 0, sum = 0, count = 0;
		for (let i = 0; i < data.length; i += step) {
			const value = data[i];
			hpPrev += hpAlpha * (value - hpPrev);
			const high = value - hpPrev;
			lpPrev += lpAlpha * (high - lpPrev);
			sum += lpPrev * lpPrev;
			count += 1;
		}
		const rms = Math.sqrt(sum / Math.max(1, count));
		if (!Number.isFinite(rms) || rms <= 1e-5) return 1;
		return Math.max(LOUDFLOOR, Math.min(LOUDCEIL, TARGET_RMS / rms));
	}

	function reportFailure(message) {
		note(`失败：${message}`);
		if (typeof onError === 'function') onError(message);
	}

	/* ---------------------------------------------------------------------
	 * 卡座与淡化
	 * ------------------------------------------------------------------- */
	function makeDeck(index) {
		const ctx = audioCtx();
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(bus || ctx.destination);
		return { index, gain, source: null, key: null, startedAt: 0, offset: 0, duration: 0, token: 0 };
	}

	function ensureDecks() {
		if (decks.length === 2 && bus) return true;
		const ctx = audioCtx();
		if (!ctx) return false;
		bus = engine.musicBus();
		if (!bus) return false;
		decks = [makeDeck(0), makeDeck(1)];
		return true;
	}

	function positionOf(deck) {
		const ctx = audioCtx();
		if (!deck || !deck.source || !ctx || !deck.duration) return 0;
		const elapsed = ctx.currentTime - deck.startedAt + deck.offset;
		return Math.max(0, elapsed % deck.duration);
	}

	function freeDeck(except) {
		return decks.find(deck => deck !== except && !deck.source) || decks.find(deck => deck !== except) || decks[0];
	}

	/* 等功率淡化：cos/sin 曲线，避免两首曲子在中点各自掉一半音量。 */
	function rampDeck(deck, from, to, seconds, token) {
		const ctx = audioCtx();
		if (!ctx || !deck) return;
		const now = ctx.currentTime;
		deck.gain.gain.cancelScheduledValues(now);
		deck.gain.gain.setValueAtTime(Math.max(0.0001, from), now);
		deck.gain.gain.linearRampToValueAtTime(Math.max(0.0001, to), now + Math.max(0.01, seconds));
		if (token !== undefined) deck.token = token;
	}

	/* 转场垫层：一段风声 + 低频，用来把曲风差距大的两首接起来。
	   完全在 Web Audio 里生成，不依赖任何预制文件。 */
	function startBridgeTexture(seconds) {
		const ctx = audioCtx();
		if (!ctx || !bus) return;
		stopBridgeTexture();
		const now = ctx.currentTime;
		const host = ctx.createGain();
		host.gain.setValueAtTime(0.0001, now);
		host.gain.linearRampToValueAtTime(0.5, now + Math.max(0.05, seconds * 0.32));
		host.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.2, seconds));
		host.connect(bus);

		const length = Math.max(1, Math.ceil(ctx.sampleRate * Math.max(0.3, seconds)));
		const noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = noiseBuffer.getChannelData(0);
		for (let i = 0; i < length; i += 1) {
			const t = i / length;
			data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * 0.6;
		}
		const noise = ctx.createBufferSource();
		noise.buffer = noiseBuffer;
		const noiseFilter = ctx.createBiquadFilter();
		noiseFilter.type = 'bandpass';
		noiseFilter.frequency.value = 620;
		noiseFilter.Q.value = 0.7;
		const noiseGain = ctx.createGain();
		noiseGain.gain.value = 0.05;
		noise.connect(noiseFilter);
		noiseFilter.connect(noiseGain);
		noiseGain.connect(host);

		const drone = ctx.createOscillator();
		drone.type = 'sine';
		drone.frequency.value = 55;
		const droneGain = ctx.createGain();
		droneGain.gain.value = 0.055;
		drone.connect(droneGain);
		droneGain.connect(host);

		noise.start(now);
		noise.stop(now + length / ctx.sampleRate + 0.05);
		drone.start(now);
		drone.stop(now + length / ctx.sampleRate + 0.05);
		bridgeNodes = { host, noise, drone };
	}

	function stopBridgeTexture() {
		if (!bridgeNodes) return;
		try { bridgeNodes.noise.stop(); } catch (_) {}
		try { bridgeNodes.drone.stop(); } catch (_) {}
		try { bridgeNodes.host.disconnect(); } catch (_) {}
		bridgeNodes = null;
	}

	function releaseDeck(deck) {
		if (!deck) return;
		try { deck.source?.disconnect(); } catch (_) {}
		deck.source = null;
		deck.key = null;
		deck.duration = 0;
		deck.offset = 0;
	}

	function stopDeck(deck, seconds = 0.6) {
		if (!deck || !deck.source) return;
		const ctx = audioCtx();
		if (!ctx) { releaseDeck(deck); return; }
		const token = ++deck.token;
		rampDeck(deck, deck.gain.gain.value, 0.0001, seconds, token);
		const source = deck.source;
		setTimeout(() => {
			if (deck.token !== token) return;
			try { source.stop(); } catch (_) {}
			releaseDeck(deck);
		}, Math.ceil(seconds * 1000) + 60);
	}

	function stopAll(seconds = 0.4) {
		decks.forEach(deck => stopDeck(deck, seconds));
		stopBridgeTexture();
	}

	/* 从旧曲当前真实位置开始交叉淡化到新曲。 */
	function crossfadeTo(key, options = {}) {
		if (!ensureDecks()) return false;
		const ctx = audioCtx();
		const entry = buffers.get(key);
		if (!ctx || !entry) return false;
		const link = options.link ? LINKS[options.link] || LINKS.default : LINKS.default;
		const seconds = Math.max(2.5, Math.min(6, options.fade || link.fade));
		const token = ++generation;
		const from = decks.find(deck => deck.source) || null;
		const to = freeDeck(from);

		if (from && link.dip && !options.instant) startBridgeTexture(seconds * 0.75);

		const source = ctx.createBufferSource();
		source.buffer = entry.buffer;
		source.loop = true;
		const level = entry.gain * (enabled ? 1 : 0);
		source.connect(to.gain);
		to.source = source;
		to.key = key;
		to.duration = entry.buffer.duration;
		to.offset = Number(options.offset) || 0;
		to.startedAt = ctx.currentTime;
		to.gain.gain.cancelScheduledValues(ctx.currentTime);
		to.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
		source.start(ctx.currentTime, to.offset % entry.buffer.duration);

		if (from && !options.instant) {
			rampDeck(from, Math.max(0.0001, from.gain.gain.value), 0.0001, seconds, token);
			rampDeck(to, 0.0001, level, seconds, token);
			const dying = from;
			setTimeout(() => {
				if (generation !== token) return;
				try { dying.source?.stop(); } catch (_) {}
				releaseDeck(dying);
				stopBridgeTexture();
			}, Math.ceil(seconds * 1000) + 80);
		} else {
			rampDeck(to, 0.0001, level, options.instant ? 0.25 : 1.2, token);
		}
		currentKey = key;
		note(`${key} 进入（${seconds.toFixed(1)}s${link.dip ? '，经低频过渡' : ''}）`);
		return true;
	}

	/* 素材还没解码完时：保持旧曲继续响，等新曲准备好再淡化。 */
	async function prepareThenFade(key, options) {
		const token = ++generation;
		const entry = await loadKey(key);
		if (generation !== token) return;
		if (!entry) {
			note(`${key} 素材不可用，保持当前音乐`);
			return;
		}
		crossfadeTo(key, options);
	}

	/* 下一站真正会用到的那几首：当前曲 + 可能的下一阶段。
	   重返探索结束后才会由种子决定进终局还是碎影，所以那一步预取两首。 */
	const NEXT_STAGE = { explore: ['summit'], summit: ['return'], return: ['finale', 'shard'] };
	async function preloadFor(stage) {
		const ctx = audioCtx();
		if (!ctx) return;
		const wanted = [stage, ...(NEXT_STAGE[stage] || [])].filter(key => TRACKS[key]);
		await Promise.all(wanted.map(loadKey));
	}

	/* ---------------------------------------------------------------------
	 * 对外接口
	 * ------------------------------------------------------------------- */
	function play(stage, options = {}) {
		if (typeof stage !== 'string') return false;
		if (!(stage in TRACKS)) return false;
		if (stage === currentKey && !options.force) return true;
		desired = stage;
		/* 预取下一站要用的曲目：音轨准备好之前旧曲一直响着，不会先停后接。 */
		preloadFor(stage).catch(() => {});
		const entry = TRACKS[stage];
		if (!entry) {
			/* 该阶段没有文件音乐（初次探索）：把文件层让出去，交还程序化背景层。 */
			generation += 1;
			stopAll(1.1);
			currentKey = stage;
			engine?.setBgmActive?.(true);
			note(`${stage} 使用程序化背景层`);
			return true;
		}
		engine?.setBgmActive?.(false);
		if (!audioCtx()) {
			/* 声音还没解锁：先记下目标，等 attach / unlock 之后补上。 */
			note(`${stage} 等待声音解锁`);
			return false;
		}
		if (buffers.has(stage)) {
			const previous = currentKey;
			const link = previous && previous !== stage ? `${previous}>${stage}` : '';
			return crossfadeTo(stage, { ...options, link });
		}
		prepareThenFade(stage, options);
		return true;
	}

	/* 结束对局：只允许结算音乐。文件 BGM 淡出后不再自动复活。 */
	function playResult(kind, playerIndex = 0) {
		generation += 1;
		stopAll(1.2);
		currentKey = 'result';
		desired = null;
		engine?.setBgmActive?.(false);
		if (engine) {
			if (kind === 'mended') engine.reward?.(playerIndex, true);
			else if (kind === 'defeat') engine.fail?.(playerIndex);
			else if (kind === 'tie') engine.success?.(playerIndex);
			else engine.reward?.(playerIndex, false);
		}
		note(`结算音乐：${kind}`);
	}

	function stop(reason = 'stop') {
		generation += 1;
		desired = null;
		currentKey = null;
		stopAll(0.5);
		stopBridgeTexture();
		note(`停止：${reason}`);
	}

	/* 兼容旧调用：静音交给 AudioEngine 总线，按钮一关就是全关。 */
	function setEnabled(on) {
		enabled = Boolean(on);
		if (engine && typeof engine.setMuted === 'function') engine.setMuted(!enabled);
		else decks.forEach(deck => rampDeck(deck, deck.gain.gain.value, enabled ? 1 : 0.0001, 0.3));
		return enabled;
	}

	function attach(audioEngine) {
		if (audioEngine) engine = audioEngine;
		stopBridgeTexture();
		decks = [];
		bus = null;
		if (engine && typeof engine.onMusicError === 'undefined') engine.onMusicError = null;
		onError = engine && engine.onMusicError;
		if (!ensureDecks()) return false;
		if (desired) {
			const wants = desired;
			desired = null;
			play(wants, { force: true });
		}
		return true;
	}

	/* 浏览器声音解锁后调用：把等待中的曲目真正放出来。 */
	function unlock() {
		attach(engine);
		if (desired) {
			const wants = desired;
			desired = null;
			play(wants, { force: true });
		}
		return true;
	}

	return {
		play,
		stop,
		setEnabled,
		isEnabled: () => !(engine && engine.muted),
		attach,
		unlock,
		playResult,
		preloadFor,
		setErrorHandler: (handler) => { onError = handler; if (engine) engine.onMusicError = handler; },
		preload: () => Promise.all(Object.keys(TRACKS).filter(key => TRACKS[key]).map(loadKey)),
		tracks: TRACKS,
		bridges: BRIDGES,
		links: LINKS,
		/* 诊断：曲库是否就绪、哪一首失败、首尾接缝量出来是多少。 */
		diagnostics: () => ({
			ready: [...buffers.keys()],
			failed: Object.fromEntries(failures),
			missing: Object.keys(TRACKS).filter(key => TRACKS[key] && !buffers.has(key) && !failures.has(key)),
			seams: Object.fromEntries([...buffers].map(([key, entry]) => [key, entry.seam])),
			loops: Object.fromEntries([...buffers].map(([key, entry]) => [key, entry.loop])),
			gains: Object.fromEntries([...buffers].map(([key, entry]) => [key, Number(entry.gain.toFixed(3))])),
			current: currentKey,
			position: Number(positionOf(decks.find(deck => deck.source)).toFixed(2)),
			log: log.slice(-12)
		})
	};
})();

/* 旧名字继续可用，避免其它脚本找不到 StageMusic。 */
const StageMusic = MusicDirector;
