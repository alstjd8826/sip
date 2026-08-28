/**
 * 마실 수 있는 것들.
 *
 * 액체는 전부 같은 셰이더 하나로 그린다. 음료마다 셰이더를 따로 쓰면 열 개를
 * 열 번 손보게 되고, 그러면 하나만 예뻐지고 나머지는 방치된다. 대신 "액체가
 * 달라 보이는 이유"를 축으로 뽑아 값만 바꾼다.
 *
 * 맥주만 예외다. 원본 데모의 셰이더를 그대로 쓰기 때문에 여기 값들을 무시한다
 * ([[BeerGlass]] 참고).
 */

export type DrinkId = 'beer' | 'wine' | 'cola' | 'americano';

export type Drink = {
  id: DrinkId;
  /** 유리 바에 뜨는 이름. */
  label: string;
  /** 액체 본색. */
  liquid: string;
  /** 거품·크레마·우유거품 색. 거품이 없는 음료도 메니스커스에 쓴다. */
  head: string;
  /**
   * 액체 성질. 전부 0~1 로 정규화한다 — 셰이더가 읽는 값이라 단위를 섞으면
   * 한 축을 만질 때마다 다른 축의 스케일을 다시 외워야 한다.
   */
  body: {
    /** 거품 머리의 두께. 0이면 거품이 없다. */
    head: number;
    /** 기포. 탄산이 셀수록 많고 빠르게 오른다. */
    fizz: number;
    /** 불투명도. 우유가 섞인 것은 빛이 안 통하고, 차·물은 통한다. */
    opacity: number;
    /** 점도. 높으면 수면이 늦게 따라오고 출렁임이 오래 남는다. */
    thickness: number;
  };
  /** 가득 채웠을 때의 수위. 위스키를 잔 끝까지 붓지는 않는다. */
  fill: number;
};

export const DRINKS: readonly Drink[] = [
  {
    id: 'beer',
    label: '맥주',
    liquid: '#E5920A',
    head: '#F8F1DD',
    body: { head: 0.85, fizz: 0.9, opacity: 0.55, thickness: 0.15 },
    fill: 0.8,
  },
  {
    id: 'wine',
    label: '와인',
    liquid: '#6E1220',
    head: '#B4536A',
    body: { head: 0.0, fizz: 0.05, opacity: 0.88, thickness: 0.45 },
    fill: 0.62,
  },
  {
    id: 'cola',
    label: '콜라',
    // 검정이 아니라 아주 짙은 적갈색이다. 순검정으로 두면 화면이 꺼진 것처럼
    // 보이고 기포도 안 읽힌다.
    liquid: '#3A1A0E',
    head: '#C08A55',
    // 거품은 많이 일었다가 금방 사그라든다 — 맥주처럼 두껍게 두면 흑맥주가 된다.
    body: { head: 0.16, fizz: 1.0, opacity: 0.93, thickness: 0.1 },
    fill: 0.84,
  },
  {
    id: 'americano',
    label: '아메리카노',
    liquid: '#3A1E10',
    head: '#8A5A34',
    body: { head: 0.1, fizz: 0.0, opacity: 0.95, thickness: 0.2 },
    fill: 0.78,
  },
] as const;

export const DRINK_BY_ID = Object.fromEntries(
  DRINKS.map((d) => [d.id, d])
) as Record<DrinkId, Drink>;
