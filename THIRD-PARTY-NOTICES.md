# 第三方素材署名与授权 / Third-Party Notices

本作源代码依 **MIT** 授权（见 `LICENSE`）。但仓库中打包的**音乐素材**由第三方创作、
依 **CC0** 或 **Creative Commons Attribution 3.0 (CC BY 3.0)** 授权，**不受 MIT 覆盖**。
若你分发、改编本作或其中的音频文件，必须保留下表所要求的署名。

项目源代码为 MIT；音频素材的权利与义务以各自来源页面为准。

---

## 1. 音乐 / Music

| 本地用途 | 曲名 | 作者 | 来源 | 授权 |
| --- | --- | --- | --- | --- |
| 初次探索 | Abandoned Castle Music (Loop) | StarNinjas | <https://opengameart.org/content/abandoned-castle-music-loop> | CC0 |
| 城堡之巅 | Determined Pursuit (epic orchestra loop) | Emma_MA | <https://opengameart.org/node/70268> | CC0 |
| 重返探索 | Inside the Overlords Domain | KarateStudios | <https://opengameart.org/content/inside-the-overlords-domain> | CC0 |
| 终局之战 | Colossal Boss Battle Theme / Blackmoor Colossus | Matthew Pablo | <https://opengameart.org/content/colossal-boss-battle-theme> | **CC BY 3.0** |
| 钟楼碎影 | Crystal Cave + Mysterious Ambience（循环编排：congusbongus） | The Cynic Project / cynicmusic | <https://opengameart.org/content/crystal-cave-mysterious-ambience-seamless-loop> | **CC BY 3.0** |

> 「初次探索」阶段在运行时由 `audio.js` 实时合成环境与节奏层，不使用外部音频文件。

### 1.1 CC BY 3.0 必备署名文本

分发本作时必须一并给出的两段署名（可直接复制）：

**终局之战**

> Music: “Colossal Boss Battle Theme” / “Blackmoor Colossus” by **Matthew Pablo**,
> licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
> Source: <https://opengameart.org/content/colossal-boss-battle-theme>.
> Modified: converted to Ogg Vorbis, adjusted loudness, prepared for seamless looping.

**钟楼碎影**

> Music: “Crystal Cave + Mysterious Ambience” by **The Cynic Project / cynicmusic**
> (<https://pixelsphere.org/>), seamless loop arrangement by **congusbongus**.
> Licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
> Source: <https://opengameart.org/content/crystal-cave-mysterious-ambience-seamless-loop>.
> Modified: resampled to 48 kHz stereo, −2.1 dB fixed gain, 4 ms boundary de-click,
> circular start shifted, two complete 86.41375-second cycles.
> No excerpt omitted; no tempo change. Result: 172.8275 s, Ogg Vorbis.

### 1.2 CC0 说明

CC0 素材在法律上不强制署名，但本项目仍在上表完整列出作者与来源，
以尊重原作者（也建议你保留）。

### 1.3 本地处理记录

所有曲目均转为 Ogg Vorbis 并控制整体响度与峰值；处理不改变原作权利归属。
详细测量数据（EBU R128 响度、循环接缝电平差与直流差、采样率）见
[`audio/SOURCES.md`](audio/SOURCES.md)。

音频还包含 `audio/bgm/*.ogg.js`（同名 Ogg 的 Base64 封装）与
`audio/transitions/` 四段预制转场；它们与上表曲目授权相同。
预制转场默认**不参与播放**（`StageMusic.bridges` 中 `verified` 全为 `false`），
阶段切换使用实时双卡座交叉淡化。

---

## 2. 美术 / Artwork

角色立绘、NPC 头像、房间与场景图、城堡地图以及标题图层，
均由本项目使用 **OpenAI 图像生成工具**制作，并经过调色、裁剪、合成等后期处理。

这些素材**不是**从第三方游戏或素材库直接取得的既有作品。
本项目不主张其构成他人的衍生作品，但也不对 AI 生成内容在特定司法辖区下的
可版权性作任何保证。若你计划商业使用这些美术素材，请自行评估当地法律。

新增：17 张阶段独立场景 + 14 张回返变化场景。

---

## 3. 字体 / Fonts

`assets/fonts/` 内含 **Playfair Display**（400 / 700），
由 Google Fonts 提供，依 **SIL Open Font License 1.1 (OFL-1.1)** 授权。

> Playfair Display, Copyright 2017 The Playfair Display Project Authors
> (<https://github.com/clauseggers/Playfair-Display>),
> licensed under the SIL Open Font License, Version 1.1.
> Full license text: <https://openfontlicense.org/>

OFL 允许自由使用、修改与再分发（包括嵌入与商用），
但**不得单独出售字体本身**，且修改后版本不得使用保留字体名（Reserved Font Name）。

---

## 4. 运行时依赖 / Dependencies

本作为**零依赖**的纯前端项目：直接双击 `index.html` 或经任意静态服务器打开即可运行，
不加载任何 CDN、外部脚本、字体服务或网络请求，运行时也不上传任何数据。

---

## 5. 汇总检查表 / Checklist

如果你 fork 或再分发本作，请确认：

- [ ] 保留 `LICENSE`（MIT）原文
- [ ] 保留本文件 `THIRD-PARTY-NOTICES.md`
- [ ] 在作品或其说明中保留 §1.1 两段 CC BY 3.0 署名
- [ ] 保留 `audio/SOURCES.md`
- [ ] 若修改了音频，在署名中注明「已修改」及修改内容
- [ ] 若再分发字体，随附 OFL-1.1 许可文本
