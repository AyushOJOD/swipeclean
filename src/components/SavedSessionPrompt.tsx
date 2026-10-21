import { Text, TouchableOpacity, View } from "react-native";

import styles from "../styles/styles";

type SavedSessionPromptProps = {
  reviewedCount: number;
  queuedCount: number;
  onResume: () => void;
  onStartFresh: () => void;
};

export default function SavedSessionPrompt({
  reviewedCount,
  queuedCount,
  onResume,
  onStartFresh,
}: SavedSessionPromptProps) {
  return (
    <View style={styles.finishedCard}>
      <Text style={styles.finishedEmoji}>👋</Text>

      <Text style={styles.finishedTitle}>Welcome back</Text>

      <Text style={styles.finishedSubtitle}>
        You have a saved review session. Continue where you left off, or start a
        fresh review.
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{reviewedCount}</Text>
          <Text style={styles.statLabel}>Reviewed</Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.statNumber}>{queuedCount}</Text>
          <Text style={styles.statLabel}>In queue</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onResume}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Resume review</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={onStartFresh}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Start fresh</Text>
      </TouchableOpacity>
    </View>
  );
}
