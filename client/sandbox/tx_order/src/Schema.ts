export type StickerType = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  v: number;
};

export type FileType = {
  id: string;
  name: string;
};

export type Schema = {
  objects: StickerType;
  files: FileType;
};
