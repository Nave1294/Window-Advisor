/**
 * AI Commentary Service
 * Uses Claude Haiku via the Anthropic API for short conversational text.
 * All calls are client-side fetch to /api/ai/* routes which proxy to Anthropic.
 */

export interface RoomConditions {
  roomName:     string;
  shouldOpen:   boolean;
  openPeriods:  { from:string; to:string }[];
  reasoning:    string;
  highF:        number;
  lowF:         number;
  balancePoint: number | null;
  cityName:     string;
  date:         string;
}

export interface DashboardContext {
  rooms:    RoomConditions[];
  cityName: string;
  highF:    number;
  lowF:     number;
  date:     string;
}
