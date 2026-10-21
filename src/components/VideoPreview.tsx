import { useVideoPlayer, VideoView } from "expo-video";
import type { StyleProp, ViewStyle } from "react-native";

type VideoPreviewProps = {
  uri: string;
  style: StyleProp<ViewStyle>;
};

export default function VideoPreview({ uri, style }: VideoPreviewProps) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      contentFit="contain"
    />
  );
}
