import { Text, TouchableOpacity, View } from "react-native";

import styles from "../styles/styles";

type FinishedScreenProps = {
  selectedCount: number;
  albumTitle: string;
  reviewedCount: number;
  keptCount: number;
  rejectedCount: number;
  deletingPhotos: boolean;
  onChooseAnotherFolder: () => void;
  onDeleteSelected: () => void;
  onReviewAgain: () => void;
};

export default function FinishedScreen({
  selectedCount,
  albumTitle,
  reviewedCount,
  keptCount,
  rejectedCount,
  deletingPhotos,
  onChooseAnotherFolder,
  onDeleteSelected,
  onReviewAgain,
}: FinishedScreenProps) {
  return (
    <View style={styles.finishedCard}>
      <Text style={styles.finishedEmoji}>✨</Text>

      <Text style={styles.finishedTitle}>Nice work!</Text>

      <Text style={styles.finishedSubtitle}>
        You've reviewed all {selectedCount} selected items from {albumTitle}.
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{reviewedCount}</Text>
          <Text style={styles.statLabel}>Reviewed</Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.statNumber}>{keptCount}</Text>
          <Text style={styles.statLabel}>Kept</Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.statNumber}>{rejectedCount}</Text>
          <Text style={styles.statLabel}>Marked for deletion</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.finishedPrimaryButton}
        onPress={onChooseAnotherFolder}
        accessibilityRole="button"
      >
        <Text style={styles.finishedPrimaryButtonText}>
          Choose another folder
        </Text>
      </TouchableOpacity>

      {rejectedCount > 0 && (
        <TouchableOpacity
          style={styles.finishedDeleteButton}
          onPress={onDeleteSelected}
          disabled={deletingPhotos}
          accessibilityRole="button"
        >
          <Text style={styles.finishedDeleteButtonText}>
            {deletingPhotos
              ? "Deleting..."
              : `Delete selected items (${rejectedCount})`}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.finishedSecondaryButton}
        onPress={onReviewAgain}
        accessibilityRole="button"
      >
        <Text style={styles.finishedSecondaryButtonText}>
          Review this selection again
        </Text>
      </TouchableOpacity>
    </View>
  );
}
