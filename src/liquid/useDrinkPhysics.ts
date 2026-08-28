/**
 * 잔 하나의 물리.
 *
 * blazejkustra/react-native-effects 의 `useBeerPhysics` (MIT, © 2026 Blazej
 * Kustra) 에서 갈라져 나왔다. 원본은 맥주 하나만 다루고 가속도계만 읽는다.
 * 여기서 달라진 것은 둘뿐이다:
 *
 *  1. **음료별 성질** — 점도가 높으면 수면이 늦게 따라오고 늦게 잦아들며 천천히
 *     비워진다. 맥주의 점도(0.15)에서는 원본 상수와 **정확히 같은 값**이 나오게
 *     맞춰놨다. 맥주가 데모와 다르게 움직이면 안 되기 때문이다.
 *  2. **드래그 입력** — 시뮬레이터에는 가속도계가 없어서 기울이기만으로는
 *     출렁임을 검증할 수 없다. 폰을 책상에 두고도 쓸 수 있다는 건 덤이다.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

import type { Drink } from '@/drinks/catalog';

/** 원본이 기준으로 삼은 점도. 이 값에서 아래 상수들이 원본과 일치한다. */
const REFERENCE_THICKNESS = 0.15;

/** 덜 감쇠된 수면 스프링 (~1.5 Hz, ζ ≈ 0.47) — 늦게 따라오고, 넘고, 울린다. */
const STIFFNESS = 90;
const DAMPING = 9;
/** 이 각도(rad) 아래로는 아무리 기울여도 흐르지 않는다. */
const DRAIN_START = 0.35;
/** 이 각도에서 흐르는 속도가 최대가 된다. */
const DRAIN_FULL = 1.35;
const MAX_DRAIN_RATE = 0.5; // 수위/초
const REFILL_RATE = 0.35; // 수위/초
/** 이보다 작은 가속도 변화는 센서 잡음으로 본다. */
const JERK_NOISE_FLOOR = 0.02;
/** 드래그를 놓은 뒤 센서로 돌아가기까지. 즉시 놓으면 수면이 튄다. */
const DRAG_RELEASE = 0.6; // 초

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type Sim = {
  /**
   * 매끄럽게 만든 중력 방향 (기기 좌표계).
   *
   * 각도를 누적하지 않고 **벡터**로 들고 있는다. 각도에 매 샘플 조금씩 더하면
   * 폰이 수평에 가까울 때 atan2 가 잡음으로 사방을 가리키고, 그 잡음을 계속
   * 적분해 각도가 한쪽으로 흘러간다. ±180도를 넘으면 한 번만 감아주는 보정도
   * 깨져서 아예 풀린다. 벡터는 적분이 없어 흘러갈 곳이 없다.
   */
  gx: number;
  gy: number;
  /** 위 벡터에서 뽑은 각도 (rad). 표시·진단용. */
  sensorAngle: number;
  /** 드래그로 만든 각도 (rad). */
  dragAngle: number;
  /** 드래그 우세도 0~1. 놓으면 서서히 0으로 돌아간다. */
  dragMix: number;
  dragging: boolean;
  /** 스프링이 쫓는 최종 목표 각도. */
  targetAngle: number;
  /** 셰이더에 넘기는, 스프링이 걸린 표시 각도. */
  angle: number;
  angleVel: number;
  /** 평면 방향 신호의 신뢰도 0~1 (폰이 평평히 누우면 0). */
  conf: number;
  /** 중력이 화면 위쪽을 향한다 → 최대 속도로 비운다. */
  pastHorizontal: boolean;
  /** 남은 양. 1이 가득. */
  level: number;
  pouring: boolean;
  pourT: number;
  slosh: number;
  bubblePhase: number;
  lastAx: number;
  lastAy: number;
  jerkAccum: number;
};

