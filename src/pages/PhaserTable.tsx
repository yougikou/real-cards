import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

import type { Player } from '../types';
import dict from '../i18n/translations';
import type { Locale } from '../i18n/LocaleProvider';

function getPhaserLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('rc-locale') as Locale | null;
  if (stored && stored in { zh: 1, ja: 1, en: 1 }) return stored;
  return 'en';
}

function pt(locale: Locale, key: string, vars?: Record<string, string>): string {
  let text = (dict[locale] as Record<string, string>)[key];
  if (!text) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

let _initialDeckCount = 0;

interface PlayerZone {
  rect: Phaser.GameObjects.Rectangle;
  text?: Phaser.GameObjects.Text;
  zoneId: string;
  defaultText: string;
  mappedPlayerId?: string;
}

class TableScene extends Phaser.Scene {
  private deckSprites: Phaser.GameObjects.Image[] = [];
  private deckCountText: Phaser.GameObjects.Text | null = null;
  private discardSprites: Phaser.GameObjects.Image[] = [];
  private discardEmptySprites: Phaser.GameObjects.Image[] = [];
  private discardCountText: Phaser.GameObjects.Text | null = null;
  private playerZones: PlayerZone[] = [];
  private connectedPlayers: Player[] = [];

  private playStackImages: Phaser.GameObjects.Image[] = [];
  private playStackEmptyText: Phaser.GameObjects.Text | null = null;
  private playStackSubText: Phaser.GameObjects.Text | null = null;
  private playStackCountText: Phaser.GameObjects.Text | null = null;
  private discardZoneRect: Phaser.GameObjects.Rectangle | null = null;
  private publicTableZone: Phaser.GameObjects.Rectangle | null = null;

  private dragConstraint: MatterJS.ConstraintType | null = null;
  private dragCard: Phaser.Physics.Matter.Image | null = null;
  private dragShadow: Phaser.GameObjects.Image | null = null;
  private dragExtraImages: Phaser.GameObjects.Image[] = [];
  private activeDragPointerId: number | null = null;
  private pointerBody: MatterJS.BodyType | null = null;
  private locale: Locale = 'en';

  // Play stack multi-select + drag state
  private selectedPlayStackCards: { rank: string; suit: string; id: string }[] = [];
  private pendingDragCard: { cardData: { rank: string; suit: string; id: string }; imgX: number; imgY: number } | null = null;
  private pendingDragStartPos: { x: number; y: number } | null = null;
  private pendingDragPointerId: number | null = null;

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

    const gfxEmpty = this.add.graphics();
    gfxEmpty.fillStyle(0x1e293b, 0.5);
    gfxEmpty.fillRoundedRect(0, 0, 100, 140, 10);
    gfxEmpty.lineStyle(1, 0x475569, 0.25);
    gfxEmpty.strokeRoundedRect(1, 1, 98, 138, 10);
    gfxEmpty.generateTexture('cardDiscardEmpty', 100, 140);
    gfxEmpty.destroy();
  }

  create() {
    this.locale = getPhaserLocale();

    if (this.matter && this.matter.world) {
        this.matter.world.setGravity(0, 0);
        this.matter.world.setBounds(0, 0, this.scale.width, this.scale.height);
    }

    this.createPlayerZones();
    this.createDeck();
    this.createDiscardPile();
    this.createPlayStack();
    this.createDiscardZone();

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
        child => child instanceof Phaser.Physics.Matter.Image && child.texture && (child.texture.key === 'cardFront' || child.texture.key === 'cardBack' || child.texture.key.startsWith('cface_'))
      ) as Phaser.Physics.Matter.Image[];
      for (const card of allCards) {
        // Do not destroy the static deck sprites
        if (!card.isStatic()) {
          card.destroy();
        }
      }

      this.dragCard = null;
      this.dragShadow?.destroy();
      this.dragShadow = null;
      for (const img of this.dragExtraImages) img.destroy();
      this.dragExtraImages = [];
      this.dragConstraint = null;
      this.activeDragPointerId = null;
      this.selectedPlayStackCards = [];
      this.pendingDragCard = null;
      this.pendingDragStartPos = null;
      this.pendingDragPointerId = null;
    };
    window.addEventListener('table-reset', onTableReset);

    const onPlayersUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ players: Record<string, Player> }>;
      this.connectedPlayers = Object.values(customEvent.detail.players);
      this.updateZoneLabels();
    };
    window.addEventListener('players-updated', onPlayersUpdated);

    const onPlayStackUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ playStack: unknown[][] }>;
      this.updatePlayStack(customEvent.detail.playStack);
    };
    window.addEventListener('play-stack-updated', onPlayStackUpdated);

    const onDeckCountUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ count: number }>;
      if (this.deckCountText) {
        this.deckCountText.setText(String(customEvent.detail.count));
      }
    };
    window.addEventListener('deck-count-updated', onDeckCountUpdated);

    const onDiscardCountUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ count: number; topCard?: { rank: string; suit: string } | null }>;
      const count = customEvent.detail.count;
      const topCard = customEvent.detail.topCard;
      if (this.discardCountText) {
        this.discardCountText.setText(String(count));
        this.discardCountText.setVisible(count > 0);
      }
      if (count > 0 && topCard) {
        const texKey = this.generateCardFaceTexture(topCard.rank, topCard.suit);
        for (const s of this.discardSprites) {
          s.setTexture(texKey);
        }
      }
      for (const s of this.discardEmptySprites) s.setVisible(count === 0);
      for (const s of this.discardSprites) s.setVisible(count > 0);
    };
    window.addEventListener('discard-count-updated', onDiscardCountUpdated);

    this.events.once('destroy', () => {
      window.removeEventListener('table-reset', onTableReset);
      window.removeEventListener('players-updated', onPlayersUpdated);
      window.removeEventListener('play-stack-updated', onPlayStackUpdated);
      window.removeEventListener('deck-count-updated', onDeckCountUpdated);
      window.removeEventListener('discard-count-updated', onDiscardCountUpdated);
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

    const deckX = gameSize.width * 0.25;
    const deckY = gameSize.height * 0.78;

    for (let i = 0; i < this.deckSprites.length; i++) {
        const card = this.deckSprites[i];
        if (card.active) {
            card.setPosition(deckX + i * 2, deckY - i * 2);
        }
    }

    if (this.deckCountText) {
        const lastIdx = this.deckSprites.length - 1;
        const topCard = this.deckSprites[lastIdx];
        if (topCard?.active) {
            this.deckCountText.setPosition(topCard.x, topCard.y);
        }
    }

    const discardX = gameSize.width * 0.75;
    const discardY = gameSize.height * 0.78;

    for (let i = 0; i < this.discardEmptySprites.length; i++) {
        const card = this.discardEmptySprites[i];
        if (card.active) {
            card.setPosition(discardX + i * 2, discardY - i * 2);
        }
    }

    for (let i = 0; i < this.discardSprites.length; i++) {
        const card = this.discardSprites[i];
        if (card.active) {
            card.setPosition(discardX + i * 2, discardY - i * 2);
        }
    }

    if (this.discardCountText) {
        const lastIdx = this.discardSprites.length - 1;
        const topCard = this.discardSprites[lastIdx];
        if (topCard?.active) {
            this.discardCountText.setPosition(topCard.x, topCard.y);
        }
    }

    // Reposition play stack elements
    const cx = gameSize.width / 2;
    const cy = gameSize.height / 2;

    if (this.playStackEmptyText) {
        this.playStackEmptyText.setPosition(cx, cy - 20);
    }
    if (this.playStackSubText) {
        this.playStackSubText.setPosition(cx, cy + 8);
    }
    if (this.playStackCountText) {
        this.playStackCountText.setPosition(cx, cy + 90);
    }

    const psTexW = 108;
    const psTotalCards = this.playStackImages.length;
    const psAvailableWidth = gameSize.width * 0.85;
    const psOverlap = psTotalCards <= 1 ? 0 : Math.min(
      psTexW * 0.7,
      Math.max(25, (psAvailableWidth - psTexW) / (psTotalCards - 1))
    );
    const psTotalSpan = psTexW + (psTotalCards - 1) * psOverlap;
    const psStartX = cx - psTotalSpan / 2 + psTexW / 2;

    for (let i = 0; i < this.playStackImages.length; i++) {
        this.playStackImages[i].setPosition(psStartX + i * psOverlap, cy - 8);
    }

    // Reposition discard zone
    if (this.discardZoneRect) {
        this.discardZoneRect.setPosition(gameSize.width * 0.75, gameSize.height * 0.78);
    }

    // Reposition public table zone
    if (this.publicTableZone) {
        this.publicTableZone.setPosition(gameSize.width / 2, gameSize.height * 0.4);
        this.publicTableZone.setSize(gameSize.width * 0.7, gameSize.height * 0.45);
    }

  }

  private createPlayerZones() {
    const { width, height } = this.scale;
    const zoneThickness = 56;
    const gap = zoneThickness; // corner gap matches strip thickness
    const color = 0x00ff00;
    const alpha = 0.12;

    const isLandscape = width > height;
    const topBottomCount = isLandscape ? 3 : 2;
    const leftRightCount = isLandscape ? 2 : 3;

    const availWidth = width - gap * 2;

    // Top zones (shortened to leave corner gaps)
    const topWidth = availWidth / topBottomCount;
    for (let i = 0; i < topBottomCount; i++) {
        const x = gap + (i * topWidth) + (topWidth / 2);
        const y = zoneThickness / 2;
        const zone = this.add.rectangle(x, y, topWidth, zoneThickness, color, alpha);
        zone.setStrokeStyle(1, 0xffffff, 0.3);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = pt(this.locale, 'phaser.seat', { n: String(i + 1) });
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '11px', align: 'center', backgroundColor: '#000000', padding: { x: 4, y: 2 } }).setOrigin(0.5);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_top_${i + 1}`, defaultText });
    }

    // Bottom zones (shortened to leave corner gaps)
    const bottomWidth = availWidth / topBottomCount;
    for (let i = 0; i < topBottomCount; i++) {
        const x = gap + (i * bottomWidth) + (bottomWidth / 2);
        const y = height - zoneThickness / 2;
        const zone = this.add.rectangle(x, y, bottomWidth, zoneThickness, color, alpha);
        zone.setStrokeStyle(1, 0xffffff, 0.3);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = pt(this.locale, 'phaser.seat', { n: String(i + 1) });
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '11px', align: 'center', backgroundColor: '#000000', padding: { x: 4, y: 2 } }).setOrigin(0.5);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_bottom_${i + 1}`, defaultText });
    }

    // Left zones (unchanged, already between top and bottom)
    const leftHeight = (height - (zoneThickness * 2)) / leftRightCount;
    for (let i = 0; i < leftRightCount; i++) {
        const x = zoneThickness / 2;
        const y = zoneThickness + (i * leftHeight) + (leftHeight / 2);
        const zone = this.add.rectangle(x, y, zoneThickness, leftHeight, color, alpha);
        zone.setStrokeStyle(1, 0xffffff, 0.3);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = pt(this.locale, 'phaser.seat', { n: String(i + 1) });
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '11px', align: 'center', backgroundColor: '#000000', padding: { x: 4, y: 2 } }).setOrigin(0.5).setRotation(Math.PI / 2);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_left_${i + 1}`, defaultText });
    }

    // Right zones (unchanged, already between top and bottom)
    const rightHeight = (height - (zoneThickness * 2)) / leftRightCount;
    for (let i = 0; i < leftRightCount; i++) {
        const x = width - zoneThickness / 2;
        const y = zoneThickness + (i * rightHeight) + (rightHeight / 2);
        const zone = this.add.rectangle(x, y, zoneThickness, rightHeight, color, alpha);
        zone.setStrokeStyle(1, 0xffffff, 0.3);
        if (this.matter) this.matter.add.gameObject(zone, { isStatic: true, isSensor: true });

        const defaultText = pt(this.locale, 'phaser.seat', { n: String(i + 1) });
        const text = this.add.text(x, y, defaultText, { color: '#ffffff', fontSize: '11px', align: 'center', backgroundColor: '#000000', padding: { x: 4, y: 2 } }).setOrigin(0.5).setRotation(-Math.PI / 2);

        this.playerZones.push({ rect: zone as Phaser.GameObjects.Rectangle, text, zoneId: `player_right_${i + 1}`, defaultText });
    }

    this.updateZoneLabels();
  }

  private updateZoneLabels() {
    // Map connected players to zones
    for (let i = 0; i < this.playerZones.length; i++) {
      const zone = this.playerZones[i];
      const player = this.connectedPlayers[i];

      let isHovered = false;
      if (this.dragCard && Phaser.Geom.Rectangle.Contains(zone.rect.getBounds(), this.dragCard.x, this.dragCard.y)) {
        isHovered = true;
      }

      if (player) {
        zone.mappedPlayerId = player.id;
        if (zone.text) {
          if (this.dragCard) {
            zone.text.setText(isHovered ? pt(this.locale, 'phaser.dealTo', { name: player.name }) : pt(this.locale, 'phaser.playerInfo', { name: player.name, count: String(player.handCount) }));
            zone.text.setColor(isHovered ? '#fbbf24' : '#ffffff');
            zone.text.setFontStyle(isHovered ? 'bold' : 'normal');
            zone.text.setAlpha(1);
          } else {
            zone.text.setText(pt(this.locale, 'phaser.playerInfo', { name: player.name, count: String(player.handCount) }));
            zone.text.setColor('#ffffff');
            zone.text.setFontStyle('normal');
            zone.text.setAlpha(0.8);
          }
        }
        if (zone.rect) {
          if (this.dragCard) {
            zone.rect.setFillStyle(isHovered ? 0x10b981 : 0x000000, isHovered ? 0.35 : 0.15);
            zone.rect.setStrokeStyle(isHovered ? 2 : 1, isHovered ? 0xfbbf24 : 0xffffff, isHovered ? 1 : 0.4);
          } else {
            zone.rect.setFillStyle(0x000000, 0.08);
            zone.rect.setStrokeStyle(1, 0xffffff, 0.15);
          }
        }
      } else {
        zone.mappedPlayerId = undefined;
        if (zone.text) {
          zone.text.setText(`[ ${zone.defaultText} ]`);
          zone.text.setColor('#666666');
          zone.text.setFontStyle('normal');
          zone.text.setAlpha(this.dragCard ? 0.15 : 0.4);
        }
        if (zone.rect) {
          zone.rect.setFillStyle(0x000000, 0.08);
          zone.rect.setStrokeStyle(1, 0xffffff, this.dragCard ? 0.08 : 0.3);
        }
      }
    }

    // Public table zone hover hint (deck card over center area)
    const dragSource = (this.dragCard as unknown as { dragSource?: string })?.dragSource;
    const isOverTable = this.dragCard && this.publicTableZone
      && Phaser.Geom.Rectangle.Contains(this.publicTableZone.getBounds(), this.dragCard.x, this.dragCard.y);

    if (this.dragCard && isOverTable && dragSource === 'deck' && this.playStackImages.length === 0) {
      if (this.playStackEmptyText) {
        this.playStackEmptyText.setText(pt(this.locale, 'phaser.dropToTable'));
        this.playStackEmptyText.setColor('#fbbf24');
      }
    } else if (this.playStackImages.length === 0) {
      if (this.playStackEmptyText) {
        this.playStackEmptyText.setText(pt(this.locale, 'tableConfig.playStackEmpty'));
        this.playStackEmptyText.setColor('#558866');
      }
    }
  }

  private createDeck() {
    const { width, height } = this.scale;
    const deckX = width * 0.25;
    const deckY = height * 0.78;
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

    this.deckCountText = this.add.text(deckX + (thickness - 1) * 2, deckY - (thickness - 1) * 2, String(_initialDeckCount), {
      color: '#ffffff',
      fontSize: '32px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setDepth(10);
  }

  private createDiscardPile() {
    const { width, height } = this.scale;
    const discardX = width * 0.75;
    const discardY = height * 0.78;
    const thickness = 5;

    // Gray placeholder sprites (visible when discard pile is empty)
    for (let i = 0; i < thickness; i++) {
      const card = this.add.image(discardX + i * 2, discardY - i * 2, 'cardDiscardEmpty');
      this.discardEmptySprites.push(card);
    }

    // Card front sprites (visible when discard pile has cards)
    for (let i = 0; i < thickness; i++) {
      const card = this.add.image(discardX + i * 2, discardY - i * 2, 'cardFront');
      card.setVisible(false);
      this.discardSprites.push(card);
    }

    this.discardCountText = this.add.text(discardX + (thickness - 1) * 2, discardY - (thickness - 1) * 2, '0', {
      color: '#ffffff',
      fontSize: '32px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setVisible(false).setOrigin(0.5).setDepth(10);
  }

  private createPlayStack() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.playStackEmptyText = this.add.text(cx, cy - 20, pt(this.locale, 'tableConfig.playStackEmpty'), {
      color: '#558866',
      fontSize: '18px',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setDepth(1);

    const subRaw = pt(this.locale, 'tableConfig.playStackSub');
    this.playStackSubText = this.add.text(cx, cy + 8, subRaw.replace(/<br\s*\/?>/gi, '\n'), {
      color: '#446655',
      fontSize: '11px',
      align: 'center',
    }).setOrigin(0.5).setDepth(1);

    const labelText = pt(this.locale, 'tableConfig.playStackLabel');
    this.playStackCountText = this.add.text(cx, cy + 90, labelText, {
      color: '#ffffff',
      fontSize: '10px',
      align: 'center',
    }).setOrigin(0.5).setAlpha(0.45).setDepth(1);

    // Invisible drop zone for deck→public-table drag
    const zoneW = width * 0.7;
    const zoneH = height * 0.45;
    this.publicTableZone = this.add.rectangle(width / 2, height * 0.4, zoneW, zoneH, 0xffffff, 0);
  }

  private updatePlayStack(playStack: unknown[][]) {
    for (const img of this.playStackImages) {
      img.destroy();
    }
    this.playStackImages = [];

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    if (playStack.length === 0) {
      this.playStackEmptyText?.setVisible(true);
      this.playStackSubText?.setVisible(true);
      if (this.playStackCountText) {
        this.playStackCountText.setText(pt(this.locale, 'tableConfig.playStackLabel'));
        this.playStackCountText.setVisible(true);
      }
      return;
    }

    this.playStackEmptyText?.setVisible(false);
    this.playStackSubText?.setVisible(false);

    const allCards = playStack.flat() as { rank: string; suit: string; id: string }[];
    const totalCards = allCards.length;

    if (this.playStackCountText) {
      this.playStackCountText.setText(`${pt(this.locale, 'tableConfig.playStackLabel')}  ·  ${totalCards}`);
      this.playStackCountText.setVisible(true);
    }

    const texW = 108; // texture width includes 4px shadow padding on each side
    const cardScale = 1.0;
    const availableWidth = width * 0.85;
    const overlap = totalCards <= 1 ? 0 : Math.min(
      texW * 0.7,
      Math.max(25, (availableWidth - texW) / (totalCards - 1))
    );
    const totalSpan = texW + (totalCards - 1) * overlap;
    const startX = cx - totalSpan / 2 + texW / 2;
    const baseY = cy - 8;

    for (let i = 0; i < totalCards; i++) {
      const cardData = allCards[i];
      const x = startX + i * overlap;
      const texKey = this.generateCardFaceTexture(cardData.rank, cardData.suit);
      const img = this.add.image(x, baseY, texKey);
      img.setScale(cardScale).setDepth(i);
      Object.assign(img, { cardData });
      img.setData('baseY', baseY);

      // Make ALL cards interactive — tap to select, drag to move
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.pendingDragCard = { cardData, imgX: img.x, imgY: img.y };
        this.pendingDragStartPos = { x: pointer.x, y: pointer.y };
        this.pendingDragPointerId = pointer.id;
      });

      // Lift selected cards visually
      if (this.selectedPlayStackCards.some(c => c.id === cardData.id)) {
        img.setY(baseY - 12);
      }

      this.playStackImages.push(img);
    }
  }

  private createDiscardZone() {
    const { width, height } = this.scale;
    this.discardZoneRect = this.add.rectangle(width * 0.75, height * 0.78, 130, 170, 0xffffff, 0);
  }

  private startPlayStackDrag(pointer: Phaser.Input.Pointer) {
    if (!this.matter || !this.pendingDragCard) return;

    const clickedCard = this.pendingDragCard.cardData;
    const startX = this.pendingDragCard.imgX;
    const startY = this.pendingDragCard.imgY;

    // Collect all cards to drag: clicked card + any selected cards
    const cardSet = new Map<string, { rank: string; suit: string; id: string }>();
    cardSet.set(clickedCard.id, clickedCard);
    for (const sel of this.selectedPlayStackCards) {
      if (!cardSet.has(sel.id)) cardSet.set(sel.id, sel);
    }
    this.selectedPlayStackCards = [];

    // Create Matter drag body BEFORE dispatching state removes
    const texKey = this.generateCardFaceTexture(clickedCard.rank, clickedCard.suit);
    const newCard = this.matter.add.image(startX, startY, texKey, undefined, {
        mass: 0.1, friction: 0.1, frictionAir: 0.05, restitution: 0.2
    });
    Object.assign(newCard, { cardData: clickedCard });
    Object.assign(newCard, { dragSource: 'playStack' });
    Object.assign(newCard, { draggedCards: Array.from(cardSet.values()) });
    newCard.setScale(1.1);
    newCard.setDepth(100);
    this.dragCard = newCard;
    this.activeDragPointerId = pointer.id;

    // Extra card visuals for multi-drag
    const extraCards = Array.from(cardSet.values()).filter(c => c.id !== clickedCard.id);
    this.dragExtraImages = [];
    for (let i = 0; i < Math.min(extraCards.length, 3); i++) {
      const eTex = this.generateCardFaceTexture(extraCards[i].rank, extraCards[i].suit);
      const ei = this.add.image(startX + (i + 1) * 10, startY + (i + 1) * -8, eTex);
      ei.setScale(1.05 - i * 0.02).setDepth(99 - i).setAlpha(0.9 - i * 0.1);
      this.dragExtraImages.push(ei);
    }

    // Shadow
    this.dragShadow = this.add.image(startX + 10, startY + 10, texKey);
    this.dragShadow.setTint(0x000000).setAlpha(0.3).setScale(1.1).setDepth(99);

    if (this.pointerBody) {
         this.matter.body.setPosition(this.pointerBody, { x: pointer.worldX, y: pointer.worldY });
    }
    if (this.pointerBody && newCard.body) {
         this.dragConstraint = this.matter.add.constraint(
            this.pointerBody,
            newCard.body as MatterJS.BodyType,
            0, 0.2,
            { pointA: { x: 0, y: 0 }, pointB: { x: 0, y: 0 } }
        );
    }

    // Remove all dragged cards from play stack state
    for (const c of cardSet.values()) {
      window.dispatchEvent(new CustomEvent('host-drag-public-card', {
        detail: { cardData: c, x: pointer.worldX, y: pointer.worldY }
      }));
    }

    this.updatePlayStackSelectionVisuals();
    this.updateZoneLabels();
  }

  private togglePlayStackSelection(cardData: { rank: string; suit: string; id: string }) {
    const idx = this.selectedPlayStackCards.findIndex(c => c.id === cardData.id);
    if (idx >= 0) {
      this.selectedPlayStackCards.splice(idx, 1);
    } else {
      this.selectedPlayStackCards.push(cardData);
    }
    this.updatePlayStackSelectionVisuals();
  }

  private updatePlayStackSelectionVisuals() {
    for (const img of this.playStackImages) {
      const cid = (img as unknown as { cardData?: { id: string } }).cardData?.id;
      const baseY = img.getData('baseY') as number;
      if (cid && this.selectedPlayStackCards.some(c => c.id === cid)) {
        img.setY(baseY - 12);
      } else if (baseY !== undefined) {
        img.setY(baseY);
      }
    }
  }

  private generateCardFaceTexture(rank: string, suit: string): string {
    const key = `cface_${rank}_${suit}`;
    if (this.textures.exists(key)) return key;

    const pad = 4;
    const cw = 100 + pad * 2;
    const ch = 140 + pad * 2;
    const canvasTex = this.textures.createCanvas(key, cw, ch);
    if (!canvasTex) return 'cardFront';
    const ctx = canvasTex.context;
    if (!ctx) return 'cardFront';

    // Drop shadow outside the card
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(pad, pad, 100, 140, 10);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Card border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pad + 1, pad + 1, 98, 138, 10);
    ctx.stroke();

    const isRed = suit === 'hearts' || suit === 'diamonds';
    const color = isRed ? '#dc2626' : '#1e293b';
    const suitSymbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠', none: '🃏' };
    const sym = suitSymbols[suit] || '?';

    ctx.fillStyle = color;
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rank, pad + 6, pad + 6);
    ctx.font = '14px Arial, sans-serif';
    ctx.fillText(sym, pad + 6, pad + 28);

    ctx.font = '48px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sym, cw / 2, ch / 2 + 5);

    ctx.save();
    ctx.translate(pad + 94, pad + 134);
    ctx.rotate(Math.PI);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(rank, 0, 0);
    ctx.font = '14px Arial, sans-serif';
    ctx.fillText(sym, 0, 22);
    ctx.restore();

    canvasTex.refresh();
    return key;
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

    const newCard = this.matter.add.image(startX, startY, 'cardBack', undefined, {
        mass: 0.1,
        friction: 0.1,
        frictionAir: 0.05,
        restitution: 0.2
    });

    Object.assign(newCard, { cardData: poppedCard });
    Object.assign(newCard, { dragSource: 'deck' });

    newCard.setScale(1.1);
    newCard.setDepth(100);
    this.dragCard = newCard;
    this.activeDragPointerId = pointer.id;

    this.dragShadow = this.add.image(startX + 10, startY + 10, 'cardBack');
    this.dragShadow.setTint(0x000000);
    this.dragShadow.setAlpha(0.3);
    this.dragShadow.setScale(1.1);
    this.dragShadow.setDepth(99);

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

    this.updateZoneLabels();
  }

  private setupInteractions() {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const isActiveDragPointer = this.activeDragPointerId === null || pointer.id === this.activeDragPointerId;

        // Check for pending play-stack click → drag conversion
        if (this.pendingDragCard && !this.dragCard && this.pendingDragPointerId === pointer.id) {
          const dx = pointer.x - this.pendingDragStartPos!.x;
          const dy = pointer.y - this.pendingDragStartPos!.y;
          if (dx * dx + dy * dy > 100) { // 10px threshold
            this.startPlayStackDrag(pointer);
            this.pendingDragCard = null;
            this.pendingDragStartPos = null;
            this.pendingDragPointerId = null;
          }
        }

        if (this.dragCard && this.pointerBody && this.dragConstraint && this.matter && isActiveDragPointer) {
             this.matter.body.setPosition(this.pointerBody, { x: pointer.worldX, y: pointer.worldY });
             if (this.dragShadow) {
                 this.dragShadow.setPosition(this.dragCard.x + 15, this.dragCard.y + 15);
             }
             // Update extra drag card visuals
             for (let i = 0; i < this.dragExtraImages.length; i++) {
               const extra = this.dragExtraImages[i];
               if (extra.active) {
                 extra.setPosition(this.dragCard.x + (i + 1) * 10, this.dragCard.y + (i + 1) * -8);
               }
             }
             this.updateZoneLabels();
        }

    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        // Tap on play stack card → toggle selection (no drag occurred)
        if (this.pendingDragCard && !this.dragCard) {
          this.togglePlayStackSelection(this.pendingDragCard.cardData);
          this.pendingDragCard = null;
          this.pendingDragStartPos = null;
          this.pendingDragPointerId = null;
          return;
        }

        // Drag release
        if (this.dragCard && (this.activeDragPointerId === null || pointer.id === this.activeDragPointerId)) {
             // Clean up extra drag images
             for (const img of this.dragExtraImages) { img.destroy(); }
             this.dragExtraImages = [];

             this.releaseCard(this.dragCard);
             this.dragCard = null;
             this.activeDragPointerId = null;

             if (this.dragShadow) {
                 this.dragShadow.destroy();
                 this.dragShadow = null;
             }

             if (this.dragConstraint && this.matter && this.matter.world) {
                 this.matter.world.removeConstraint(this.dragConstraint);
                 this.dragConstraint = null;
             }
             this.updateZoneLabels();
         }
    });

  }

  private releaseCard(card: Phaser.Physics.Matter.Image) {
    const draggedCards = (card as unknown as { draggedCards?: { rank: string; suit: string; id: string }[] }).draggedCards;
    const allCardData = draggedCards ?? ([(card as unknown as { cardData?: { rank: string; suit: string; id: string } }).cardData].filter(Boolean) as { rank: string; suit: string; id: string }[]);
    if (allCardData.length === 0) { card.destroy(); return; }

    let targetZone: PlayerZone | null = null;

    for (const zone of this.playerZones) {
         if (Phaser.Geom.Rectangle.Contains(zone.rect.getBounds(), card.x, card.y)) {
             targetZone = zone;
             break;
         }
    }

    // Settle animation common to both drop outcomes
    this.tweens.add({
        targets: card,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
        ease: 'Power2'
    });

    if (targetZone && targetZone.mappedPlayerId) {
        this.time.delayedCall(250, () => {
            if (!card.active) return;
            card.setStatic(true);
            this.tweens.add({
                targets: card,
                x: targetZone!.rect.x,
                y: targetZone!.rect.y,
                scaleX: 0.2,
                scaleY: 0.2,
                alpha: 0,
                duration: 400,
                ease: 'Power2',
                onComplete: () => {
                    card.destroy();
                    for (const cd of allCardData) {
                      window.dispatchEvent(new CustomEvent('host-deal-card', {
                        detail: { playerId: targetZone!.mappedPlayerId, cardData: cd }
                      }));
                    }
                }
            });
        });
    } else if (this.discardZoneRect && Phaser.Geom.Rectangle.Contains(this.discardZoneRect.getBounds(), card.x, card.y)) {
        this.time.delayedCall(200, () => {
            if (!card.active) return;
            card.setStatic(true);
            const { width, height } = this.scale;
            this.tweens.add({
                targets: card,
                x: width * 0.75,
                y: height * 0.78,
                scaleX: 0.3,
                scaleY: 0.3,
                alpha: 0,
                duration: 350,
                ease: 'Power2',
                onComplete: () => {
                    card.destroy();
                    for (const cd of allCardData) {
                      window.dispatchEvent(new CustomEvent('host-discard-card', {
                        detail: { cardData: cd }
                      }));
                    }
                }
            });
        });
    } else if (this.publicTableZone && Phaser.Geom.Rectangle.Contains(this.publicTableZone.getBounds(), card.x, card.y) && (card as unknown as { dragSource?: string }).dragSource === 'deck') {
        // Drop from deck onto public table → reveal face-up
        this.time.delayedCall(200, () => {
            if (!card.active) return;
            card.setStatic(true);
            const { width, height } = this.scale;
            this.tweens.add({
                targets: card,
                x: width / 2,
                y: height * 0.4,
                scaleX: 0.5,
                scaleY: 0.5,
                alpha: 0,
                duration: 400,
                ease: 'Power2',
                onComplete: () => {
                    card.destroy();
                    for (const cd of allCardData) {
                      window.dispatchEvent(new CustomEvent('host-deal-to-table', {
                        detail: { cardData: cd }
                      }));
                    }
                }
            });
        });
    } else {
        // Return to PUBLIC TABLE for play-stack cards, or deck for deck-drag cards
        const dragSource = (card as unknown as { dragSource?: string }).dragSource;
        const returnEvent = dragSource === 'deck' ? 'host-return-popped-card' : 'host-return-public-card';

        this.time.delayedCall(500, () => {
            if (!card.active) return;
            card.setStatic(true);
            const { width, height } = this.scale;

            this.tweens.add({
                targets: card,
                x: dragSource === 'deck' ? width * 0.25 : width / 2,
                y: dragSource === 'deck' ? height * 0.78 : height / 2,
                scaleX: 0.5,
                scaleY: 0.5,
                alpha: 0,
                duration: 400,
                ease: 'Power2',
                onComplete: () => {
                    card.destroy();
                    for (const cd of allCardData) {
                      window.dispatchEvent(new CustomEvent(returnEvent, {
                        detail: { cardData: cd }
                      }));
                    }
                }
            });
        });
    }
  }
}

export default function PhaserTable({ initialDeckCount = 0 }: { initialDeckCount?: number }) {
  const gameRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);

  _initialDeckCount = initialDeckCount;

  useEffect(() => {
    if (!gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: gameRef.current,
      width: '100%',
      height: '100%',
      backgroundColor: '#07111f',
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
