export interface Lot {
  id: number; // buy transaction id
  date: string; // ISO 8601
  originalQty: number;
  price: number;
  remaining: number;
}

export interface MatchedLot {
  lotId: number; // buy transaction id
  buyDate: string;
  qtyMatched: number;
  buyPrice: number;
  sellPrice: number;
  costBasis: number;
  proceeds: number;
  gainLoss: number;
}

export interface SellResult {
  sellTransactionId: number;
  sellDate: string;
  sellPrice: number;
  matchedLots: MatchedLot[];
  totalCostBasis: number;
  totalProceeds: number;
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
