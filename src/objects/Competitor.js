import Phaser from 'phaser';

export default class Competitor {
    constructor(scene, x, y, speedFactor) {
        this.scene = scene;
        this.speedFactor = speedFactor; // 0.8 (慢) - 1.2 (快)
        
        // 复用玩家纹理，但改变颜色以区分
        this.sprite = scene.matter.add.sprite(x, y, 'player_straight');
        
        // 碰撞体
        const Bodies = Phaser.Physics.Matter.Matter.Bodies;
        const mainBody = Bodies.circle(x, y + 10, 15, { label: 'competitor' });
        this.sprite.setExistingBody(mainBody);
        this.sprite.setOrigin(0.5, 0.6);

        // 物理属性
        this.sprite.setFriction(0.005);
        this.sprite.setFrictionAir(0.02);
        this.sprite.setBounce(0.1);
        this.sprite.setMass(50);
        this.sprite.setFixedRotation();
        
        // 随机颜色
        this.sprite.setTint(Math.random() * 0xffffff);
        
        // 简单的 AI 状态
        this.direction = 0; // -1, 0, 1
        this.nextDecisionTime = 0;
    }

    update(playerY, config) {
        // 距离玩家太远自动销毁或重置 (为了性能，这里假设由 Scene 管理销毁)
        
        // AI 决策
        if (this.scene.time.now > this.nextDecisionTime) {
            // 随机改变方向
            this.direction = (Math.random() - 0.5) * 2; // -1 ~ 1
            this.nextDecisionTime = this.scene.time.now + Phaser.Math.Between(500, 2000);
        }

        // 施加力
        const forceX = this.direction * config.turnSpeed * 0.5; // AI 转向没那么灵敏
        this.sprite.applyForce({ x: forceX, y: 0 });

        // 下滑力 (根据 speedFactor 调整)
        this.sprite.applyForce({ x: 0, y: config.slope * this.speedFactor });

        // 视觉更新
        const velocity = this.sprite.body.velocity;
        
        // 简单旋转
        this.sprite.setRotation(this.direction * 0.2);

        // 纹理切换
        if (this.direction < -0.3) {
            this.sprite.setTexture('player_left');
        } else if (this.direction > 0.3) {
            this.sprite.setTexture('player_right');
        } else {
            this.sprite.setTexture('player_straight');
        }
    }
}
