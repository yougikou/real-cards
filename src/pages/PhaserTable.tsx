import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

import type { Player } from '../types';

interface PlayerZone {
  rect: Phaser.GameObjects.Rectangle;
  text?: Phaser.GameObjects.Text;
  zoneId: string;
  defaultText: string;
  mappedPlayerId?: string;
}

class TableScene extends Phaser.Scene {
  private deckSprites: Phaser.GameObjects.Image[] = [];
  private playerZones: PlayerZone[] = [];
  private connectedPlayers: Player[] = [];

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

    this.scale.on('resize', this.handleResize, this);

    const onTableReset = () => {
      // Find and destroy all floating cards (both face up and face down)
      const allCards = this.children.list.filter(
        child => child instanceof Phaser.Physics.Matter.Image && child.texture && (child.texture.key === 'cardFront' || child.texture.key === 'cardBack')
      ) as Phaser.Physics.Matter.Image[];
      for (const card of allCards) {
        // Do not destroy the static deck sprites
        if (!card.isStatic()) {
          card.destroy();
        }
      }
    };
    window.addEventListener('table-reset', onTableReset);

    const onTableRecenter = () => {
      this.cameras.main.setZoom(1);
      this.cameras.main.setScroll(0, 0);
    };
    window.addEventListener('table-recenter', onTableRecenter);

