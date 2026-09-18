import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Dynamic Expo config so the API origin / bundle id can vary per build channel
 * (dev / preview / production, wired from `eas.json`'s `env` per profile) without
 * hand-editing a static `app.json` for every environment.
 */

type Channel = 'development' | 'preview' | 'production';

function channelOf(): Channel {
  const c = process.env.APP_VARIANT as Channel | undefined;
  return c ?? 'development';
}

const BUNDLE_ID: Record<Channel, string> = {
  development: 'com.carrental.app.dev',
  preview: 'com.carrental.app.preview',
  production: 'com.carrental.app',
};

const APP_NAME: Record<Channel, string> = {
  development: 'Car Rental (Dev)',
  preview: 'Car Rental (Preview)',
  production: 'Car Rental',
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const channel = channelOf();
  const id = BUNDLE_ID[channel];

  return {
    ...config,
    name: APP_NAME[channel],
    slug: 'carrental-mobile',
    scheme: 'carrental',
    owner: undefined,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
      dark: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#0b1420',
      },
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      bundleIdentifier: id,
      supportsTablet: true,
      infoPlist: {
        // iOS only considers an application language for native RTL/locale behavior when the
        // bundle declares it. The in-app catalogue is runtime-driven, but these are the three
        // locales shipped with this binary and used by UIKit controls such as UIDatePicker.
        CFBundleLocalizations: ['en', 'ar', 'fr'],
        NSCameraUsageDescription:
          'Used to photograph your driving licence and take vehicle condition photos at pickup/return.',
        NSPhotoLibraryUsageDescription: 'Used to attach a photo of your driving licence.',
        NSFaceIDUsageDescription: 'Used to unlock the app quickly and securely.',
        NSLocationWhenInUseUsageDescription:
          'Used to sort pickup locations by distance from you. Optional — you can always choose one manually.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: id,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0f6b4c',
      },
      permissions: [
        'CAMERA',
        'READ_MEDIA_IMAGES',
        'USE_BIOMETRIC',
        'USE_FINGERPRINT',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-system-ui',
      'expo-localization',
      'expo-local-authentication',
      [
        'expo-image-picker',
        {
          photosPermission: 'Used to attach a photo of your driving licence.',
          cameraPermission:
            'Used to photograph your driving licence and take vehicle condition photos at pickup/return.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Used to sort pickup locations by distance from you. Optional — you can always choose one manually.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#0f6b4c',
        },
      ],
      [
        '@stripe/stripe-react-native',
        {
          merchantIdentifier: 'merchant.com.carrental.app',
          enableGooglePay: true,
        },
      ],
      [
        'expo-build-properties',
        {
          // SDK 51 predates the top-level `newArchEnabled` config field — this plugin is the
          // documented way to opt into the New Architecture on this SDK.
          ios: { deploymentTarget: '15.1', newArchEnabled: true },
          android: { minSdkVersion: 24, newArchEnabled: true },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      channel,
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? undefined,
      },
    },
  };
};
