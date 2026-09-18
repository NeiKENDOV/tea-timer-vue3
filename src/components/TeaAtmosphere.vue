<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

type StyleId = 'night' | 'violet' | 'emerald' | 'electric'
type MotionMode = 'full' | 'reduced' | 'off'
const props = defineProps<{ styleId: StyleId; motionMode: MotionMode; running: boolean; completedInfusions: number; interaction: number; preview?: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const colors: Record<StyleId, [string, string]> = { night: ['#67e8f9', '#a5b4fc'], violet: ['#c4a7ff', '#67e8d2'], emerald: ['#6ee7b7', '#e4c58a'], electric: ['#82aaff', '#f0abfc'] }
const createKotlinRandom = (seed: number) => {
  let x = seed | 0, y = seed >> 31, z = 0, w = 0, v = ~seed, addend = (seed << 10) ^ (y >>> 4)
  const nextInt = () => { const t = x ^ (x >>> 2); x = y; y = z; z = w; w = v; v = v ^ (v << 4) ^ (t ^ (t << 1)); addend = (addend + 362437) | 0; return (v + addend) | 0 }
  for (let index = 0; index < 64; index += 1) nextInt()
  return () => (nextInt() >>> 8) / 16777216
}
const random = createKotlinRandom(42)
const stars = Array.from({ length: 32 }, () => ({ x: random(), y: random(), phase: random() * Math.PI * 2, radius: 1 + random() }))
let frame = 0, previousTimestamp = 0, time = 0, speed = .35, engagement = 0
let engagementFrom = 0, engagementTarget = props.running ? 1 : 0, engagementStarted = performance.now()
let evolution = Math.min(props.completedInfusions, 24) / 24
let evolutionFrom = evolution, evolutionTarget = evolution, evolutionStarted = performance.now()
let touchStarted = -1, completionStarted = -1, previousInteraction = props.interaction, previousInfusions = props.completedInfusions
let resizeObserver: ResizeObserver | undefined, intersectionObserver: IntersectionObserver | undefined, visible = true

const rgba = (hex: string, alpha: number) => { const value = Number.parseInt(hex.slice(1), 16); return `rgba(${value >> 16},${value >> 8 & 255},${value & 255},${alpha})` }
const resize = () => { const element = canvas.value; if (!element) return; const box = element.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2); element.width = Math.max(1, Math.round(box.width * ratio)); element.height = Math.max(1, Math.round(box.height * ratio)) }
const ringGeometry = (element: HTMLCanvasElement) => {
  if (props.preview) return { x: element.width / 2, y: element.height / 2 }
  const ring = document.querySelector<HTMLElement>('[data-timer-ring]'), canvasBox = element.getBoundingClientRect(), ringBox = ring?.getBoundingClientRect(), ratioX = element.width / Math.max(1, canvasBox.width), ratioY = element.height / Math.max(1, canvasBox.height)
  if (!ringBox) return { x: element.width / 2, y: element.height * .42 }
  return { x: (ringBox.left + ringBox.width / 2 - canvasBox.left) * ratioX, y: (ringBox.top + ringBox.height / 2 - canvasBox.top) * ratioY }
}
const draw = (timestamp: number) => {
  const element = canvas.value, context = element?.getContext('2d')
  if (!element || !context) return
  const delta = previousTimestamp ? Math.min(.05, (timestamp - previousTimestamp) / 1000) : 0
  previousTimestamp = timestamp
  const targetSpeed = props.running ? 1 : .35, motionScale = props.motionMode === 'reduced' ? .3 : 1
  speed += (targetSpeed - speed) * delta * 2
  if (props.motionMode !== 'off') time += delta * speed * motionScale
  const engagementProgress = Math.min(1, (timestamp - engagementStarted) / 1800)
  engagement = engagementFrom + (engagementTarget - engagementFrom) * engagementProgress
  const evolutionDuration = props.motionMode === 'reduced' ? 20000 : 12000
  const evolutionProgress = props.motionMode === 'off' ? 1 : Math.min(1, (timestamp - evolutionStarted) / evolutionDuration)
  evolution = evolutionFrom + (evolutionTarget - evolutionFrom) * evolutionProgress
  const character = props.motionMode === 'full' ? engagement : 0
  const width = element.width, height = element.height, unit = Math.min(width, height), ratio = Math.min(devicePixelRatio || 1, 2)
  const [primary, secondary] = colors[props.styleId], ring = ringGeometry(element)
  const touchProgress = touchStarted < 0 ? 1 : Math.min(1, (timestamp - touchStarted) / 1400)
  const touchStrength = Math.max(0, Math.sin(touchProgress * Math.PI)) * (props.motionMode === 'reduced' ? .25 : 1)
  const completionProgress = completionStarted < 0 ? 1 : Math.min(1, (timestamp - completionStarted) / 1800)
  const finishWave = props.motionMode === 'full' ? Math.max(0, Math.sin(completionProgress * Math.PI)) : 0
  const phase = time + evolution * 3, disturbanceFront = touchProgress * Math.max(width, height) * .8, disturbanceBand = unit * .16
  const disturbance = (x: number, y: number) => {
    const normalized = (Math.hypot(x - ring.x, y - ring.y) - disturbanceFront) / Math.max(1, disturbanceBand)
    return Math.exp(-normalized * normalized) * touchStrength
  }
  context.clearRect(0, 0, width, height); context.lineWidth = ratio
  if (touchStrength > .001) { context.strokeStyle = rgba(primary, touchStrength * .045); context.lineWidth = 2 * ratio; context.beginPath(); context.arc(ring.x, ring.y, touchProgress * Math.max(width, height) * .8, 0, Math.PI * 2); context.stroke() }

  if (props.styleId === 'emerald') {
    for (let index = 0; index < 3; index += 1) { const baseX = width * (.5 + .3 * Math.sin(phase * .1 + index * 2)), baseY = height * (.5 + .32 * Math.sin(phase * .07 + index * 2.6)), dx = baseX - ring.x, dy = baseY - ring.y, distance = Math.max(1, Math.hypot(dx, dy)), shift = disturbance(baseX, baseY) * 18 * ratio, x = baseX + dx / distance * shift, y = baseY + dy / distance * shift, breath = Math.sin(time * .5 + index * .7) * character, radius = unit * (.7 + evolution * .06 + breath * .035), tint = index === 1 ? secondary : primary; const gradient = context.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, rgba(tint, .13 + breath * .012)); gradient.addColorStop(1, rgba(tint, 0)); context.fillStyle = gradient; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill() }
  } else if (props.styleId === 'electric') {
    const chargeCycle = Math.floor(time / 12), chargeProgress = time % 12 / 2.4
    for (let line = 0; line < 7; line += 1) { const tint = line % 3 === 0 ? secondary : primary, baseline = height * (.68 + line * .035 - evolution * .025), wavePath = new Path2D(); let previousX = 0, previousY = baseline
      for (let sample = 0; sample <= 80; sample += 1) { const fraction = sample / 80, x = width * fraction, baseY = baseline + Math.sin(fraction * Math.PI * 2 + phase * .28 + line * .35) * height * (.035 + evolution * .01) + Math.sin(fraction * Math.PI - phase * .15) * height * .045, y = baseY + disturbance(x, baseY) * Math.sin(fraction * Math.PI * 4 - touchProgress * Math.PI * 2) * 14 * ratio; if (sample) { const ordinary = line === chargeCycle % 7 && chargeProgress < 1 ? chargeProgress : -2, ending = completionProgress * 1.4 - line * .045, head = finishWave > .001 ? ending : ordinary, behind = head - fraction; if (behind >= 0 && behind <= .12) { const strength = (1 - behind / .12) * (finishWave > .001 ? finishWave * .6 : character * .6 * Math.max(0, Math.sin(chargeProgress * Math.PI))); context.strokeStyle = rgba(tint, strength * .15); context.lineWidth = 5 * ratio; context.beginPath(); context.moveTo(previousX, previousY); context.lineTo(x, y); context.stroke(); context.strokeStyle = rgba(tint, strength); context.lineWidth = 1.5 * ratio; context.stroke() } }; sample ? wavePath.lineTo(x, y) : wavePath.moveTo(x, y); previousX = x; previousY = y }
      context.strokeStyle = rgba(tint, .12 + line * .012); context.lineWidth = ratio; context.stroke(wavePath)
    }
  } else {
    const points = stars.map((star, index) => { let x = (star.x * .8 + .1 + Math.sin(phase * .07 + star.phase) * .09) * width, y = (star.y * .8 + .1 + Math.sin(phase * .05 + star.phase * 1.7) * .09) * height
      let dx = x - ring.x, dy = y - ring.y, distance = Math.max(1, Math.hypot(dx, dy)), shift = disturbance(x, y) * 14 * ratio; x += dx / distance * shift; y += dy / distance * shift
      if (props.styleId === 'violet' && index < 22) { const angle = index * Math.PI * 2 / 22 + time * .025, orbitRadius = unit * .45, orbitX = ring.x + Math.cos(angle) * orbitRadius, orbitY = ring.y + Math.sin(angle) * orbitRadius; x += (orbitX - x) * character * .45; y += (orbitY - y) * character * .45; dx = x - ring.x; dy = y - ring.y; distance = Math.max(1, Math.hypot(dx, dy)); const clearance = unit * .28; if (distance < clearance) { x += dx / distance * (clearance - distance) * character; y += dy / distance * (clearance - distance) * character }; x += dx / distance * finishWave * 10 * ratio; y += dy / distance * finishWave * 10 * ratio }
      return { ...star, x, y }
    })
    if (props.styleId === 'night' && character > .001) { const cycle = Math.floor(time / 18), flight = time % 18 / 1.7; if (flight < 1) { const start = points[(cycle * 7 + 3) % points.length], travelX = width * .16, travelY = height * .07, fade = Math.max(0, Math.sin(flight * Math.PI)) * character; for (let sample = 0; sample < 20; sample += 1) { const tail = sample / 20; context.fillStyle = rgba(primary, fade * (1 - tail) * .5); context.beginPath(); context.arc(start.x + travelX * flight - travelX * tail * .24, start.y + travelY * flight - travelY * tail * .24, (1.2 - tail * .8) * ratio, 0, Math.PI * 2); context.fill() } } }
    points.forEach((point, index) => { if (props.styleId === 'violet') { if (index >= 22) return; const brightness = .2 + .55 * (.5 + .5 * Math.sin(time * .65 + point.phase)), tint = index % 4 === 0 ? secondary : primary, glow = point.radius * (10 + evolution * 2) * ratio, gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, glow); gradient.addColorStop(0, rgba(tint, brightness * .16)); gradient.addColorStop(1, rgba(tint, 0)); context.fillStyle = gradient; context.beginPath(); context.arc(point.x, point.y, glow, 0, Math.PI * 2); context.fill(); context.fillStyle = rgba(tint, brightness); context.beginPath(); context.arc(point.x, point.y, point.radius * ratio, 0, Math.PI * 2); context.fill(); return }
      const limit = unit * (.25 + evolution * .025); for (let other = index + 1; other < points.length; other += 1) { const distance = Math.hypot(point.x - points[other].x, point.y - points[other].y); if (distance >= limit) continue; context.strokeStyle = rgba(primary, .14 * (1 - distance / limit)); context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(points[other].x, points[other].y); context.stroke() }; context.fillStyle = rgba(primary, .04); context.beginPath(); context.arc(point.x, point.y, point.radius * 6 * ratio, 0, Math.PI * 2); context.fill(); context.fillStyle = rgba(primary, .35); context.beginPath(); context.arc(point.x, point.y, point.radius * ratio, 0, Math.PI * 2); context.fill()
    })
  }
  if (visible && !document.hidden && props.motionMode !== 'off') frame = requestAnimationFrame(draw)
}
const restart = () => { cancelAnimationFrame(frame); previousTimestamp = 0; frame = requestAnimationFrame(draw) }
watch(() => props.interaction, value => { if (value !== previousInteraction) { previousInteraction = value; touchStarted = performance.now(); restart() } })
watch(() => props.completedInfusions, value => { const now = performance.now(); if (value > previousInfusions) completionStarted = now; previousInfusions = value; evolutionFrom = evolution; evolutionTarget = Math.min(value, 24) / 24; evolutionStarted = now; restart() })
watch(() => props.running, value => { engagementFrom = engagement; engagementTarget = value && props.motionMode === 'full' ? 1 : 0; engagementStarted = performance.now(); restart() })
watch(() => props.motionMode, value => { engagementFrom = engagement; engagementTarget = props.running && value === 'full' ? 1 : 0; engagementStarted = performance.now(); restart() })
watch(() => props.styleId, restart)
onMounted(() => { resizeObserver = new ResizeObserver(() => { resize(); restart() }); intersectionObserver = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; if (visible) restart() }); if (canvas.value) { resizeObserver.observe(canvas.value); intersectionObserver.observe(canvas.value) }; document.addEventListener('visibilitychange', restart); resize(); restart() })
onBeforeUnmount(() => { cancelAnimationFrame(frame); resizeObserver?.disconnect(); intersectionObserver?.disconnect(); document.removeEventListener('visibilitychange', restart) })
</script>

<template><canvas ref="canvas" aria-hidden="true" class="pointer-events-none absolute inset-0 size-full" /></template>
