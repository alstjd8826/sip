/**
 * 맥주가 아닌 음료의 액체.
 *
 * 원본 데모의 맥주 셰이더에서 갈라져 나왔다 (MIT, © 2026 Blazej Kustra).
 * 맥주는 [[BeerGlass]] 가 원본 그대로 그리고, 여기서는 거품·기포·투명도를
 * 값으로 받아 와인부터 물까지 한 셰이더로 덮는다.
 *
 * 축을 파라미터로 뺀 이유는 단순하다. 음료마다 셰이더를 복제하면 열 벌을 열 번
 * 손보게 되고, 결국 하나만 손질되고 나머지는 방치된다.
 *
 * `u.live`  = (수면 각도 rad, 화면상 수위 0~1, 출렁임 0~1, 붓는 세기 0~1)
 * `u.liveData[0].x` = 적분된 기포 위상
 * `u.params0` = (거품 두께, 탄산, 불투명도, 점도)
 */
import { useMemo } from 'react';
import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

import type { Drink } from '@/drinks/catalog';

type Props = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'colors' | 'params'
> & {
  drink: Drink;
  paramsSynchronizable: ParamsSynchronizable;
};

export default function DrinkGlass({ drink, ...rest }: Props) {
  const colors = useMemo<ColorInput[]>(
    () => [drink.liquid, drink.head],
    [drink.liquid, drink.head]
  );
  const params = useMemo(
    () => [
      drink.body.head,
      drink.body.fizz,
      drink.body.opacity,
      drink.body.thickness,
      0,
      0,
      0,
      0,
    ],
    [drink.body.head, drink.body.fizz, drink.body.opacity, drink.body.thickness]
  );

  return (
    <ShaderView
      fragmentShader={LIQUID_SHADER}
      colors={colors}
      params={params}
      {...rest}
    />
  );
}

const LIQUID_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// ── 원본에서 가져온 기포·물방울 ────────────────────────────────
// blazejkustra/react-native-effects (MIT, (c) 2026 Blazej Kustra) 의 맥주
// 셰이더에서 그대로 옮겼다. 맥주와 콜라의 기포·응결이 달라 보이면 같은 잔에
// 담긴 것 같지 않다.
//
// 물방울은 여기 있던 CC BY-NC-SA 파생 코드를 걷어내고 직접 새로 썼다
// (아래 '응결' 구간). 레포 전체를 MIT 로 두기 위해서다.
fn bubbles(p0: vec2<f32>, phase: f32, cells: f32, riseSpeed: f32, seed: f32) -> vec2<f32> {
  let gx = p0.x * cells + seed * 19.7;
  let gy = p0.y * cells - phase * riseSpeed;
  let p = vec2<f32>(gx, gy);
  let cell = floor(p);
  let rnd = hash21(cell);
  let hasB = step(0.45, rnd);
  let rs = fract(rnd * 5.71);
  // Strongly skewed small: mostly pinpricks, the odd larger lens.
  let r = 0.045 + rs * rs * rs * 0.13;
  // Wobble as it rises: bounded sine of phase x a per-cell constant.
  let wob = sin(phase * (1.2 + rnd * 1.6) + rnd * 31.4) * (0.05 + rs * 0.06);
  let ctr = vec2<f32>(0.32 + fract(rnd * 7.31) * 0.36 + wob,
                      0.32 + fract(rnd * 13.7) * 0.36);
  let f = fract(p);
  let rel = f - ctr;
  let d = length(rel);
  // Spherical shell. Interior picks up refracted darkening, strongest in the
  // lower half of the bubble...
  let inside = smoothstep(r, r * 0.92, d);
  let bodyShade = inside * clamp(0.35 - 0.45 * rel.y / max(r, 0.001), 0.0, 1.0);
  // ...a bright rim, strongest up-left where the light hits...
  let rim = smoothstep(r, r * 0.9, d) * smoothstep(r * 0.55, r * 0.8, d);
  let dir = rel / max(d, 0.001);
  let rimLight = rim * (0.55 + 0.45 * dot(dir, vec2<f32>(-0.45, 0.6)));
  // ...a hard specular glint up-left and a soft counter-glint down-right.
  let g1 = length(rel + vec2<f32>(r * 0.38, -r * 0.38));
  let g2 = length(rel - vec2<f32>(r * 0.3, -r * 0.3));
  let glints = smoothstep(r * 0.28, r * 0.05, g1)
             + smoothstep(r * 0.3, 0.0, g2) * 0.35;
  let bright = 0.6 + 0.4 * fract(rnd * 3.17);
  return vec2<f32>(hasB * bodyShade,
                   hasB * bright * (rimLight * 0.9 + glints * 0.9));
}

