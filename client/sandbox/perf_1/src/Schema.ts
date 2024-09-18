export type ObjectType = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  attributes: {
    a: string;
    b: string;
    c: number;
    d: number;
    e: string;
    f: string;
    g: string;
    h: string;
  };
};

export type Schema = {
  objects: ObjectType;
};
