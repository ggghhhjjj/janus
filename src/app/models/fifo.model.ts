export interface Lot {
  id: number; // buy transaction id
  date: string; // ISO 8601
  originalQty: number;
  price: number;
  remaining: number;
  fee?: number; // Commission fee on the buy (optional)
}

export interface MatchedLot {
  lotId: number; // buy transaction id
  buyDate: string;
  originalQty: number;      // buy lot's quantity (after any splits)
  availableUnits: number;   // lot remaining at the moment this sell was processed
  qtyMatched: number;
  buyPrice: number;
  sellPrice: number;
  costBasis: number;
  proceeds: number;
  gainLoss: number;
  proportionalBuyFee: number; // proportional share of buy commission for this match
}

export interface MatchingDetailsRow {
  sellDate: string;
  sellTransactionId: number;
  buyDate: string;
  buyTransactionId: number;
  ticker: string;
  availableUnits: number;
  matchedUnits: number;
  effectiveBuyPrice: number;
  effectiveSellPrice: number;
  totalGain: number;
}

export interface SellResult {
  sellTransactionId: number;
  sellDate: string;
  sellPrice: number;
  matchedLots: MatchedLot[];
  totalCostBasis: number;
  totalProceeds: number;
  totalSellFee?: number; // Commission fee on the sell (optional)
  totalGainLoss: number;
}

export interface FifoResult {
  ticker: string;
  openLots: Lot[];
  sellResults: SellResult[];
}

export interface FifoState {
  results: Record<string, FifoResult>;
  totalRealizedGainLoss: number;
  yearlyGainLoss: Record<number, number>; // year → gain/loss
}
