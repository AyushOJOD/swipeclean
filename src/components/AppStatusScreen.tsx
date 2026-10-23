import {
  ActivityIndicator,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import styles from "../styles/styles";

type AppStatusScreenProps = {
  type: "loading" | "permission-denied" | "gallery-error" | "no-media";
  message?: string;
  onRetry?: () => void;
};

export default function AppStatusScreen({
  type,
  message,
  onRetry,
}: AppStatusScreenProps) {
  if (type === "loading") {
    return (
      <View style={styles.loadingState}>
        <View style={styles.loadingMark}>
          <ActivityIndicator size="large" color="#B8A5FF" />
        </View>
        <Text style={styles.loadingTitle}>Getting things ready</Text>
        <Text style={styles.loadingSubtitle}>
          Finding your media and albums…
        </Text>
        <View style={styles.loadingTrack}>
          <View style={styles.loadingTrackFill} />
        </View>
      </View>
    );
  }

  if (type === "permission-denied") {
    return (
      <View style={styles.finishedCard}>
        <Text style={styles.finishedTitle}>Media access needed</Text>
        <Text style={styles.finishedSubtitle}>
          Allow access to your media to start reviewing your gallery. If Android
          doesn't show the permission prompt, open Settings and allow access
          manually.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, { marginBottom: 12 }]}
          onPress={onRetry}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Try again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (type === "gallery-error") {
    return (
      <TouchableOpacity
        style={styles.finishedCard}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.finishedTitle}>Couldn't load media</Text>
        <Text style={styles.finishedSubtitle}>{message}</Text>
        <Text style={styles.primaryButtonText}>Tap to retry</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.finishedCard}>
      <Text style={styles.finishedEmoji}>📷</Text>
      <Text style={styles.finishedTitle}>No media found</Text>
      <Text style={styles.finishedSubtitle}>
        Add media to your device or check your gallery permissions.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Reload gallery</Text>
      </TouchableOpacity>
    </View>
  );
}
