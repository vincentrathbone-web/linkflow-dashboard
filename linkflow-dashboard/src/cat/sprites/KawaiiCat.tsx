import type { CatExpression, CatSpriteProps } from '../catEngine';

/**
 * Rounder "kawaii" cartoon cat, grey & white.
 *
 * Definition comes from a 6-tone grey ramp plus a consistent outline stroke,
 * so the white paws read clearly against the white belly instead of melting
 * into it.
 *
 * Two poses share one head: the standing/walking pose, and a clambering pose
 * used while climbing a card — body angled up the face with the front paws
 * stretched overhead, rather than the whole sprite just sliding upward.
 */
const OUTLINE = '#6f747d';
const GREY_LIGHT = '#c3c8cf';
const GREY = '#a9adb4';
const GREY_DARK = '#8a8f98';
const WHITE = '#fbfcfd';
const WHITE_SHADE = '#dfe3e9';
const EAR_PINK = '#f2b9c6';
const NOSE_PINK = '#e8899e';
const MOUTH_DARK = '#5b4a52';
const TONGUE = '#f2879c';
const EYE = '#22252b';

const STROKE = 1.1;

/** The head is identical in both poses, so it lives in one place. */
function Head({ className, expression }: { className: string; expression: CatExpression }) {
  return (
    <g className={className} style={{ transformOrigin: '17px 19px' }}>
      <path d="M8 3.5 L14.5 15.5 L4.5 14.5 Z" fill={GREY} stroke={OUTLINE} strokeWidth={STROKE} strokeLinejoin="round" />
      <path d="M9.4 8.6 L12.6 14.6 L7.2 14 Z" fill={EAR_PINK} />
      <path d="M26 3.5 L29.5 14.5 L19.5 15.5 Z" fill={GREY} stroke={OUTLINE} strokeWidth={STROKE} strokeLinejoin="round" />
      <path d="M24.8 8.6 L26.8 14 L21.4 14.6 Z" fill={EAR_PINK} />

      <circle cx="17" cy="19" r="13" fill={GREY} stroke={OUTLINE} strokeWidth={STROKE} />
      <ellipse cx="15" cy="12" rx="8" ry="3.4" fill={GREY_LIGHT} opacity="0.8" />
      <ellipse cx="17" cy="24" rx="9.5" ry="7" fill={WHITE} stroke={OUTLINE} strokeWidth={STROKE} opacity="0.98" />

      {/* eyes — both in one group so they blink together */}
      {expression === 'smile' ? (
        <>
          <path d="M7.6 19 Q11 15.4 14.4 19" stroke={EYE} strokeWidth="2.1" fill="none" strokeLinecap="round" />
          <path d="M19.6 19 Q23 15.4 26.4 19" stroke={EYE} strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </>
      ) : expression === 'yawn' ? (
        <>
          <path d="M8 18.4 Q11 21 14 18.4" stroke={EYE} strokeWidth="2.1" fill="none" strokeLinecap="round" />
          <path d="M20 18.4 Q23 21 26 18.4" stroke={EYE} strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <g className="cat-anim-blink">
          <circle cx="11" cy="18" r="3.1" fill={EYE} />
          <circle cx="12.1" cy="16.9" r="1" fill="#fff" />
          <circle cx="23" cy="18" r="3.1" fill={EYE} />
          <circle cx="24.1" cy="16.9" r="1" fill="#fff" />
        </g>
      )}

      <path d="M14.8 23 L19.2 23 L17 25.6 Z" fill={NOSE_PINK} stroke={OUTLINE} strokeWidth="0.8" strokeLinejoin="round" />

      {expression === 'yawn' ? (
        <>
          <ellipse cx="17" cy="28.4" rx="3.6" ry="3.9" fill={MOUTH_DARK} stroke={OUTLINE} strokeWidth="0.8" />
          <ellipse cx="17" cy="30.2" rx="2.2" ry="1.8" fill={TONGUE} />
        </>
      ) : expression === 'smile' ? (
        <path d="M12.6 26.4 Q17 31 21.4 26.4" stroke={MOUTH_DARK} strokeWidth="1.3" strokeLinecap="round" fill="none" />
      ) : (
        <>
          <path d="M17 25.6 Q17 27.8 14.2 28.3" stroke={MOUTH_DARK} strokeWidth="1.15" strokeLinecap="round" fill="none" />
          <path d="M17 25.6 Q17 27.8 19.8 28.3" stroke={MOUTH_DARK} strokeWidth="1.15" strokeLinecap="round" fill="none" />
        </>
      )}

      <path d="M8 24 L2.5 22.6" stroke={GREY_DARK} strokeWidth="0.85" strokeLinecap="round" />
      <path d="M8 26 L2.8 26.4" stroke={GREY_DARK} strokeWidth="0.85" strokeLinecap="round" />
      <path d="M26 24 L31.5 22.6" stroke={GREY_DARK} strokeWidth="0.85" strokeLinecap="round" />
      <path d="M26 26 L31.2 26.4" stroke={GREY_DARK} strokeWidth="0.85" strokeLinecap="round" />
    </g>
  );
}

