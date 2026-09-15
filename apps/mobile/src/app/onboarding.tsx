import { useI18n } from '@carrental/i18n/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Dimensions, FlatList, View, type ViewToken } from 'react-native';

import { Button, Screen, Text } from '../components/ui';
import { ONBOARDING_SEEN_KEY } from '../lib/onboarding';
import { useTheme } from '../lib/theme/theme-provider';

const { width } = Dimensions.get('window');

const SLIDES = [
  { titleKey: 'mobile.onboarding.slide1.title', bodyKey: 'mobile.onboarding.slide1.body' },
  { titleKey: 'mobile.onboarding.slide2.title', bodyKey: 'mobile.onboarding.slide2.body' },
  { titleKey: 'mobile.onboarding.slide3.title', bodyKey: 'mobile.onboarding.slide3.body' },
] as const;

export default function OnboardingScreen() {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const finish = () => {
    void AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    router.replace('/');
  };

  // `setIndex` from `useState` is referentially stable, so an empty-deps `useCallback` gives
  // `onViewableItemsChanged` the stable identity FlatList expects without a ref-read-in-render.
  const onViewableChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) setIndex(viewableItems[0].index ?? 0);
  }, []);

  const isLast = index === SLIDES.length - 1;

  return (
    <Screen padded={false} contentContainerStyle={{ flex: 1 }}>
      <View style={{ alignItems: 'flex-end', padding: space(4) }}>
        <Text variant="small" color="mutedForeground" onPress={finish}>
          {t('mobile.onboarding.skip')}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.titleKey}
        onViewableItemsChanged={onViewableChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={{ width, padding: space(6), alignItems: 'center', justifyContent: 'center', gap: space(3) }}>
            <Text variant="display" style={{ textAlign: 'center' }}>
              {t(item.titleKey)}
            </Text>
            <Text variant="body" color="mutedForeground" style={{ textAlign: 'center' }}>
              {t(item.bodyKey)}
            </Text>
          </View>
        )}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space(2), paddingVertical: space(4) }}>
        {SLIDES.map((s, i) => (
          <View
            key={s.titleKey}
            style={{
              width: i === index ? 20 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === index ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>

      <View style={{ padding: space(4) }}>
        <Button
          fullWidth
          size="lg"
          onPress={() => {
            if (isLast) finish();
            else listRef.current?.scrollToIndex({ index: index + 1 });
          }}
        >
          {isLast ? t('mobile.onboarding.getStarted') : t('mobile.onboarding.next')}
        </Button>
      </View>
    </Screen>
  );
}
