import * as MediaLibrary from "expo-media-library/legacy";

import type { GalleryAlbum } from "../types/media";

export default async function loadGalleryAlbums(): Promise<{
  albums: GalleryAlbum[];
  permissionGranted: boolean;
}> {
  const permission = await MediaLibrary.requestPermissionsAsync(false, [
    "photo",
    "video",
  ]);

  if (!permission.granted) {
    return {
      albums: [],
      permissionGranted: false,
    };
  }

  const albumResults = await MediaLibrary.getAlbumsAsync({
    includeSmartAlbums: true,
  });

  // Keep only albums that actually contain photos or videos.
  const checkedAlbums = await Promise.all(
    albumResults
      .filter((album) => album.assetCount > 0)
      .map(async (album): Promise<GalleryAlbum | null> => {
        try {
          const result = await MediaLibrary.getAssetsAsync({
            album: album.id,
            mediaType: [
              MediaLibrary.MediaType.photo,
              MediaLibrary.MediaType.video,
            ],
            first: 1,
          });

          if (result.assets.length === 0) {
            return null;
          }

          return {
            id: album.id,
            title: album.title,
            assetCount: album.assetCount,
          };
        } catch (error) {
          console.warn(
            `Couldn't verify media in album "${album.title}":`,
            error,
          );
          return null;
        }
      }),
  );

  const albums = checkedAlbums
    .filter((album): album is GalleryAlbum => album !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    albums,
    permissionGranted: true,
  };
}
