/**
 * Pure state-machine logic for the cat companion, kept separate from React
 * so the animation math is easy to reason about and test in isolation.
 *
 * Positioning model: the cat lives inside a full-viewport container. `x` is
 * pixels from the container's left edge; `y` is pixels from the container's
 * BOTTOM edge (0 = standing on the floor). Perch targets are DOM elements
 * (section cards) the cat can climb onto and sit on top of.
 */

export type CatActivity =
  | 'walking'
  | 'sitting'
  | 'grooming'
  | 'climbing'
  | 'perchWalking'
  | 'perched'
  | 'descending'
  | 'nudging';

/**
 * Facial expression, deliberately independent of `CatActivity` — the cat can
 * smile or yawn while doing anything, so this is driven by its own timer
 * rather than being folded into the movement state machine.
 */
export type CatExpression = 'neutral' | 'smile' | 'yawn';

export interface CatSpriteProps {
  activity: CatActivity;
  facing: 1 | -1;
  expression: CatExpression;
  /**
   * True while the user is dragging the cat by hand (see Cat.tsx). Drives
   * KawaiiCat's scruff-pinch detail — the raised fold of skin at the nape
   * that appears only while picked up.
   */
  isDragging?: boolean;
}

export interface PerchTarget {
  id: string;
  /** left/top/width/height in the same coordinate space as the cat container. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CatState {
  x: number;
  y: number;
  facing: 1 | -1;
  activity: CatActivity;
  /** ms remaining before the current stationary activity ends. */
  timer: number;
  walkTargetX: number | null;
  perchTargetId: string | null;
  /** which edge of the perch target the cat is climbing/perched on. */
  perchSide: 'left' | 'right' | null;
  /** set while strolling a card's top surface toward the edge it will climb down. */
  descendOnArrival: boolean;
}

const WALK_SPEED = 55; // px/s
const CLIMB_SPEED = 42; // px/s — slower than walking; hauling yourself up is work
/** Matches the sprite's intrinsic SVG box so perch maths line up with the art. */
const CAT_WIDTH = 78;
const CAT_HEIGHT = 52;
/**
 * The paws don't sit on the sprite's bottom edge — there's ~7 units of empty
 * SVG below them. Cat.tsx offsets by this so `y` means "where the paws are",
 * which is what every perch calculation below assumes.
 */
const PAW_OFFSET = 6.7;
/** Keeps the cat from strolling right off the corner of a card. */
const PERCH_EDGE_INSET = 12;
/**
 * Where a hand would actually grip the cat: the scruff, at the back of the
 * neck. Dragging anchors the pointer here instead of at the sprite's
 * geometric center, so the body visibly hangs below/behind the cursor
 * rather than the whole cat just being centered on it -- the same offset
 * KawaiiCat's pinch-fold detail is drawn around, so the two line up.
 */
const SCRUFF_POINT = { x: 40, y: 14 };

/** Height (from the viewport bottom) of a card's top surface. */
function perchSurfaceY(perch: PerchTarget): number {
  return window.innerHeight - perch.top;
}

/**
 * HARD RULE: the cat's head always points the way it's moving — it never
 * walks backwards.
 *
 * The sprite's un-flipped artwork faces LEFT (head drawn at low x, tail at
 * high x), so the CSS flip flag (`facing`, applied as scaleX(facing) in
 * Cat.tsx) is the *inverse* of the direction of travel: moving right needs a
 * flip (facing -1) to turn the head rightward; moving left needs no flip
 * (facing 1, the natural orientation). This is the one place that mapping is
 * defined — every direction decision must route through it rather than
 * re-deriving the sign locally, which is exactly how this went wrong before
 * (movement and the CSS flip were computed from the same ternary as if they
 * were the same value, when for a left-facing sprite they're opposite).
 */
function facingForDirection(movingRight: boolean): 1 | -1 {
  return movingRight ? -1 : 1;
}

/** The actual +1/-1 step multiplier for a given facing value (its inverse). */
function stepDirection(facing: 1 | -1): 1 | -1 {
  return facing === -1 ? 1 : -1;
}

/**
 * HARD RULE: while scaling a perch's vertical edge (climbing up or coming
 * back down), the cat's paws must press against that edge — it can never
 * climb with its back to the surface. The wall IS the card's true corner
 * (see wallX below), so face left when scaling the left edge (wall on the
 * left), face right when scaling the right edge (wall on the right). This
 * must be derived from `perchSide` alone, never from the direction the cat
 * happened to be walking when it arrived — that varies with where it
 * started from and previously left the cat climbing back-first about half
 * the time.
 *
 * NOTE: this mapping is what keeps the climbing pose's bounding box on the
 * correct (outside-the-card) side of the wall -- see the "no overlap" rule
 * on wallX below and the getBBox tuning in KawaiiCat.tsx's climbing
 * branch, both done against *this* mapping. Flipping this function instead
 * of fixing the pose geometry looked like it fixed the reported
 * paws-vs-back-to-the-wall bug, but it actually didn't: mirroring the
 * whole (already internally backwards) pose just moves which side of the
 * wall it sits on -- the tail stayed measurably closer to the wall than
 * the paw pads either way (verified live via getBoundingClientRect on both
 * mappings). The real defect is that the pose's own local geometry has the
 * tail nearer the rotation pivot than the paws; see KawaiiCat.tsx.
 */
