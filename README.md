# SwipeClean 🧹📱

> A fast, delightful, Tinder-style gallery cleaner for Android. Declutter your camera roll, organize albums, and reclaim gigabytes of storage in minutes.

[![Android](https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white)](#download-apk)
[![Expo](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86.3-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Download APK](https://img.shields.io/badge/Download-APK%20(Google%20Drive)-4285F4?logo=googledrive&logoColor=white)](https://drive.google.com/drive/folders/1ielxMLhWB0BsWa-ePhePA5U6DuMp8DOY?usp=sharing)

---

## 📥 Download APK

Get the latest release APK directly from Google Drive:

👉 **[Download SwipeClean APK (Google Drive)](https://drive.google.com/drive/folders/1ielxMLhWB0BsWa-ePhePA5U6DuMp8DOY?usp=sharing)**

### Installation Instructions
1. Download the `.apk` file onto your Android device.
2. Open your file manager or browser downloads and tap the `.apk`.
3. If prompted, enable **"Install unknown apps"** in your device settings.
4. Open **SwipeClean**, grant storage permissions when requested, and start decluttering!

---

## ✨ Features

- **👉 Swipe-to-Clean Gestures**: Effortlessly swipe right to keep or swipe left to queue for deletion with fluid 60fps animations powered by `react-native-reanimated` and `react-native-gesture-handler`.
- **📁 Album & Folder Targeting**: Review any specific album (Camera, Screenshots, WhatsApp, Downloads, etc.) or scan your entire gallery.
- **🎯 Configurable Batch Sessions**: Pick how many photos to clean at a time (e.g., 20, 50, 100, or all) to avoid cleaning fatigue.
- **🎥 Video Playback & Thumbnails**: Full support for video media with automated thumbnail generation and smooth in-app playback (`expo-video`).
- **🔍 Tap to Preview**: Tap any card to open a full-resolution preview modal before deciding.
- **🛡️ Two-Stage Safe Deletion Queue**: Nothing is deleted permanently without your explicit confirmation. Review your queued items in the Deletion Queue Modal, remove any accidental adds, and confirm batch deletion with Android's native safety prompt.
- **↩️ Instant Undo**: Easily step backward and change your mind on previous swipes.
- **💾 Session Save & Auto-Resume**: Stop at any time. SwipeClean preserves your review state across app restarts, so you can pick right back up where you left off.
- **📊 Cleanup Summary**: Detailed finished screen showing photos reviewed, photos kept, items deleted, and total storage reclaimed.
- **⚡ Highly Optimized Binary**: Streamlined with R8 minification, resource shrinking, and DEFLATE packaging — reducing standalone APK size by **~56%** (down to ~40 MB).

---

## 🎮 Gestures & Controls

| Gesture / Action | Result |
| :--- | :--- |
| **Swipe Right ➡️** | **Keep** — Keep the photo/video in your gallery. |
| **Swipe Left ⬅️** | **Queue for Deletion** — Add photo/video to the trash queue. |
| **Tap Card 👆** | **Full Preview** — View high-res photo or play video. |
| **Undo Button ↩️** | Revert your most recent swipe decision. |
| **Trash Queue 🗑️** | Open modal to review pending items or batch delete. |

---

## 🛠️ Tech Stack

- **Framework**: [Expo SDK 57](https://expo.dev) + [React Native 0.86.3](https://reactnative.dev)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction) (File-based navigation)
- **Gestures & Animations**: `react-native-gesture-handler` & `react-native-reanimated 4`
- **Media Engine**: `expo-media-library`, `expo-video`, `expo-video-thumbnails`
- **Storage & State**: `@react-native-async-storage/async-storage` & `expo-file-system`
- **Language**: TypeScript

---

## 💻 Local Development

### Prerequisites
- Node.js (v18+)
- Java 21 JDK (Adoptium / Eclipse Temurin recommended)
- Android SDK & platform-tools (`adb`)
- Expo CLI (`npx expo`)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AyushOJOD/swipeclean.git
   cd swipeclean
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npx expo start
   ```

4. **Run directly on connected Android device/emulator:**
   ```bash
   npx expo run:android
   ```

---

## 📦 Building the Release APK

To compile an optimized production APK locally using Gradle:

```bash
cd android
.\gradlew.bat assembleRelease
```

The output APK will be generated at:
```
android/app/build/outputs/apk/release/app-release.apk
```

> **Note**: For Google Play Store submission, build an Android App Bundle (`.aab`) instead:
> ```bash
> .\gradlew.bat bundleRelease
> ```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
