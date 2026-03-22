const { ALL_TILES, getTingTiles, getTingTilesWithMelds } = require('../../utils/mahjong');

const TILE_IMAGE_MAP = {
  11: 'Man1', 12: 'Man2', 13: 'Man3', 14: 'Man4', 15: 'Man5', 16: 'Man6', 17: 'Man7', 18: 'Man8', 19: 'Man9',
  21: 'Sou1', 22: 'Sou2', 23: 'Sou3', 24: 'Sou4', 25: 'Sou5', 26: 'Sou6', 27: 'Sou7', 28: 'Sou8', 29: 'Sou9',
  31: 'Pin1', 32: 'Pin2', 33: 'Pin3', 34: 'Pin4', 35: 'Pin5', 36: 'Pin6', 37: 'Pin7', 38: 'Pin8', 39: 'Pin9',
  41: 'Ton', 42: 'Nan', 43: 'Shaa', 44: 'Pei', 45: 'Chun', 46: 'Hatsu', 47: 'Haku'
};

const TILE_LABEL_MAP = {
  11: '一万', 12: '二万', 13: '三万', 14: '四万', 15: '五万', 16: '六万', 17: '七万', 18: '八万', 19: '九万',
  21: '一条', 22: '二条', 23: '三条', 24: '四条', 25: '五条', 26: '六条', 27: '七条', 28: '八条', 29: '九条',
  31: '一饼', 32: '二饼', 33: '三饼', 34: '四饼', 35: '五饼', 36: '六饼', 37: '七饼', 38: '八饼', 39: '九饼',
  41: '东', 42: '南', 43: '西', 44: '北', 45: '中', 46: '发', 47: '白'
};

const TILE_GROUPS = [
  { name: '万牌', tiles: [11, 12, 13, 14, 15, 16, 17, 18, 19] },
  { name: '条牌', tiles: [21, 22, 23, 24, 25, 26, 27, 28, 29] },
  { name: '饼牌', tiles: [31, 32, 33, 34, 35, 36, 37, 38, 39] },
  { name: '字牌', tiles: [41, 42, 43, 44, 45, 46, 47] }
];

const CHI_SUIT_OPTIONS = [
  { label: '万', base: 10 },
  { label: '条', base: 20 },
  { label: '饼', base: 30 }
];

const CHI_START_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const TILE_OPTIONS = ALL_TILES.map((code) => ({
  code,
  label: TILE_LABEL_MAP[code]
}));

function tileImageByCode(code) {
  const file = TILE_IMAGE_MAP[code];
  return file ? `../../assets/tiles/png/${file}.png` : '';
}

function buildTileGroupsWithAssets() {
  return TILE_GROUPS.map((group) => ({
    name: group.name,
    tiles: group.tiles.map((code) => ({
      code,
      label: TILE_LABEL_MAP[code],
      image: tileImageByCode(code)
    }))
  }));
}

function buildHandSlots(selectedTiles, laiziTile, slotCount) {
  const slots = [];
  for (let i = 0; i < slotCount; i += 1) {
    const tile = selectedTiles[i];
    if (tile === undefined) {
      slots.push({ index: i, empty: true, isLaizi: false, label: '', image: '' });
    } else {
      slots.push({
        index: i,
        empty: false,
        tile,
        image: tileImageByCode(tile),
        label: TILE_LABEL_MAP[tile],
        isLaizi: laiziTile !== null && tile === laiziTile
      });
    }
  }
  return slots;
}

function getTargetConcealedCount(meldCount) {
  return Math.max(1, 13 - meldCount * 3);
}

function getChiTilesBySelection(suitBase, start) {
  return [suitBase + start, suitBase + start + 1, suitBase + start + 2];
}

function buildChiStartCards(suitBase) {
  return CHI_START_OPTIONS.map((start) => ({
    start,
    tiles: getChiTilesBySelection(suitBase, start).map((tile) => ({
      code: tile,
      image: tileImageByCode(tile)
    }))
  }));
}

