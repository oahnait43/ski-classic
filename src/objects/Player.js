import Phaser from 'phaser';

export default class Player {
    constructor(scene, x, y) {
        this.scene = scene;
        
        // 使用 Matter.js 的 Sprite
        this.sprite = scene.matter.add.sprite(x, y, 'player_straight');
        
        const Body = Phaser.Physics.Matter.Matter.Body;
        const Bodies = Phaser.Physics.Matter.Matter.Bodies;

        // 碰撞体：主要是底部的圆形，确保顺滑
        const mainBody = Bodies.circle(x, y + 10, 15, { label: 'playerCollider' });
        
        this.sprite.setExistingBody(mainBody);
        
        // 调整 Origin，确保重心在脚底板中心，动作更细腻
        this.sprite.setOrigin(0.5, 0.85);
        this.sprite.setDepth(10); // 确保玩家在最上层

        // 物理属性
        this.sprite.setFriction(0.005); // 地面摩擦力
        this.sprite.setFrictionAir(0.02); // 增加空气阻力，限制终极速度
        this.sprite.setBounce(0.1); // 降低弹性
        this.sprite.setMass(50);
        this.sprite.setFixedRotation(); 

        // 状态
        this.isAlive = true;
        this.isCrashed = false;
        this.isRecovering = false;
        this.isJumping = false;
        this.airControlFactor = 0; // 空中控制力(0~1)，跳跃时递减
        this.speedLines = []; // 速度线特效
        
        // 粒子发射器 (雪花)
        this.particles = scene.add.particles(0, 0, 'snow_particle', {
            speed: { min: 50, max: 100 },
            angle: { min: 220, max: 320 }, // 向后上方飞溅
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.8, end: 0 },
            lifespan: 500,
            gravityY: 100,
            follow: this.sprite,
            followOffset: { x: 0, y: -27 }, // 跟随板尾 (再向后2px)
            emitting: false
        });
        