function facingForPerchSide(side: 'left' | 'right'): 1 | -1 {
  return facingForDirection(side === 'right');
}

/**
 * HARD RULE: the cat's rendered sprite must never overlap the card it's
 * climbing — only the outside of a perch is space the cat can occupy. That
 * means the climb/descend x has to sit exactly at the card's true corner,
 * not inset into it (an earlier version inset by a few px "so the paws
 * read as gripping the edge", which instead let the sprite render on top
 * of the card — see KawaiiCat.tsx's climbing pose for how the art itself
 * stays clear of the boundary). Recomputed fresh every frame, the same way
 * `y` already re-derives from the perch, so it stays correct if the card
 * reflows under the cat.
 */
function wallX(perch: PerchTarget, side: 'left' | 'right'): number {
  return side === 'right' ? perch.left + perch.width : perch.left;
}

export function createInitialCatState(containerWidth: number): CatState {
  return {
    x: containerWidth / 2,
    y: 0,
    facing: 1,
    activity: 'walking',
    timer: 0,
    walkTargetX: pickWanderTarget(containerWidth),
    perchTargetId: null,
    perchSide: null,
    descendOnArrival: false,
  };
}

function pickWanderTarget(containerWidth: number): number {
  const margin = CAT_WIDTH;
  return margin + Math.random() * Math.max(1, containerWidth - margin * 2);
}

/** Somewhere else along this card's top surface, biased away from where we are. */
function pickPerchWalkTarget(perch: PerchTarget, currentX: number): number {
  const min = perch.left + PERCH_EDGE_INSET;
  const max = perch.left + perch.width - PERCH_EDGE_INSET;
  if (max <= min) return perch.left + perch.width / 2;
  for (let i = 0; i < 6; i++) {
    const candidate = min + Math.random() * (max - min);
    if (Math.abs(candidate - currentX) > 45) return candidate;
  }
  return min + Math.random() * (max - min);
}

/**
 * HARD RULE for drag-and-drop placement: only a container's TOP counts as a
 * placeable surface, and dropping must resolve to the NEAREST such surface
 * at or below the release point — the cat can only come to rest on
 * something it would actually land on, never lower, and it can't skip past
 * a nearer surface to reach a farther one. Concretely: among perches whose
 * horizontal span contains the drop point, discard any whose top is above
 * the cursor (that surface has already been "fallen past"), then take the
 * one with the smallest remaining top (the first surface reached going
 * downward from the release point). If none qualify, the cat lands on the
 * floor instead.
 *
 * This is what makes releasing inside card A's body land on B rather than
 * A when A, B, C are stacked vertically: being inside A puts the cursor
 * below A's own top surface, so A no longer qualifies and the search falls
 * through to the next card down. Releasing in the open space above A still
 * lands on A, since A's top is the nearest qualifying surface below the
 * cursor there.
 */
export function resolveDrop(
  prev: CatState,
  dropClientX: number,
  dropClientY: number,
  containerWidth: number,
  perches: PerchTarget[],
): CatState {
  let landing: PerchTarget | null = null;
  for (const p of perches) {
    if (dropClientX < p.left || dropClientX > p.left + p.width) continue;
    if (p.top < dropClientY) continue; // surface is above the cursor -- already fallen past it
    if (!landing || p.top < landing.top) landing = p;
  }

  if (!landing) {
    const margin = CAT_WIDTH / 2;
    const x = Math.min(Math.max(dropClientX, margin), Math.max(margin, containerWidth - margin));
    return {
      ...prev,
      x,
      y: 0,
      activity: 'walking',
      walkTargetX: null,
      perchTargetId: null,
      perchSide: null,
      descendOnArrival: false,
      timer: 0,
    };
  }

  const min = landing.left + PERCH_EDGE_INSET;
  const max = landing.left + landing.width - PERCH_EDGE_INSET;
  const x = max <= min ? landing.left + landing.width / 2 : Math.min(Math.max(dropClientX, min), max);
  const perchSide: 'left' | 'right' = x < landing.left + landing.width / 2 ? 'left' : 'right';

  return {
    ...prev,
    x,
    y: perchSurfaceY(landing),
    activity: 'perchWalking',
    walkTargetX: null,
    perchTargetId: landing.id,
    perchSide,
    descendOnArrival: false,
    timer: 0,
  };
}