/** A stretched limb: a round-capped shaft with a paw on the end. */
function Limb({
  from,
  to,
  far,
  width = 5.4,
}: {
  from: [number, number];
  to: [number, number];
  far?: boolean;
  width?: number;
}) {
  const d = `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`;
  return (
    <>
      <path d={d} stroke={OUTLINE} strokeWidth={width + 2 * STROKE} strokeLinecap="round" />
      <path d={d} stroke={far ? GREY_DARK : GREY} strokeWidth={width} strokeLinecap="round" />
      <ellipse
        cx={to[0]}
        cy={to[1]}
        rx={far ? 2.8 : 3}
        ry={far ? 2.2 : 2.4}
        fill={far ? WHITE_SHADE : WHITE}
        stroke={OUTLINE}
        strokeWidth={STROKE}
      />
    </>
  );
}

export function KawaiiCat({ activity, expression, isDragging }: CatSpriteProps) {
  const isClimbing = activity === 'climbing' || activity === 'descending';
  const isMoving = activity === 'walking' || activity === 'perchWalking';
  const headClass = isMoving ? 'cat-anim-head-bob' : activity === 'grooming' ? 'cat-anim-groom' : '';

  if (isClimbing) {
    // Clambering up the face of a card: body pitched ~85° (nearly upright,
    // hugging the wall) rather than the shallow ~50° lean this used to have
    // -- that shallow angle left the pose's local bounding box spanning
    // roughly local-x 4-72 out of the sprite's 0-78 box, i.e. it straddled
    // both halves of the div almost edge to edge. Since the div is centered
    // on `state.x` (which HARD RULE now pins to the perch's true edge, see
    // catEngine.ts), anything wider than the local left half (x<=39) was
    // guaranteed to render on top of the card itself rather than stopping
    // at its border. The `translate(-30 0)` shifts the rotated group so its
    // measured bbox (verified via getBBox: x -1.7 to 38.3) sits just inside
    // that left half, with paws landing right at the x=39 edge -- touching
    // the card, never crossing into it.
    return (
      // Taller viewBox with a negative origin: an ~85°-pitched cat needs
      // room above the walking sprite's box for the overhead reach. The
      // negative margin keeps the sprite's baseline aligned with the
      // walking pose so perch maths stay identical.
      <svg
        width="78"
        height="96"
        viewBox="0 -26 78 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginTop: -26 }}
      >
        {/* Reflects the ALREADY-rotated pose around its own bbox midpoint
            (measured bbox -1.7 to 38.3 -> midpoint 18.3, so reflect about
            36.6-x). This is a mirror of the *final* rendered coordinates,
            not the pre-rotation local ones -- mirroring pre-rotation
            interacts with the ~85° rotate() in a way that reads as an
            unwanted vertical flip (tried it, looked upside down). Doing it
            here instead just swaps which end (paw vs tail) is nearer the
            open edge while leaving the overall "head near top, tail near
            bottom" silhouette alone, and since a bbox reflected about its
            own midpoint maps exactly onto itself, this can't reintroduce
            the card-overlap this pose was originally tuned to avoid. Fixes
            the paws-vs-tail-nearest-the-wall bug: verified live via
            getBoundingClientRect that the tail was consistently closer to
            the card than the paw pads before this, regardless of
            facingForPerchSide's mapping -- see HANDOVER.md. The +3 on top
            of the 36.6 reflection point nudges the whole reflected pose 3px
            closer to the wall, tightening the paw-to-wall gap per visual
            review. */}
        <g transform="translate(39.6 0) scale(-1 1)">
        <g transform="translate(-30 0) rotate(85 39 30)">
          {/* tail trails below the body — S-bend, matching the standing pose */}
          <path
            className="cat-anim-tail-subtle"
            d="M62 30 C 68 33, 74 29, 71 22 C 68 16, 63 15, 66 9"
            stroke={OUTLINE}
            strokeWidth="4.4"
            strokeLinecap="round"
            fill="none"
            style={{ transformOrigin: '62px 30px' }}
          />
          <path
            className="cat-anim-tail-subtle"
            d="M62 30 C 68 33, 74 29, 71 22 C 68 16, 63 15, 66 9"
            stroke={GREY_DARK}
            strokeWidth="2.8"
            strokeLinecap="round"
            style={{ transformOrigin: '62px 30px' }}
          />

          {/* far-side limbs, behind the body. The upper paw clears the skull
              by just ~0.4 units, so its shaft hides but the paw still shows.
              Direction matches the near paw's (from [31,31] to [6,29], i.e.
              roughly (-25,-2)) rather than its own original steep diagonal
              (-24,-13) -- the two front paws should reach up in parallel,
              not splay apart, even though this one is mostly hidden behind
              the head. */}
          <g className="cat-anim-climb-reach-b">
            <Limb from={[29, 26]} to={[2, 24]} far />
          </g>
          <g className="cat-anim-climb-push-a">
            <Limb from={[57, 29]} to={[64, 33]} far width={5} />
          </g>

          {/* body */}
          <ellipse cx="46" cy="27" rx="21" ry="10.5" fill={GREY} stroke={OUTLINE} strokeWidth={STROKE} />
          <ellipse cx="44" cy="22" rx="14" ry="4" fill={GREY_LIGHT} opacity="0.75" />
          <path d="M32 29 Q46 39 60 29 Q46 35.5 32 29 Z" fill={WHITE} />
          <path d="M33 29.4 Q46 38 59 29.4" stroke={OUTLINE} strokeWidth={STROKE} fill="none" opacity="0.9" />

          {/* near rear leg braces against the wall */}
          <g className="cat-anim-climb-push-b">
            <Limb from={[56, 31]} to={[62, 34]} width={5} />
          </g>

          <Head className="" expression={expression} />

          {/* near front paw grips just below the far one — kept clear of the
              muzzle so it never covers the face — and sits on top so it reads
              as the closest limb */}
          <g className="cat-anim-climb-reach-a">
            <Limb from={[31, 31]} to={[6, 29]} />
          </g>
        </g>
        </g>
      </svg>
    );
  }

  const bodyClass = isMoving ? 'cat-anim-walk' : '';
  const legFrontClass = activity === 'nudging' ? 'cat-anim-nudge-paw' : isMoving ? 'cat-anim-leg-a' : '';
  // Diagonal gait: near-front pairs with far-back, far-front with near-back.
  // Far legs get their own gentler cycle — see the note in index.css.
  const legPhaseB = isMoving ? 'cat-anim-leg-b' : '';
  const farLegPhaseA = isMoving ? 'cat-anim-far-leg-a' : '';
  const farLegPhaseB = isMoving ? 'cat-anim-far-leg-b' : '';

  /** Legs further from the viewer: darker fur + shaded paws. */
  const farLeg = (x: number, cx: number) => (
    <>
      <rect x={x + 1} y="31" width="5" height="10" rx="2.5" fill={GREY_DARK} stroke={OUTLINE} strokeWidth={STROKE} />
      <ellipse cx={cx} cy="42.4" rx="2.8" ry="2.2" fill={WHITE_SHADE} stroke={OUTLINE} strokeWidth={STROKE} />
    </>
  );

  const nearLeg = (x: number, cx: number) => (
    <>
      <rect x={x + 1} y="31" width="5" height="10" rx="2.5" fill={GREY} stroke={OUTLINE} strokeWidth={STROKE} />
      <ellipse cx={cx} cy="42.4" rx="3" ry="2.4" fill={WHITE} stroke={OUTLINE} strokeWidth={STROKE} />
    </>
  );

  return (
    // Extra headroom above the normal 0-52 box (matching how the climbing
    // pose gets its own headroom) so the scruff pinch has somewhere to go
    // when lifted -- without it, the peak tops out level with the ear tips
    // (y≈3.5) and just reads as part of the roofline instead of a distinct
    // raised fold. The negative margin keeps every other pose's baseline
    // exactly where it was; nothing but the lifted pinch ever draws above
    // y=0.
    <svg width="78" height="68" viewBox="0 -16 78 68" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginTop: -16 }}>
      {/* tail — S-bend (two opposing curves), barely animated on purpose */}
      <path
        className="cat-anim-tail-subtle"
        d="M62 30 C 70 34, 77 28, 73 20 C 70 13, 64 11, 68 4"
        stroke={OUTLINE}
        strokeWidth="4.4"
        strokeLinecap="round"
        fill="none"
        style={{ transformOrigin: '62px 30px' }}
      />
      <path
        className="cat-anim-tail-subtle"
        d="M62 30 C 70 34, 77 28, 73 20 C 70 13, 64 11, 68 4"
        stroke={GREY_DARK}
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
        style={{ transformOrigin: '62px 30px' }}
      />
      {/* white tail tip */}
      <circle cx="68" cy="4.5" r="1.9" fill={WHITE} stroke={OUTLINE} strokeWidth="0.9" />

      {/* far-side legs — drawn before the body so it occludes them.
          Both far legs sit to the LEFT of their near-side partner so the
          perspective stays consistent front-to-back. */}
      <g className={farLegPhaseB} style={{ transformOrigin: '30px 40px' }}>{farLeg(26, 30)}</g>
      <g className={farLegPhaseA} style={{ transformOrigin: '54px 40px' }}>{farLeg(50, 54)}</g>

      {/* body */}
      <g className={bodyClass} style={{ transformOrigin: '46px 27px' }}>
        <ellipse cx="46" cy="27" rx="21" ry="10.5" fill={GREY} stroke={OUTLINE} strokeWidth={STROKE} />
        {/* back highlight */}
        <ellipse cx="44" cy="22" rx="14" ry="4" fill={GREY_LIGHT} opacity="0.75" />
        {/* white belly, kept clear of the paws so they stay readable */}
        <path d="M32 29 Q46 39 60 29 Q46 35.5 32 29 Z" fill={WHITE} />
        <path d="M33 29.4 Q46 38 59 29.4" stroke={OUTLINE} strokeWidth={STROKE} fill="none" opacity="0.9" />
      </g>

      {/* near-side legs — drawn after the body so they sit in front */}
      <g className={legFrontClass} style={{ transformOrigin: '38px 40px' }}>{nearLeg(34, 38)}</g>
      <g className={legPhaseB} style={{ transformOrigin: '62px 40px' }}>{nearLeg(58, 62)}</g>

      <Head className={headClass} expression={expression} />

      {/* Scruff pinch: a fold of skin at the nape that lifts when the cat
          is picked up by hand, the way a real cat's loose neck skin
          bunches up when grabbed there. Anchored past the ear (33-47) on
          the shoulder/neck part of the back curve -- tried it overlapping
          the ear tip first and at that spot the same-colour fill just read
          as a third ear rather than a separate fold, even lifted. Only the
          peak point actually moves — the rest-state geometry sits flush
          against the natural back curve (same two anchor points, barely-
          raised peak) so there's no visible seam when not dragging. The
          CSS `transition` on `d` interpolates that single point smoothly;
          both path strings use the same M/Q/Q/Z command structure so the
          browser can tween between them rather than snapping. */}
      <path
        d={
          isDragging
            ? 'M33 19 Q36 4 40 2 Q44 4 47 16 Q40 12 33 19 Z'
            : 'M33 19 Q36 18.5 40 18 Q44 18.5 47 16 Q40 20.5 33 19 Z'
        }
        fill={GREY_LIGHT}
        stroke={OUTLINE}
        strokeWidth={STROKE}
        style={{ transition: 'd 220ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
      <path
        d={isDragging ? 'M35 16 Q37 6 40 4 Q43 6 45 14' : 'M35 19 Q37 18.7 40 18.5 Q43 18.7 45 16.5'}
        stroke={GREY_DARK}
        strokeWidth="0.9"
        fill="none"
        opacity="0.7"
        style={{ transition: 'd 220ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
    </svg>
  );
}
