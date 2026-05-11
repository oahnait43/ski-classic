import Phaser from 'phaser';

export default class Dog {
    constructor(scene, x, y) {
        this.scene = scene;
        
        // 使用 Matter.js Sprite
        this.sprite = scene.matter.add.sprite(x, y, 'dog_1', null, {
            isSensor: true, // 传感器模式：只触发碰撞事件，不产生物理反弹
            label: 'dog'
        });
        this.sprite.dogInstance = this; // Link instance to sprite
        
        this.sprite.setIgnoreGravity(true); // 狗不受重力影响 (为了简化 AI 跑动)
        
        // 随机跑动方向
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.speed = Phaser.Math.Between(1, 3);
        
        // 播放动画
        this.scene.anims.create({
            key: 'dog_run',
            frames: [
                { key: 'dog_1' },
                { key: 'dog_2' }
            ],
            frameRate: 10,
            repeat: -1
        });
        
        this.sprite.play('dog_run');
        this.sprite.setFlipX(this.direction === -1); // 根据方向翻转
        
        this.nextBarkTime = 0;
        this.isCarried = false;
        this.player = null;
    }

    update() {
        if (this.isCarried) {
            if (this.player && this.player.sprite && this.player.sprite.active) {
                // 跟随玩家，位置在玩家背上或稍后方
                this.sprite.setPosition(this.player.sprite.x, this.player.sprite.y - 10);
                // 停止播放跑动动画，改为静止或其他
                this.sprite.setFrame('dog_1'); 
                this.sprite.setFlipX(this.player.sprite.flipX);
                this.sprite.setDepth(this.player.sprite.depth + 1); // 在玩家上面
            } else {
                this.drop();
            }
            return;
        }

        this.sprite.x += this.direction * this.speed;
        
        // 碰到边界反弹
        if (this.sprite.x < 0) {
            this.direction = 1;
            this.sprite.setFlipX(false);
        } else if (this.sprite.x > this.scene.scale.width) {
            this.direction = -1;
            this.sprite.setFlipX(true);
        }
        
        // 随机叫
        if (this.scene.time.now > this.nextBarkTime) {
            // 只有当狗在屏幕范围内时才叫
            const camera = this.scene.cameras.main;
            if (this.sprite.y > camera.scrollY - 100 && this.sprite.y < camera.scrollY + camera.height + 100) {
                 if (Phaser.Math.Between(0, 100) < 5) { 
                    this.bark();
                    this.nextBarkTime = this.scene.time.now + Phaser.Math.Between(2000, 5000);
                }
            }
        }
    }

    bark() {
        if (this.isCarried) return; // 被收集后不叫

        if (this.scene && typeof this.scene.showFloatingText === 'function') {
            // 荧光粉色
            this.scene.showFloatingText(this.sprite.x, this.sprite.y - 40, 'Wang!', '#FF00FF');
        }
    }

    collect(player) {
        if (this.isCarried) return; // 防止重复触发
        this.isCarried = true;
        
        // 1. 显示头顶爱心特效
        if (this.scene) {
            const x = player.sprite.x;
            const y = player.sprite.y - 60;
            
            // 爱心文字
            const heart = this.scene.add.text(x, y, '❤', {
                fontSize: '40px',
                fill: '#ff0000',
                stroke: '#ffffff',
                strokeThickness: 4
            }).setOrigin(0.5).setDepth(2000);

            // 飘动动画
            this.scene.tweens.add({
                targets: heart,
                y: y - 100,
                scale: 1.5,
                alpha: 0,
                duration: 1000,
                ease: 'Sine.easeOut',
                onComplete: () => heart.destroy()
            });
            
            // 播放音效或文字提示
            if (typeof this.scene.showFloatingText === 'function') {
                this.scene.showFloatingText(x, y - 40, 'Doggy Love! +100', '#ff69b4');
            }
        }

        // 2. 销毁小狗实体
        if (this.sprite) {
            this.sprite.destroy();
        }
    }
}
