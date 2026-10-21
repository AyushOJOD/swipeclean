import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import styles from "../styles/styles";
import type { GalleryAlbum } from "../types/media";

type AlbumPickerProps = {
  albums: GalleryAlbum[];
  selectedAlbum: GalleryAlbum | null;
  photoCountInput: string;
  onSelectAlbum: (album: GalleryAlbum) => void;
  onChangePhotoCount: (value: string) => void;
  onStartReview: (album: GalleryAlbum, count: number) => void;
};

export default function AlbumPicker({
  albums,
  selectedAlbum,
  photoCountInput,
  onSelectAlbum,
  onChangePhotoCount,
  onStartReview,
}: AlbumPickerProps) {
  return (
    <ScrollView contentContainerStyle={styles.pickerContainer}>
      <Text style={styles.finishedEmoji}>🗂️</Text>
      <Text style={styles.pickerEyebrow}>YOUR GALLERY</Text>
      <Text style={styles.finishedTitle}>Choose a folder</Text>
      <Text style={styles.finishedSubtitle}>
        Pick an album, then choose how many items to review. You can select up
        to the number available in that album.
      </Text>

      {albums.map((album) => {
        const isExpanded = selectedAlbum?.id === album.id;
        const count = Number(photoCountInput);

        return (
          <View key={album.id} style={styles.albumAccordion}>
            <TouchableOpacity
              style={[
                styles.albumOption,
                isExpanded && styles.albumOptionSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => onSelectAlbum(album)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.albumTitle}>{album.title}</Text>
                <Text style={styles.albumCount}>{album.assetCount} items</Text>
              </View>

              <Text style={styles.albumSelectMark}>
                {isExpanded ? "⌃" : "⌄"}
              </Text>
            </TouchableOpacity>

            {isExpanded ? (
              <View style={styles.countPanel}>
                <Text style={styles.albumTitle}>How many items?</Text>
                <Text style={styles.albumCount}>
                  Available in {album.title}: {album.assetCount}
                </Text>

                <View style={styles.countChips}>
                  {[25, 50, 100]
                    .filter((n) => n <= album.assetCount)
                    .map((n) => (
                      <TouchableOpacity
                        key={n}
                        style={[
                          styles.countChip,
                          count === n && styles.countChipSelected,
                        ]}
                        onPress={() => onChangePhotoCount(String(n))}
                      >
                        <Text style={styles.countChipText}>{n}</Text>
                      </TouchableOpacity>
                    ))}

                  <TouchableOpacity
                    style={[
                      styles.countChip,
                      count === album.assetCount && styles.countChipSelected,
                    ]}
                    onPress={() => onChangePhotoCount(String(album.assetCount))}
                  >
                    <Text style={styles.countChipText}>
                      All ({album.assetCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  value={photoCountInput}
                  onChangeText={(value) =>
                    onChangePhotoCount(value.replace(/[^0-9]/g, ""))
                  }
                  keyboardType="number-pad"
                  placeholder="Enter number"
                  placeholderTextColor="#8D93A2"
                  style={styles.countInput}
                />

                <Text style={styles.albumCount}>
                  Choose 1–{album.assetCount} items.
                </Text>

                <TouchableOpacity
                  style={styles.primaryButton}
                  disabled={
                    !photoCountInput || count < 1 || count > album.assetCount
                  }
                  onPress={() => onStartReview(album, count)}
                >
                  <Text style={styles.primaryButtonText}>Start reviewing</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
