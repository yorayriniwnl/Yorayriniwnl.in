declare module "chess.js" {
  export class Chess {
    constructor(fen?: string);
    [key: string]: any;
  }

  export type ChessMove = any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elementName: string]: any;
  }
}
