import {
    Image,
    Modal,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import styles from "../styles/styles";
import type { Photo } from "../types/media";
import { formatDuration } from "../utils/formatDuration";

type DeletionQueueModalProps = {
  visible: boolean;
  rejectedPhotos: Photo[];
  photos: Photo[];
  deletingPhotos: boolean;
  onClose: () => void;
  onPreview: (photo: Photo) => void;
  onRestore: (photo: Photo) => void;
  onDeleteQueue: () => void;
};

export default function DeletionQueueModal({
  visible,
  rejectedPhotos,
  photos,
  deletingPhotos,
  onClose,
  onPreview,
  onRestore,
  onDeleteQueue,
}: DeletionQueueModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.queueScreen}>
        <View style={styles.queueHeader}>
          <View style={styles.previewHeaderText}>
            <Text style={styles.queueTitle}>Deletion queue</Text>
            <Text style={styles.previewSubtitle}>
              {rejectedPhotos.length}{" "}
              {rejectedPhotos.length === 1 ? "item" : "items"} pending review
            </Text>
          </View>

          <TouchableOpacity
            accessibilityLabel="Close deletion queue"
            onPress={onClose}
            style={styles.previewCloseButton}
          >
            <Text style={styles.previewCloseText}>×</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.queueDescription}>
          These items have not been deleted. Preview them and restore anything
          you want to keep.
        </Text>

        {rejectedPhotos.length === 0 ? (
          <View style={styles.queueEmpty}>
            <Text style={styles.finishedEmoji}>🧹</Text>
            <Text style={styles.finishedTitle}>Your queue is empty</Text>
            <Text style={styles.finishedSubtitle}>
              Swipe left on an item to add it here for review.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.queueGrid}>
            {rejectedPhotos.map((photo) => (
              <View key={photo.id} style={styles.queueItem}>
                <TouchableOpacity
                  accessibilityLabel={`Preview ${photo.label}`}
                  style={styles.queueThumbnailButton}
                  onPress={() => onPreview(photo)}
                >
                  <Image
                    source={{
                      uri:
                        photo.mediaType === "video"
                          ? (photo.thumbnailUri ?? photo.uri)
                          : photo.uri,
                    }}
                    style={styles.queueThumbnail}
                    resizeMode="cover"
                  />

                  {photo.mediaType === "video" ? (
                    <View style={styles.queueVideoBadge}>
                      <Text style={styles.queueVideoBadgeText}>
                        ▶ {formatDuration(photo.duration)}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>

                <Text style={styles.queuePhotoLabel} numberOfLines={1}>
                  {photo.label}
                </Text>

                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={() => onRestore(photo)}
                >
                  <Text style={styles.restoreButtonText}>Restore</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.queueFooter}>
          <TouchableOpacity
            style={[
              styles.queueDeleteButton,
              (rejectedPhotos.length === 0 || deletingPhotos) &&
                styles.queueDeleteButtonDisabled,
            ]}
            onPress={onDeleteQueue}
            disabled={rejectedPhotos.length === 0 || deletingPhotos}
          >
            <Text style={styles.queueDeleteButtonText}>
              {deletingPhotos
                ? "Deleting..."
                : `Delete ${rejectedPhotos.length}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.queueDoneButton}
            onPress={onClose}
            disabled={deletingPhotos}
          >
            <Text style={styles.primaryButtonText}>Done reviewing</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