        // 确保粒子在玩家下方渲染
        this.particles.setDepth(5);
    }

    update(controls, config = { turnSpeed: 0.05, slope: 0.005 }) {
        if (!this.isAlive) return;
        
        // 【看门狗】强制重置缩放：如果不在跳跃、摔倒或震动状态，强制 scale 回归 1
        // 彻底解决小跳后可能卡在变大状态的 BUG
        if (!this.isJumping && !this.isCrashed && !this.isRecovering) {
            if (Math.abs(this.sprite.scaleX - 1) > 0.01 || Math.abs(this.sprite.scaleY - 1) > 0.01) {
                // 只有当偏差大于 0.01 时才重置，避免浮点数抖动
                // 检查是否正在进行任何 tween (例如 hitObstacle 的震动)
                if (!this.scene.tweens.isTweening(this.sprite)) {
                    this.sprite.setScale(1);
                }
            }
        }
        
        // 限制最大速度
        const maxVelocity = 11;
        if (this.sprite.body.velocity.y > maxVelocity) {
            this.sprite.setVelocityY(maxVelocity);
        }

        // 确保水平速度衰减
        if (this.isCrashed) {
            this.sprite.setVelocityX(this.sprite.body.velocity.x * 0.9);
            return;
        }

        const velocity = this.sprite.body.velocity;

        // 1. 物理运动
        // 转向阻力
        const turnDrag = Math.abs(controls.tilt) * 0.04;

        let airFriction = 0.0005 + turnDrag;
        this.sprite.setFrictionAir(airFriction);

        this.sprite.setFriction(0.003);

        // 横向控制力
        let forceX = controls.tilt * config.turnSpeed;

        // 空中控制
        if (this.isJumping && this.airControlFactor > 0) {
            forceX *= this.airControlFactor;
        }
        this.sprite.applyForce({ x: forceX, y: 0 });

        // 速度限制
        const maxSpeedX = 9;
        if (velocity.x > maxSpeedX) this.sprite.setVelocityX(maxSpeedX);
        if (velocity.x < -maxSpeedX) this.sprite.setVelocityX(-maxSpeedX);

        // 坡度推力
        if (!this.isJumping) {
            this.sprite.applyForce({ x: 0, y: config.slope });

            // 减少轨迹生成频率，提高性能
            if (this.scene.time.now % 80 < 20) {
                this.createTrail();
            }
        }

        // 速度反馈：高速时生成速度线
        const speed = Math.abs(velocity.y);
        if (speed > 18 && !this.isJumping && this.scene.time.now % 120 < 20) {
            this.createSpeedLine();
        }

        // 2. 视觉表现 (切换 Sprite 帧)
        // 恢复中的闪烁效果
        if (this.isRecovering) {
            this.sprite.setAlpha(this.scene.time.now % 200 < 100 ? 0.5 : 1);
        } else {
            this.sprite.setAlpha(1);
        }

        if (this.isJumping) {
            this.sprite.setTexture('player_jump');
            this.particles.stop(); // 跳跃时不产生雪花
            // 移除 setRotation(0)，让 tween 控制旋转
        } else {
            // 根据 tilt 值进行更平滑的视觉旋转
            const targetRotation = controls.tilt * 0.5; // 加大旋转幅度
            const currentRotation = this.sprite.rotation;
            this.sprite.setRotation(Phaser.Math.Linear(currentRotation, targetRotation, 0.2));

            if (controls.tilt < -0.1) {
                this.sprite.setTexture('player_left');
                this.particles.start();
                // 调整粒子：雪浪向右喷射，且更猛烈
                this.particles.angle = { min: -30, max: 60 };
                this.particles.speed = { min: 100 + Math.abs(velocity.y)*10, max: 200 + Math.abs(velocity.y)*20 };
            } else if (controls.tilt > 0.1) {
                this.sprite.setTexture('player_right');
                this.particles.start();
                // 调整粒子：雪浪向左喷射
                this.particles.angle = { min: 120, max: 210 };
                this.particles.speed = { min: 100 + Math.abs(velocity.y)*10, max: 200 + Math.abs(velocity.y)*20 };
            } else {
                this.sprite.setTexture('player_straight');
                // 直行时只有轻微雪尘
                if (velocity.y > 5) {
                    this.particles.start();
                    this.particles.angle = { min: 250, max: 290 };
                    this.particles.speed = { min: 50, max: 100 };
                } else {
                    this.particles.stop();
                }
            }
        }
    }

    createTrail() {
        // 创建一个简单的淡出圆形作为轨迹
        // 调整位置：跟随板尾 (再向后2px)
        const trail = this.scene.add.circle(this.sprite.x, this.sprite.y - 17, 6, 0xdddddd, 0.4);
        trail.setDepth(1); // 在最底层
        
        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            scale: 0,
            duration: 1000,
            onComplete: () => trail.destroy()
        });
    }

    createSpeedLine() {
        // 速度线：快速滑过的短线，增强速度感
        const line = this.scene.add.line(
            this.sprite.x + Phaser.Math.Between(-20, 20),
            this.sprite.y - Phaser.Math.Between(30, 60),
            0, 0, Phaser.Math.Between(10, 30), 0,
            0xffffff, 0.6
        );
        line.setDepth(1);
        line.setLineWidth(1);
        line.setAngle(Phaser.Math.Between(-15, 15));
        this.speedLines.push(line);

        this.scene.tweens.add({
            targets: line,
            alpha: 0,
            y: line.y + Phaser.Math.Between(20, 50),
            duration: 400,
            onComplete: () => {
                line.destroy();
                // 从数组移除
                const idx = this.speedLines.indexOf(line);
                if (idx > -1) this.speedLines.splice(idx, 1);
            }
        });
    }

    jump() {
        if (this.isCrashed || this.isJumping || this.isRecovering) return false;

        this.isJumping = true;
        this.airControlFactor = 0.6; // 空中保留60%横向控制力，逐渐衰减

        const currentVelY = this.sprite.body.velocity.y;

        // 跳跃冲力：速度越快跳得越高
        const jumpImpulse = 5 + (currentVelY * 0.6);
        this.sprite.setVelocityY(currentVelY + jumpImpulse);

        // 滞空时间
        const baseDuration = 600;
        const extraDuration = Math.min(1400, currentVelY * 50);
        const totalDuration = baseDuration + extraDuration;

        // 缩放因子（视觉上的腾空感）
        const scaleFactor = 1.8 + Math.min(1.2, currentVelY * 0.08);

        // 分段动画：上升 → 滞空 → 下落
        this.jumpTween = this.scene.tweens.add({
            targets: this.sprite,
            scaleX: scaleFactor,
            scaleY: scaleFactor,
            duration: totalDuration * 0.4,
            ease: 'Quad.out',
            onComplete: () => {
                if (!this.sprite.active) return;
                this.scene.tweens.add({
                    targets: this.sprite,
                    scaleX: scaleFactor * 1.05,
                    scaleY: scaleFactor * 1.05,
                    duration: totalDuration * 0.2,
                    yoyo: true,
                    repeat: 0,
                    onComplete: () => {
                        if (!this.sprite.active) return;
                        this.scene.tweens.add({
                            targets: this.sprite,
                            scaleX: 1,
                            scaleY: 1,
                            duration: totalDuration * 0.4,
                            ease: 'Quad.in',
                            onComplete: () => {
                                this.sprite.setScale(1);
                            }
                        });
                    }
                });
            }
        });

        // 空中翻转特效（大跳时触发）
        if (jumpImpulse > 10) {
            this.scene.tweens.add({
                targets: this.sprite,
                angle: 720,
                duration: totalDuration * 0.9,
                ease: 'Back.out'
            });
        }

        // 阴影效果
        const shadow = this.scene.add.ellipse(this.sprite.x, this.sprite.y + 10, 20, 10, 0x000000, 0.2);
        shadow.setDepth(0);
        this.scene.tweens.add({
            targets: shadow,
            scaleX: 0.2,
            scaleY: 0.2,
            alpha: 0,
            y: this.sprite.y + 100,
            duration: totalDuration * 0.5,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => shadow.destroy()
        });

        // 影子跟随玩家
        this.scene.events.on('update', () => {
            if (shadow && shadow.active) {
                shadow.x = this.sprite.x;
            }
        });

        // 空中控制力衰减计时
        this.scene.time.delayedCall(totalDuration * 0.6, () => {
            this.airControlFactor = 0.2; // 后半段只剩20%
        });

        // 落地回调
        this.scene.time.delayedCall(totalDuration, () => {
            if (!this.scene || !this.sprite.active) return;
            this.isJumping = false;
            this.airControlFactor = 0;
            this.sprite.setAngle(0);
            this.sprite.setScale(1);
            if (this.jumpTween && this.jumpTween.isPlaying()) {
                this.jumpTween.stop();
            }
            // 落地雪尘
            this.particles.emitParticleAt(this.sprite.x, this.sprite.y, 20);
        });

        return true;
    }

    hitObstacle() {
        if (this.isCrashed || this.isRecovering) return;

        // 停止跳跃动画并重置缩放
        if (this.isJumping) {
            this.scene.tweens.killTweensOf(this.sprite);
            this.sprite.setScale(1);
            this.sprite.setAngle(0);
            this.isJumping = false;
        }

        // 减速明显一点，但不要太慢导致卡住
        const currentVel = this.sprite.body.velocity;
        // 保持至少 2 的速度，或者当前速度的 50%
        const newSpeedY = Math.max(2, currentVel.y * 0.5);
        this.sprite.setVelocityY(newSpeedY); 
        
        // 视觉反馈：变红震动
        this.sprite.setTint(0xFF0000);
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: 1.2,
            scaleY: 0.8,
            yoyo: true,
            duration: 100,
            onComplete: () => this.sprite.clearTint()
        });
    }
    
    crash() {
        if (this.isCrashed || this.isRecovering) return;
        
        // 停止跳跃动画并重置缩放
        this.scene.tweens.killTweensOf(this.sprite);
        this.sprite.setScale(1);
        this.isJumping = false;

        this.isCrashed = true;
        this.sprite.setTexture('player_crash');
        this.particles.stop();
        
        // 允许物理旋转摔倒
        this.sprite.setFixedRotation(false); 
        
        // 施加反向力（被撞飞）
        this.sprite.applyForce({ x: (Math.random() - 0.5) * 0.1, y: -0.05 });
        
        // 1.5秒后自动恢复
        this.scene.time.delayedCall(1500, () => {
            this.recover();
        });
    }

    recover() {
        this.isCrashed = false;
        this.isRecovering = true;
        
        // 恢复直立
        this.sprite.setAngle(0);
        this.sprite.setFixedRotation(true);
        this.sprite.setTexture('player_straight');
        
        // 2秒无敌时间
        this.scene.time.delayedCall(2000, () => {
            this.isRecovering = false;
            this.sprite.setAlpha(1);
        });
    }

    die() {
        // Deprecated: 使用 crash 代替
        this.crash();
    }
}
