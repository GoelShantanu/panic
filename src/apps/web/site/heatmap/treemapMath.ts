// Pure TypeScript squarified treemap calculation (Bruls, Huizing, van Wijk algorithm).
// Runs 100% in client browser with zero npm dependencies and sub-millisecond execution.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedItem<T> {
  item: T;
  rect: Rect;
}

export function squarify<T extends { value: number }>(
  items: T[],
  container: Rect
): PlacedItem<T>[] {
  const result: PlacedItem<T>[] = [];
  if (items.length === 0 || container.w <= 0 || container.h <= 0) return result;

  // Filter out any zero or invalid values
  const validItems = items.filter((it) => typeof it.value === 'number' && it.value > 0);
  if (validItems.length === 0) return result;

  const totalValue = validItems.reduce((sum, item) => sum + item.value, 0);
  if (totalValue <= 0) return result;

  const totalArea = container.w * container.h;
  const normalized = validItems.map((item) => ({
    raw: item,
    area: (item.value / totalValue) * totalArea,
  }));

  function layoutRow(
    row: typeof normalized,
    box: Rect
  ): { placed: PlacedItem<T>[]; remaining: Rect } {
    const rowArea = row.reduce((s, it) => s + it.area, 0);
    const isHorizontal = box.w >= box.h;
    const placed: PlacedItem<T>[] = [];

    if (isHorizontal) {
      const rowWidth = Math.min(box.w, rowArea / box.h);
      let currentY = box.y;
      for (const it of row) {
        const itemH = it.area / rowWidth;
        placed.push({
          item: it.raw,
          rect: {
            x: box.x,
            y: currentY,
            w: Math.max(1, rowWidth),
            h: Math.max(1, itemH),
          },
        });
        currentY += itemH;
      }
      const remaining: Rect = {
        x: box.x + rowWidth,
        y: box.y,
        w: Math.max(0, box.w - rowWidth),
        h: box.h,
      };
      return { placed, remaining };
    } else {
      const rowHeight = Math.min(box.h, rowArea / box.w);
      let currentX = box.x;
      for (const it of row) {
        const itemW = it.area / rowHeight;
        placed.push({
          item: it.raw,
          rect: {
            x: currentX,
            y: box.y,
            w: Math.max(1, itemW),
            h: Math.max(1, rowHeight),
          },
        });
        currentX += itemW;
      }
      const remaining: Rect = {
        x: box.x,
        y: box.y + rowHeight,
        w: box.w,
        h: Math.max(0, box.h - rowHeight),
      };
      return { placed, remaining };
    }
  }

  function worstAspectRatio(row: typeof normalized, sideLength: number): number {
    if (row.length === 0 || sideLength <= 0) return Infinity;
    const rowArea = row.reduce((s, it) => s + it.area, 0);
    const rowAreaSq = rowArea * rowArea;
    const sideSq = sideLength * sideLength;
    let max = 0;
    for (const it of row) {
      const area = it.area;
      if (area <= 0) continue;
      const r = Math.max((sideSq * area) / rowAreaSq, rowAreaSq / (sideSq * area));
      if (r > max) max = r;
    }
    return max;
  }

  let currentContainer = { ...container };
  let currentRow: typeof normalized = [];

  for (const item of normalized) {
    const side = Math.min(currentContainer.w, currentContainer.h);
    if (side <= 0) break;

    const currentWorst = worstAspectRatio(currentRow, side);
    const testRow = [...currentRow, item];
    const newWorst = worstAspectRatio(testRow, side);

    if (currentRow.length === 0 || newWorst <= currentWorst) {
      currentRow.push(item);
    } else {
      const { placed, remaining } = layoutRow(currentRow, currentContainer);
      result.push(...placed);
      currentContainer = remaining;
      currentRow = [item];
    }
  }

  if (currentRow.length > 0 && currentContainer.w > 0 && currentContainer.h > 0) {
    const { placed } = layoutRow(currentRow, currentContainer);
    result.push(...placed);
  }

  return result;
}

export interface SectorLayout<T> {
  sector: string;
  rect: Rect;
  totalMarketCap: number;
  stockCount: number;
  avgChange: number;
  stocks: PlacedItem<T>[];
}

export function computeNestedTreemap<T extends { sector: string; marketCap: number; change: number }>(
  stocks: T[],
  containerWidth: number,
  containerHeight: number,
  headerHeight = 26
): SectorLayout<T>[] {
  if (stocks.length === 0 || containerWidth <= 0 || containerHeight <= 0) return [];

  // Group stocks by sector
  const sectorMap = new Map<string, { sector: string; stocks: T[]; totalMarketCap: number; totalChange: number }>();
  for (const s of stocks) {
    const sec = s.sector || 'Other';
    let entry = sectorMap.get(sec);
    if (!entry) {
      entry = { sector: sec, stocks: [], totalMarketCap: 0, totalChange: 0 };
      sectorMap.set(sec, entry);
    }
    entry.stocks.push(s);
    entry.totalMarketCap += Math.max(1, s.marketCap);
    entry.totalChange += s.change;
  }

  // Sort sectors descending by market cap
  const sectors = Array.from(sectorMap.values())
    .map((s) => ({
      ...s,
      value: s.totalMarketCap,
    }))
    .sort((a, b) => b.value - a.value);

  // Layout sectors across the container
  const placedSectors = squarify(sectors, { x: 0, y: 0, w: containerWidth, h: containerHeight });

  // Inside each placed sector, layout its stocks
  const result: SectorLayout<T>[] = [];

  for (const ps of placedSectors) {
    const secData = ps.item;
    const secRect = ps.rect;

    const innerX = 0;
    const innerY = headerHeight;
    const innerW = secRect.w;
    const innerH = Math.max(0, secRect.h - headerHeight);

    // Sort stocks inside sector descending by market cap
    const sortedStocks = [...secData.stocks]
      .map((st) => ({
        ...st,
        value: Math.max(1, st.marketCap),
      }))
      .sort((a, b) => b.value - a.value);

    const placedStocks = squarify(sortedStocks, {
      x: innerX,
      y: innerY,
      w: innerW,
      h: innerH,
    });

    result.push({
      sector: secData.sector,
      rect: secRect,
      totalMarketCap: secData.totalMarketCap,
      stockCount: secData.stocks.length,
      avgChange: secData.stocks.length > 0 ? secData.totalChange / secData.stocks.length : 0,
      stocks: placedStocks,
    });
  }

  return result;
}
