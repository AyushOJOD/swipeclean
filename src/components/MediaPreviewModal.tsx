import { Image, Modal, Text, TouchableOpacity, View } from "react-native";

import styles from "../styles/styles";
import type { Photo } from "../types/media";
import VideoPreview from "./VideoPreview";

type MediaPreviewModalProps = {
  visible: boolean;
  photo: Photo | null;
  onClose: () => void;
  onPhotoUnavailable: (photoId: string) => void;
};

export default function MediaPreviewModal({
  visible,
  photo,
  onClose,
  onPhotoUnavailable,
}: MediaPreviewModalProps) {
  return (
    <Modal
      visible={visible && Boolean(photo)}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.previewScreen}>
        <View style={styles.previewHeader}>
          <View style={styles.previewHeaderText}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {photo?.label ?? "Media preview"}
            </Text>

            <Text style={styles.previewSubtitle}>
              {photo?.mediaType === "video" ? "Video preview" : "Photo preview"}
            </Text>
          </View>

          <TouchableOpacity
            accessibilityLabel="Close photo preview"
            onPress={onClose}
            style={styles.previewCloseButton}
          >
            <Text style={styles.previewCloseText}>×</Text>
          </TouchableOpacity>
        </View>

        {photo ? (
          photo.mediaType === "video" ? (
            <VideoPreview
              key={photo.id}
              uri={photo.uri}
              style={styles.previewVideo}
            />
          ) : (
            <Image
              source={{ uri: photo.uri }}
              style={styles.previewImage}
              resizeMode="contain"
              onError={() => {
                onPhotoUnavailable(photo.id);
                onClose();
              }}
            />
          )
        ) : null}

        <Text style={styles.previewHint}>
          Close preview to continue reviewing
        </Text>
      </View>
    </Modal>
  );
}