/**
 * Standing still, doing nothing much, is the common case — a cat that's
 * always mid-errand reads as restless/robotic rather than alive. Weighted
 * well above the movement options below, and held for longer than a walk
 * between two nearby points would take.
 */
function randomPauseMs(): number {
  return 2500 + Math.random() * 5500; // 2.5s - 8s
}

/**
 * Choose what the cat does next once it's idle on the floor: wander to a new
 * spot, sit and groom, climb a nearby perch target, or nudge one from below.
 * Standing still is deliberately the largest single bucket — see randomPauseMs.
 */
function decideNextFloorActivity(
  state: CatState,
  containerWidth: number,
  perches: PerchTarget[],
): CatState {
  const roll = Math.random();

  // Horizontal closeness alone isn't enough: `perch.top` is a viewport-
  // relative rect that's only meaningful for cards actually on screen. A
  // card scrolled below the fold can have `top` far greater than
  // innerHeight, which fed straight into perchSurfaceY() and sent the cat
  // climbing toward a wildly negative or oversized target. Require the
  // card to be at least partially visible before it's a climb candidate.
  const nearbyPerch = perches.find(
    (p) =>
      Math.abs(p.left + p.width / 2 - state.x) < 260 &&
      p.top < window.innerHeight &&
      p.top + p.height > 0,
  );

  if (nearbyPerch && roll < 0.18) {
    const side: 'left' | 'right' = state.x < nearbyPerch.left + nearbyPerch.width / 2 ? 'left' : 'right';
    const edgeX = wallX(nearbyPerch, side);
    return {
      ...state,
      activity: 'walking',
      walkTargetX: edgeX,
      perchTargetId: nearbyPerch.id,
      perchSide: side,
    };
  }

  if (nearbyPerch && roll < 0.28) {
    return { ...state, activity: 'nudging', timer: 900, perchTargetId: nearbyPerch.id };
  }

  if (roll < 0.48) {
    return {
      ...state,
      activity: 'walking',
      walkTargetX: pickWanderTarget(containerWidth),
      perchTargetId: null,
      perchSide: null,
    };
  }

  // The remaining 52% of decisions (roughly double the old share) hold
  // still — mostly sitting, occasionally grooming — for the longer duration
  // above, so the cat spends a clear majority of its time not moving.
  return {
    ...state,
    activity: roll < 0.85 ? 'sitting' : 'grooming',
    timer: randomPauseMs(),
  };
}

