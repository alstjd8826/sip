import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRINKS, type DrinkId } from '@/drinks/catalog';
import { motion, theme } from '@/theme';

const CHIP_GAP = 6;

type Props = {
  value: DrinkId;
  onChange: (id: DrinkId) => void;
};

/**
 * 화면 아래에 떠 있는 음료 전환 바.
 *
 * 탭바가 아니다. 음료는 대등한 화면이 아니라 잔 하나에 담기는 내용물이고,
 * 열 종류를 탭으로 두면 다섯 개부터 More 로 밀린다.
 *
 * 유리를 쓸 자격이 있는 자리다 — 바로 뒤에서 액체가 계속 움직이므로, 불투명한
 * 판을 얹으면 그 움직임이 잘린다.
 */
export function DrinkBar({ value, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const glass = isLiquidGlassAvailable();

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, theme.space(4)) }]}
      pointerEvents="box-none">
      <View style={[styles.bar, glass ? styles.barGlass : styles.barSolid]}>
        {glass ? (
          <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}>
          {DRINKS.map((drink) => (
            <Chip
              key={drink.id}
              label={drink.label}
              swatch={drink.liquid}
              selected={drink.id === value}
              onPress={() => onChange(drink.id)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function Chip({
  label,
  swatch,
  selected,
  onPress,
}: {
  label: string;
  swatch: string;
  selected: boolean;
  onPress: () => void;
}) {
  const press = useSharedValue(0);
  const on = useSharedValue(selected ? 1 : 0);

  // 선택 표시는 배경이 자라나며 들어온다. 손가락이 닿은 게 아니라
  // 상태가 바뀐 것이므로 스프링이 아니라 짧은 타이밍이다.
  useEffect(() => {
    on.set(withTiming(selected ? 1 : 0, { duration: motion.duration.base }));
  }, [selected, on]);

  const tap = useCallback(() => {
    // 같은 걸 다시 눌러도 진동은 준다 — 눌린 건 사실이니까.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  const chipStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - press.get() * (1 - motion.pressScale) },
    ],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    opacity: on.get(),
    transform: [{ scale: 0.9 + on.get() * 0.1 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.62 + on.get() * 0.38,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={6}
      onPressIn={() => press.set(withTiming(1, { duration: motion.duration.press }))}
      onPressOut={() => press.set(withSpring(0, motion.glide))}
      onPress={tap}>
      <Animated.View style={[styles.chip, chipStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.chipFill, fillStyle]} />
        <View style={[styles.dot, { backgroundColor: swatch }]} />
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.space(3),
  },
  bar: {
    borderRadius: theme.radius.pill,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  barGlass: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.hairline,
  },
  barSolid: { backgroundColor: theme.color.fallback },
  row: {
    padding: CHIP_GAP,
    gap: CHIP_GAP,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    paddingHorizontal: theme.space(3.5),
    height: 40,
    borderRadius: theme.radius.pill,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  chipFill: {
    backgroundColor: theme.color.selected,
    borderRadius: theme.radius.pill,
    borderCurve: 'continuous',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 14,
    color: theme.color.ink,
    fontWeight: '500',
  },
});
