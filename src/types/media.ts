export type Decision = "kept" | "rejected";
export type Direction = "left" | "right";

export type Photo = {
  id: string;
  uri: string;
  label: string;
  mediaType: "photo" | "video";
  duration?: number;
  thumbnailUri?: string;
};

export type GalleryAlbum = {
  id: string;
  title: string;
  assetCount: number;
};
