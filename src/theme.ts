/**
 * 디자인 토큰.
 *
 * 화면 전체가 액체라 배경색이 매 순간 바뀐다. 그래서 UI 색은 액체와 경쟁하지
 * 않는 무채색 한 계열로만 두고, 강조는 색이 아니라 **유리와 대비**로 낸다.
 * 액센트를 따로 두면 음료 색과 부딪히는 조합이 반드시 나온다.
 */
export const theme = {
  color: {
    /** 유리 위에 얹는 글자. 액체가 밝든 어둡든 읽혀야 해서 흰색 고정. */
    ink: '#FFFFFF',
    inkSoft: 'rgba(255, 255, 255, 0.62)',
    /** 유리를 못 쓰는 기기에서 떨어지는 불투명 바탕. */
    fallback: 'rgba(28, 28, 30, 0.82)',
    hairline: 'rgba(255, 255, 255, 0.16)',
    /** 고른 음료를 표시하는 알약. */
    selected: 'rgba(255, 255, 255, 0.20)',
  },
  radius: { pill: 999, card: 22, chip: 16 },
  space: (n: number) => n * 4,
} as const;

/**
 * 모션 어휘. 한 벌만 쓴다.
 *
 * 손가락이 닿은 것은 스프링, 나머지는 300ms 이하의 강한 ease-out.
 */
export const motion = {
  /** 제자리로 돌아가 멈추는 것. 튀지 않는다. */
  settle: { duration: 400, dampingRatio: 1 },
  /** 손가락이 놓은 뒤 따라오는 것. 약간 넘긴다. */
  glide: { duration: 320, dampingRatio: 0.82 },
  easeOut: [0.23, 1, 0.32, 1] as const,
  duration: { press: 120, base: 240, exit: 160 },
  pressScale: 0.96,
} as const;
