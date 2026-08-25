declare module "chess.js" {
  export class Chess {
    constructor(fen?: string);
    [key: string]: any;
  }

  export type ChessMove = any;
}

declare module "three" {
  export = THREE;
}

declare namespace THREE {
  type Euler = any;
  type Group = any;
  type Mesh = any;
  type MeshBasicMaterial = any;
  type MeshStandardMaterial = any;
  type Vector3 = any;
  const Euler: any;
  const Vector3: any;
  const MathUtils: any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elementName: string]: any;
  }
}
