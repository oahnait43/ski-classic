import Phaser from 'phaser';
import Player from '../objects/Player';
import Dog from '../objects/Dog';
import Competitor from '../objects/Competitor';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        // 从 URL 参数或传入数据获取配置
        const urlParams = new URLSearchParams(window.location.search);
        
        this.config = {
            slope: parseFloat(urlParams.get('slope')) || 0.005, // 坡度带来的额外推力
            turnSpeed: parseFloat(urlParams.get('turn')) || 0.05, // 转向灵敏度
            obstacleDensity: parseInt(urlParams.get('density')) || 2, // 障碍物密度
            friction: parseFloat(urlParams.get('friction')) || 0.005 // 摩擦力
        };
        
        console.log('Game Config:', this.config);
    }

    create() {
        // 确保 UIScene 启动
        this.scene.launch('UIScene');

        // 设置世界边界：扩大宽度以适应缩小后的视野
        const worldWidth = this.scale.width * 4; 
        this.matter.world.setBounds(-worldWidth / 2, -1000, worldWidth * 2, Infinity, 30, true, true, false, false);
        
        // 创建玩家
        this.player = new Player(this, this.scale.width / 2, 100);
        
        // 摄像机设置
        this.cameras.main.setZoom(0.35); // 调整为 0.35
        // startFollow(target, roundPixels, lerpX, lerpY, offsetX, offsetY)
        // offsetY 设为 -300 让人物处于屏幕偏上位置
        this.cameras.main.startFollow(this.player.sprite, false, 0.1, 0.1, 0, -300);
        this.cameras.main.setBackgroundColor('#faf9f6'); // 暖白/纸张色，更护眼且符合禅意
        
        // 输入控制
        this.cursors = this.input.keyboard.createCursorKeys();
        
        // 移动端重力感应变量
        this.tiltInput = 0;
        
        // iOS 权限处理覆盖层
        this.checkOrientationPermission();

        // 障碍物管理
        this.obstacles = [];
        this.decorations = []; // 装饰物（不碰撞）
        this.dogs = []; // 狗
        this.competitors = []; // 同行者
        this.bears = []; // 狗熊
        this.birds = []; // 鸟群
        this.tornadoes = []; // 小龙卷风
        this.bunnies = []; // 雪兔
        this.magicPoles = []; // 魔力雪杖
        this.gates = []; // 旗门 (独立管理，不用物理引擎检测)
        
        // 雪暴状态
        this.snowStormActive = false;
        this.snowStormFx = null;
        
        // 增益状态
        this.speedMultiplier = 1.0; // 速度倍率
        this.magnetActive = false; // 磁铁状态
        this.magnetEndTime = 0; // 磁铁结束时间
        this.lastSpawnY = 400; 

        // 碰撞检测
        this.matter.world.on('collisionstart', (event) => {
            // 确保场景没有被暂停或结束
            if (!this.scene.isActive()) return;

            event.pairs.forEach((pair) => {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;

                this.handleCollision(bodyA, bodyB);
            });
        });
        
        // 状态
        this.score = 0;
        this.hp = 100;     // 血量提升到100
        this.distance = 0;
        this.startTime = Date.now();
        this.endTime = 0;
        this.startY = this.player.sprite.y;
        this.isGameOver = false;
        this.isFinished = false;

        // === 连击系统 (Combo) ===
        this.combo = 0;
        this.comboTimer = 0;
        this.comboTimeout = 2500; // 2.5秒内续combo
        this.lastComboTime = 0;

        // === 检查点系统 ===
        this.checkpoints = [2000, 4000, 6000, 8000];
        this.passedCheckpoints = new Set();

        // === 速度倍率上限 ===
        this.maxSpeedMultiplier = 2.0;
        
        // 地形生成状态
        this.currentZone = 'normal'; // normal, forest, mound_field
        this.zoneRemainingLength = 0;
        
        // 小狗加分计时器
        this.lastDogCoinTime = 0;

        // 初始化粒子池
        this.createParticleManager();
        
        // 待销毁对象队列 (防止物理计算中修改世界导致死锁)
        this.pendingDestroy = [];
    }

    checkOrientationPermission() {
        // 隐式处理权限，不再显示弹窗
        const overlay = document.getElementById('start-overlay');
        if (overlay) overlay.style.display = 'none';

        // 尝试恢复音频
        this.input.once('pointerdown', () => {
            if (this.sound && this.sound.context && this.sound.context.state === 'suspended') {
                this.sound.context.resume();
            }
        });

        // 直接尝试添加监听器 (Android / 非强制权限设备)
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', this.handleOrientation.bind(this));
            }
        }

        // iOS 13+ 需要用户交互才能请求权限
        // 我们利用玩家在游戏中的第一次点击来触发请求
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            const requestPermission = () => {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                            this.events.emit('updateDebug', 'iOS Permission Granted');
                        }
                    })
                    .catch(console.error)
                    .finally(() => {
                        // 移除监听器，只请求一次
                        window.removeEventListener('click', requestPermission);
                        window.removeEventListener('touchend', requestPermission);
                    });
            };

            // 监听全局点击事件
            window.addEventListener('click', requestPermission);
            window.addEventListener('touchend', requestPermission);
        }
        
        // 始终启用鼠标回退，以防万一
        this.enableMouseControl();
    }

    enableMouseControl() {
        this.events.emit('updateDebug', 'Mouse Control Enabled');
        this.input.on('pointermove', (pointer) => {
            // 将鼠标 X 坐标映射到 -1 到 1 的 tilt 值
            const centerX = this.scale.width / 2;
            const tilt = (pointer.x - centerX) / (this.scale.width / 2);
            // 限制范围
            this.tiltInput = Phaser.Math.Clamp(tilt, -1, 1);
        });
    }

    updateHealth(amount, x, y, message) {
        if (this.isGameOver || this.isFinished) return;
        
        this.hp += amount;
        if (this.hp > 100) this.hp = 100; // 恢复上限
        
        this.events.emit('updateHealth', this.hp);
        
        if (message && x && y) {
            const color = amount > 0 ? '#00ff00' : '#ff0000';
            this.showFloatingText(x, y, message, color);
        }

        if (this.hp <= 0) {
            this.gameOver();
        }
    }

    addScore(points, x, y, message, color) {
        if (this.isGameOver || this.isFinished) return;

        // 连击系统：连续得分增加倍率
        const now = this.time.now;
        if (now - this.lastComboTime < this.comboTimeout && this.lastComboTime > 0) {
            this.combo++;
        } else {
            this.combo = 0;
        }
        this.lastComboTime = now;

        // 计算连击倍率 (每5连击+0.5倍, 最高3倍)
        const comboMultiplier = 1 + Math.min(2, Math.floor(this.combo / 5) * 0.5);
        const finalPoints = Math.round(points * comboMultiplier);

        this.score += finalPoints;
        this.events.emit('updateScore', this.score);

        // 显示连击信息
        if (this.combo >= 3) {
            this.events.emit('updateCombo', this.combo, comboMultiplier);
        } else {
            this.events.emit('updateCombo', 0, 1);
        }

        if (message) {
            let displayMsg = message;
            if (comboMultiplier > 1) {
                displayMsg += ` x${comboMultiplier.toFixed(1)}`;
            }
            this.showFloatingText(x, y, displayMsg, color);
        }
    }

    handleCollision(bodyA, bodyB) {
        // 如果游戏结束，不再处理碰撞
        if (this.isGameOver) return;

        // 辅助函数：获取标签
        const getLabel = (body) => body.label;
        const hasLabel = (label) => getLabel(bodyA) === label || getLabel(bodyB) === label;
        
        // 玩家碰撞检测
        if (hasLabel('playerCollider')) {
            const otherBody = getLabel(bodyA) === 'playerCollider' ? bodyB : bodyA;
            const label = otherBody.label;

            // 只要确保在 destroy 之前检查 active 即可
            if (otherBody.gameObject && !otherBody.gameObject.active) return;

            // 跳跃期间忽略障碍物碰撞 (树、雪包、狗)
            if (this.player.isJumping && (label === 'obstacle' || label === 'mound' || label === 'dog')) {
                return;
            }

            if (label === 'obstacle') {
                // Check if player is already crashed or recovering to avoid continuous damage
                if (this.player.isCrashed || this.player.isRecovering) return;

                // 移除丢掉小狗逻辑

                // 树：触发摔倒，不结束游戏
                this.player.crash();
                // 树震动效果
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.tweens.add({
                        targets: otherBody.gameObject,
                        scaleX: 1.2,
                        scaleY: 0.8,
                        yoyo: true,
                        duration: 100,
                        repeat: 1
                    });
                }
                // 扣血 (2滴)
                this.updateHealth(-2, this.player.sprite.x, this.player.sprite.y - 50, '-2 HP');
                
            } else if (label === 'ramp') {
                // 跳板：跳跃
                if (this.player.jump()) {
                    // 加分
                    this.addScore(50, this.player.sprite.x, this.player.sprite.y - 80, 'YAHOO! +50', '#00ffff');
                }
            } else if (label === 'mound') {
                // 雪堆：颠簸
                this.player.hitObstacle();

                // 移除丢掉小狗逻辑

                // 扣血 (2滴)
                this.updateHealth(-2, this.player.sprite.x, this.player.sprite.y - 40, '-2 HP');
                
                // 雪包炸裂特效 (复用粒子系统)
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    // 安全访问 position，如果 body 已经被销毁可能没有 position
                    const x = otherBody.position ? otherBody.position.x : otherBody.gameObject.x;
                    const y = otherBody.position ? otherBody.position.y : otherBody.gameObject.y;
                    
                    this.emitSnowExplosion(x, y);
                    
                    // 加入待销毁队列，不立即销毁
                    this.pendingDestroy.push(otherBody.gameObject);
                }
            } else if (label === 'dog') {
                // 狗：收集小狗
                if (otherBody.gameObject && otherBody.gameObject.dogInstance) {
                    const dog = otherBody.gameObject.dogInstance;
                    if (!dog.isCarried) {
                        dog.collect(this.player); // 调用新的收集方法
                        // 加分
                        this.addScore(100, null, null, null, null); // 已经在 collect 里显示文字了，这里只加分
                    }
                }
            } else if (label === 'coin') {
                // 金币：加分
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    const x = otherBody.position ? otherBody.position.x : otherBody.gameObject.x;
                    const y = otherBody.position ? otherBody.position.y : otherBody.gameObject.y;
                    this.addScore(15, x, y - 40, 'Coin! +15', '#ffd700');
                    this.pendingDestroy.push(otherBody.gameObject);
                }
            } else if (label === 'bunny') {
                // 雪兔：加速
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.collectBunny(otherBody.gameObject);
                }
            } else if (label === 'magic_pole') {
                // 魔力雪杖：磁铁
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.collectMagicPole(otherBody.gameObject);
                }
            } else if (label === 'tornado') {
                // 龙卷风：卷回 1km
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.hitTornado(otherBody.gameObject);
                }
            } else if (label === 'bloodpack') {
                // 血包：加血
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    // 防止重复触发
                    if (otherBody.gameObject.isHit) return;
                    otherBody.gameObject.isHit = true;

                    // 使用玩家位置显示提示，更安全且符合直觉
                    const x = this.player.sprite.x;
                    const y = this.player.sprite.y;
                    
                    this.updateHealth(10, x, y - 40, 'Heal! +10 HP');
                    this.pendingDestroy.push(otherBody.gameObject);
                }
            } else if (label === 'gateSensor') {
                // 穿过旗门 (旧逻辑兼容，防止重复触发，主要逻辑在 updateGates)
                // 加入待销毁队列
                if (otherBody.gameObject && otherBody.gameObject.active) {
                    this.pendingDestroy.push(otherBody.gameObject);
                }
            }
        }
    }

    showFloatingText(x, y, message, color, bgColor = null) {
        const style = { 
            fontSize: '48px', // 加大字号 (24px -> 48px)
            fill: color, 
            fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive, sans-serif', // 使用手写体
            fontStyle: 'bold',
            stroke: '#ffffff', // 改为白色描边，增强对比度
            strokeThickness: 6 // 加粗描边
        };
        // 只有显式传入 bgColor 时才添加背景色 (例如 ROAR!)
        // 大部分情况去掉背景色，保持干净
        if (bgColor) {
             style.backgroundColor = bgColor;
             style.padding = { x: 10, y: 5 };
        }

        const text = this.add.text(x, y, message, style).setOrigin(0.5).setDepth(1000);
        
        // 优化动效：停留时间更长，飘动更明显
        this.tweens.add({
            targets: text,
            y: y - 120, // 飘得更高
            alpha: { from: 1, to: 0 },
            scale: { from: 0.5, to: 1.2 }, // 弹跳放大效果
            duration: 1500, // 延长显示时间 (800 -> 1500)
            ease: 'Back.out', // 更有弹性的缓动
            onComplete: () => text.destroy()
        });
    }

    checkCollision(bodyA, bodyB) {
        // Deprecated: logic moved to handleCollision
        return false;
    }

    handleOrientation(event) {
        const gamma = event.gamma; // 左右倾斜
        
        // 增加有效性检查，防止 null/undefined 报错
        if (gamma !== null && gamma !== undefined) {
            // 限制在 -30 到 30 度
            let tilt = gamma / 30;
            if (tilt > 1) tilt = 1;
            if (tilt < -1) tilt = -1;
            this.tiltInput = tilt;
            
            // 更新 UI 调试信息
            this.events.emit('updateDebug', `Tilt: ${gamma.toFixed(1)} | Input: ${tilt.toFixed(2)}`);
        }
    }

    update() {
        if (this.isGameOver) return;
        // 如果已经到达终点，停止大部分逻辑，只保留必要的渲染
        if (this.isFinished) return;

        try {
            // 雪暴逻辑 (2km - 7km 随机区域)
            const currentDist = this.distance;
            
            // 简单随机逻辑：在此区间内，每隔一段时间随机决定是否开启
            if (currentDist >= 2000 && currentDist <= 7000) {
                // 使用 Perlin Noise 或简单的正弦波组合来控制频率
                // 降低频率: 周期变长
                const timeFactor = this.time.now * 0.0002; // 0.0005 -> 0.0002
                // 提高阈值: 减少开启时间 (约 20% 时间开启)
                const isBlizzard = Math.sin(timeFactor) + Math.sin(timeFactor * 2.1) * 0.5 > 0.8;

                if (isBlizzard) {
                    // 开启雪暴
                    if (!this.snowStormActive) {
                        this.snowStormActive = true;
                        // 移除模糊效果
                        // if (this.cameras.main.postFX) { ... }
                        
                        this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 200, "BLIZZARD!", "#00FFFF");
                        
                        // 开启飞雪粒子
                        if (this.blizzardEmitter) {
                            this.blizzardEmitter.start();
                        }
                    }
                    
                    // 强风干扰 - 降低风力幅度
                    if (this.player && this.player.sprite && this.player.sprite.active) {
                        const windForce = (Math.random() - 0.5) * 0.025;
                        this.player.sprite.applyForce({x: windForce, y: 0});

                        if (this.blizzardEmitter) {
                             this.blizzardEmitter.setSpeedX({ min: windForce * 3000 - 80, max: windForce * 3000 + 80 });
                        }
                    }
                } else {
                    // 暂时停歇
                    this.stopBlizzard();
                }
            } else {
                // 超出区间，彻底关闭
                this.stopBlizzard();
            }

            // 输入处理
            let control = 0; // 默认为 0
            
            // 优先检查键盘输入 (PC端)
            const leftDown = this.cursors.left.isDown;
            const rightDown = this.cursors.right.isDown;

            // 键盘输入逻辑优化：直接根据按键状态赋值，不依赖 else if 互斥
            if (leftDown && rightDown) {
                control = 0; // 同时按住抵消
            } else if (leftDown) {
                control = -1;
            } else if (rightDown) {
                control = 1;
            } else {
                // 如果没有键盘输入，才使用重力感应 (移动端)
                // 只有当完全没有键盘输入时才回退到 tilt
                control = this.tiltInput;
            }

                if (this.player && this.player.isAlive && this.player.sprite && this.player.sprite.active) {
                // 应用速度倍率到 config
                const currentConfig = { ...this.config };
                currentConfig.slope *= this.speedMultiplier;
                
                this.player.update({ tilt: control }, currentConfig);
                // 移除抱着小狗加分逻辑
            }
            
            // 磁铁逻辑
            if (this.magnetActive) {
                if (this.time.now > this.magnetEndTime) {
                    this.magnetActive = false;
                    this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 60, "MAGNET EXPIRED", "#888888");
                } else {
                    // 吸附金币
                    // 加大吸附半径 (300 -> 500)
                    const magnetRadius = 500;
                    this.obstacles.forEach(obs => {
                        if (obs && obs.active && obs.label === 'coin') {
                            const dist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, obs.x, obs.y);
                            if (dist < magnetRadius) {
                                // 飞向玩家
                                const angle = Phaser.Math.Angle.Between(obs.x, obs.y, this.player.sprite.x, this.player.sprite.y);
                                // 提高吸附速度 (15 -> 25)
                                const speed = 25;
                                
                                // 由于金币是 Static 刚体，setVelocity 不起作用
                                // 需要手动更新位置
                                obs.x += Math.cos(angle) * speed;
                                obs.y += Math.sin(angle) * speed;
                                
                                // 如果使用了 setPosition 也可以
                                // obs.setPosition(obs.x + Math.cos(angle) * speed, obs.y + Math.sin(angle) * speed);
                            }
                        }
                    });
                }
            }
            
            // 更新小狗 (增加有效性检查)
            if (this.dogs) {
                this.dogs.forEach(dog => {
                    // 修复：检查 dog.sprite.active 而不是 dog.active
                    if (dog && dog.sprite && dog.sprite.active && typeof dog.update === 'function') {
                        dog.update();
                    }
                });
            }

            // 更新同行者 (增加有效性检查)
            if (this.competitors) {
                this.competitors.forEach(comp => {
                    if (comp && comp.sprite && comp.sprite.active && typeof comp.update === 'function') {
                        comp.update(this.player.sprite.y, this.config);
                    }
                });
            }

            // 更新旗门检测
            this.updateGates();

            // 更新狗熊
            this.updateBears();

            // 更新鸟
            this.updateBirds();

            // 更新分数和距离
            if (this.player && this.player.sprite) {
                const currentDistance = Math.floor((this.player.sprite.y - this.startY) / 10);
                if (currentDistance > this.distance) {
                    this.distance = currentDistance;
                    this.events.emit('updateDistance', this.distance);
                    
                            // 检查终点
                    if (this.distance >= 8848 && !this.isFinished) {
                        this.reachFinishLine();
                    }

                    // 检查点检测
                    this.checkCheckpoints();
                }
            }

            // 动态生成环境
            const viewBottom = this.cameras.main.scrollY + this.scale.height;
            // 预加载下方 1000 像素的内容
            if (this.lastSpawnY < viewBottom + 1000) {
                this.spawnEnvironment(this.lastSpawnY, this.lastSpawnY + 500);
                this.lastSpawnY += 500;
            }
            
            // 处理延迟销毁队列 (安全销毁)
            if (this.pendingDestroy && this.pendingDestroy.length > 0) {
                // 去重，防止同一个对象被多次添加
                const uniqueSet = new Set(this.pendingDestroy);
                uniqueSet.forEach(obj => {
                    if (obj) {
                        // 1. 停止该对象上的所有动画，防止 tween 试图更新已销毁对象的属性
                        this.tweens.killTweensOf(obj);
                        
                        // 2. 销毁对象
                        if (obj.active) {
                            obj.destroy();
                        }
                    }
                });
                this.pendingDestroy = []; // 清空队列
            }
            
            // 优化：降低清理频率 (每60帧/1秒清理一次)，防止每一帧遍历大数组导致卡顿
            if (this.time.now % 1000 < 20) {
                this.cleanupEnvironment();
            }
        } catch (error) {
            console.error('Game Loop Error:', error);
            // 尝试恢复或忽略错误，避免卡死
        }
    }

    stopBlizzard() {
        if (this.snowStormActive) {
            this.snowStormActive = false;
            if (this.snowStormFx) {
                this.cameras.main.postFX.remove(this.snowStormFx);
                this.snowStormFx = null;
            }
            if (this.blizzardEmitter) {
                this.blizzardEmitter.stop();
            }
        }
    }

    updateGates() {
        if (!this.player || !this.player.sprite) return;
        const playerX = this.player.sprite.x;
        const playerY = this.player.sprite.y;
        
        this.gates.forEach(gate => {
            if (!gate || gate.passed) return;
            
            // 简单的 Y 轴穿过检测
            // 如果玩家刚刚经过旗门的 Y 线
            if (playerY > gate.y && playerY < gate.y + 50) { // 50 是检测容差
                // 检查 X 轴是否在旗门范围内
                const halfWidth = gate.width / 2;
                if (playerX > gate.x - halfWidth && playerX < gate.x + halfWidth) {
                    gate.passed = true;
                    // 旗门基础分100，连击加成
                    this.addScore(100, gate.x, gate.y - 50, 'GATE! +100', '#ffff00');
                    this.updateHealth(2, gate.x, gate.y - 80, 'HP +2');
                    // 小特效
                    this.cameras.main.flash(100, 255, 255, 0);
                }
            }
        });
    }

    checkCheckpoints() {
        if (this.isFinished) return;
        for (const cp of this.checkpoints) {
            if (this.distance >= cp && !this.passedCheckpoints.has(cp)) {
                this.passedCheckpoints.add(cp);
                const bonus = Math.floor(cp / 10); // 每1000m给100分bonus
                this.addScore(bonus, this.player.sprite.x, this.player.sprite.y - 100, `CHECKPOINT ${cp}m! +${bonus}`, '#FFD700');
                this.updateHealth(10, this.player.sprite.x, this.player.sprite.y - 70, 'HP +10');
                this.cameras.main.flash(300, 255, 215, 0);
                this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 150, `✅ ${cp}m`, '#FFD700');
            }
        }
    }

    reachFinishLine() {
        if (this.isFinished) return; // 防止重复触发
        this.isFinished = true;
        this.endTime = Date.now(); // 记录结束时间
        
        try {
            this.player.sprite.setVelocity(0, 0); // 停止
            this.physics.pause(); // 暂停物理
            
            // 播放彩带特效 (放在 try-catch 中，防止报错阻断后续逻辑)
            try {
                this.fireConfetti();
            } catch (err) {
                console.error('Confetti Error:', err);
            }
            
            // 保存分数并获取排行榜数据
            const result = this.saveScore();
            
            // 通知 UIScene 显示排行榜
            this.events.emit('showLeaderboard', result);
            
        } catch (error) {
            console.error('Finish Line Error:', error);
            // 保底尝试
            this.events.emit('showLeaderboard', {
                score: this.score,
                time: 'Error',
                leaderboard: []
            });
        }
    }

    fireConfetti() {
        // 创建多个颜色的彩带粒子
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
        
        // 创建一个简单的矩形纹理用于彩带
        if (!this.textures.exists('confetti')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 10, 5);
            g.generateTexture('confetti', 10, 5);
        }

        const emitter = this.add.particles(0, 0, 'confetti', {
            x: { min: 0, max: this.scale.width },
            y: -50,
            lifespan: 3000,
            speedY: { min: 100, max: 300 },
            speedX: { min: -100, max: 100 },
            angle: { min: 0, max: 360 },
            rotate: { min: 0, max: 360 },
            gravityY: 100,
            scale: { min: 0.5, max: 1.5 },
            tint: colors,
            quantity: 2,
            frequency: 50
        });
        
        // 5秒后停止
        this.time.delayedCall(5000, () => emitter.stop());
    }

    // ===== saveScore 已合并到文件末尾的统一版本 =====

    showLeaderboard(data) {
        const width = this.scale.width;
        const height = this.scale.height;
        const cx = width / 2;
        const cy = height / 2;
        
        // 1. 播放礼花特效 (基于物理的粒子爆发)
        this.fireConfetti();
        // 再额外来几发
        this.time.delayedCall(500, () => this.fireConfetti());
        this.time.delayedCall(1000, () => this.fireConfetti());

        // 背景遮罩 (磨砂玻璃感)
        const bg = this.add.rectangle(cx, cy, width * 0.85, height * 0.75, 0xffffff, 0.95)
            .setStrokeStyle(4, 0x000000)
            .setScrollFactor(0)
            .setDepth(2000);
            
        // 标题 "SKI CLASSIC"
        this.add.text(cx, cy - height * 0.3, 'SKI CLASSIC', {
            fontSize: '40px',
            fill: '#333333',
            fontFamily: '"Georgia", serif',
            fontStyle: 'bold',
            letterSpacing: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 分数展示区
        this.add.text(cx, cy - height * 0.22, 'SCORE', {
            fontSize: '18px', fill: '#888', fontFamily: 'Arial'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        this.add.text(cx, cy - height * 0.16, `${data.score || 0}`, {
            fontSize: '72px',
            fill: '#000000',
            fontFamily: '"Arial", sans-serif',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 用时 (修复显示 undefined 问题)
        const displayTime = data.time || '0m 0s';
        this.add.text(cx, cy - height * 0.10, `Time: ${displayTime}`, {
            fontSize: '24px',
            fill: '#666',
            fontFamily: 'Arial',
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 分割线
        const lineY = cy - height * 0.05;
        const line = this.add.graphics().setScrollFactor(0).setDepth(2001);
        line.lineStyle(2, 0xeeeeee, 1);
        line.lineBetween(cx - 100, lineY, cx + 100, lineY);

        // 排行榜 (Top 5 即可，避免拥挤)
        let startY = cy;
        const lineHeight = 35;
        
        // 确保 data.leaderboard 存在
        const list = data.leaderboard || [];
        
        list.slice(0, 5).forEach((record, index) => {
            const rank = index + 1;
            const scoreStr = record.score;
            const dateStr = record.date ? record.date.split(' ')[0] : '-'; // 仅日期
            
            // 排名颜色
            let rankColor = '#666';
            if (rank === 1) rankColor = '#FFD700'; // 金
            if (rank === 2) rankColor = '#C0C0C0'; // 银
            if (rank === 3) rankColor = '#CD7F32'; // 铜

            // 排名
            this.add.text(cx - 120, startY + index * lineHeight, `${rank}`, { 
                fontSize: '24px', fill: rankColor, fontStyle: 'bold' 
            }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(2001);

            // 分数
            this.add.text(cx, startY + index * lineHeight, `${scoreStr}`, { 
                fontSize: '24px', fill: '#333', fontStyle: 'bold' 
            }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(2001);
            
            // 日期
            this.add.text(cx + 120, startY + index * lineHeight, dateStr, { 
                fontSize: '16px', fill: '#999' 
            }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(2001);
        });

        // 重玩按钮 (底部)
        const restartBtn = this.add.text(cx, cy + height * 0.28, '- RESTART -', {
            fontSize: '28px',
            fill: '#333333',
            fontFamily: '"Georgia", serif',
            fontStyle: 'bold'
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            this.scene.restart();
        });
        
        // 呼吸动效
        this.tweens.add({
            targets: restartBtn,
            scale: 1.1,
            alpha: 0.8,
            yoyo: true,
            repeat: -1,
            duration: 1000
        });
    }

    updateBears() {
        if (!this.player || !this.player.sprite || !this.player.sprite.body) return;
        const playerPos = this.player.sprite.body.position;
        
        this.bears.forEach(bear => {
            if (!bear || !bear.body) return;
            // 1. 巡逻逻辑
            if (Math.abs(bear.x - bear.startX) > bear.patrolRange) {
                bear.direction *= -1;
                bear.setVelocityX(0);
            }
            // 只有在没有追逐玩家时才巡逻
            const distToPlayer = Phaser.Math.Distance.Between(bear.x, bear.y, playerPos.x, playerPos.y);
            
            // 判定是否开始追逐 - 增加预警机制
            if (!bear.isChasing) {
                if (distToPlayer < 400) {
                    // 靠近预警（300-400范围）：显示感叹号
                    if (distToPlayer > 300 && !bear.warningShown) {
                        bear.warningShown = true;
                        this.showFloatingText(bear.x, bear.y - 80, '⚠ BEAR!', '#FFA500');
                    }
                    // 开始追逐（300以内）
                    if (distToPlayer < 300) {
                        bear.isChasing = true;
                        bear.chaseStartY = bear.y;
                        if (this.time.now > bear.nextRoarTime) {
                            this.showFloatingText(bear.x, bear.y - 60, 'ROAR!', '#ff0000', '#ffffff');
                            bear.nextRoarTime = this.time.now + 3000;
                            this.cameras.main.shake(200, 0.003);
                        }
                    }
                } else {
                    bear.warningShown = false;
                }
            }

            // 判定是否放弃追逐
            if (bear.isChasing) {
                const chasedDist = Math.abs(bear.y - bear.chaseStartY);
                if (chasedDist > bear.maxChaseDistance || distToPlayer > 500) {
                    bear.isChasing = false;
                    bear.setVelocity(0, 0); // 停下
                    bear.startX = bear.x; // 重置巡逻起点
                }
            }
            
            if (bear.isChasing) {
                // 追逐玩家 (简单的向玩家移动)
                const dx = playerPos.x - bear.x;
                const dy = playerPos.y - bear.y;
                bear.setVelocityX(dx > 0 ? 3 : -3); // 加速追赶
                bear.setVelocityY(dy > 0 ? 3 : -1); 

                // 咬住判定
                const biteRange = 80; // 增加判定范围 (50 -> 80)
                const escapeRange = 300; // 必须拉开足够距离才能摆脱

                if (distToPlayer < biteRange) {
                    bear.isBiting = true;
                } else if (distToPlayer > escapeRange || !bear.isChasing) {
                    bear.isBiting = false;
                }

                // 持续伤害 - 频率降低，伤害减少
                if (bear.isBiting && !this.isGameOver) {
                    if (!bear.lastDamageTime || this.time.now - bear.lastDamageTime > 800) {
                        // 熊咬人不走 updateHealth，避免提前触发 gameOver()
                        this.hp -= 3;
                        if (this.hp < 0) this.hp = 0;
                        this.events.emit('updateHealth', this.hp);
                        this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 50, '-3 HP', '#ff0000');
                        bear.lastDamageTime = this.time.now;
                        this.cameras.main.shake(100, 0.003);
                        this.events.emit('flashHealth');

                        if (this.hp <= 0) {
                            this.bearEatPlayer(bear);
                        } else {
                            // 有血时正常emit血量更新
                            this.events.emit('updateHealth', this.hp);
                        }
                    }
                }
                
            } else {
                // 继续巡逻
                bear.setVelocityX(bear.direction * 0.5); // 慢悠悠走
                // 保持 Y 轴位置稍微波动或者静止
                 bear.setVelocityY(0);
            }
        });
    }

    bearEatPlayer(bear) {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.player.isAlive = false;
        this.player.sprite.setVelocity(0, 0);
        this.endTime = Date.now();

        const bigBear = this.add.image(bear.x, bear.y, 'bear');
        bigBear.setDepth(2000);

        this.tweens.add({
            targets: bigBear,
            scale: 5,
            x: this.cameras.main.midPoint.x,
            y: this.cameras.main.midPoint.y,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.time.delayedCall(600, () => {
                    const result = this.saveScore();
                    this.events.emit('showLeaderboard', result);
                });
            }
        });

        this.showFloatingText(bear.x, bear.y - 100, 'CHOMP!', '#ff0000', '#000000');
    }

    updateBirds() {
        if (!this.player || !this.player.sprite) return;
        const playerY = this.player.sprite.y;
        
        this.birds.forEach(birdObj => {
            if (!birdObj || !birdObj.sprite) return;
            if (birdObj.state === 'idle') {
                // 检查玩家是否靠近
                if (Math.abs(birdObj.groundY - playerY) < 200) {
                    // 惊吓起飞
                    birdObj.state = 'flying';
                    // 随机飞向左上或右上
                    birdObj.velocityX = (Math.random() - 0.5) * 5;
                    birdObj.velocityY = -3 - Math.random() * 2;
                }
            } else if (birdObj.state === 'flying') {
                birdObj.sprite.x += birdObj.velocityX;
                birdObj.sprite.y += birdObj.velocityY;
                // 慢慢淡出
                birdObj.sprite.alpha -= 0.01;
            }
        });
    }

    spawnEnvironment(startY, endY) {
        // 5km - 6km 雪暴区间生成龙卷风 (50000px - 60000px)
        // 弹性区间：48000 - 62000
        // 修改：为了测试，将区间提前到 2km (20000px)
        const relativeY = startY - this.startY;
        // if (relativeY > 48000 && relativeY < 62000) {
        // 龙卷风稀有出现 (2km - 7km)
        if (relativeY > 20000 && relativeY < 70000) {
            // 降低概率 (50% -> 5%)，防止刷屏
            // 且只在没有雪暴时生成 (互斥)
            if (!this.snowStormActive && Math.random() < 0.05) {
                const zoom = this.cameras.main.zoom || 0.5;
                const viewWidth = this.scale.width / zoom; 
                const centerX = this.player.sprite.x;
                const x = Phaser.Math.Between(centerX - viewWidth / 2, centerX + viewWidth / 2);
                const y = Phaser.Math.Between(startY, endY);
                this.createTornado(x, y);
            }
        }

        // 终点线位置 (8848m * 10 = 88480px + startY)
        const finishY = this.startY + 88480;
        
        // 如果本次生成范围覆盖了终点线
        if (startY <= finishY && endY >= finishY) {
            this.createFinishLine(finishY);
        }

        // 更新地形区域状态
        if (this.zoneRemainingLength <= 0) {
            // 随机选择新地形 - 多元化的5种区域
            const rand = Math.random();
            const zoneOptions = [
                { name: 'normal', prob: 0.30, length: [800, 1400] },
                { name: 'forest', prob: 0.20, length: [600, 1000] },
                { name: 'mound_field', prob: 0.15, length: [500, 800] },
                { name: 'open_slope', prob: 0.20, length: [600, 1000] },
                { name: 'item_bonus', prob: 0.15, length: [400, 700] },
            ];

            let cumProb = 0;
            let chosen = zoneOptions[0];
            for (const z of zoneOptions) {
                cumProb += z.prob;
                if (rand < cumProb) { chosen = z; break; }
            }

            this.currentZone = chosen.name;
            this.zoneRemainingLength = chosen.length[0] + Math.random() * (chosen.length[1] - chosen.length[0]);

            const zoneMessages = {
                'normal': null,
                'forest': ['DENSE FOREST!', '#228B22'],
                'mound_field': ['MOUND FIELD!', '#4169E1'],
                'open_slope': ['OPEN SLOPE! GO GO!', '#FFD700'],
                'item_bonus': ['ITEM BONUS!', '#FF69B4'],
            };
            const msg = zoneMessages[this.currentZone];
            if (msg) {
                this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 80, msg[0], msg[1]);
            }
        }
        
        // 减少剩余长度
        this.zoneRemainingLength -= (endY - startY);

        const density = this.config.obstacleDensity || 2;
        // 扩大生成范围，覆盖新的世界宽度
        // 动态计算视野宽度：scale.width / zoom
        const zoom = this.cameras.main.zoom || 0.5;
        const viewWidth = this.scale.width / zoom; 
        const centerX = this.player.sprite.x;
        const minX = centerX - viewWidth / 1.5;
        const maxX = centerX + viewWidth / 1.5;
        
        // 根据不同地形执行不同生成逻辑
        if (this.currentZone === 'forest') {
            this.spawnForestZone(startY, endY, minX, maxX, centerX);
        } else if (this.currentZone === 'mound_field') {
            this.spawnMoundFieldZone(startY, endY, minX, maxX);
        } else if (this.currentZone === 'open_slope') {
            this.spawnOpenSlopeZone(startY, endY, minX, maxX);
        } else if (this.currentZone === 'item_bonus') {
            this.spawnItemBonusZone(startY, endY, minX, maxX);
        } else {
            this.spawnNormalZone(startY, endY, minX, maxX, density);
        }
    }

    spawnForestZone(startY, endY, minX, maxX, centerX) {
        // 密林：更宽的通道，更少的树木
        const step = 100; // 树木间隔加大

        for (let y = startY; y < endY; y += step) {
            const pathOffset = Math.sin(y * 0.004) * 350; // 蜿蜒更平缓
            const pathCenter = centerX + pathOffset;
            const pathWidth = 400; // 通道加宽到400

            // 填充通道左侧
            for (let x = minX; x < pathCenter - pathWidth / 2; x += Phaser.Math.Between(100, 180)) {
                this.createObstacle(x, y + Phaser.Math.Between(-20, 20));
            }

            // 填充通道右侧
            for (let x = pathCenter + pathWidth / 2; x < maxX; x += Phaser.Math.Between(100, 180)) {
                this.createObstacle(x, y + Phaser.Math.Between(-20, 20));
            }

            // 通道中间极少障碍
            if (Math.random() < 0.03) {
                this.createObstacle(pathCenter + Phaser.Math.Between(-60, 60), y);
            }
        }

        this.spawnItems(startY, endY, minX, maxX);
    }

    spawnMoundFieldZone(startY, endY, minX, maxX) {
        // 雪包阵：适量雪包 + 跳板
        const count = 8; // 数量减半 (15 -> 8)
        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            
            // 确保生成在视野内
            if (Math.random() < 0.3) {
                this.createRamp(x, y); // 30% 是跳板
            } else {
                this.createMound(x, y); // 70% 是雪包
            }
        }
        
        // 少量树木点缀
        for (let i = 0; i < 2; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createObstacle(x, y);
        }
        
        // 统一生成道具
        this.spawnItems(startY, endY, minX, maxX);
    }

    spawnNormalZone(startY, endY, minX, maxX, density) {
        // 1. 生成树木 (致命障碍)
        const obstacleCount = Phaser.Math.Between(1, density * 2);
        for (let i = 0; i < obstacleCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createObstacle(x, y);
        }

        // 2. 生成跳板 (Ramp) - 提高概率
        if (Phaser.Math.Between(0, 10) > 4) { // 60% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createRamp(x, y);
        }

        // 3. 生成雪堆 (Mound) - 提高概率
        if (Phaser.Math.Between(0, 10) > 2) { // 80% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createMound(x, y);
        }
        
        // 统一生成道具
        this.spawnItems(startY, endY, minX, maxX);
    }

    spawnOpenSlopeZone(startY, endY, minX, maxX) {
        // 开阔坡道：障碍极少，多跳板多金币，冲刺感
        // 偶尔一棵树点缀
        if (Math.random() < 0.3) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createObstacle(x, y);
        }

        // 跳板较多
        const rampCount = Phaser.Math.Between(2, 4);
        for (let i = 0; i < rampCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createRamp(x, y);
        }

        // 金币密集
        const coinCount = Phaser.Math.Between(5, 10);
        for (let i = 0; i < coinCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createCoin(x, y);
        }

        this.spawnItems(startY, endY, minX, maxX);
    }

    spawnItemBonusZone(startY, endY, minX, maxX) {
        // 道具嘉年华：雪兔、魔力雪杖、血包、金币大放送
        // 少量雪包点缀
        const moundCount = Phaser.Math.Between(2, 4);
        for (let i = 0; i < moundCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createMound(x, y);
        }

        // 大量雪兔
        for (let i = 0; i < 3; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createBunny(x, y);
        }

        // 大量魔力雪杖
        for (let i = 0; i < 2; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createMagicPole(x, y);
        }

        // 金币密集
        const coinCount = Phaser.Math.Between(6, 12);
        for (let i = 0; i < coinCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createCoin(x, y);
        }

        // 血包
        for (let i = 0; i < 2; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createBloodPack(x, y);
        }
    }

    spawnItems(startY, endY, minX, maxX) {
        // 4. 生成小狗
        if (Phaser.Math.Between(0, 20) > 18) { // 10% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.dogs.push(new Dog(this, x, y));
        }

        // 5. 生成同行者 (Competitor) - 增加生成
        if (Phaser.Math.Between(0, 20) > 12) { // 提高概率 (15 -> 12)
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            // 速度因子多样化：0.5 ~ 1.5
            const speedFactor = 0.5 + Math.random() * 1.0;
            this.competitors.push(new Competitor(this, x, y, speedFactor));
        }

        // 6. 生成装饰
        const decoCount = Phaser.Math.Between(3, 8);
        for (let i = 0; i < decoCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createDecoration(x, y);
        }

        // 7. 生成指示旗 (Gate) - 新增
        if (Phaser.Math.Between(0, 10) > 6) { // 40% 概率
            // 门需要一定宽度
            const gateWidth = 150;
            // 确保生成在可玩区域内
            const x = Phaser.Math.Between(minX + 100, maxX - 100);
            const y = Phaser.Math.Between(startY, endY);
            this.createGate(x, y, gateWidth);
        }

        // 8. 生成狗熊 (Bear) - 稀有
        if (Phaser.Math.Between(0, 50) > 48) { // 4% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createBear(x, y);
        }

        // 9. 生成鸟群 (Birds)
        if (Phaser.Math.Between(0, 20) > 15) { // 25% 概率
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createBirds(x, y);
        }

        // 10. 生成金币 (Coins) - 经常出现
        const coinCount = Phaser.Math.Between(2, 5);
        for (let i = 0; i < coinCount; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createCoin(x, y);
        }

        // 11. 生成血包 (Blood Packs) - 随机生成，偶尔一串
        if (Math.random() < 0.3) { // 30% 概率生成血包
            if (Math.random() < 0.2) { // 20% 概率生成一串 (3-5个)
                const count = Phaser.Math.Between(3, 5);
                const packStartX = Phaser.Math.Between(minX + 100, maxX - 100);
                const packStartY = Phaser.Math.Between(startY, endY);
                for (let i = 0; i < count; i++) {
                    this.createBloodPack(packStartX, packStartY + i * 50); // 纵向一串
                }
            } else {
                // 单个血包
                const x = Phaser.Math.Between(minX, maxX);
                const y = Phaser.Math.Between(startY, endY);
                this.createBloodPack(x, y);
            }
        }

        // 12. 生成雪兔 (Snow Bunny) - 稀有增益
        // 提高概率到 40%
        if (Math.random() < 0.4) { 
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createBunny(x, y);
        }

        // 13. 生成魔力雪杖 (Magic Pole) - 稀有道具
        // 提高概率到 40%
        if (Math.random() < 0.4) { 
            const x = Phaser.Math.Between(minX, maxX);
            const y = Phaser.Math.Between(startY, endY);
            this.createMagicPole(x, y);
        }
    }

    createParticleManager() {
        // 创建全局复用的粒子管理器 (障碍物撞击)
        if (!this.snowParticleManager) {
            this.snowParticleManager = this.add.particles(0, 0, 'snow_particle', {
                speed: { min: 50, max: 150 },
                scale: { start: 1, end: 0 },
                lifespan: 500,
                quantity: 10,
                emitting: false // 默认不发射
            });
            this.snowParticleManager.setDepth(100); 
        }

        // 创建飞雪粒子管理器 (雪暴特效)
        if (!this.blizzardEmitter) {
            // 使用更明显的白色圆点或雪花纹理
            // 如果没有专用纹理，复用 snow_particle
            this.blizzardEmitter = this.add.particles(0, 0, 'snow_particle', {
                x: { min: -100, max: this.scale.width + 100 },
                y: -50,
                quantity: 2,
                lifespan: 2000,
                gravityY: 50,
                speedX: { min: -200, max: 200 }, // 强风左右吹
                speedY: { min: 300, max: 500 }, // 高速下落
                scale: { min: 0.5, max: 1.5 },
                alpha: { start: 0.8, end: 0 },
                emitting: false 
            });
            this.blizzardEmitter.setDepth(2000); // 最上层
            this.blizzardEmitter.setScrollFactor(0); // 跟随摄像机
        }
    }

    emitSnowExplosion(x, y) {
        if (this.snowParticleManager) {
            this.snowParticleManager.emitParticleAt(x, y, 10);
        }
    }

    createTornado(x, y) {
        if (!this.textures.exists('tornado')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            // 绘制龙卷风 (螺旋线)
            g.lineStyle(3, 0xDDDDDD, 0.8);
            g.beginPath();
            // 从下往上画螺旋
            let cx = 30, cy = 90;
            let radius = 5;
            g.moveTo(cx, cy);
            for (let i = 0; i < 200; i++) {
                const angle = i * 0.2;
                radius += 0.1;
                cy -= 0.4;
                g.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * 10); // 压扁的螺旋
            }
            g.strokePath();
            g.generateTexture('tornado', 60, 100);
        }

        const tornado = this.matter.add.sprite(x, y, 'tornado', null, {
            isSensor: true, // 只触发事件，不碰撞
            label: 'tornado'
        });
        
        // 1. 自转动画 (视觉)
        this.tweens.add({
            targets: tornado,
            scaleX: 1.2,
            duration: 300,
            yoyo: true,
            repeat: -1
        });
        
        // 2. 盘旋动画 (物理位置移动)
        // 使用一个虚拟对象来控制盘旋角度
        const path = { t: 0, r: Phaser.Math.Between(80, 150) }; // 加大半径
        
        tornado.moveTween = this.tweens.add({
            targets: path,
            t: 1,
            duration: Phaser.Math.Between(3000, 5000), // 3-5秒一圈
            repeat: -1,
            onUpdate: () => {
                // 严格检查 tornado 及其 body 是否存在
                if (tornado && tornado.active && tornado.body) {
                    const angle = path.t * Math.PI * 2;
                    // 使用 setPosition 更新物理体位置
                    tornado.setPosition(
                        x + Math.cos(angle) * path.r,
                        y + Math.sin(angle) * (path.r * 0.6) // 椭圆轨迹
                    );
                }
            }
        });
        
        this.tornadoes.push(tornado);
    }

    hitTornado(tornado) {
        // 停止特定的移动动画
        if (tornado.moveTween) {
            tornado.moveTween.stop();
        }
        
        // 销毁龙卷风，防止重复触发
        tornado.destroy();
        
        // 视觉效果
        this.cameras.main.shake(500, 0.02);
        this.cameras.main.flash(500, 255, 255, 255);
        
        this.showFloatingText(this.player.sprite.x, this.player.sprite.y, "TORNADO! BACK 500M!", "#FF0000");

        // 逻辑回退 500m (500m * 10 = 5000px)
        const backPixels = 5000;
        this.player.sprite.y -= backPixels;
        
        // 重置生成器状态，防止下方为空
        this.lastSpawnY = this.player.sprite.y + 500;
        
        // 清理当前屏幕下方的所有障碍物，防止重复/重叠
        this.cleanupAllBelow(this.player.sprite.y);
    }

    cleanupAllBelow(y) {
        // 清理指定 Y 坐标以下的所有物体
        const cleanupList = (list) => {
            return list.filter(obj => {
                // 安全检查：如果对象已不存在或已销毁，直接移除
                if (!obj) return false;
                
                // 处理封装对象 (如 Dog, Competitor)
                if (obj.sprite) {
                    if (!obj.sprite.active) return false;
                } else {
                    // 处理直接的 GameObject (Matter Sprite)
                    if (!obj.active) return false;
                }

                // 安全获取 Y 坐标
                let objY = 0;
                try {
                    objY = obj.y !== undefined ? obj.y : (obj.sprite ? obj.sprite.y : 0);
                } catch (e) {
                    // 如果获取坐标失败（例如 body 已丢失），视为无效对象
                    return false;
                }

                if (objY > y) {
                    // 安全销毁：先停止 Tweens
                    if (obj.scene) {
                        obj.scene.tweens.killTweensOf(obj);
                    }
                    if (obj.sprite && obj.sprite.scene) {
                        obj.sprite.scene.tweens.killTweensOf(obj.sprite);
                    }
                    // 特殊处理龙卷风的 moveTween
                    if (obj.moveTween) {
                        obj.moveTween.stop();
                    }
                    
                    if (typeof obj.destroy === 'function') {
                        obj.destroy();
                    } else if (obj.sprite && typeof obj.sprite.destroy === 'function') {
                        obj.sprite.destroy();
                    }
                    return false;
                }
                return true;
            });
        };
        
        this.obstacles = cleanupList(this.obstacles);
        this.bears = cleanupList(this.bears);
        this.dogs = cleanupList(this.dogs);
        this.tornadoes = cleanupList(this.tornadoes);
        this.bunnies = cleanupList(this.bunnies);
        this.magicPoles = cleanupList(this.magicPoles);
        // 不清理装饰物，保留一点氛围
    }

    createFinishLine(y) {
        // 创建终点横幅
        const width = this.scale.width * 2; // 足够宽
        const graphics = this.make.graphics({x: 0, y: 0, add: false});
        
        // 绘制黑白格旗帜
        const boxSize = 40;
        const cols = Math.ceil(width / boxSize);
        const rows = 2;
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                graphics.fillStyle((i + j) % 2 === 0 ? 0x000000 : 0xffffff, 1);
                graphics.fillRect(i * boxSize, j * boxSize, boxSize, boxSize);
            }
        }
        graphics.generateTexture('finish_banner', width, boxSize * rows);
        
        const banner = this.add.image(this.player.sprite.x, y, 'finish_banner');
        banner.setDepth(500);
        
        // 两侧立柱
        const postLeft = this.add.rectangle(this.player.sprite.x - 300, y, 20, 300, 0x8B4513).setDepth(500);
        const postRight = this.add.rectangle(this.player.sprite.x + 300, y, 20, 300, 0x8B4513).setDepth(500);
        
        // 添加文字
        const text = this.add.text(this.player.sprite.x, y - 100, 'FINISH LINE', {
            fontSize: '48px',
            fill: '#ff0000',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(501);
        
        // 确保不会被清理
        // (不需要特殊处理，cleanupEnvironment 只清理上方的)
    }

    createBunny(x, y) {
        const bunny = this.matter.add.sprite(x, y, 'bunny', null, {
            isSensor: true,
            label: 'bunny'
        });
        
        // 跳跃动画
        this.tweens.add({
            targets: bunny,
            y: y - 20,
            scaleY: 0.8, // 挤压感
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        this.bunnies.push(bunny);
    }

    createMagicPole(x, y) {
        const pole = this.matter.add.sprite(x, y, 'magic_pole', null, {
            isSensor: true,
            label: 'magic_pole'
        });
        
        // 发光旋转动画
        this.tweens.add({
            targets: pole,
            angle: 15,
            yoyo: true,
            repeat: -1,
            duration: 1000,
            ease: 'Sine.easeInOut'
        });
        
        // 闪光
        this.tweens.add({
            targets: pole,
            alpha: 0.5,
            yoyo: true,
            repeat: -1,
            duration: 500
        });
        
        this.magicPoles.push(pole);
    }

    collectBunny(bunny) {
        if (!bunny.active) return;
        bunny.destroy();

        // 速度倍率上限2.0x
        if (this.speedMultiplier < this.maxSpeedMultiplier) {
            this.speedMultiplier = Math.min(this.maxSpeedMultiplier, this.speedMultiplier + 0.05);
            this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 60, `SPEED UP! +5% (${(this.speedMultiplier * 100).toFixed(0)}%)`, "#FF69B4");
            this.events.emit('updateSpeedMult', this.speedMultiplier);
        } else {
            this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 60, 'MAX SPEED!', '#FF69B4');
        }

        this.cameras.main.flash(200, 255, 192, 203);
    }

    collectMagicPole(pole) {
        if (!pole.active) return;
        pole.destroy();
        
        // 激活磁铁 10s
        this.magnetActive = true;
        this.magnetEndTime = this.time.now + 10000;
        
        this.showFloatingText(this.player.sprite.x, this.player.sprite.y - 60, "MAGNET MODE! 10s", "#00FFFF");
        
        // 视觉特效
        this.cameras.main.flash(200, 0, 255, 255); // Cyan flash
    }

    createFinishLine(y) {
        // 创建终点横幅
        const width = this.scale.width * 2; // 足够宽
        const graphics = this.make.graphics({x: 0, y: 0, add: false});
        
        // 绘制黑白格旗帜
        const boxSize = 40;
        const cols = Math.ceil(width / boxSize);
        const rows = 2;
        
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                graphics.fillStyle((i + j) % 2 === 0 ? 0x000000 : 0xffffff, 1);
                graphics.fillRect(i * boxSize, j * boxSize, boxSize, boxSize);
            }
        }
        graphics.generateTexture('finish_banner', width, boxSize * rows);
        
        const banner = this.add.image(this.player.sprite.x, y, 'finish_banner');
        banner.setDepth(500);
        
        // 两侧立柱
        const postLeft = this.add.rectangle(this.player.sprite.x - 300, y, 20, 300, 0x8B4513).setDepth(500);
        const postRight = this.add.rectangle(this.player.sprite.x + 300, y, 20, 300, 0x8B4513).setDepth(500);
        
        // 添加文字
        const text = this.add.text(this.player.sprite.x, y - 100, 'FINISH LINE', {
            fontSize: '48px',
            fill: '#ff0000',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(501);
        
        // 确保不会被清理
        // (不需要特殊处理，cleanupEnvironment 只清理上方的)
    }

    createGate(x, y, width) {
        // 左旗
        const leftFlag = this.add.image(x - width / 2, y, 'gate_left');
        // 右旗
        const rightFlag = this.add.image(x + width / 2, y, 'gate_right');
        
        // 不再创建物理实体，而是创建一个逻辑对象
        const gate = {
            x: x,
            y: y,
            width: width,
            leftFlag: leftFlag,
            rightFlag: rightFlag,
            passed: false // 是否已穿过
        };
        
        this.gates.push(gate);
    }

    createBear(x, y) {
        const bear = this.matter.add.sprite(x, y, 'bear', null, {
            isStatic: false, // 狗熊会动
            label: 'bear',
            friction: 0.1,
            density: 0.05
        });
        bear.setFixedRotation(); // 不倒
        
        // 简单的巡逻逻辑属性
        bear.startX = x;
        bear.patrolRange = 100;
        bear.direction = 1;
        bear.nextRoarTime = 0;
        bear.isChasing = false;
        bear.warningShown = false;
        bear.chaseStartY = 0;
        bear.maxChaseDistance = 800; // 追逐距离增加
        
        this.bears.push(bear);
    }

    createBirds(x, y) {
        // 生成一群鸟 (3-5只)
        const count = Phaser.Math.Between(3, 5);
        for (let i = 0; i < count; i++) {
            const bird = this.add.image(x + Phaser.Math.Between(-20, 20), y + Phaser.Math.Between(-20, 20), 'bird');
            bird.setScale(0.5 + Math.random() * 0.5);
            // 鸟不参与物理碰撞，只是视觉元素
            this.birds.push({
                sprite: bird,
                state: 'idle', // idle, flying
                groundY: y
            });
        }
    }

    createObstacle(x, y) {
        if (!this.textures.exists('tree')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0x228B22, 1); // ForestGreen
            g.fillTriangle(0, 60, 30, 0, 60, 60); // 变大一点
            g.fillStyle(0x8B4513, 1); // SaddleBrown
            g.fillRect(22, 60, 16, 15);
            g.generateTexture('tree', 60, 75);
        }

        const obstacle = this.matter.add.sprite(x, y, 'tree', null, {
            isStatic: true,
            label: 'obstacle',
            shape: {
                type: 'circle',
                radius: 10, // 缩小碰撞半径 (15 -> 10)
                offset: { x: 0, y: 25 } // 向下偏移，只碰撞树根/树干 (20 -> 25)
            },
            restitution: 0.2, 
            friction: 0.8
        });
        this.obstacles.push(obstacle);
    }

    createRamp(x, y) {
        if (!this.textures.exists('ramp')) {
             // 重新绘制更明显的跳板
             const rampG = this.make.graphics({x:0, y:0, add: false});
             rampG.fillStyle(0x4169E1, 1); // 皇家蓝
             rampG.lineStyle(3, 0x000080, 1); 
             rampG.beginPath();
             rampG.moveTo(0, 40);
             rampG.lineTo(60, 10); // 更宽更陡
             rampG.lineTo(60, 40);
             rampG.closePath();
             rampG.fillPath();
             rampG.strokePath();
             rampG.generateTexture('ramp', 60, 40);
        }

        const ramp = this.matter.add.sprite(x, y, 'ramp', null, {
            isStatic: true,
            isSensor: true,
            label: 'ramp'
        });
        this.obstacles.push(ramp);
    }

    createMound(x, y) {
        if (!this.textures.exists('mound')) {
             // 重新绘制更明显的雪堆
             const moundG = this.make.graphics({x:0, y:0, add: false});
             moundG.fillStyle(0xE0FFFF, 1); 
             moundG.lineStyle(2, 0xADD8E6, 1);
             moundG.beginPath();
             moundG.arc(30, 30, 25, Math.PI, 0); // 更大
             moundG.strokePath();
             moundG.fillPath();
             moundG.generateTexture('mound', 60, 30);
        }
        
        const mound = this.matter.add.sprite(x, y, 'mound', null, {
            isStatic: true,
            isSensor: true, 
            label: 'mound'
        });
        this.obstacles.push(mound);
    }

    createCoin(x, y) {
        if (!this.textures.exists('coin')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            // 手绘风格金币：不规则圆形，粗边框
            g.lineStyle(3, 0xffa500, 1); // 橙色边框
            g.fillStyle(0xffd700, 1); // 金色填充
            g.beginPath();
            // 绘制一个略微不规则的圆
            g.moveTo(30, 15);
            for (let i = 0; i <= 360; i += 45) {
                const rad = Phaser.Math.DegToRad(i);
                const r = 14 + Math.random() * 2; // 半径微调
                g.lineTo(15 + Math.cos(rad) * r, 15 + Math.sin(rad) * r);
            }
            g.closePath();
            g.fillPath();
            g.strokePath();
            
            // 内部符号 '$'
            g.fillStyle(0xffa500, 1);
            g.fillRect(13, 8, 4, 14); // 竖线
            g.generateTexture('coin', 30, 30);
        }

        const coin = this.matter.add.sprite(x, y, 'coin', null, {
            isStatic: true,
            isSensor: true,
            label: 'coin'
        });
        
        // 金币旋转动画
        this.tweens.add({
            targets: coin,
            scaleX: 0.2,
            yoyo: true,
            repeat: -1,
            duration: 500
        });
        
        this.obstacles.push(coin);
    }

    createBloodPack(x, y) {
        if (!this.textures.exists('bloodpack')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            // 手绘风格血包：不规则矩形
            g.lineStyle(3, 0x000000, 1); // 黑边
            g.fillStyle(0xffffff, 1); // 白底
            
            // 药包主体
            g.beginPath();
            g.moveTo(2, 2);
            g.lineTo(38, 4);
            g.lineTo(36, 28);
            g.lineTo(4, 26);
            g.closePath();
            g.fillPath();
            g.strokePath();
            
            // 红十字 (手绘感)
            g.lineStyle(4, 0xff0000, 1);
            g.beginPath();
            g.moveTo(20, 8);
            g.lineTo(20, 22);
            g.moveTo(13, 15);
            g.lineTo(27, 15);
            g.strokePath();
            
            g.generateTexture('bloodpack', 40, 30);
        }

        const pack = this.matter.add.sprite(x, y, 'bloodpack', null, {
            isStatic: true,
            isSensor: true,
            label: 'bloodpack'
        });
        
        // 浮动动画
        this.tweens.add({
            targets: pack,
            y: y - 10,
            yoyo: true,
            repeat: -1,
            duration: 1000,
            ease: 'Sine.easeInOut'
        });

        this.obstacles.push(pack);
    }

    createDecoration(x, y) {
        if (!this.textures.exists('snow_deco')) {
            const g = this.make.graphics({x:0, y:0, add:false});
            g.fillStyle(0xdceefc, 1); // 浅蓝色雪痕
            g.fillCircle(5, 5, 5);
            g.generateTexture('snow_deco', 10, 10);
        }
        
        const deco = this.add.image(x, y, 'snow_deco');
        deco.setAlpha(0.6);
        this.decorations.push(deco);
    }

    cleanupEnvironment() {
        const viewTop = this.cameras.main.scrollY;
        
        // 辅助函数：安全清理
        const safeDestroy = (obj) => {
             if (!obj) return;
             if (obj.scene) obj.scene.tweens.killTweensOf(obj);
             if (obj.destroy) obj.destroy();
        };

        // 清理障碍物
        this.obstacles = this.obstacles.filter(obs => {
            // 如果对象已经被销毁（例如被撞碎），直接从列表中移除
            if (!obs.active) return false;

            if (obs.y < viewTop - 200) {
                // 安全销毁：停止动画
                this.tweens.killTweensOf(obs);

                // 如果是旗门物理实体(旧逻辑兼容)或传感器实体
                // 检查 leftFlag 和 rightFlag 是否存在且有 destroy 方法
                if (obs.leftFlag && typeof obs.leftFlag.destroy === 'function') {
                    obs.leftFlag.destroy();
                }
                if (obs.rightFlag && typeof obs.rightFlag.destroy === 'function') {
                    obs.rightFlag.destroy();
                }
                
                obs.destroy();
                return false;
            }
            return true;
        });

        // 清理纯逻辑旗门
        this.gates = this.gates.filter(gate => {
            if (gate.y < viewTop - 200) {
                if (gate.leftFlag && typeof gate.leftFlag.destroy === 'function') {
                    gate.leftFlag.destroy();
                }
                if (gate.rightFlag && typeof gate.rightFlag.destroy === 'function') {
                    gate.rightFlag.destroy();
                }
                return false;
            }
            return true;
        });

        // 清理狗
        this.dogs = this.dogs.filter(dog => {
            if (dog.sprite.y < viewTop - 200) {
                safeDestroy(dog.sprite);
                return false;
            }
            return true;
        });

        // 清理狗熊
        this.bears = this.bears.filter(bear => {
            if (bear.y < viewTop - 500) {
                safeDestroy(bear);
                return false;
            }
            return true;
        });

        // 清理龙卷风
        this.tornadoes = this.tornadoes.filter(t => {
            if (t.y < viewTop - 500) {
                safeDestroy(t);
                return false;
            }
            return true;
        });

        // 清理雪兔
        this.bunnies = this.bunnies.filter(b => {
            if (b.y < viewTop - 500) {
                safeDestroy(b);
                return false;
            }
            return true;
        });

        // 清理魔力雪杖
        this.magicPoles = this.magicPoles.filter(p => {
            if (p.y < viewTop - 500) {
                safeDestroy(p);
                return false;
            }
            return true;
        });

        // 清理鸟
        this.birds = this.birds.filter(bird => {
            if (bird.sprite.y < viewTop - 500) {
                safeDestroy(bird.sprite);
                return false;
            }
            return true;
        });

        // 清理同行者
        this.competitors = this.competitors.filter(comp => {
            if (comp.sprite.y < viewTop - 500) { // 稍微宽松一点
                safeDestroy(comp.sprite);
                return false;
            }
            return true;
        });

        // 清理装饰
        this.decorations = this.decorations.filter(deco => {
            if (deco.y < viewTop - 200) {
                safeDestroy(deco);
                return false;
            }
            return true;
        });
    }

    gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        
        this.player.die();
        this.cameras.main.shake(500, 0.01);
        
        // 保存并获取排行榜 (返回完整对象)
        const result = this.saveScore(this.score);
        
        this.events.emit('updateDebug', 'Game Over! Showing Leaderboard.');
        
        // 显示排行榜 UI
        this.events.emit('showLeaderboard', result);

        // 停止物理更新但保持渲染 (可选)
        // this.physics.pause(); 
    }

    saveScore(score = this.score) {
        const KEY = 'ski_game_leaderboard';
        let leaderboard = [];
        try {
            const data = localStorage.getItem(KEY);
            if (data) {
                leaderboard = JSON.parse(data);
            } else {
                // 从旧 key 迁移
                const oldData = localStorage.getItem('ski_leaderboard');
                if (oldData) {
                    leaderboard = JSON.parse(oldData);
                    localStorage.removeItem('ski_leaderboard');
                }
            }
        } catch (e) {
            console.error('Failed to load leaderboard', e);
        }

        const dateStr = new Date().toLocaleDateString();
        let timeSeconds = 0;
        let timeStr = '0m 0s';
        if (this.startTime) {
            const endTime = this.endTime || Date.now();
            const durationMs = endTime - this.startTime;
            timeSeconds = Math.floor(durationMs / 1000);
            const minutes = Math.floor(timeSeconds / 60);
            const seconds = timeSeconds % 60;
            timeStr = `${minutes}m ${seconds}s`;
        }

        leaderboard.push({
            score: score,
            date: dateStr,
            time: timeStr,
            timeSeconds: timeSeconds
        });

        // 补齐旧记录缺失的 timeSeconds
        leaderboard.forEach(r => {
            if (r.timeSeconds === undefined || r.timeSeconds === null) {
                const m = (r.time || '0m 0s').match(/(\d+)m\s*(\d+)s/);
                r.timeSeconds = m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
            }
        });

        // 按时间升序（用时越短排名越前）
        leaderboard.sort((a, b) => a.timeSeconds - b.timeSeconds);

        if (leaderboard.length > 20) {
            leaderboard = leaderboard.slice(0, 20);
        }

        try {
            localStorage.setItem(KEY, JSON.stringify(leaderboard));
        } catch (e) {
            console.error('Failed to save leaderboard', e);
        }

        return {
            score: score,
            time: timeStr,
            leaderboard: leaderboard
        };
    }
}
