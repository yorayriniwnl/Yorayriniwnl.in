declare module "chess.js" {
  export type ChessColor = "w" | "b";
  export type ChessPieceType = "p" | "n" | "b" | "r" | "q" | "k";

  export type ChessPiece = {
    color: ChessColor;
    type: ChessPieceType;
    square: string;
  };

  export type ChessMove = {
    color: ChessColor;
    from: string;
    to: string;
    piece: ChessPieceType;
    san: string;
    captured?: ChessPieceType;
    promotion?: ChessPieceType;
    flags?: string;
  };

  export class Chess {
    constructor(fen?: string);
    board(): Array<Array<ChessPiece | null>>;
    fen(): string;
    turn(): ChessColor;
    get(square: string): ChessPiece | null;
    moves(): string[];
    moves(options: { square?: string; verbose: true }): ChessMove[];
    moves(options: { square?: string; verbose?: false }): string[];
    move(move: ChessMove | string | { from: string; to: string; promotion?: string }): ChessMove | null;
    undo(): ChessMove | null;
    history(): string[];
    history(options: { verbose: true }): ChessMove[];
    isGameOver(): boolean;
    game_over(): boolean;
    in_check(): boolean;
    in_checkmate(): boolean;
    in_stalemate(): boolean;
    in_threefold_repetition(): boolean;
    insufficient_material(): boolean;
    isDraw(): boolean;
  }
}