// ── 응결 (직접 구현) ─────────────────────────────────────────
//
// 차가운 잔의 바깥면에서는 세 가지가 동시에 일어난다:
//   1. 미세한 구슬이 유리 전체에 촘촘히 맺힌다
//   2. 그중 몇이 커져 무게를 못 이기고 흘러내린다
//   3. 흘러내린 자리는 유리가 닦여 맑아졌다가 다시 서린다
//
// 방울은 중력을 따라 흐르므로 화면이 아니라 **회전 좌표계**에서 계산한다.
// 폰을 기울이면 방울도 같이 방향을 튼다 — 화면 기준으로 곧게 떨어뜨리면
// 잔을 눕혔을 때 방울이 옆으로 기어가는 꼴이 된다.

/** 구면 방울 하나. 반환 (덮개, 법선.x, 법선.y). */
fn beadAt(rel: vec2<f32>, r: f32) -> vec3<f32> {
  let rr = max(r, 0.0001);
  let d = length(rel);
  let m = smoothstep(rr, rr * 0.62, d);
  // 가장자리로 갈수록 법선이 눕는다. 이 기울기가 굴절과 하이라이트를 만든다.
  let k = clamp(d / rr, 0.0, 1.0);
  let n = rel / rr;
  return vec3<f32>(m, n.x * k, n.y * k);
}

/** 미세 응결 한 층. */
fn frostLayer(p: vec2<f32>, cells: f32, seed: f32, t: f32) -> vec3<f32> {
  let q = p * cells + vec2<f32>(seed * 13.1, seed * 7.7);
  let cell = floor(q);
  let h = hash21(cell + seed * 31.0);
  let keep = step(0.40, h);
  // 크기는 작은 쪽으로 치우친다. 큰 구슬은 드물다.
  let sz = fract(h * 5.71);
  // 아주 느리게 자랐다 줄었다 한다. 깜빡이면 비 내리는 창문이 된다.
  let breathe = 0.90 + 0.10 * sin(t * 0.45 + h * 41.0);
  let r = (0.13 + sz * sz * 0.26) * breathe;
  let ctr = vec2<f32>(0.5)
          + (vec2<f32>(fract(h * 3.71), fract(h * 9.13)) - 0.5) * 0.46;
  let b = beadAt(fract(q) - ctr, r);
  return b * keep;
}

/**
 * 흘러내리는 방울 한 벌.
 *
 * 반환 (방울, 닦인 자국, 법선.x, 법선.y).
 * 열의 일부에만 생긴다 — 땀 흘리는 잔이지 폭우 맞는 창문이 아니다.
 */
