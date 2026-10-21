import { Image, Text, TouchableOpacity, View } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";

import styles from "../styles/styles";
import type { Photo } from "../types/media";
import { formatDuration } from "../utils/formatDuration";

type MediaCardProps = {
  photo: Photo;
  unavailable: boolean;
  cardStyle: AnimatedStyle<{
    transform: (
      | { translateX: number }
      | { translateY: number }
      | { rotate: string }
    )[];
  }>;
  keepStyle: AnimatedStyle<{ opacity: number }>;
  rejectStyle: AnimatedStyle<{ opacity: number }>;
  onPhotoUnavailable: (photoId: string) => void;
  onSkipUnavailable: (photoId: string) => void;
};

export default function MediaCard({
  photo,
  unavailable,
  cardStyle,
  keepStyle,
  rejectStyle,
  onPhotoUnavailable,
  onSkipUnavailable,
}: MediaCardProps) {
  return (
    <Animated.View style={[styles.card, cardStyle]}>
      {unavailable ? (
        <View style={styles.unavailableOverlay}>
          <Text style={styles.unavailableTitle}>Photo unavailable</Text>
          <Text style={styles.unavailableMessage}>
            This item may have been deleted or moved outside SwipeClean.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.unavailableSkipButton}
            onPress={() => onSkipUnavailable(photo.id)}
          >
            <Text style={styles.unavailableSkipButtonText}>
              Skip unavailable item
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Image
          key={photo.id}
          source={{
            uri:
              photo.mediaType === "video"
                ? (photo.thumbnailUri ?? photo.uri)
                : photo.uri,
          }}
          style={styles.photo}
          resizeMode="cover"
          onError={() => onPhotoUnavailable(photo.id)}
        />
      )}

      {!unavailable && photo.mediaType === "video" ? (
        <View pointerEvents="none" style={styles.videoCenterBadge}>
          <Text style={styles.videoPlayIcon}>▶</Text>
          <Text style={styles.videoDuration}>
            {formatDuration(photo.duration)}
          </Text>
        </View>
      ) : null}

      <Animated.View style={[styles.stamp, styles.keepStamp, keepStyle]}>
        <Text style={styles.keepStampText}>KEEP</Text>
      </Animated.View>

      <Animated.View style={[styles.stamp, styles.rejectStamp, rejectStyle]}>
        <Text style={styles.rejectStampText}>REJECT</Text>
      </Animated.View>

      <View style={styles.photoInfo}>
        <Text style={styles.photoTitle} numberOfLines={2}>
          {photo.label}
        </Text>

        {photo.mediaType === "video" ? (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>
              ▶ {formatDuration(photo.duration)}
            </Text>
          </View>
        ) : null}

        <Text style={styles.photoSubtitle}>
          SwipeClean · {photo.mediaType === "video" ? "Video" : "Photo"} · Tap
          to preview
        </Text>
      </View>
    </Animated.View>
  );
}
