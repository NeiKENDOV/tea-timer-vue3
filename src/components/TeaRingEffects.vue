<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

type StyleId = 'night' | 'violet' | 'emerald' | 'electric'
type MotionMode = 'full' | 'reduced' | 'off'
const props = defineProps<{ styleId: StyleId; motionMode: MotionMode; running: boolean; justCompleted: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const colors: Record<StyleId, [string, string]> = {
  night: ['#67e8f9', '#a5b4fc'], violet: ['#c4a7ff', '#67e8d2'],
  emerald: ['#6ee7b7', '#e4c58a'], electric: ['#82aaff', '#f0abfc']
}
let frame = 0, previousTime = 0, elapsed = 0, completionStarted = -1, activeAlpha = props.running ? 1 : 0
let activeAlphaFrom = activeAlpha, activeAlphaTarget = activeAlpha, activeAlphaStarted = performance.now()
let resizeObserver: ResizeObserver | undefined

const rgba = (hex: string, alpha: number) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${value >> 16},${value >> 8 & 255},${value & 255},${alpha})`
}
const resize = () => {
  const element = canvas.value
  if (!element) return
  const box = element.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2)
  element.width = Math.round(box.width * ratio); element.height = Math.round(box.height * ratio)
}
const circle = (context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string | CanvasGradient, width = 0) => {
  context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2)
  if (width) { context.strokeStyle = color; context.lineWidth = width; context.stroke() }
  else { context.fillStyle = color; context.fill() }
}
const mix = (first: string, second: string, amount: number) => {
  const a = Number.parseInt(first.slice(1), 16), b = Number.parseInt(second.slice(1), 16)
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount)
  return `#${[channel(16), channel(8), channel(0)].map(value => value.toString(16).padStart(2, '0')).join('')}`
}
const drawCompletion = (context: CanvasRenderingContext2D, progress: number, unit: number, cx: number, cy: number, primary: string, secondary: string, ratio: number) => {
  const envelope = Math.max(0, Math.sin(progress * Math.PI))
  if (props.motionMode === 'reduced') { circle(context, cx, cy, unit * .455, rgba(primary, envelope * .4), 2 * ratio); return }
  if (props.styleId === 'night') {
    const bloom = Math.max(0, Math.sin(Math.pow(progress, .65) * Math.PI)), radius = unit * (.45 + progress * .018)
    for (let layer = 5; layer >= 1; layer -= 1) circle(context, cx, cy, radius, rgba(primary, bloom * .025), (3 + layer * 3) * ratio)
    circle(context, cx, cy, radius, rgba(mix(primary, secondary, progress * .4), bloom * .65), 1.5 * ratio)
  } else if (props.styleId === 'violet') {
    const radius = unit * .47, angle = -Math.PI / 2 + progress * Math.PI * 2
    for (let sample = 56; sample >= 0; sample -= 1) {
      const tail = sample / 56, strength = Math.pow(1 - tail, 2), a = angle - tail * 1.8
      circle(context, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, (1 + strength * 1.5) * ratio, rgba(mix(primary, secondary, tail), envelope * strength * .85))
    }
    circle(context, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 10 * ratio, rgba(primary, envelope * .1))
  } else if (props.styleId === 'emerald') {
    for (let layer = 0; layer < 2; layer += 1) {
      const wave = Math.max(0, Math.min(1, (progress - layer * .18) / (1 - layer * .18))), fade = Math.max(0, Math.sin(wave * Math.PI)), radius = unit * (.447 + wave * .036), tint = layer ? secondary : primary
      circle(context, cx, cy, radius, rgba(tint, fade * .06), 8 * ratio); circle(context, cx, cy, radius, rgba(tint, fade * .55), 1.5 * ratio)
    }
  } else {
    const pulse = Math.min(1, progress / .55), energy = Math.max(0, Math.sin(pulse * Math.PI))
    for (let segment = 0; segment < 3; segment += 1) {
      context.beginPath()
      for (let sample = 0; sample <= 60; sample += 1) {
        const fraction = sample / 60, angle = segment * Math.PI * 2 / 3 + fraction * Math.PI * .5 + progress * .5
        const ripple = Math.sin(fraction * Math.PI * 16) * Math.sin(fraction * Math.PI) * energy * unit * .006, radius = unit * .466 + ripple
        const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius
        sample ? context.lineTo(x, y) : context.moveTo(x, y)
      }
      const tint = segment === 1 ? secondary : primary; context.strokeStyle = rgba(tint, energy * .12); context.lineWidth = 7 * ratio; context.lineCap = 'round'; context.stroke(); context.strokeStyle = rgba(tint, energy * .85); context.lineWidth = 1.5 * ratio; context.stroke()
    }
  }
}
const draw = (timestamp: number) => {
  const element = canvas.value, context = element?.getContext('2d')
  if (!element || !context) return
  const delta = previousTime ? Math.min(.05, (timestamp - previousTime) / 1000) : 0
  previousTime = timestamp
  if (!document.hidden && props.motionMode !== 'off') elapsed += delta
  const width = element.width, height = element.height, unit = Math.min(width, height), cx = width / 2, cy = height / 2
  const ratio = Math.min(devicePixelRatio || 1, 2), [primary, secondary] = colors[props.styleId]
  const activeDuration = activeAlphaTarget > activeAlphaFrom ? 450 : 300
  const activeProgress = Math.min(1, (timestamp - activeAlphaStarted) / activeDuration)
  activeAlpha = activeAlphaFrom + (activeAlphaTarget - activeAlphaFrom) * activeProgress
  context.clearRect(0, 0, width, height)
  if (activeAlpha > .001 && props.motionMode === 'full') {
    context.save(); context.globalAlpha = activeAlpha
    for (let layer = 6; layer >= 1; layer -= 1) circle(context, cx, cy, unit * .44, rgba(primary, .012), (8 + layer * 5) * ratio)
    if (props.styleId === 'night') {
      const cycle = elapsed % 3.6 / 3.6, breath = .5 - .5 * Math.cos(cycle * Math.PI * 2), base = unit * .44
      for (let layer = 4; layer >= 1; layer -= 1) circle(context, cx, cy, base + breath * ratio, rgba(primary, .012 + breath * .012), layer * 5 * ratio)
      circle(context, cx, cy, base + breath * ratio, rgba(primary, .08 + breath * .12), 2 * ratio)
      for (let index = 0; index < 2; index += 1) { const wave = (cycle + index / 2) % 1, eased = 1 - Math.pow(1 - wave, 3), radius = base + (unit / 2 - base - ratio) * eased, fade = Math.pow(Math.sin(Math.PI * wave), 2) * (1 - wave); circle(context, cx, cy, radius, rgba(primary, .18 * fade), (2 - wave) * ratio) }
    } else if (props.styleId === 'violet') {
      const angle = elapsed / 6 * Math.PI * 2, radius = unit * .47
      for (let sample = 40; sample >= 0; sample -= 1) { const tail = sample / 40, strength = 1 - tail, a = angle - tail * .8 - Math.PI / 2, tint = mix(primary, secondary, tail); circle(context, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, (1 + strength) * ratio, rgba(tint, strength * strength * .55)) }
      const hx = cx + Math.cos(angle - Math.PI / 2) * radius, hy = cy + Math.sin(angle - Math.PI / 2) * radius
      const glow = context.createRadialGradient(hx, hy, 0, hx, hy, 12 * ratio); glow.addColorStop(0, rgba(primary, .25)); glow.addColorStop(1, rgba(primary, 0)); circle(context, hx, hy, 12 * ratio, glow); circle(context, hx, hy, 2.5 * ratio, primary)
    } else if (props.styleId === 'emerald') {
      const gradient = context.createConicGradient(elapsed / 12 * Math.PI * 2, cx, cy)
      gradient.addColorStop(0, rgba(primary, .05)); gradient.addColorStop(.3, rgba(primary, .6)); gradient.addColorStop(.55, rgba(secondary, .65)); gradient.addColorStop(.8, rgba(secondary, .08)); gradient.addColorStop(1, rgba(primary, .05))
      context.save(); context.globalAlpha = activeAlpha * .12; circle(context, cx, cy, unit * .47, gradient, 10 * ratio); context.globalAlpha = activeAlpha * .3; circle(context, cx, cy, unit * .47, gradient, 4 * ratio); context.globalAlpha = activeAlpha; circle(context, cx, cy, unit * .47, gradient, 1.5 * ratio); context.restore()
    } else {
      const angle = elapsed / 8 * Math.PI * 2
      for (let layer = 0; layer < 2; layer += 1) { const tint = layer ? secondary : primary; context.beginPath(); for (let sample = 0; sample <= 240; sample += 1) { const a = sample / 240 * Math.PI * 2, radius = unit * .47 + Math.sin(a * 8 - angle + layer * Math.PI) * unit * .006, x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius; sample ? context.lineTo(x, y) : context.moveTo(x, y) }; context.closePath(); context.strokeStyle = rgba(tint, .05); context.lineWidth = 7 * ratio; context.stroke(); context.strokeStyle = rgba(tint, layer ? .22 : .5); context.lineWidth = 1.2 * ratio; context.stroke() }
    }
    context.restore()
  }
  if (props.justCompleted && completionStarted >= 0) {
    const completionProgress = Math.min(1, (timestamp - completionStarted) / 1600)
    drawCompletion(context, completionProgress, unit, cx, cy, primary, secondary, ratio)
  }
  if (!document.hidden && (props.running || activeAlpha > .001 || props.justCompleted) && props.motionMode !== 'off') frame = requestAnimationFrame(draw)
}
const restart = () => { cancelAnimationFrame(frame); previousTime = 0; frame = requestAnimationFrame(draw) }
watch(() => props.running, value => { activeAlphaFrom = activeAlpha; activeAlphaTarget = value ? 1 : 0; activeAlphaStarted = performance.now(); if (value) elapsed = 0; restart() })
watch(() => props.styleId, restart)
watch(() => props.motionMode, restart)
watch(() => props.justCompleted, value => { if (value) completionStarted = performance.now(); restart() })
onMounted(() => { resizeObserver = new ResizeObserver(() => { resize(); restart() }); if (canvas.value) resizeObserver.observe(canvas.value); resize(); restart() })
onBeforeUnmount(() => { cancelAnimationFrame(frame); resizeObserver?.disconnect() })
</script>

<template><canvas ref="canvas" aria-hidden="true" class="pointer-events-none absolute inset-0 size-full" /></template>