fn runnerLayer(p: vec2<f32>, t: f32, cols: f32, seed: f32, rate: f32) -> vec4<f32> {
  let cx = p.x * cols + seed * 3.3;
  let ci = floor(cx);
  let h = hash21(vec2<f32>(ci, seed * 57.0));
  // 이름을 hasRun 으로 둔다. active 는 WGSL 예약어라 변수명으로 쓰면
  // 셰이더 전체가 컴파일되지 않는다.
  let hasRun = step(0.58, fract(h * 91.7));

  let speed = rate * (0.6 + fract(h * 13.3) * 0.8);
  let cyc = fract(t * speed + h);
  // 중력 방향(+y)으로 흐른다. 화면 밖에서 시작해 밖으로 나간다.
  let dropY = (-0.75 + cyc * 1.7) * cols;
  let qy = p.y * cols;
  let dy = qy - dropY;

  // 사행. 유리 위를 곧게 흐르지 않는다.
  let wig = sin(p.y * 8.0 + h * 37.0) * 0.09 + sin(p.y * 23.0 + h) * 0.03;
  let dx = fract(cx) - 0.5 - wig;

  // 반지름은 열 폭(±0.5)보다 넉넉히 작아야 한다. 크게 두면 방울이 열 경계에서
  // 잘려 네모난 얼룩이 된다.
  let r = 0.11 + fract(h * 3.1) * 0.09;
  // 위쪽이 늘어난 물방울 모양. 표면장력이 뒤를 붙잡는다.
  // step 으로 딱 끊으면 dy = 0 에서 모양이 튀어 이음매가 보인다.
  let stretch = 1.0 + 1.1 * smoothstep(0.12, -0.12, dy);
  let b = beadAt(vec2<f32>(dx, dy / stretch), r);

  // 지나온 자리(위쪽)는 닦여 있다가 서서히 다시 서린다.
  let behind = max(-dy, 0.0);
  // 자국은 방울이 **지나온 자리에 남는다**. 예전엔 exp(-behind) 만 써서
  // 방울 위치에서 가장 강했고, 그러면 닦인 영역이 방울에 붙어 다니는 후광이
  // 되어 지나가자마자 다시 서리는 것처럼 보인다.
  //
  // 그래서 방울 바로 뒤에서 시작해(smoothstep) 길게 끌리며 서서히 서린다.
  let wake = smoothstep(0.0, r * 0.9, behind)
           * exp(-behind * 0.30)
           * smoothstep(r * 1.4, r * 0.75, abs(dx));

  return vec4<f32>(b.x * hasRun, wake * hasRun, b.y * hasRun, b.z * hasRun);
}








