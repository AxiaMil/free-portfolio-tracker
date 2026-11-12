// Phone chrome (bottom navigation, + and refresh) slides away while scrolling down and comes back on any
// scroll up, near the top, or at the very end of the page, so the content gets the whole screen while reading.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

const DOWN_PX = 12; // distance scrolled down before hiding (ignores small jitters)
const UP_PX = 8; // distance scrolled up before showing again
const TOP_PX = 64; // always shown this close to the top
const END_PX = 24; // and this close to the bottom (so the nav is there when the page runs out)

export function useHideOnScroll(enabled: Ref<boolean>, resetOn: () => unknown) {
  const hidden = ref(false);
  let lastY = 0;
  let travel = 0; // distance moved in the current direction
  let frame = 0;

  function update() {
    frame = 0;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    // iOS rubber-banding reports positions outside 0..max; treat those as the edges
    if (!enabled.value || y <= TOP_PX || y >= max - END_PX) {
      hidden.value = false;
      lastY = Math.min(Math.max(y, 0), Math.max(max, 0));
      travel = 0;
      return;
    }
    const dy = y - lastY;
    lastY = y;
    if (!dy) return;
    travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
    if (travel > DOWN_PX) hidden.value = true;
    else if (travel < -UP_PX) hidden.value = false;
  }

  const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };

  onMounted(() => {
    lastY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
  });
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
  });
  // a new page, or switching to the desktop layout, always starts with everything visible
  watch([resetOn, enabled], () => { hidden.value = false; travel = 0; lastY = window.scrollY; });

  return hidden;
}
