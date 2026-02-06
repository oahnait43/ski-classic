[README.md](https://github.com/user-attachments/files/25118669/README.md)
# Ski Game - 滑雪大冒险

一个基于 Phaser 3 + Matter.js + Vite 的 H5 滑雪游戏，支持手机重力感应与桌面端键盘/鼠标操作，采用手绘涂鸦风格的自生成美术资源。

## 特性
- 真实物理：Matter.js 提供滑行、碰撞与摩擦的物理手感。
- 多端操作：移动端左右倾斜；桌面端方向键；鼠标移动亦可控制。
- 动态环境：无限雪坡、树木、雪包、旗门与随机事件。
- 生物互动：小狗、狗熊、飞鸟、同行者等丰富行为与反馈。
- 视觉表现：礼花粒子、浮动文字、打字机风格榜单等。
- 排行榜：本地存储 Top10，结束画面展示分数与用时。
- 可配置：通过 URL 参数微调坡度、转向、密度与摩擦。

## 操作说明
- 移动端：左右倾斜手机控制方向（需要设备方向权限）。
- 桌面端：键盘左右方向键控制转向。
- 鼠标：左右移动鼠标也可映射为转向输入。
- 游戏目标：累计得分并滑至终点，距离达到 8848 触发终点演出。

## 游戏配置（URL 参数）
- `slope`：坡度推力，默认 `0.005`。值越大下滑越快。
- `turn`：转向灵敏度，默认 `0.05`。
- `density`：障碍物密度基数，默认 `2`。
- `friction`：摩擦力，默认 `0.005`。

示例：
```
https://your-game.pages.dev/?slope=0.01&density=5
```

## 排行榜与数据存储
- 存储位置：浏览器 `localStorage`。
- 键名：`ski_game_leaderboard`。
- 记录内容：`score`（分数）、`date`（日期）、`time`（用时，统一格式如 `3m 27s`）。
- 展示：结束画面显示当前得分与用时，并列出前 5 名（内部保留前 10）。

## 本地开发
```bash
npm install
npm run dev
```
- 预览生产构建：
```bash
npm run preview
```
- 构建生产版本：
```bash
npm run build
```

## 部署
**Cloudflare Pages**
- Framework preset：Vite
- Build command：`npm run build`
- Build output directory：`dist`
- 连接仓库后保存并部署即可。

**GitHub Pages（静态托管）**
- 方式一：将 `dist/` 构建产物作为站点根目录上传到仓库主分支，并在仓库设置中启用 Pages。
- 方式二：保留源码，由 GitHub Actions 在推送时自动构建并发布（需自行编写 CI 工作流）。

## 目录与关键代码
- 入口与配置：[main.js](file:///w:/我的坚果云/Ai/Cloudflare/ski/src/main.js)
- 资源生成（手绘涂鸦风格）：[PreloadScene.js](file:///w:/我的坚果云/Ai/Cloudflare/ski/src/scenes/PreloadScene.js)
- 核心玩法与结束画面/榜单：  
  - 游戏逻辑与交互：[GameScene.js](file:///w:/我的坚果云/Ai/Cloudflare/ski/src/scenes/GameScene.js)  
  - 结束 UI 展示：[UIScene.js](file:///w:/我的坚果云/Ai/Cloudflare/ski/src/scenes/UIScene.js)
- 玩家行为与物理更新：[Player.js](file:///w:/我的坚果云/Ai/Cloudflare/ski/src/objects/Player.js)
- 小狗行为（含荧光粉叫声）：[Dog.js](file:///w:/我的坚果云/Ai/Cloudflare/ski/src/objects/Dog.js)

## 美术与音效
- 所有静态素材由代码在运行时生成，采用简笔画/涂鸦风格，包含水彩晕染与发光线条等效果。
- 礼花与雪花为粒子系统生成，结束画面触发多次礼花爆发。

## 常见问题
- iOS 设备方向权限：需在用户首次交互后请求权限，未授权时仅键盘/鼠标可用。
- 浏览器本地存储：清除缓存或隐私模式会导致排行榜记录丢失。
- 屏幕尺寸变化：窗口缩放时自动适配，使用 `RESIZE` 模式与居中。
- 性能建议：移动端建议关闭 Matter Debug；避免在低端设备上开启过高密度。

## 更新日志（最近）
- 小狗叫声浮动文字改为荧光粉色 `#FF00FF`，视觉更可爱。
- 修复结尾画面“Time: Error”问题，时间统一在保存分数时计算并展示。
- 排行榜增加分数/时间的回退值，避免异常数据导致显示错误。
- 增强结束礼花与榜单的视觉层级和风格表现。

## 技术栈
- Phaser 3（游戏框架）
- Matter.js（物理引擎）
- Vite（构建与开发服务器）

## 许可证
当前未设置许可证。如需开源分发，请添加合适的 LICENSE 文件（如 MIT/Apache-2.0 等）。
