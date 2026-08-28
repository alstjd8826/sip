import { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
// Reanimated 4 의 runOnJS 자리. reanimated 가 아니라 worklets 에서 나온다.
import { scheduleOnRN } from 'react-native-worklets';

import { DrinkBar } from '@/components/DrinkBar';
import { DRINK_BY_ID, type DrinkId } from '@/drinks/catalog';
import BeerGlass from '@/liquid/BeerGlass';
import DrinkGlass from '@/liquid/DrinkGlass';
import { useDrinkPhysics } from '@/liquid/useDrinkPhysics';
import { motion } from '@/theme';

export default function GlassScreen() {
  const [id, setId] = useState<DrinkId>('beer');
  const drink = DRINK_BY_ID[id];
  const { width } = useWindowDimensions();

  const { paramsSynchronizable, refill, drag, dragEnd } = useDrinkPhysics(drink);


  const onDrag = useCallback(
    (dx: number) => drag(dx / width),
    [drag, width]
  );

  /**
   * 기울이기의 두 번째 입력.
   *
   * 시뮬레이터에는 가속도계가 없어서 이게 없으면 액체가 멈춰 있는 것밖에
   * 확인할 수 없다. 폰을 책상에 둔 채로도 쓸 수 있다는 게 덤이다.
   *
   * 탭은 다시 채우기. 드래그와 겹치지 않게 이동 거리로 갈린다.
   */
  const pan = Gesture.Pan()
    .minDistance(4)
    .onUpdate((e) => {
      'worklet';
      scheduleOnRN(onDrag, e.translationX);
    })
    .onFinalize(() => {
      'worklet';
      scheduleOnRN(dragEnd);
    });

  const tap = Gesture.Tap().onEnd((_e, ok) => {
    'worklet';
    if (ok) scheduleOnRN(refill);
  });

  const gesture = Gesture.Exclusive(pan, tap);

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          {/*
            음료가 바뀌면 잔이 갈린다. 위치가 아니라 내용물이 바뀐 것이므로
            움직임 없이 겹쳐 녹인다 — 액체가 옆에서 밀려 들어오면 잔이
            바뀐 것처럼 보인다.
          */}
          <Animated.View
            key={id}
            style={StyleSheet.absoluteFill}
            entering={FadeIn.duration(motion.duration.base)}
            exiting={FadeOut.duration(motion.duration.exit)}>
            {id === 'beer' ? (
              <BeerGlass
                paramsSynchronizable={paramsSynchronizable}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <DrinkGlass
                drink={drink}
                paramsSynchronizable={paramsSynchronizable}
                style={StyleSheet.absoluteFill}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      <DrinkBar value={id} onChange={setId} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