export function stepCat(
  state: CatState,
  dtMs: number,
  containerWidth: number,
  perches: PerchTarget[],
): CatState {
  const dt = dtMs / 1000;

  switch (state.activity) {
    case 'walking': {
      if (state.walkTargetX === null) {
        return decideNextFloorActivity(state, containerWidth, perches);
      }
      const dx = state.walkTargetX - state.x;
      const facing: 1 | -1 = dx === 0 ? state.facing : facingForDirection(dx > 0);
      const step = WALK_SPEED * dt;
      if (Math.abs(dx) <= step) {
        const arrived = { ...state, x: state.walkTargetX, facing, walkTargetX: null };
        // Arrived at a perch target's base — start climbing instead of
        // re-rolling floor behaviour.
        if (arrived.perchTargetId) {
          const perch = perches.find((p) => p.id === arrived.perchTargetId);
          if (perch) {
            return {
              ...arrived,
              activity: 'climbing',
              facing: arrived.perchSide ? facingForPerchSide(arrived.perchSide) : arrived.facing,
            };
          }
        }
        return decideNextFloorActivity(arrived, containerWidth, perches);
      }
      return { ...state, x: state.x + step * stepDirection(facing), facing };
    }

    case 'sitting':
    case 'grooming':
    case 'nudging': {
      const timer = state.timer - dtMs;
      if (timer <= 0) return decideNextFloorActivity({ ...state, timer: 0 }, containerWidth, perches);
      return { ...state, timer };
    }

    case 'climbing': {
      const perch = perches.find((p) => p.id === state.perchTargetId);
      if (!perch) {
        // Route through 'descending' rather than deciding a floor activity
        // directly here: decideNextFloorActivity never touches `y`, so a
        // perch vanishing mid-climb used to leave the cat's activity flip
        // to something floor-appropriate (walking/sitting/grooming) while
        // `y` stayed stuck at whatever height it had climbed to -- a cat
        // sitting or strolling in mid-air with no perch in sight. Keeping
        // perchTargetId (not nulling it) also lets 'descending' snap x back
        // to the wall if the perch reappears on a later measurement, same
        // as the perchWalking/perched fallbacks. See HANDOVER.md.
        return {
          ...state,
          activity: 'descending',
          walkTargetX: null,
          facing: state.perchSide ? facingForPerchSide(state.perchSide) : state.facing,
        };
      }
      const facing = state.perchSide ? facingForPerchSide(state.perchSide) : state.facing;
      const x = state.perchSide ? wallX(perch, state.perchSide) : state.x;
      const targetY = perchSurfaceY(perch);
      const step = CLIMB_SPEED * dt;
      if (targetY - state.y <= step) {
        // Step over the lip onto the surface and start strolling from the
        // edge we came up — no teleporting to the middle of the card.
        return {
          ...state,
          x,
          y: targetY,
          facing,
          activity: 'perchWalking',
          walkTargetX: pickPerchWalkTarget(perch, x),
        };
      }
      return { ...state, x, y: state.y + step, facing };
    }

    // Strolling along the top surface of a card. `y` is re-derived from the
    // perch every frame so the cat rides along if the page scrolls or the
    // card reflows underneath it.
    case 'perchWalking': {
      const perch = perches.find((p) => p.id === state.perchTargetId);
      if (!perch) {
        // Keep perchTargetId (don't null it here) so 'descending' can still
        // find the perch and pin x to the wall if it reappears on a later
        // measurement (e.g. a transient empty/stale `perches` array) --
        // matches how the 'perched' case's identical fallback already
        // behaves. Nulling it here used to permanently strand the cat: once
        // gone, 'descending' can never look the perch back up by id, so x
        // freezes wherever the cat happened to be and it free-falls in
        // place with no wall reference at all -- this is the likely cause
        // of the "floating with no card nearby" bug (see HANDOVER.md).
        return {
          ...state,
          activity: 'descending',
          walkTargetX: null,
          facing: state.perchSide ? facingForPerchSide(state.perchSide) : state.facing,
        };
      }
      const surfaceY = perchSurfaceY(perch);

      if (state.walkTargetX === null) {
        const roll = Math.random();
        if (roll < 0.34) {
          return { ...state, y: surfaceY, activity: 'perched', timer: randomPauseMs() };
        }
        if (roll < 0.52) {
          // Head for an edge, then climb down from there. Walks all the way
          // to the true corner (not an inset point) so there's no jump when
          // `descending` snaps x to wallX() on arrival.
          const edgeX = state.perchSide ? wallX(perch, state.perchSide) : pickPerchWalkTarget(perch, state.x);
          return { ...state, y: surfaceY, walkTargetX: edgeX, descendOnArrival: true };
        }
        return { ...state, y: surfaceY, walkTargetX: pickPerchWalkTarget(perch, state.x) };
      }

      const dx = state.walkTargetX - state.x;
      const facing: 1 | -1 = dx === 0 ? state.facing : facingForDirection(dx > 0);
      const step = WALK_SPEED * dt;
      if (Math.abs(dx) <= step) {
        const arrived = { ...state, x: state.walkTargetX, y: surfaceY, facing, walkTargetX: null };
        if (state.descendOnArrival) {
          return {
            ...arrived,
            activity: 'descending',
            descendOnArrival: false,
            facing: arrived.perchSide ? facingForPerchSide(arrived.perchSide) : arrived.facing,
          };
        }
        return arrived;
      }
      return { ...state, x: state.x + step * stepDirection(facing), y: surfaceY, facing };
    }

    case 'perched': {
      const perch = perches.find((p) => p.id === state.perchTargetId);
      const y = perch ? perchSurfaceY(perch) : state.y;
      const timer = state.timer - dtMs;
      if (timer <= 0) {
        if (!perch) {
          return {
            ...state,
            activity: 'descending',
            timer: 0,
            facing: state.perchSide ? facingForPerchSide(state.perchSide) : state.facing,
          };
        }
        // Back to strolling the surface; perchWalking decides when to leave.
        return { ...state, y, activity: 'perchWalking', walkTargetX: null, timer: 0 };
      }
      return { ...state, y, timer };
    }

    case 'descending': {
      const perch = perches.find((p) => p.id === state.perchTargetId);
      const facing = state.perchSide ? facingForPerchSide(state.perchSide) : state.facing;
      const x = perch && state.perchSide ? wallX(perch, state.perchSide) : state.x;
      const step = CLIMB_SPEED * dt;
      if (state.y - step <= 0) {
        return decideNextFloorActivity(
          { ...state, x, y: 0, activity: 'walking', perchTargetId: null, perchSide: null, walkTargetX: null },
          containerWidth,
          perches,
        );
      }
      return { ...state, x, y: state.y - step, facing };
    }

    default:
      return state;
  }
}

export { CAT_WIDTH, CAT_HEIGHT, PAW_OFFSET, SCRUFF_POINT };
