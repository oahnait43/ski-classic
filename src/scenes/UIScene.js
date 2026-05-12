import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        // 确保 UI 在最上层
        this.scene.bringToTop();

        // 字体配置：恢复手绘涂鸦风格 (高饱和度)
        const fontStyle = { 
            fontSize: '18px', 
            fill: '#000', // 纯黑
            fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive, sans-serif', // 手写体
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 3 // 白色描边，突出简笔画感
        };

        // 版本号显示
        this.add.text(20, 5, 'v1.1.0-beta', {
            fontSize: '10px',
            fill: '#555',
            fontFamily: 'monospace'
        }).setScrollFactor(0);

        // 1. 距离显示 (最上方)
        const distStyle = { ...fontStyle, fontSize: '20px', fill: '#333' };
        this.distanceText = this.add.text(20, 20, 'Dist: 0m', distStyle);

        // 2. 血量显示 (中间) - 仅血槽
        this.hpContainer = this.add.container(20, 55);
        
        // 血条背景 (黑色粗框)
        const hpBg = this.add.graphics();
        hpBg.lineStyle(2, 0x000000, 1); 
        hpBg.beginPath();
        hpBg.moveTo(0, 2);
        hpBg.lineTo(80, 3); 
        hpBg.lineTo(78, 11);
        hpBg.lineTo(0, 10);
        hpBg.closePath();
        hpBg.strokePath();
        this.hpContainer.add(hpBg);

        // 血条填充 (鲜艳颜色)
        this.hpBar = this.add.graphics();
        this.updateHealthBar(100); 
        this.hpContainer.add(this.hpBar);

        // 3. 金币显示 (最下方)
        this.coinContainer = this.add.container(20, 80);

        // 绘制金币图标 (手绘风格)
        const coinG = this.add.graphics();
        coinG.lineStyle(2, 0xffa500, 1); // 橙色边框
        coinG.fillStyle(0xffd700, 1); // 金色填充
        coinG.beginPath();
        coinG.arc(10, 10, 8, 0, Math.PI * 2);
        coinG.fillPath();
        coinG.strokePath();
        // $ 符号
        coinG.fillStyle(0xffa500, 1);
        coinG.fillRect(9, 6, 2, 8);
        this.coinContainer.add(coinG);

        this.scoreText = this.add.text(25, 0, '0', fontStyle);
        this.coinContainer.add(this.scoreText);

        // 4. 连击显示 (右侧)
        this.comboText = this.add.text(this.scale.width - 20, 20, '', {
            fontSize: '28px',
            fill: '#FF4500',
            fontFamily: '"Comic Sans MS", cursive',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 4,
            align: 'right'
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(2000);
        this.comboText.setAlpha(0);

        // 5. 速度倍率显示 (右侧下方)
        this.speedText = this.add.text(this.scale.width - 20, 55, '', {
            fontSize: '14px',
            fill: '#FF69B4',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 2,
            align: 'right'
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(2000);
        this.speedText.setAlpha(0);

        
        // 监听 GameScene 事件
        const gameScene = this.scene.get('GameScene');
        
        // 更新分数 (金币)
        gameScene.events.on('updateScore', (score) => {
            this.scoreText.setText('' + score);
        });

        // 更新距离
        gameScene.events.on('updateDistance', (distance) => {
            this.distanceText.setText(`Dist: ${Math.floor(distance)}m`);
        });

        // 更新血量
        gameScene.events.on('updateHealth', (hp) => {
            this.updateHealthBar(hp);
        });

        // 血条闪烁 (受伤)
        gameScene.events.on('flashHealth', () => {
            this.flashHealthBar();
        });
        
        // 显示排行榜
        gameScene.events.on('showLeaderboard', (data) => {
            this.showLeaderboard(data);
        });

        // 连击更新
        gameScene.events.on('updateCombo', (combo, multiplier) => {
            if (combo >= 3) {
                this.comboText.setText(`🔥 ${combo} COMBO`);
                this.comboText.setAlpha(1);
                this.comboText.setScale(1);

                // 连击数越高颜色越深
                if (combo >= 15) {
                    this.comboText.setFill('#FF0000');
                } else if (combo >= 10) {
                    this.comboText.setFill('#FF4500');
                } else {
                    this.comboText.setFill('#FF8C00');
                }

                // 跳动动画
                this.tweens.killTweensOf(this.comboText);
                this.tweens.add({
                    targets: this.comboText,
                    scale: 1.2,
                    yoyo: true,
                    duration: 200,
                    ease: 'Sine.easeOut'
                });
            } else {
                // 慢慢淡出
                this.tweens.killTweensOf(this.comboText);
                this.tweens.add({
                    targets: this.comboText,
                    alpha: 0,
                    duration: 500,
                    ease: 'Sine.easeOut'
                });
            }
        });

        // 速度倍率更新
        gameScene.events.on('updateSpeedMult', (mult) => {
            if (mult > 1.0) {
                this.speedText.setText(`⚡ ${(mult * 100).toFixed(0)}%`);
                this.speedText.setAlpha(1);

                this.tweens.killTweensOf(this.speedText);
                this.tweens.add({
                    targets: this.speedText,
                    scale: 1.3,
                    yoyo: true,
                    duration: 300,
                    ease: 'Sine.easeOut'
                });
            } else {
                this.speedText.setAlpha(0);
            }
        });
    }

    flashHealthBar() {
        if (this.hpBarTween && this.hpBarTween.isPlaying()) return;
        
        this.hpBarTween = this.tweens.add({
            targets: this.hpContainer,
            alpha: 0.2,
            duration: 100,
            yoyo: true,
            repeat: 1,
            onComplete: () => {
                this.hpContainer.setAlpha(1);
            }
        });
    }

    updateHealthBar(hp) {
        this.hpBar.clear();
        
        // 限制 hp 范围 (不限制上限)
        const clampedHp = Math.max(0, hp);
        const percent = clampedHp / 100;
        // 宽度适配新的背景 (约 80px)
        const width = 78 * percent; 
        
        // 颜色渐变 (恢复鲜艳颜色)
        let color = 0x00ff00; // 绿色
        if (percent < 0.3) {
            color = 0xff0000; // 红色
        } else if (percent < 0.6) {
            color = 0xffff00; // 黄色
        }
        
        if (width > 0) {
            this.hpBar.fillStyle(color, 1);
            this.hpBar.beginPath();
            // 稍微调整偏移以匹配新的背景
            this.hpBar.moveTo(2, 4);
            this.hpBar.lineTo(2 + width, 4.5);
            this.hpBar.lineTo(2 + width - 1, 9);
            this.hpBar.lineTo(1, 8.5);
            this.hpBar.closePath();
            this.hpBar.fillPath();
        }
    }
    
    showLeaderboard(data) {
        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;
        const cy = height / 2;
        
        // 背景：极简白纸风格，无边框，轻微阴影
        // 阴影
        this.add.rectangle(cx + 5, cy + 5, width * 0.85, height * 0.7, 0x000000, 0.05)
            .setScrollFactor(0)
            .setDepth(1999);
        
        // 白纸
        const bg = this.add.rectangle(cx, cy, width * 0.85, height * 0.7, 0xFFFFFF, 1)
            .setScrollFactor(0)
            .setDepth(2000);
            
        // 字体配置
        const titleStyle = {
            fontSize: '24px',
            fill: '#333',
            fontFamily: '"Georgia", "Times New Roman", serif',
            fontStyle: 'normal',
            letterSpacing: 2
        };
        
        const scoreLabelStyle = {
            fontSize: '14px',
            fill: '#888',
            fontFamily: '"Georgia", "Times New Roman", serif',
            letterSpacing: 1
        };
        
        const scoreValueStyle = {
            fontSize: '64px',
            fill: '#222',
            fontFamily: '"Georgia", "Times New Roman", serif',
            fontStyle: 'normal'
        };
        
        const listStyle = {
            fontSize: '16px',
            fill: '#555',
            fontFamily: '"Courier New", monospace' // 打字机风格
        };

        // Title: 简单的 "FINISHED" 或 "GAME OVER"
        this.add.text(cx, cy - height * 0.28, 'S K I   C L A S S I C', titleStyle)
            .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // Score Label
        this.add.text(cx, cy - height * 0.20, 'SCORE', scoreLabelStyle)
            .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // Score Value (大号数字)
        this.add.text(cx, cy - height * 0.12, `${data.score}`, scoreValueStyle)
            .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // Time
        const timeStr = data.time || '--';
        this.add.text(cx, cy - height * 0.05, `Time: ${timeStr}`, { ...scoreLabelStyle, fontSize: '16px' })
            .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 排行榜标题行
        const listStyleSmall = {
            fontSize: '12px',
            fill: '#aaa',
            fontFamily: '"Courier New", monospace'
        };

        const lineY = cy - height * 0.01;
        const line = this.add.graphics();
        line.lineStyle(1, 0xDDDDDD, 1);
        line.lineBetween(cx - 160, lineY, cx + 160, lineY);
        line.setScrollFactor(0).setDepth(2001);

        // 列头
        const colX = cx - 150;
        this.add.text(colX, lineY + 8, 'RANK', listStyleSmall).setScrollFactor(0).setDepth(2001);
        this.add.text(colX + 45, lineY + 8, 'TIME', listStyleSmall).setScrollFactor(0).setDepth(2001);
        this.add.text(colX + 130, lineY + 8, 'SCORE', listStyleSmall).setScrollFactor(0).setDepth(2001);
        this.add.text(colX + 220, lineY + 8, 'DATE', listStyleSmall).setScrollFactor(0).setDepth(2001);

        // 排行榜列表 — 显示全部记录（最多20条）
        let startY = lineY + 32;
        const lineHeight = 24;
        const maxVisible = Math.min(data.leaderboard.length, 20);

        if (maxVisible > 0) {
            data.leaderboard.forEach((record, index) => {
                if (index >= maxVisible) return;

                const rank = index + 1;
                let rankColor = '#999';
                if (rank === 1) rankColor = '#FFD700';
                else if (rank === 2) rankColor = '#C0C0C0';
                else if (rank === 3) rankColor = '#CD7F32';

                const y = startY + index * lineHeight;
                const showTime = record.time || '--';
                const showScore = record.score ?? 0;
                const showDate = record.date ? record.date.slice(0, 10) : '--';

                this.add.text(colX, y, `${rank}`, {
                    fontSize: '15px', fill: rankColor, fontFamily: '"Courier New", monospace', fontStyle: 'bold'
                }).setScrollFactor(0).setDepth(2001);

                this.add.text(colX + 40, y, `${showTime}`, {
                    fontSize: '14px', fill: rank === 1 ? '#222' : '#555', fontFamily: '"Courier New", monospace', fontStyle: 'bold'
                }).setScrollFactor(0).setDepth(2001);

                this.add.text(colX + 125, y, `${showScore}`, {
                    fontSize: '13px', fill: '#666', fontFamily: '"Courier New", monospace'
                }).setScrollFactor(0).setDepth(2001);

                this.add.text(colX + 215, y, `${showDate}`, {
                    fontSize: '11px', fill: '#aaa', fontFamily: '"Courier New", monospace'
                }).setScrollFactor(0).setDepth(2001);
            });
        } else {
            this.add.text(cx, startY + 20, 'No records yet', listStyle)
                .setOrigin(0.5).setScrollFactor(0).setDepth(2001);
        }

        // Restart Button (Simple Text Link)
        const restartBtn = this.add.text(cx, cy + height * 0.28, '- RESTART -', {
            fontSize: '18px',
            fill: '#333',
            fontFamily: '"Georgia", "Times New Roman", serif'
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            // 只需重启 GameScene，其 create() 会自动重启 UIScene 并刷新事件绑定
            this.scene.get('GameScene').scene.restart();
        })
        .on('pointerover', () => restartBtn.setColor('#000'))
        .on('pointerout', () => restartBtn.setColor('#333'));
        
        // Fullscreen click to restart (optional, kept for convenience but lower priority)
        this.add.rectangle(cx, cy, width, height, 0x000000, 0)
            .setInteractive()
            .setScrollFactor(0)
            .setDepth(1999) 
            .on('pointerdown', () => {
                // Keep explicit button click for Zen feel, prevent accidental restart?
                // Or maybe just let it be. Let's keep explicit button for "Zen" patience.
                // But user might expect click anywhere. Let's remove the global click to enforce "Elegant" interaction.
            });
    }
}
