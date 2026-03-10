export interface Player {
  id: string;
  name: string;
  avatarUrl: string;
  isHost: boolean;
  totalScore: number;
}

export interface Round {
  id: number;
  scores: Record<string, number>; // playerId -> score
  timestamp: number;
}

export interface Transaction {
  fromName: string;
  toName: string;
  amount: number;
}

export enum AppView {
  HOME = 'HOME',
  ROOM = 'ROOM',
  SETTLEMENT = 'SETTLEMENT'
}

export interface RoomState {
  roomId: string;
  players: Player[];
  rounds: Round[];
  createdAt: number;
}