export function useDrinkPhysics(drink: Drink): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  /** 탭하면 다시 채운다. */
  refill: () => void;
  /** 드래그 중 가로 이동량(화면 폭 대비 -1~1)을 넘긴다. */
  drag: (amount: number) => void;
  dragEnd: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, drink.fill, 0, 0, 0, 0, 0, 0]);

  const simRef = useRef<Sim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      gx: 0,
      gy: -1,
      sensorAngle: 0,
      dragAngle: 0,
      dragMix: 0,
      dragging: false,
      targetAngle: 0,
      angle: 0,
      angleVel: 0,
      conf: 0,
      pastHorizontal: false,
      level: 1,
      pouring: false,
      pourT: 0,
      slosh: 0,
      bubblePhase: 0,
      lastAx: 0,
      lastAy: -1,
      jerkAccum: 0,
    };
  }

  /**
   * 음료를 바꿔도 잔은 그대로 두고 내용물만 갈린다. 물리 상태를 새로 만들면
   * 기울인 채로 바꿨을 때 수면이 수평으로 튀었다가 다시 기울어진다.
   */
  const drinkRef = useRef(drink);
  drinkRef.current = drink;

  // 가속도계 → 목표 각도. 평면(x, y)만 쓴다. z 는 무시한다.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const ok = await Accelerometer.isAvailableAsync();
        if (!ok || cancelled) return;
        Accelerometer.setUpdateInterval(16);
        sub = Accelerometer.addListener(({ x, y }) => {
          const s = simRef.current as Sim;

          // 평면 성분이 약하면(거의 눕힘) 신뢰도가 떨어지고, 그만큼 덜 반영해
          // 마지막 방향을 붙든다. 눕힌 폰은 좌우가 없으니 물어볼 것이 없다.
          const conf = Math.min(1, Math.hypot(x, y) / 0.35);
          const w = conf * conf * 0.35;
          s.gx += (x - s.gx) * w;
          s.gy += (y - s.gy) * w;
          s.conf = conf;
          s.pastHorizontal = y > 0;

          const jerk = Math.hypot(x - s.lastAx, y - s.lastAy);
          s.lastAx = x;
          s.lastAy = y;
          s.jerkAccum += Math.max(0, jerk - JERK_NOISE_FLOOR);
        });
      } catch {
        // 가속도계가 없으면(시뮬레이터) 드래그만으로 움직인다.
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as Sim;
      const d = drinkRef.current;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      // 점도. 맥주(0.15)에서 0이 되어 원본 상수와 정확히 같아진다.
      const t = d.body.thickness - REFERENCE_THICKNESS;
      const stiffness = STIFFNESS * (1 - t * 0.8);
      const damping = DAMPING * (1 + t * 1.2);

      // 세로로 세우면 y ≈ -1. 액체는 폰과 반대로 돌아 세상과 수평을 지킨다.
      s.sensorAngle = Math.atan2(s.gx, -s.gy);

      // 드래그를 놓으면 센서로 서서히 돌아간다.
      if (s.dragging) s.dragMix = 1;
      else s.dragMix = Math.max(0, s.dragMix - dt / DRAG_RELEASE);
      const blended =
        s.sensorAngle + (s.dragAngle - s.sensorAngle) * s.dragMix;

      // 지금 각도에서 가장 가까운 표현으로 펴준다. 안 그러면 ±180도 이음매를
      // 지날 때 스프링이 먼 쪽으로 한 바퀴 돈다.
      s.targetAngle =
        blended + Math.round((s.angle - blended) / (2 * Math.PI)) * 2 * Math.PI;

      s.angleVel += (s.targetAngle - s.angle) * stiffness * dt;
      s.angleVel -= s.angleVel * damping * dt;
      s.angle += s.angleVel * dt;

      s.slosh = Math.min(
        1,
        s.slosh + Math.abs(s.angleVel) * 0.12 * dt + s.jerkAccum * 1.5
      );
      s.jerkAccum = 0;
      s.slosh *= Math.exp(-dt / 1.0);

      // 마시기. 기울기의 매끄러운 함수 하나를 매 프레임 적분한다.
      // 드래그로 기울였을 때도 같은 규칙이 적용돼야 시뮬에서 검증이 된다.
      const tiltMag = Math.abs(s.targetAngle);
      const conf = Math.max(s.conf, s.dragMix);
      const rate =
        MAX_DRAIN_RATE *
        (1 - t * 0.6) *
        conf *
        (s.pastHorizontal && !s.dragging
          ? 1
          : smoothstep(DRAIN_START, DRAIN_FULL, tiltMag));
      s.level = Math.max(0, s.level - rate * dt);

      let pour = 0;
      if (s.pouring) {
        s.pourT += dt;
        pour = smoothstep(0, 0.35, s.pourT) * (1 - smoothstep(0.92, 1, s.level));
        s.level = Math.min(1, s.level + REFILL_RATE * (1 - t * 0.6) * dt);
        if (s.level >= 1) s.pouring = false;
      }

      // 적분한 위상. 시간 × 변하는 속도로 하면 기포가 순간이동한다.
      s.bubblePhase += dt * (1 + pour * 2 + s.slosh * 0.5);

      setParamsSynchronizable(
        s.angle,
        s.level * d.fill,
        s.slosh,
        pour,
        s.bubblePhase,
        0,
        0,
        0
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const refill = useCallback(() => {
    const s = simRef.current as Sim;
    if (!s.pouring && s.level < 1) {
      s.pouring = true;
      s.pourT = 0;
    }
  }, []);

  const drag = useCallback((amount: number) => {
    const s = simRef.current as Sim;
    s.dragging = true;
    // 화면을 반쯤 가로지르면 90도. 손가락 이동과 기울기가 비례해야
    // 얼마나 더 끌어야 하는지 눈으로 가늠이 된다.
    s.dragAngle = Math.max(-1, Math.min(1, amount * 2)) * (Math.PI / 2);
  }, []);

  const dragEnd = useCallback(() => {
    (simRef.current as Sim).dragging = false;
  }, []);

  return { paramsSynchronizable, refill, drag, dragEnd };
}