function buildSuitCards() {
  return CHI_SUIT_OPTIONS.map((item) => ({
    label: item.label,
    base: item.base,
    image: tileImageByCode(item.base + 1)
  }));
}

function buildTileCards() {
  return TILE_OPTIONS.map((item) => ({
    code: item.code,
    label: item.label,
    image: tileImageByCode(item.code)
  }));
}

function buildExposedTileCountMap(exposedMelds) {
  const countMap = {};
  for (const meld of exposedMelds) {
    for (const tile of meld.tiles) {
      countMap[tile] = (countMap[tile] || 0) + 1;
    }
  }
  return countMap;
}

function buildExposedMeldViews(exposedMelds, laiziTile) {
  return exposedMelds.map((meld) => ({
    id: meld.id,
    type: meld.type,
    typeLabel: meld.type === 'chi' ? '吃' : meld.type === 'peng' ? '碰' : '杠',
    tiles: meld.tiles.map((tile) => ({
      tile,
      image: tileImageByCode(tile),
      label: TILE_LABEL_MAP[tile],
      isLaizi: laiziTile !== null && tile === laiziTile
    }))
  }));
}

Page({
  data: {
    tileGroups: buildTileGroupsWithAssets(),
    selectedTiles: [],
    handSlots: [],
    exposedMelds: [],
    exposedMeldViews: [],
    tileCountMap: {},
    totalTileCountMap: {},
    exposedTileCountMap: {},
    laiziTile: null,
    laiziCount: 0,
    handCount: 0,
    targetConcealedCount: 13,
    meldGroupCount: 0,
    chiSuitCards: buildSuitCards(),
    chiStartCards: buildChiStartCards(CHI_SUIT_OPTIONS[0].base),
    tileCards: buildTileCards(),
    pickerSelectedSuit: CHI_SUIT_OPTIONS[0].base,
    pickerSelectedChiStart: CHI_START_OPTIONS[0],
    pickerSelectedPengTile: TILE_OPTIONS[0].code,
    pickerSelectedGangTile: TILE_OPTIONS[0].code,
    pickerDraftSuit: CHI_SUIT_OPTIONS[0].base,
    pickerDraftChiStart: CHI_START_OPTIONS[0],
    pickerDraftTile: TILE_OPTIONS[0].code,
    selectedChiPreview: [],
    selectedPengPreview: '',
    selectedGangPreview: '',
    showMeldPicker: false,
    meldPickerType: '',
    tingResults: [],
    isTing: false,
    canClear: false,
    canClearAll: false
  },

  onLoad() {
    this.refreshState(this.data.selectedTiles, this.data.laiziTile);
    this.updateMeldSelectionPreview(
      this.data.pickerSelectedSuit,
      this.data.pickerSelectedChiStart,
      this.data.pickerSelectedPengTile,
      this.data.pickerSelectedGangTile
    );
  },

  handleBack() {
    wx.navigateBack();
  },

  onAddTile(e) {
    const tile = Number(e.currentTarget.dataset.tile);
    const selectedTiles = this.data.selectedTiles.slice();
    const targetConcealedCount = this.data.targetConcealedCount;
    const exposedTileCountMap = this.data.exposedTileCountMap || {};

    if (selectedTiles.length >= targetConcealedCount) return;

    const concealedCount = selectedTiles.filter((t) => t === tile).length;
    const exposedCount = exposedTileCountMap[tile] || 0;
    if (concealedCount + exposedCount >= 4) {
      wx.showToast({ title: '同种牌最多4张', icon: 'none' });
      return;
    }

    selectedTiles.push(tile);
    this.refreshState(selectedTiles, this.data.laiziTile, this.data.exposedMelds);
  },

  onToggleLaizi(e) {
    const tile = Number(e.currentTarget.dataset.tile);
    const nextLaizi = this.data.laiziTile === tile ? null : tile;
    this.refreshState(this.data.selectedTiles, nextLaizi, this.data.exposedMelds);
  },

  onRemoveTile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const selectedTiles = this.data.selectedTiles.slice();
    if (index < 0 || index >= selectedTiles.length) return;
    selectedTiles.splice(index, 1);
    this.refreshState(selectedTiles, this.data.laiziTile, this.data.exposedMelds);
  },

  onClearTiles() {
    if (!this.data.selectedTiles.length) return;
    this.refreshState([], this.data.laiziTile, this.data.exposedMelds);
  },

  onClearAll() {
    if (!this.data.canClearAll) return;
    this.refreshState([], null, []);
  },

  openMeldPicker(e) {
    const type = String(e.currentTarget.dataset.type || '');
    if (!type) return;

    this.setData({
      showMeldPicker: true,
      meldPickerType: type,
      pickerDraftSuit: this.data.pickerSelectedSuit,
      pickerDraftChiStart: this.data.pickerSelectedChiStart,
      pickerDraftTile: type === 'gang' ? this.data.pickerSelectedGangTile : this.data.pickerSelectedPengTile,
      chiStartCards: buildChiStartCards(this.data.pickerSelectedSuit)
    });
  },

  closeMeldPicker() {
    this.setData({
      showMeldPicker: false,
      meldPickerType: ''
    });
  },

  preventBubble() {},

  onSelectPickerSuit(e) {
    const suitBase = Number(e.currentTarget.dataset.base);
    if (!suitBase) return;
    this.setData({
      pickerDraftSuit: suitBase,
      pickerDraftChiStart: CHI_START_OPTIONS[0],
      chiStartCards: buildChiStartCards(suitBase)
    });
  },

  onSelectPickerChiStart(e) {
    const start = Number(e.currentTarget.dataset.start);
    if (!start) return;
    this.setData({ pickerDraftChiStart: start });
  },

  onSelectPickerTile(e) {
    const tile = Number(e.currentTarget.dataset.tile);
    if (!tile) return;
    this.setData({ pickerDraftTile: tile });
  },

  updateMeldSelectionPreview(suitBase, chiStart, pengTileCode, gangTileCode) {
    const chiTiles = getChiTilesBySelection(suitBase, chiStart);
    this.setData({
      selectedChiPreview: chiTiles.map((tile) => tileImageByCode(tile)),
      selectedPengPreview: tileImageByCode(pengTileCode),
      selectedGangPreview: tileImageByCode(gangTileCode)
    });
  },

  onConfirmMeldPicker() {
    const { meldPickerType, pickerDraftSuit, pickerDraftChiStart, pickerDraftTile } = this.data;
    if (!meldPickerType) {
      this.closeMeldPicker();
      return;
    }

    if (meldPickerType === 'chi') {
      this.setData({
        pickerSelectedSuit: pickerDraftSuit,
        pickerSelectedChiStart: pickerDraftChiStart
      });
    } else if (meldPickerType === 'peng') {
      this.setData({ pickerSelectedPengTile: pickerDraftTile });
    } else {
      this.setData({ pickerSelectedGangTile: pickerDraftTile });
    }

    this.updateMeldSelectionPreview(
      meldPickerType === 'chi' ? pickerDraftSuit : this.data.pickerSelectedSuit,
      meldPickerType === 'chi' ? pickerDraftChiStart : this.data.pickerSelectedChiStart,
      meldPickerType === 'peng' ? pickerDraftTile : this.data.pickerSelectedPengTile,
      meldPickerType === 'gang' ? pickerDraftTile : this.data.pickerSelectedGangTile
    );

    this.closeMeldPicker();
  },

  onAddChiMeld() {
    const suitBase = this.data.pickerSelectedSuit;
    const start = this.data.pickerSelectedChiStart;
    const tiles = getChiTilesBySelection(suitBase, start);
    this.tryAddExposedMeld('chi', tiles);
  },

  onAddPengMeld() {
    const tile = this.data.pickerSelectedPengTile;
    this.tryAddExposedMeld('peng', [tile, tile, tile]);
  },

  onAddGangMeld() {
    const tile = this.data.pickerSelectedGangTile;
    this.tryAddExposedMeld('gang', [tile, tile, tile, tile]);
  },

  onRemoveMeld(e) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    const nextMelds = this.data.exposedMelds.filter((item) => item.id !== id);
    this.refreshState(this.data.selectedTiles, this.data.laiziTile, nextMelds);
  },

  canAddMeldByPhysicalLimit(meldTiles, selectedTiles, exposedTileCountMap) {
    const extra = {};
    for (const tile of meldTiles) {
      extra[tile] = (extra[tile] || 0) + 1;
    }

    for (const tileText of Object.keys(extra)) {
      const tile = Number(tileText);
      const concealedCount = selectedTiles.filter((t) => t === tile).length;
      const exposedCount = exposedTileCountMap[tile] || 0;
      if (concealedCount + exposedCount + extra[tile] > 4) {
        return false;
      }
    }

    return true;
  },

  tryAddExposedMeld(type, tiles) {
    const exposedMelds = this.data.exposedMelds.slice();
    if (exposedMelds.length >= 4) {
      wx.showToast({ title: '吃碰牌最多4组', icon: 'none' });
      return;
    }

    const nextMeldCount = exposedMelds.length + 1;
    const nextTarget = getTargetConcealedCount(nextMeldCount);
    if (this.data.selectedTiles.length > nextTarget) {
      wx.showToast({ title: `请先将暗手牌减到${nextTarget}张以内`, icon: 'none' });
      return;
    }

    if (!this.canAddMeldByPhysicalLimit(tiles, this.data.selectedTiles, this.data.exposedTileCountMap)) {
      wx.showToast({ title: '同种牌实体总数不能超过4张', icon: 'none' });
      return;
    }

    exposedMelds.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      tiles
    });

    this.refreshState(this.data.selectedTiles, this.data.laiziTile, exposedMelds);
  },

  refreshState(selectedTiles, laiziTile, exposedMelds) {
    const safeMelds = Array.isArray(exposedMelds) ? exposedMelds : [];
    const tileCountMap = {};
    for (const tile of selectedTiles) {
      tileCountMap[tile] = (tileCountMap[tile] || 0) + 1;
    }

    const exposedTileCountMap = buildExposedTileCountMap(safeMelds);
    const totalTileCountMap = { ...tileCountMap };
    for (const tileText of Object.keys(exposedTileCountMap)) {
      const tile = Number(tileText);
      totalTileCountMap[tile] = (totalTileCountMap[tile] || 0) + exposedTileCountMap[tile];
    }
    let laiziCount = 0;
    const normalTiles = [];

    for (const tile of selectedTiles) {
      if (laiziTile !== null && tile === laiziTile) {
        laiziCount += 1;
      } else {
        normalTiles.push(tile);
      }
    }

    const handCount = selectedTiles.length;
    const meldGroupCount = safeMelds.length;
    const targetConcealedCount = getTargetConcealedCount(meldGroupCount);

    let tingRaw = [];
    if (handCount === targetConcealedCount) {
      tingRaw = meldGroupCount === 0
        ? getTingTiles(normalTiles, laiziCount, laiziTile)
        : getTingTilesWithMelds(normalTiles, laiziCount, laiziTile, safeMelds);
    }

    const handSlots = buildHandSlots(selectedTiles, laiziTile, targetConcealedCount);
    const exposedMeldViews = buildExposedMeldViews(safeMelds, laiziTile);

    const tingResults = tingRaw.map((item) => ({
      tile: item.tile,
      image: tileImageByCode(item.tile),
      label: TILE_LABEL_MAP[item.tile],
      remaining: item.remaining
    }));

    this.setData({
      selectedTiles,
      handSlots,
      exposedMelds: safeMelds,
      exposedMeldViews,
      tileCountMap,
      totalTileCountMap,
      exposedTileCountMap,
      laiziTile,
      laiziCount,
      handCount,
      targetConcealedCount,
      meldGroupCount,
      tingResults,
      isTing: handCount === targetConcealedCount && tingResults.length > 0,
      canClear: handCount > 0,
      canClearAll: handCount > 0 || meldGroupCount > 0 || laiziTile !== null
    });
  }
});
