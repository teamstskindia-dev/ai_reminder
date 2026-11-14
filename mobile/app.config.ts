import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Static native configuration for iOS and Android. Everything user-visible (brand name in the UI,
 * logos, colours, tabs, onboarding, banners, feature flags) comes from the backend's public config at
 * runtime. Only values that must be baked into the native binaries live here.
 */

/** Single source of truth for the marketing version and the build number (iOS buildNumber / Android versionCode). */
const APP_VERSION = '1.0.0';
const BUILD_NUMBER = Number(process.env.APP_BUILD_NUMBER ?? 1);

const BRAND_PRIMARY = '#5B4FE9';

/** development | preview | production — set per EAS build profile (eas.json). Local runs default to development. */
const APP_ENV = (process.env.APP_ENV ?? 'development').trim();
const IS_DEV = APP_ENV === 'development';

const easProjectId = process.env.EAS_PROJECT_ID?.trim() || undefined;
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() || undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Remi',
  slug: 'remi',
  version: APP_VERSION,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'remi',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.remi.app',
    buildNumber: String(BUILD_NUMBER),
    supportsTablet: true,
    icon: './assets/images/icon.png',
    // Sign in with Apple (required by App Store guideline 4.8 when Google sign-in is offered).
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // HTTPS only. Development builds may reach a backend on localhost / the LAN; never arbitrary loads.
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: IS_DEV,
      },
    },
  },
  android: {
    package: 'com.remi.app',
    versionCode: BUILD_NUMBER,
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: BRAND_PRIMARY,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    // Only what the app uses; plugins add their own (expo-notifications adds POST_NOTIFICATIONS etc.).
    permissions: [],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.CAMERA',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
        dark: { backgroundColor: '#0E0D16', image: './assets/images/splash-icon.png' },
      },
    ],
    // No biometrics are used (no Face ID usage string); backups are disabled app-wide (allowBackup: false).
    ['expo-secure-store', { faceIDPermission: false, configureAndroidBackup: false }],
    '@react-native-community/datetimepicker',
    'expo-apple-authentication',
    [
      'expo-audio',
      {
        // Voice answers in the get-to-know-you chat now; tap-to-record conversations next.
        microphonePermission: 'Allow $(PRODUCT_NAME) to use the microphone so you can talk to your friend and record conversations.',
        recordAudioAndroid: true,
        enableBackgroundRecording: false,
        enableBackgroundPlayback: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: BRAND_PRIMARY,
        defaultChannel: 'default',
        // Generates the iOS `aps-environment` entitlement.
        mode: IS_DEV ? 'development' : 'production',
      },
    ],
    [
      'expo-build-properties',
      {
        // Cleartext HTTP (e.g. http://localhost:4000) only in development builds; preview/production are HTTPS-only.
        android: { usesCleartextTraffic: IS_DEV },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...config.extra,
    appEnv: APP_ENV,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
});
