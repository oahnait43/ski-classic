import Phaser from 'phaser';

export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super('PreloadScene');
    }

    preload() {
        // === 简笔画/涂鸦风格资源生成 (带水彩晕染) ===
        
        // 通用：绘制发光线条 (模拟彩灯/霓虹灯)
        const drawGlowingLine = (g, x1, y1, x2, y2, color, width = 2) => {
            // 外发光
            g.lineStyle(width * 4, color, 0.1);
            g.lineBetween(x1, y1, x2, y2);
            g.lineStyle(width * 2, color, 0.3);
            g.lineBetween(x1, y1, x2, y2);
            // 核心亮线
            g.lineStyle(width, 0xFFFFFF, 1);
            g.lineBetween(x1, y1, x2, y2);
        };

        // 通用：柔和线条样式 (用于玩家、动物等保留手绘风格的对象)
        const setSoftLineStyle = (g, width = 3) => {
            g.lineStyle(width, 0x000000, 1); // 纯黑
        };

        // 通用：绘制水彩晕染 (用于玩家、动物)
        const drawWatercolorSmudge = (g, x, y, width, height, color, alpha = 0.1) => {
            g.fillStyle(color, alpha);
            const steps = 3;
            for (let i = 0; i < steps; i++) {
                const w = width * (0.8 + Math.random() * 0.4); 
                const h = height * (0.8 + Math.random() * 0.4);
                const offsetX = (Math.random() - 0.5) * width * 0.3;
                const offsetY = (Math.random() - 0.5) * height * 0.3;
                g.fillEllipse(x + offsetX, y + offsetY, w, h);
            }
        };

        // 1. 玩家 (Stickman on Snowboard) - 保持黑色简笔画
        const playerGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        
        const drawDoodleSnowboarder = (g, pose) => {
            // 水彩晕染层 (极淡的蓝灰色)
            drawWatercolorSmudge(g, 32, 32, 35, 45, 0xB0C4DE, 0.1); 

            // 骨干层 (Stickman)
            setSoftLineStyle(g, 3);
            
            // 头部 (不封口的圆，更有手绘感)
            g.beginPath();
            g.arc(32, 18, 6, 0.2, 6.0); 
            g.strokePath();
            
            // 身体
            g.beginPath();
            
            if (pose === 'straight') {
                // 身体
                g.moveTo(32, 24); g.lineTo(32, 42);
                // 腿
                g.moveTo(32, 42); g.lineTo(26, 55);
                g.moveTo(32, 42); g.lineTo(38, 55);
                // 手
                g.moveTo(32, 30); g.lineTo(20, 38);
                g.moveTo(32, 30); g.lineTo(44, 38);
                // 板 (单笔线条)
                setSoftLineStyle(g, 4);
                g.moveTo(10, 58); g.lineTo(54, 58);

            } else if (pose === 'left') {
                g.moveTo(32, 24); g.lineTo(28, 40); // 倾斜
                g.moveTo(28, 40); g.lineTo(20, 52);
                g.moveTo(28, 40); g.lineTo(32, 52);
                g.moveTo(28, 30); g.lineTo(15, 40);
                g.moveTo(28, 30); g.lineTo(40, 35);
                // 板 (倾斜)
                setSoftLineStyle(g, 4);
                g.moveTo(5, 55); g.lineTo(45, 50);

            } else if (pose === 'right') {
                g.moveTo(32, 24); g.lineTo(36, 40);
                g.moveTo(36, 40); g.lineTo(44, 52);
                g.moveTo(36, 40); g.lineTo(32, 52);
                g.moveTo(36, 30); g.lineTo(49, 40);
                g.moveTo(36, 30); g.lineTo(24, 35);
                // 板 (倾斜)
                setSoftLineStyle(g, 4);
                g.moveTo(19, 50); g.lineTo(59, 55);

            } else if (pose === 'jump') {
                // 抓板动作
                g.moveTo(32, 20); g.lineTo(32, 35);
                g.moveTo(32, 35); g.lineTo(25, 42); // 腿缩起
                g.moveTo(32, 35); g.lineTo(39, 42);
                g.moveTo(32, 25); g.lineTo(32, 45); // 手抓下去
                setSoftLineStyle(g, 4);
                g.moveTo(20, 45); g.lineTo(44, 45); // 板横置

            } else if (pose === 'crash') {
                // 散架
                g.moveTo(30, 40); g.lineTo(20, 30);
                g.moveTo(34, 40); g.lineTo(44, 30);
                g.moveTo(32, 45); g.lineTo(25, 55);
                g.moveTo(32, 45); g.lineTo(39, 55);
                setSoftLineStyle(g, 4);
                g.moveTo(10, 20); g.lineTo(20, 40); // 板飞了
            }
            g.strokePath();
        };

        ['straight', 'left', 'right', 'jump', 'crash'].forEach(pose => {
            playerGraphics.clear();
            drawDoodleSnowboarder(playerGraphics, pose);
            playerGraphics.generateTexture(`player_${pose}`, 64, 64);
        });

        // 2. 小狗 (简笔画)
        const dogGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        
        const drawDog = (g, frame) => {
            // 水彩晕染 (极淡的土黄色)
            drawWatercolorSmudge(g, 20, 15, 25, 20, 0xF5DEB3, 0.15); // Wheat

            setSoftLineStyle(g, 2);
            g.beginPath();
            // 头
            g.strokeCircle(10, 15, 6);
            // 耳朵
            g.moveTo(6, 10); g.lineTo(4, 6);
            g.moveTo(14, 10); g.lineTo(16, 6);
            // 身体
            g.strokeRect(16, 12, 14, 8);
            // 尾巴
            g.moveTo(30, 12); g.lineTo(34, 8);
            // 腿
            if (frame === 1) {
                g.moveTo(18, 20); g.lineTo(18, 26);
                g.moveTo(28, 20); g.lineTo(28, 26);
            } else {
                g.moveTo(18, 20); g.lineTo(16, 25);
                g.moveTo(28, 20); g.lineTo(30, 25);
            }
            g.strokePath();
        };

        dogGraphics.clear(); drawDog(dogGraphics, 1);
        dogGraphics.generateTexture('dog_1', 40, 30);
        
        dogGraphics.clear(); drawDog(dogGraphics, 2);
        dogGraphics.generateTexture('dog_2', 40, 30);

        // 3. 树木 (简笔画风格：几笔线条)
        const treeG = this.make.graphics({x:0, y:0, add: false});
        
        // 水彩晕染 - 改为白色/灰白色
        drawWatercolorSmudge(treeG, 30, 35, 45, 55, 0xF5F5F5, 0.5); // WhiteSmoke, 稍微不透明一点以显示出白色

        setSoftLineStyle(treeG, 3);
        treeG.beginPath();
        // 树冠 (三个三角形叠加的感觉，但不封口)
        treeG.moveTo(30, 5); treeG.lineTo(15, 25); treeG.lineTo(25, 25);
        treeG.lineTo(10, 45); treeG.lineTo(30, 45);
        treeG.lineTo(5, 65); treeG.lineTo(55, 65);
        treeG.lineTo(30, 45); treeG.lineTo(50, 45);
        treeG.lineTo(35, 25); treeG.lineTo(45, 25);
        treeG.lineTo(30, 5);
        // 树干
        treeG.moveTo(30, 65); treeG.lineTo(30, 75);
        treeG.strokePath();
        treeG.generateTexture('tree', 60, 80);

        // 4. 跳板 (简笔画)
        const rampG = this.make.graphics({x:0, y:0, add: false});
        
        // 水彩晕染 (极淡的蓝色)
        drawWatercolorSmudge(rampG, 30, 35, 45, 25, 0x87CEFA, 0.1); // LightSkyBlue

        setSoftLineStyle(rampG, 3);
        rampG.beginPath();
        // 三角形侧面
        rampG.moveTo(5, 45); 
        rampG.lineTo(55, 25); // 坡面
        rampG.lineTo(55, 45);
        rampG.lineTo(5, 45);
        // 简单的纹理线条
        rampG.moveTo(20, 45); rampG.lineTo(20, 38);
        rampG.moveTo(40, 45); rampG.lineTo(40, 30);
        rampG.strokePath();
        rampG.generateTexture('ramp', 60, 50);

        // 5. 雪堆 (简笔画曲线)
        const moundG = this.make.graphics({x:0, y:0, add: false});
        
        // 水彩晕染 (极淡的青白色)
        drawWatercolorSmudge(moundG, 20, 20, 30, 15, 0xE0FFFF, 0.15); // LightCyan

        setSoftLineStyle(moundG, 2);
        moundG.beginPath();
        moundG.arc(20, 20, 15, 3.2, 6.2); // 不封口的圆弧
        moundG.strokePath();
        moundG.generateTexture('mound', 40, 30);
        
        // 6. 装饰 (小草/小石头)
        const decoG = this.make.graphics({x:0, y:0, add: false});
        decoG.lineStyle(2, 0x333333, 0.5);
        decoG.beginPath();
        decoG.moveTo(5, 10); decoG.lineTo(0, 0);
        decoG.moveTo(5, 10); decoG.lineTo(10, 2);
        decoG.strokePath();
        decoG.generateTexture('snow_deco', 10, 10);

        // 7. 指示旗 (Gate) - 移除横杠，只保留旗子
        const gateG = this.make.graphics({x:0, y:0, add: false});
        // 左旗 (蓝色)
        setSoftLineStyle(gateG, 3);
        gateG.beginPath();
        gateG.moveTo(10, 40); gateG.lineTo(10, 0); // 杆子
        gateG.strokePath();
        gateG.lineStyle(2, 0x4682B4, 0.8); // SteelBlue
        gateG.beginPath();
        gateG.moveTo(10, 2); gateG.lineTo(30, 10); gateG.lineTo(10, 18); // 旗面
        gateG.strokePath();
        gateG.generateTexture('gate_left', 40, 40);

        // 右旗 (红色)
        gateG.clear();
        setSoftLineStyle(gateG, 3);
        gateG.beginPath();
        gateG.moveTo(30, 40); gateG.lineTo(30, 0);
        gateG.strokePath();
        gateG.lineStyle(2, 0xCD5C5C, 0.8); // IndianRed
        gateG.beginPath();
        gateG.moveTo(30, 2); gateG.lineTo(10, 10); gateG.lineTo(30, 18);
        gateG.strokePath();
        gateG.generateTexture('gate_right', 40, 40);

        // 8. 简笔画狗熊 (Bear) - 新增
        const bearG = this.make.graphics({x:0, y:0, add: false});
        
        // 水彩晕染 (淡棕色)
        drawWatercolorSmudge(bearG, 40, 50, 55, 65, 0xCD853F, 0.1); // Peru

        setSoftLineStyle(bearG, 3);
        bearG.beginPath();
        // 身体 (大椭圆)
        bearG.strokeEllipse(40, 40, 25, 35);
        // 头
        bearG.strokeCircle(40, 15, 12);
        // 耳朵
        bearG.strokeCircle(30, 8, 4);
        bearG.strokeCircle(50, 8, 4);
        // 手
        bearG.moveTo(25, 30); bearG.lineTo(10, 50);
        bearG.moveTo(55, 30); bearG.lineTo(70, 50);
        // 腿
        bearG.moveTo(30, 70); bearG.lineTo(25, 90);
        bearG.moveTo(50, 70); bearG.lineTo(55, 90);
        bearG.strokePath();
        // 愤怒表情
        setSoftLineStyle(bearG, 2);
        bearG.beginPath();
        bearG.moveTo(35, 12); bearG.lineTo(45, 18); // 眉毛
        bearG.moveTo(45, 12); bearG.lineTo(35, 18);
        bearG.strokePath();
        bearG.generateTexture('bear', 80, 95);

        // 9. 简笔画飞鸟 (Bird) - 新增
        const birdG = this.make.graphics({x:0, y:0, add: false});
        setSoftLineStyle(birdG, 2);
        birdG.beginPath();
        // 简单的 "m" 形状 (使用直线代替不支持的贝塞尔曲线)
        birdG.moveTo(0, 10); 
        birdG.lineTo(10, 0);
        birdG.lineTo(20, 10);
        birdG.lineTo(30, 0);
        birdG.lineTo(40, 10);
        birdG.strokePath();
        birdG.generateTexture('bird', 40, 20);

        // 10. 粒子 (纯白不透明，避免 WebGL 预乘 alpha 导致的粉色偏色)
        const particleG = this.make.graphics({x:0, y:0, add: false});
        particleG.fillStyle(0xffffff, 1);
        particleG.fillCircle(2, 2, 2);
        particleG.generateTexture('snow_particle', 4, 4);

        // 11. 雪兔 (Snow Bunny)
        const bunnyG = this.make.graphics({x:0, y:0, add: false});
        // 白色身体，粉色耳朵内侧
        bunnyG.fillStyle(0xFFFFFF, 1);
        bunnyG.lineStyle(2, 0xDDDDDD, 1);
        
        // 身体
        bunnyG.fillCircle(15, 20, 10);
        bunnyG.strokeCircle(15, 20, 10);
        
        // 头
        bunnyG.fillCircle(15, 10, 8);
        bunnyG.strokeCircle(15, 10, 8);
        
        // 耳朵
        bunnyG.fillStyle(0xFFC0CB, 1); // Pink
        bunnyG.fillEllipse(10, 0, 3, 8);
        bunnyG.strokeEllipse(10, 0, 3, 8);
        bunnyG.fillEllipse(20, 0, 3, 8);
        bunnyG.strokeEllipse(20, 0, 3, 8);
        
        // 尾巴
        bunnyG.fillStyle(0xFFFFFF, 1);
        bunnyG.fillCircle(25, 20, 3);
        
        bunnyG.generateTexture('bunny', 30, 30);

        // 12. 魔力雪杖 (Magic Ski Pole)
        const poleG = this.make.graphics({x:0, y:0, add: false});
        
        // 发光特效 (外层光晕)
        drawGlowingLine(poleG, 10, 40, 10, 0, 0x00FFFF, 4); // Cyan Glow
        
        // 杖身
        poleG.lineStyle(3, 0xC0C0C0, 1); // Silver
        poleG.beginPath();
        poleG.moveTo(10, 40);
        poleG.lineTo(10, 5);
        poleG.strokePath();
        
        // 顶端宝石
        poleG.fillStyle(0x00FFFF, 1);
        poleG.fillCircle(10, 5, 5);
        
        // 装饰环
        poleG.lineStyle(2, 0xFFD700, 1); // Gold
        poleG.strokeCircle(10, 5, 5);
        
        poleG.generateTexture('magic_pole', 20, 45);
    }

    create() {
        this.scene.start('GameScene');
        // 同时启动 UI 场景
        this.scene.launch('UIScene');
    }
}