fn condensation(p: vec2<f32>, t: f32, amount: f32) -> vec4<f32> {
  let f1 = frostLayer(p, 62.0, 1.0, t);
  let f2 = frostLayer(p, 104.0, 2.0, t);
  let r1 = runnerLayer(p, t, 7.0, 1.0, 0.11);
  let r2 = runnerLayer(p, t, 12.0, 2.0, 0.17);
  let drops = clamp(r1.x + r2.x, 0.0, 1.0);
  let wiped = clamp(r1.y + r2.y, 0.0, 1.0);
  let frost = (f1.x * 0.75 + f2.x * 0.55) * (1.0 - wiped * 0.95) * amount;
  // 법선은 **흘러내리는 방울 것만** 내보낸다.
  //
  // 서리 구슬은 픽셀 한두 개 크기라 그 법선을 섞으면 방울 안에서 값이 픽셀
  // 단위로 튀어 딱딱한 세로 막대가 생긴다. 서리 음영은 어차피 법선을 쓰지
  // 않고 뿌옇게 덮기만 한다.
  let nx = r1.z + r2.z;
  let ny = r1.w + r2.w;
  return vec4<f32>(drops * amount, frost, nx, ny);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let res = u.resolution.xy;
  let uv  = fragCoord.xy / res;
  let asp = res.x / res.y;

  let angle   = u.live.x;
  let level   = u.live.y;
  let slosh   = u.live.z;
  let pour    = u.live.w;
  let phase   = u.liveData[0].x;

  let headAmt = u.params0.x;
  let fizz    = u.params0.y;
  let opacity = u.params0.z;
  let thick   = u.params0.w;

  let t = u.time.x;

  // 화면 좌표를 수면 기준으로 돌린다. 액체는 폰과 반대로 돌아 수평을 지킨다.
  //
  // 부호는 원본 맥주 셰이더에 맞춘 것이다. 원본은 회전 대신 기울기
  // tan(angle) 인 직선으로 수면을 긋는데, 여기서 -angle 로 돌리면 그 직선의
  // 기울기가 거울상이 되어 맥주와 반대로 기운다.
  let c = cos(angle);
  let s = sin(angle);
  let p = vec2<f32>((uv.x - 0.5) * asp, uv.y - 0.5);
  let rp = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);

  // 수면 높이. 출렁일수록 파동이 커지고, 점도가 높으면 잔물결이 죽는다.
  let waveAmp = (0.004 + slosh * 0.05) * (1.0 - thick * 0.7);
  let wave =
      sin(rp.x * 9.0 + t * 2.3) * waveAmp
    + sin(rp.x * 21.0 - t * 3.7) * waveAmp * 0.45
    + (fbm(vec2<f32>(rp.x * 6.0, t * 0.7)) - 0.5) * waveAmp * 1.6;

  // level 은 화면 위에서 잰 수위(0=바닥). 회전 좌표계의 y 로 옮긴다.
  let surfaceY = (0.5 - level) + wave;
  // WGSL 의 y 는 화면 아래로 자란다. 수면보다 y 가 **큰** 쪽이 잠긴 쪽이다.
  // 이 부호를 뒤집으면 액체가 천장에 붙는다.
  let depth = rp.y - surfaceY;   // >0 이면 수면 아래

  // 유리 원통. 화면을 잔의 정면이라고 보면, 가장자리로 갈수록 유리를 비스듬히
  // 통과해 어두워지고 그 안쪽에 빛이 한 줄 선다. 이게 없으면 색칠한 사각형이다.
  let ex = abs(uv.x - 0.5) * 2.0;
  let curve = 1.0 - ex * ex * 0.55;                 // 가장자리 감쇠
  let spec = exp(-pow((uv.x - 0.30) * 7.0, 2.0)) * 0.55   // 왼쪽 주 하이라이트
           + exp(-pow((uv.x - 0.74) * 16.0, 2.0)) * 0.22; // 오른쪽 반사
  let rim = smoothstep(0.86, 1.0, ex) * 0.35;       // 잔 벽 두께

  var col = vec3<f32>(0.03, 0.03, 0.035);

  col = col * curve + vec3<f32>(rim * 0.06);

  // ── 액체 ────────────────────────────────────────────────────
  let inLiquid = smoothstep(-0.0015, 0.0015, depth);

  // 기둥 높이로 정규화한 깊이. 절대값으로 재면 위스키처럼 얕은 잔이
  // 바닥까지 밝은 채로 끝난다.
  let column = max(level, 0.08);
  let dn = clamp(depth / column, 0.0, 1.0);

  // 위는 옅고 아래로 갈수록 짙다. 투명할수록 이 폭이 크다.
  // 맑은 음료일수록 위아래 밝기 차가 작다. 차이를 크게 주면 밑색이 눌려
  // 녹차가 갈색으로 보인다.
  let lift = 0.62 + 0.28 * opacity;
  var body = u.color0.rgb * mix(lift, 1.0, dn * (0.5 + 0.5 * opacity));

  // 수면 바로 아래로 들어온 빛. 투명한 음료일수록 멀리 퍼진다.
  //
  // 예전엔 이 항을 (1 - opacity) 에 그대로 비례시켰는데, 물처럼 아주 맑은
  // 음료가 형광등처럼 자체발광했다. 맑다고 밝은 게 아니라 **뒤가 비치는**
  // 것이므로, 세기를 낮추고 색을 흰빛 쪽으로 조금만 민다.
  let through = (1.0 - opacity);
  let lightIn = exp(-dn * (2.0 + opacity * 8.0)) * through * 0.34;
  body = body + mix(u.color0.rgb, vec3<f32>(1.0), 0.35) * lightIn;

  // 바닥에 고이는 짙은 그늘
  body = body * (1.0 - smoothstep(0.72, 1.0, dn) * 0.22 * opacity);

  // 흐르는 결. 점도가 높을수록 크고 느리다.
  let swirl = fbm(rp * (7.0 - thick * 3.5) + vec2<f32>(0.0, -phase * (0.5 - thick * 0.3)));
  body = body * (0.94 + swirl * 0.12);

  // 기포.
  //
  // 세 층을 시차로 겹친다. 한 층만 쓰면 크기가 고르고 평면처럼 보인다.
  // 기포는 빛을 굴절시켜 **어두워지기도** 하고 테두리가 반짝이기도 한다 —
  // 둘 다 있어야 밝은 위쪽에서도 어두운 바닥에서도 보인다.
  if (fizz > 0.01) {
    // +y 가 세상 기준 위가 되도록 뒤집는다. 기포는 늘 수면 쪽으로 오른다.
    let bp = vec2<f32>(rp.x, -rp.y);
    let b1 = bubbles(bp, phase, 11.0, 1.5, 1.0);
    let b2 = bubbles(bp, phase, 18.0, 2.4, 2.0);
    let b3 = bubbles(bp, phase, 28.0, 3.6, 3.0);
    let shade = (b1.x + b2.x * 0.8 + b3.x * 0.6) * fizz;
    let glint = (b1.y + b2.y * 0.8 + b3.y * 0.6) * fizz;
    // 어두운 액체일수록 기포를 **밝게** 올린다. 예전엔 투명도에 묶어놨는데,
    // 콜라처럼 짙은 음료에서 기포가 그대로 묻혀버렸다. 어두울수록 굴절로
    // 어두워지는 몫은 줄이고 반짝이는 몫을 키워야 보인다.
    let lum = dot(u.color0.rgb, vec3<f32>(0.299, 0.587, 0.114));
    body = body * (1.0 - shade * 0.45 * (0.35 + 0.65 * lum));
    body = body + vec3<f32>(glint * (0.26 + 0.50 * (1.0 - lum)));
  }

  // 유리 원통 음영은 액체에도 걸린다 — 같은 잔을 통해 보는 것이므로.
  body = body * curve + mix(u.color0.rgb, vec3<f32>(1.0), 0.25) * spec * (0.14 + through * 0.14) + vec3<f32>(rim * 0.05);

  col = mix(col, body, inLiquid);

  // ── 메니스커스 ───────────────────────────────────────────────
  // 수면은 얇은 밝은 선 하나와 그 아래 옅은 띠를 갖는다.
  let mline = exp(-abs(depth) * 300.0) * (0.40 + slosh * 0.45);
  let mband = exp(-max(depth, 0.0) * 60.0) * 0.10;
  col = col + u.color1.rgb * (mline + mband);

  // ── 거품 머리 ────────────────────────────────────────────────
  if (headAmt > 0.01) {
    let hh = headAmt * 0.085;
    let inHead = smoothstep(0.0, 0.004, depth) * (1.0 - smoothstep(hh * 0.82, hh, depth));
    let cells = fbm(vec2<f32>(rp.x * 40.0, rp.y * 40.0 + phase * 0.2));
    let pores = smoothstep(0.55, 0.85, vnoise(vec2<f32>(rp.x * 90.0, rp.y * 90.0)));
    let foam = u.color1.rgb * (0.84 + cells * 0.22 - pores * 0.10);
    col = mix(col, foam * curve, inHead);
  }

  // ── 붓는 줄기 ────────────────────────────────────────────────
  //
  // 원본 맥주 셰이더와 같은 구조다. 떨어지는 줄기는 **곧고**, 가속하면서
  // 아래로 갈수록 굵어진다 — 좌우로 뱀처럼 흔들리지 않는다. 화면 기준으로
  // 곧게 두는 것도 원본과 같다. 회전 좌표계에 태우면 기울일 때 줄기가 같이
  // 누워서 붓는 것처럼 안 보인다.
  if (pour > 0.001) {
    let cx = (uv.x - 0.5) * asp;
    let streamW = (0.011 + 0.009 * uv.y) * (0.7 + pour * 0.3);
    // 수면 위에서만 보인다.
    let above = 1.0 - smoothstep(-0.01, 0.01, depth);
    let mask = smoothstep(streamW, streamW * 0.3, abs(cx)) * above * pour;
    let tex = 0.7 + 0.5 * vnoise(vec2<f32>(cx * 160.0, uv.y * 8.0 - t * 14.0));
    // 줄기는 액체보다 밝다. 얇게 흐르면 빛이 통과하기 때문이다.
    let core = mix(u.color1.rgb, vec3<f32>(1.0), 0.3);
    col = mix(col, core * tex, mask * 0.85);

    // 떨어진 자리에서 튀는 빛.
    let spd = length(vec2<f32>(cx * 1.6, depth));
    let churn = 0.6 + 0.8 * vnoise(vec2<f32>(cx * 60.0, t * 12.0));
    col = col + mix(u.color1.rgb, vec3<f32>(1.0), 0.45)
              * exp(-spd * spd * 300.0) * pour * churn * 0.5;
  }

  // ── 유리에 맺힌 물방울 ──────────────────────────────────────
  //
  // **맨 마지막**에 얹는다. 응결은 잔의 바깥면에 맺히므로 액체 앞을 덮는다.
  // 액체를 합성하기 전에 얹었더니 빈 공간에만 남아서, 물방울이 음료가 없는
  // 쪽에만 맺힌 것처럼 보였다.
  //
  // 계산은 회전 좌표계에서 한다. 방울은 중력을 따라 흐르므로 폰을 기울이면
  // 흐르는 방향도 같이 틀어야 한다.
  let sweat = 0.35 + 0.65 * fizz;
  let cd = condensation(rp, t, sweat);

  // **수면 아래에서만** 맺힌다. 유리는 차가운 액체가 닿아 있는 쪽에서 땀을
  // 흘리고, 그 위쪽 유리는 따뜻해서 마른 채로 있다. 실제 잔에도 응결선이
  // 액체 높이에 그어진다.
  let wet = smoothstep(-0.012, 0.006, depth);
  let dropM = cd.x * wet;
  let frostM = cd.y * wet;
  // 층을 여러 개 더한 값이라 그대로 쓰면 1을 넘는다. 렌즈 계수가 음수로
  // 내려가면 색이 음수가 되어 화면이 검게 뭉갠다.
  let n = clamp(vec2<f32>(cd.z, cd.w), vec2<f32>(-1.0), vec2<f32>(1.0));

  // 서리는 유리를 뿌옇게 만든다 — 뒤가 옅게 비친다.
  col = mix(col, mix(col, vec3<f32>(0.75), 0.35), frostM * 0.55);

  // 방울은 렌즈다. 어두운 음료 위에서 물방울은 **더 어둡게** 보이고,
  // 가장자리에서 빛이 꺾여 초승달처럼 한쪽만 빛난다. 가운데를 밝히면
  // 유리에 맺힌 물이 아니라 뿌연 얼룩이 된다.
  let edge = clamp(length(n), 0.0, 1.0);
  var dcol = col * (1.0 - edge * 0.30);
  let lit = clamp(dot(n, vec2<f32>(-0.6, -0.8)), 0.0, 1.0);
  dcol = dcol + vec3<f32>(1.0, 0.98, 0.94)
              * smoothstep(0.45, 1.0, lit) * edge * 0.45;

  col = mix(col, dcol, dropM);

  return vec4<f32>(max(col, vec3<f32>(0.0)), 1.0);
}
`;