    const onPlayersUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ players: Record<string, Player> }>;
      this.connectedPlayers = Object.values(customEvent.detail.players);
      this.updateZoneLabels();
    };
    window.addEventListener('players-updated', onPlayersUpdated);

    this.events.once('destroy', () => {
      window.removeEventListener('table-reset', onTableReset);
      window.removeEventListener('table-recenter', onTableRecenter);
      window.removeEventListener('players-updated', onPlayersUpdated);
    });
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    if (this.matter && this.matter.world) {
        this.matter.world.setBounds(0, 0, gameSize.width, gameSize.height);
    }

    for (const zone of this.playerZones) {
        if (this.matter && zone.rect.body) {
            this.matter.world.remove(zone.rect.body as MatterJS.BodyType);
        }
        zone.rect.destroy();
        if (zone.text) {
            zone.text.destroy();
        }
    }
    this.playerZones = [];

    this.createPlayerZones();

    const deckX = gameSize.width / 2;
    const deckY = gameSize.height / 2;

    for (let i = 0; i < this.deckSprites.length; i++) {
        const card = this.deckSprites[i];
        if (card.active) {
            card.setPosition(deckX + i * 2, deckY - i * 2);
        }
    }
  }

  private createPlayerZones() {
    const { width, height } = this.scale;
    const zoneThickness = 120;
    const color = 0x00ff00;
    const alpha = 0.1;

    const isLandscape = width > height;
    const topBottomCount = isLandscape ? 3 : 2;
    const leftRightCount = isLandscape ? 2 : 3;

    // Top zones
    const topWidth = width / topBottomCount;
    for (let i = 0; i < topBottomCount; i++) {
        const x = (i * topWidth) + (topWidth / 2);
        const y = zoneThickness / 2;
        const zone = this.add.rectangle(x, y, topWidth, zoneThickness, color, alpha);
        zone.setStrokeStyle(2, 0xffffff, 0.5);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = `Top Seat ${i + 1}`;
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '16px', align: 'center' }).setOrigin(0.5);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_top_${i + 1}`, defaultText });
    }

    // Bottom zones
    const bottomWidth = width / topBottomCount;
    for (let i = 0; i < topBottomCount; i++) {
        const x = (i * bottomWidth) + (bottomWidth / 2);
        const y = height - zoneThickness / 2;
        const zone = this.add.rectangle(x, y, bottomWidth, zoneThickness, color, alpha);
        zone.setStrokeStyle(2, 0xffffff, 0.5);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = `Bottom Seat ${i + 1}`;
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '16px', align: 'center' }).setOrigin(0.5);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_bottom_${i + 1}`, defaultText });
    }

    // Left zones
    const leftHeight = (height - (zoneThickness * 2)) / leftRightCount;
    for (let i = 0; i < leftRightCount; i++) {
        const x = zoneThickness / 2;
        const y = zoneThickness + (i * leftHeight) + (leftHeight / 2);
        const zone = this.add.rectangle(x, y, zoneThickness, leftHeight, color, alpha);
        zone.setStrokeStyle(2, 0xffffff, 0.5);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = `Left Seat ${i + 1}`;
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '16px', align: 'center' }).setOrigin(0.5).setRotation(Math.PI / 2);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_left_${i + 1}`, defaultText });
    }

    // Right zones
    const rightHeight = (height - (zoneThickness * 2)) / leftRightCount;
    for (let i = 0; i < leftRightCount; i++) {
        const x = width - zoneThickness / 2;
        const y = zoneThickness + (i * rightHeight) + (rightHeight / 2);
        const zone = this.add.rectangle(x, y, zoneThickness, rightHeight, color, alpha);
        zone.setStrokeStyle(2, 0xffffff, 0.5);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = `Right Seat ${i + 1}`;
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '16px', align: 'center' }).setOrigin(0.5).setRotation(-Math.PI / 2);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_right_${i + 1}`, defaultText });
    }

    this.updateZoneLabels();
  }

  private updateZoneLabels() {
    // Map connected players to zones
    for (let i = 0; i < this.playerZones.length; i++) {
      const zone = this.playerZones[i];
      const player = this.connectedPlayers[i];
      if (player) {
        zone.mappedPlayerId = player.id;
        if (zone.text) {
          zone.text.setText(`📥 DEAL TO:\n${player.name}\nCards: ${player.handCount}`);
          zone.text.setColor('#fbbf24'); // yellow-400
          zone.text.setFontStyle('bold');
        }
        if (zone.rect) {
          zone.rect.setFillStyle(0x10b981, 0.2); // emerald-500
          zone.rect.setStrokeStyle(4, 0xfbbf24, 1); // yellow-400
        }
      } else {
        zone.mappedPlayerId = undefined;
        if (zone.text) {
          zone.text.setText(`Empty\n(${zone.defaultText})`);
          zone.text.setColor('#888888');
          zone.text.setFontStyle('normal');
        }
        if (zone.rect) {
          zone.rect.setFillStyle(0x000000, 0.1);
          zone.rect.setStrokeStyle(2, 0xffffff, 0.1);
        }
      }
    }
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

    let poppedCard: unknown = null;
    window.dispatchEvent(new CustomEvent('host-pop-card', {
      detail: {
        callback: (card: unknown) => {
          poppedCard = card;
        }
      }
    }));

    if (!poppedCard) return;

    const newCard = this.matter.add.image(startX, startY, 'cardFront', undefined, {
        mass: 0.1,
        friction: 0.1,
        frictionAir: 0.05,
        restitution: 0.2
    });

    Object.assign(newCard, { cardData: poppedCard });

    newCard.setAngle(Phaser.Math.Between(-5, 5));
    this.dragCard = newCard;

    if (this.pointerBody) {
         this.matter.body.setPosition(this.pointerBody, { x: pointer.worldX, y: pointer.worldY });
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
             this.matter.body.setPosition(this.pointerBody, { x: pointer.worldX, y: pointer.worldY });
        } else if (pointer.isDown) {
             this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
             this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
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

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        const newZoom = this.cameras.main.zoom - (deltaY * 0.001);
        this.cameras.main.zoom = Phaser.Math.Clamp(newZoom, 0.2, 3);
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

    if (targetZone && targetZone.mappedPlayerId) {
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
                const cardData = (card as Phaser.Physics.Matter.Image & { cardData?: unknown }).cardData;
                card.destroy();
                if (targetZone?.mappedPlayerId) {
                  window.dispatchEvent(new CustomEvent('host-deal-card', {
                    detail: { playerId: targetZone.mappedPlayerId, cardData }
                  }));
                }
            }
        });
    } else {
        // Return to deck if dropped on invalid area
        card.setStatic(true);
        const { width, height } = this.scale;

        this.tweens.add({
            targets: card,
            x: width / 2,
            y: height / 2,
            scaleX: 0.5,
            scaleY: 0.5,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                const cardData = (card as Phaser.Physics.Matter.Image & { cardData?: unknown }).cardData;
                card.destroy();
                if (cardData) {
                    window.dispatchEvent(new CustomEvent('host-return-popped-card', {
                        detail: { cardData }
                    }));
                }
            }
        });
    }
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
