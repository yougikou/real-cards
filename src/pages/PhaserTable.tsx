import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

interface PlayerZone {
  rect: Phaser.GameObjects.Rectangle;
  zoneId: string;
}

class TableScene extends Phaser.Scene {
  private deckSprites: Phaser.GameObjects.Image[] = [];
  private playerZones: PlayerZone[] = [];

  private dragConstraint: MatterJS.ConstraintType | null = null;
  private dragCard: Phaser.Physics.Matter.Image | null = null;
  private pointerBody: MatterJS.BodyType | null = null;

  constructor() {
    super('TableScene');
  }

  preload() {
    const graphicsBack = this.add.graphics();
    graphicsBack.fillStyle(0x1e3a8a, 1);
    graphicsBack.fillRoundedRect(0, 0, 100, 140, 10);
    graphicsBack.lineStyle(4, 0xffffff, 1);
    graphicsBack.strokeRoundedRect(2, 2, 96, 136, 10);

    graphicsBack.fillStyle(0x3b82f6, 0.5);
    for(let i = 0; i < 5; i++) {
        graphicsBack.fillRect(10 + i * 18, 10, 8, 120);
    }

    graphicsBack.generateTexture('cardBack', 100, 140);
    graphicsBack.destroy();

    const graphicsFront = this.add.graphics();
    graphicsFront.fillStyle(0xffffff, 1);
    graphicsFront.fillRoundedRect(0, 0, 100, 140, 10);
    graphicsFront.lineStyle(2, 0xd1d5db, 1);
    graphicsFront.strokeRoundedRect(1, 1, 98, 138, 10);

    graphicsFront.fillStyle(0x000000, 1);
    graphicsFront.fillTriangle(50, 40, 20, 90, 80, 90);
    graphicsFront.fillCircle(35, 90, 15);
    graphicsFront.fillCircle(65, 90, 15);
    graphicsFront.fillRect(45, 90, 10, 30);

    this.add.text(10, 10, 'A', { fontSize: '24px', color: '#000', fontFamily: 'Arial' }).setVisible(false);

    graphicsFront.generateTexture('cardFront', 100, 140);
    graphicsFront.destroy();
  }

  create() {
    if (this.matter && this.matter.world) {
        this.matter.world.setGravity(0, 0);
        this.matter.world.setBounds(0, 0, this.scale.width, this.scale.height);
    }

    this.createPlayerZones();
    this.createDeck();

    if (this.matter) {
        this.pointerBody = this.matter.add.circle(0, 0, 5, {
            isStatic: true,
            isSensor: true
        });
    }

    this.setupInteractions();
  }

  private createPlayerZones() {
    const { width, height } = this.scale;
    const zoneThickness = 120;
    const color = 0x00ff00;
    const alpha = 0.1;

    const topZone = this.add.rectangle(width / 2, zoneThickness / 2, width, zoneThickness, color, alpha);
    if (this.matter) this.matter.add.gameObject(topZone, { isStatic: true, isSensor: true });
    this.playerZones.push({ rect: topZone as Phaser.GameObjects.Rectangle, zoneId: 'player_top' });

    const bottomZone = this.add.rectangle(width / 2, height - zoneThickness / 2, width, zoneThickness, color, alpha);
    if (this.matter) this.matter.add.gameObject(bottomZone, { isStatic: true, isSensor: true });
    this.playerZones.push({ rect: bottomZone as Phaser.GameObjects.Rectangle, zoneId: 'player_bottom' });

    const leftZone = this.add.rectangle(zoneThickness / 2, height / 2, zoneThickness, height - zoneThickness * 2, color, alpha);
    if (this.matter) this.matter.add.gameObject(leftZone, { isStatic: true, isSensor: true });
    this.playerZones.push({ rect: leftZone as Phaser.GameObjects.Rectangle, zoneId: 'player_left' });

    const rightZone = this.add.rectangle(width - zoneThickness / 2, height / 2, zoneThickness, height - zoneThickness * 2, color, alpha);
    if (this.matter) this.matter.add.gameObject(rightZone, { isStatic: true, isSensor: true });
    this.playerZones.push({ rect: rightZone as Phaser.GameObjects.Rectangle, zoneId: 'player_right' });
  }

  private createDeck() {
    const { width, height } = this.scale;
    const deckX = width / 2;
    const deckY = height / 2;
    const thickness = 5;

    for (let i = 0; i < thickness; i++) {
      const card = this.add.image(deckX + i * 2, deckY - i * 2, 'cardBack');

      if (i === thickness - 1) {
        card.setInteractive({ useHandCursor: true });

        card.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          this.spawnAndDragCard(pointer, card.x, card.y);
        });
      }
      this.deckSprites.push(card);
    }
  }

  private spawnAndDragCard(pointer: Phaser.Input.Pointer, startX: number, startY: number) {
    if (!this.matter) return;
    const newCard = this.matter.add.image(startX, startY, 'cardFront', undefined, {
        mass: 0.1,
        friction: 0.1,
        frictionAir: 0.05,
        restitution: 0.2
    });

    newCard.setAngle(Phaser.Math.Between(-5, 5));
    this.dragCard = newCard;

    if (this.pointerBody) {
         this.matter.body.setPosition(this.pointerBody, { x: pointer.x, y: pointer.y });
    }

    if (this.pointerBody && newCard.body) {
         this.dragConstraint = this.matter.add.constraint(
            this.pointerBody,
            newCard.body as MatterJS.BodyType,
            0,
            0.2,
            {
                pointA: { x: 0, y: 0 },
                pointB: { x: 0, y: 0 }
            }
        );
    }
  }

  private setupInteractions() {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (this.dragCard && this.pointerBody && this.dragConstraint && this.matter) {
             this.matter.body.setPosition(this.pointerBody, { x: pointer.x, y: pointer.y });
        }
    });

    this.input.on('pointerup', () => {
         if (this.dragCard) {
             this.releaseCard(this.dragCard);
             this.dragCard = null;

             if (this.dragConstraint && this.matter && this.matter.world) {
                 this.matter.world.removeConstraint(this.dragConstraint);
                 this.dragConstraint = null;
             }
         }
    });
  }

  private releaseCard(card: Phaser.Physics.Matter.Image) {
    let targetZone: PlayerZone | null = null;

    for (const zone of this.playerZones) {
         if (Phaser.Geom.Rectangle.Contains(zone.rect.getBounds(), card.x, card.y)) {
             targetZone = zone;
             break;
         }
    }

    if (targetZone) {
        card.setStatic(true);

        this.tweens.add({
            targets: card,
            x: targetZone.rect.x,
            y: targetZone.rect.y,
            scaleX: 0.2,
            scaleY: 0.2,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                card.destroy();
                this.onCardDealt(card.name || Phaser.Math.RND.uuid(), targetZone!.zoneId);
            }
        });
    }
  }

  private onCardDealt(cardId: string, playerId: string) {
      console.log(`[Event] Card ${cardId} dealt to player ${playerId}`);
  }
}

export default function PhaserTable() {
  const gameRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: gameRef.current,
      width: '100%',
      height: '100%',
      backgroundColor: '#065f46',
      physics: {
        default: 'matter',
        matter: {
          gravity: { x: 0, y: 0 },
          debug: false
        }
      },
      scene: [TableScene]
    };

    phaserGameRef.current = new Phaser.Game(config);

    const handleResize = () => {
      if (phaserGameRef.current) {
         phaserGameRef.current.scale.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, []);

  return (
    <div
        ref={gameRef}
        className="w-full h-screen overflow-hidden"
        style={{ touchAction: 'none' }}
    />
  );
}
