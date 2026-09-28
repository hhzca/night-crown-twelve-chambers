# 音乐来源与授权

下载日期：2026-09-25；钟楼碎影于 2026-09-26 更新。本目录包括游戏使用的音乐及离线浏览器读取副本。

| 本地用途 | 原曲及作者 | 来源 | 授权 | 本地原件 |
| --- | --- | --- | --- | --- |
| 初始探索 | Abandoned Castle Music (Loop)，StarNinjas | https://opengameart.org/content/abandoned-castle-music-loop | CC0 | `source/exploration_original.ogg` |
| 城堡之巅 | Determined Pursuit (epic orchestra loop)，Emma_MA | https://opengameart.org/node/70268 | CC0 | `source/summit_original.wav` |
| 返回探索 | Inside the Overlords Domain，KarateStudios | https://opengameart.org/content/inside-the-overlords-domain | CC0 | `source/return_original.flac` |
| 终局之战 | Colossal Boss Battle Theme / Blackmoor Colossus，Matthew Pablo | https://opengameart.org/content/colossal-boss-battle-theme | CC BY 3.0 | `source/finale_battle_original.mp3` |
| 钟楼碎影 | Crystal Cave + Mysterious Ambience；The Cynic Project / cynicmusic 作曲，congusbongus 循环编排 | https://opengameart.org/content/crystal-cave-mysterious-ambience-seamless-loop | CC BY 3.0 | 交付目录 `complete-edition-20260926/sources/music_jewels.ogg` |

**终局之战公开发行时的署名建议：** Music: “Colossal Boss Battle Theme” / “Blackmoor Colossus” by Matthew Pablo, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Source: https://opengameart.org/content/colossal-boss-battle-theme. Modified: converted to Ogg Vorbis, adjusted loudness, and prepared for seamless looping.

**钟楼碎影署名：** Music: “Crystal Cave + Mysterious Ambience” by The Cynic Project / cynicmusic (https://pixelsphere.org/), seamless loop arrangement by congusbongus. Licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Source: https://opengameart.org/content/crystal-cave-mysterious-ambience-seamless-loop . Modified: resampled to 48 kHz stereo, -2.1 dB fixed gain, 4 ms boundary de-click, circular start shifted, two complete 86.41375-second cycles. No excerpt omitted; no tempo change. Result: 172.8275 s, Ogg Vorbis.

原版 Clocktower / symphony（CC0，https://opengameart.org/content/clocktower）保留在项目备份，已不用于钟楼碎影。原曲有声乐般的合成层与战斗感，本次采用明确标为 relaxing / enchanting / crystal 的钢琴与琶音循环素材替换。不是本项目原创作曲，也不是逐条复刻任务书配器的定制作曲。

下载原件 SHA-256：`62EC050B257AB3E3E55345FCCB8229A79BD04F3D7689423FD4A269D776C0CE79`。OpenGameArt 文件与 FreeBlocks 的 GitHub 镜像内容一致。

本地处理：将各曲转为 Ogg Vorbis；控制整体响度和峰值。所有原作的权利和授权以各来源页面所示为准。

## 运行时的处理（stage-music.js）

1. **感知响度归一**：载入时对每首曲做带限 RMS 测量（去极低频与极高频），
   按比值给每首一个独立增益，而不是给所有曲设同一个 `volume`。
   当前值可在游戏“设置”的音频诊断中查看。
2. **循环点**：载入时量首尾各 30ms 的电平与直流差（`diagnostics().seams`）。
   差值在阈值内只做 4ms 起止微淡化；超出阈值的曲目
   就改用等功率交叉淡化循环，把电平台阶摊进 1.5 秒的过渡里。
3. **转场**：不做「固定跳到第 8 / 10 秒」的续播。`audio/transitions/` 下四段文件仍然登记在
   `StageMusic.bridges` 里，但 `verified` 全为 `false`，默认不参与播放。
   阶段切换改为双卡座从旧曲真实播放位置交叉淡化（3.0–5.0 秒），
   曲风差距大的两条连接（重返→终局、重返→碎影）中间垫一层实时生成的风声与低频。
   确认某段预制转场真的与曲目结构对得上之后，把对应的 `verified` 改成 `true` 才会启用。
4. **初次探索**：不使用文件音乐，由 `audio.js` 实时合成环境与节奏层。
   进入有文件音乐的阶段时，程序化背景层会让出位置，不再出现两条旋律同时响。

5. **离线副本**：`bgm/*.ogg.js` 是同名 Ogg 的 Base64 封装，音乐和授权完全相同；仅在直接打开 HTML 时按需加载，解决浏览器对 file:// fetch 的限制。更换 Ogg 后需运行根目录 `node build-offline-audio.cjs` 重新生成。

## 新碎影音乐的客观测量

- 48,000 Hz，双声道，172.8275 秒，Ogg Vorbis。
- FFmpeg EBU R128：-15.95 LUFS，true peak -2.04 dBTP，LRA 2.90 LU。
- 最终文件解码后首尾各 30 ms：电平差 +0.224 dB，直流差 0.000225。
- 游戏内既有诊断（左声道，首段跳过最初 30 ms）：电平差 +0.45 dB，直流差 0.00086；满足任务书的 3 dB / 0.005 阈值，仅使用 4 ms 微淡化。
- 数值检测、浏览器解码和循环调度已验证；未声称完成真人耳机试听。四段既有预制转场保留且不强行启用，游戏使用实时交叉淡化。
