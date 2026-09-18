<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import TeaAtmosphere from './components/TeaAtmosphere.vue'
import TeaRingEffects from './components/TeaRingEffects.vue'
import { getPresetGuidance, getPresetSource, teaPresets, type TeaProfile } from './data/presets'

type StyleId = 'night' | 'violet' | 'emerald' | 'electric'
type MotionMode = 'full' | 'reduced' | 'off'
type SheetName = 'mode' | 'editor' | 'preset' | null
interface TimerState {
  profiles: TeaProfile[]; selectedTeaId: number | null; favoriteTeaIds: number[]
  firstSeconds: number; incrementSeconds: number; targetSeconds: number; currentSeconds: number
  infusions: number; running: boolean; startedAt: number | null; infusionSeconds: number[]
  lastCompletedSeconds: number; ceremonyStarted: boolean; sound: boolean; vibration: boolean
  notification: boolean; styleId: StyleId; motionMode: MotionMode; keepScreenOn: boolean
}

const STORAGE_KEY = 'tea-timer-vue3-state-v2'
const LEGACY_STORAGE_KEY = 'tea-timer-vue3-state'
const styleOptions: Array<{ id: StyleId; title: string; subtitle: string; classes: string; accent: string; primary: string; background: string }> = [
  { id: 'night', title: 'NightSpace', subtitle: 'Созвездие и дыхание', classes: 'border-[#67e8f9]/35 bg-[#080e18]', accent: 'border-[#67e8f9] text-[#67e8f9]', primary: '#67e8f9', background: '#080e18' },
  { id: 'violet', title: 'Neon Violet', subtitle: 'Светлячки и комета', classes: 'border-[#c4a7ff]/35 bg-[#100b19]', accent: 'border-[#c4a7ff] text-[#c4a7ff]', primary: '#c4a7ff', background: '#100b19' },
  { id: 'emerald', title: 'Deep Emerald', subtitle: 'Сияние и переливы', classes: 'border-[#6ee7b7]/35 bg-[#081410]', accent: 'border-[#6ee7b7] text-[#6ee7b7]', primary: '#6ee7b7', background: '#081410' },
  { id: 'electric', title: 'Electric Blue', subtitle: 'Бегущие волны', classes: 'border-[#82aaff]/35 bg-[#090d18]', accent: 'border-[#82aaff] text-[#82aaff]', primary: '#82aaff', background: '#090d18' }
]
const palettes: Record<StyleId, Record<string, string>> = {
  night: { background: 'bg-[#080e18]', surface: 'bg-[#121d2b]', high: 'bg-[#1b293b]', text: 'text-[#e8f0fa]', primary: 'text-[#67e8f9]', button: 'bg-[#67e8f9]', selected: 'bg-[#163a47]', border: 'border-[#223447]', focus: 'focus-visible:outline-[#67e8f9]' },
  violet: { background: 'bg-[#100b19]', surface: 'bg-[#20162e]', high: 'bg-[#30233f]', text: 'text-[#f2ecfa]', primary: 'text-[#c4a7ff]', button: 'bg-[#c4a7ff]', selected: 'bg-[#38264f]', border: 'border-[#30233f]', focus: 'focus-visible:outline-[#c4a7ff]' },
  emerald: { background: 'bg-[#081410]', surface: 'bg-[#14241d]', high: 'bg-[#24382f]', text: 'text-[#e7f3ed]', primary: 'text-[#6ee7b7]', button: 'bg-[#6ee7b7]', selected: 'bg-[#244739]', border: 'border-[#24382f]', focus: 'focus-visible:outline-[#6ee7b7]' },
  electric: { background: 'bg-[#090d18]', surface: 'bg-[#151d30]', high: 'bg-[#25324c]', text: 'text-[#edf1fc]', primary: 'text-[#82aaff]', button: 'bg-[#82aaff]', selected: 'bg-[#283b61]', border: 'border-[#25324c]', focus: 'focus-visible:outline-[#82aaff]' }
}
const defaults: TimerState = {
  profiles: [], selectedTeaId: null, favoriteTeaIds: [], firstSeconds: 10, incrementSeconds: 5,
  targetSeconds: 10, currentSeconds: 0, infusions: 0, running: false, startedAt: null,
  infusionSeconds: [], lastCompletedSeconds: 0, ceremonyStarted: false, sound: true,
  vibration: true, notification: true, styleId: 'night', motionMode: 'full', keepScreenOn: false
}
const readState = (): Partial<TimerState> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? '{}') }
  catch { return {} }
}
const stored = readState()
const state = reactive<TimerState>({
  ...defaults, ...stored,
  profiles: Array.isArray(stored.profiles) ? stored.profiles : [],
  favoriteTeaIds: Array.isArray(stored.favoriteTeaIds) ? stored.favoriteTeaIds : [],
  infusionSeconds: Array.isArray(stored.infusionSeconds) ? stored.infusionSeconds.filter(value => Number.isInteger(value) && value > 0 && value <= 3600) : [],
  styleId: styleOptions.some(option => option.id === stored.styleId) ? stored.styleId as StyleId : 'night',
  motionMode: ['full', 'reduced', 'off'].includes(stored.motionMode ?? '') ? stored.motionMode as MotionMode : 'full'
})

const drawerOpen = ref(false), settingsOpen = ref(false), activeSheet = ref<SheetName>(null)
const pendingAction = ref<(() => void) | null>(null), editorProfile = ref<TeaProfile | null>(null)
const expandedGuidance = ref(false), justCompleted = ref(false), interaction = ref(0), liveMessage = ref('')
const modeForm = reactive({ first: '10', increment: '5' })
const teaForm = reactive({ id: 0, name: '', temperature: '90', grams: '5', first: '10', increment: '5', description: '' })
const presetForm = reactive({ temperature: '90', grams: '5', times: [] as string[] })
let timerId: number | undefined, completionId: number | undefined, wakeLock: WakeLockSentinel | null = null

const palette = computed(() => palettes[state.styleId])
const currentStyle = computed(() => styleOptions.find(option => option.id === state.styleId) ?? styleOptions[0])
const customProfiles = computed(() => state.profiles.filter(profile => !teaPresets.some(preset => preset.id === profile.id)))
const availablePresets = computed(() => teaPresets.map(base => state.profiles.find(profile => profile.id === base.id) ?? base))
const allProfiles = computed(() => [...customProfiles.value, ...availablePresets.value])
const selectedTea = computed(() => allProfiles.value.find(profile => profile.id === state.selectedTeaId))
const title = computed(() => selectedTea.value?.name ?? 'Свободный режим')
const finished = computed(() => state.infusionSeconds.length > 0 && state.infusions >= state.infusionSeconds.length)
const progress = computed(() => justCompleted.value || finished.value ? 1 : Math.min(1, state.currentSeconds / Math.max(1, state.targetSeconds)))
const displaySeconds = computed(() => justCompleted.value ? state.lastCompletedSeconds : state.currentSeconds)
const displayTarget = computed(() => justCompleted.value ? state.lastCompletedSeconds : state.targetSeconds)
const favoriteFirst = (a: TeaProfile, b: TeaProfile) => Number(state.favoriteTeaIds.includes(b.id)) - Number(state.favoriteTeaIds.includes(a.id))
const sortedCustomProfiles = computed(() => [...customProfiles.value].sort(favoriteFirst))
const sortedPresets = computed(() => [...availablePresets.value].sort(favoriteFirst))
const modeValid = computed(() => Number(modeForm.first) > 0 && Number(modeForm.increment) >= 0)
const teaValid = computed(() => teaForm.name.trim() && Number(teaForm.temperature) > 0 && Number(teaForm.grams) > 0 && Number(teaForm.first) > 0 && Number(teaForm.increment) >= 0)
const presetValid = computed(() => Number(presetForm.temperature) >= 60 && Number(presetForm.temperature) <= 100 && Number(presetForm.grams) > 0 && Number(presetForm.grams) <= 20 && presetForm.times.length === 15 && presetForm.times.every(value => Number(value) >= 1 && Number(value) <= 3600))
const statusLabel = computed(() => justCompleted.value ? 'Пролив готов' : finished.value ? 'Церемония завершена' : state.running ? 'Нажмите, чтобы остановить' : state.currentSeconds > 0 ? 'Нажмите, чтобы продолжить' : 'Нажмите, чтобы начать')

watch(state, value => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true })
watch(currentStyle, value => { document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', value.background) }, { immediate: true })
watch(() => state.keepScreenOn, () => void handleWakeLock())
const hasProgress = () => state.running || state.currentSeconds > 0 || state.infusions > 0
const runConfirmed = (action: () => void) => { if (hasProgress()) pendingAction.value = action; else action() }
const stopTimer = () => { state.running = false; state.startedAt = null }
const resetTimer = () => { stopTimer(); state.currentSeconds = 0; state.targetSeconds = state.infusionSeconds[0] ?? state.firstSeconds; state.infusions = 0; state.lastCompletedSeconds = 0; state.ceremonyStarted = false; justCompleted.value = false; liveMessage.value = '' }
const handleReset = () => runConfirmed(resetTimer)
const handleConfirm = () => { const action = pendingAction.value; pendingAction.value = null; action?.() }

const signalFinished = async () => {
  const vibrations: Record<StyleId, number[]> = { night: [280, 90, 360], violet: [180, 90, 220, 90, 280], emerald: [560], electric: [140, 90, 180, 90, 240] }
  if (state.vibration && navigator.vibrate) navigator.vibrate(vibrations[state.styleId])
  if (state.sound) await new Audio(`/finish-${state.styleId}.wav`).play().catch(() => undefined)
  if (state.notification && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker?.ready
    await registration?.showNotification('Пролив завершён', { body: `${title.value}: ${finished.value ? 'церемония завершена' : `следующий пролив ${state.targetSeconds} сек`}`, icon: '/pwa-192x192.webp', tag: 'tea-timer-finished' })
  }
}
const completeInfusion = () => {
  if (!state.running || finished.value) return
  const completed = state.targetSeconds, count = state.infusions + 1
  stopTimer(); state.currentSeconds = 0; state.infusions = count; state.lastCompletedSeconds = completed
  state.targetSeconds = state.infusionSeconds[count] ?? (state.infusionSeconds.length ? completed : completed + state.incrementSeconds)
  justCompleted.value = true; liveMessage.value = state.infusionSeconds.length && count >= state.infusionSeconds.length ? 'Церемония завершена' : `Пролив ${count} готов`
  window.clearTimeout(completionId); completionId = window.setTimeout(() => { justCompleted.value = false }, 1600)
  void signalFinished()
}
const syncElapsed = () => { if (!state.running || !state.startedAt) return; state.currentSeconds = Math.floor((Date.now() - state.startedAt) / 1000); if (state.currentSeconds >= state.targetSeconds) completeInfusion() }
const handleToggleTimer = () => {
  if (finished.value) return
  interaction.value += 1; if (state.vibration && navigator.vibrate) navigator.vibrate(12)
  if (state.running) { syncElapsed(); stopTimer(); return }
  state.running = true; state.ceremonyStarted = true; state.startedAt = Date.now() - state.currentSeconds * 1000
}
const selectProfile = (profile: TeaProfile) => { state.selectedTeaId = profile.id; state.firstSeconds = profile.infusionSeconds[0] ?? profile.firstSeconds; state.incrementSeconds = profile.incrementSeconds; state.infusionSeconds = [...profile.infusionSeconds]; resetTimer(); drawerOpen.value = false }
const handleSelect = (profile: TeaProfile) => runConfirmed(() => selectProfile(profile))
const handleCustomMode = () => runConfirmed(() => { state.selectedTeaId = null; state.infusionSeconds = []; resetTimer(); drawerOpen.value = false; activeSheet.value = null })
const handleFavorite = (id: number) => { state.favoriteTeaIds = state.favoriteTeaIds.includes(id) ? state.favoriteTeaIds.filter(value => value !== id) : [...state.favoriteTeaIds, id] }
const handleOpenMode = () => { modeForm.first = String(state.firstSeconds); modeForm.increment = String(state.incrementSeconds); expandedGuidance.value = false; activeSheet.value = 'mode' }
const handleSaveMode = () => { if (!modeValid.value) return; runConfirmed(() => { state.selectedTeaId = null; state.infusionSeconds = []; state.firstSeconds = Number(modeForm.first); state.incrementSeconds = Number(modeForm.increment); resetTimer(); activeSheet.value = null }) }
const handleOpenEditor = (profile: TeaProfile | null = null) => {
  editorProfile.value = profile; expandedGuidance.value = false
  if (profile?.preset) { presetForm.temperature = String(profile.temperature); presetForm.grams = String(profile.grams); presetForm.times = profile.infusionSeconds.map(String); activeSheet.value = 'preset'; return }
  Object.assign(teaForm, { id: profile?.id ?? 0, name: profile?.name ?? '', temperature: String(profile?.temperature ?? 90), grams: String(profile?.grams ?? 5), first: String(profile?.firstSeconds ?? 10), increment: String(profile?.incrementSeconds ?? 5), description: profile?.description ?? '' }); activeSheet.value = 'editor'
}
const saveProfile = (profile: TeaProfile) => { state.profiles = [...state.profiles.filter(item => item.id !== profile.id), profile]; selectProfile(profile); activeSheet.value = null }
const handleSaveTea = () => { if (!teaValid.value) return; runConfirmed(() => saveProfile({ id: teaForm.id || Date.now(), name: teaForm.name.trim(), temperature: Number(teaForm.temperature), grams: Number(teaForm.grams), firstSeconds: Number(teaForm.first), incrementSeconds: Number(teaForm.increment), description: teaForm.description.trim(), infusionSeconds: [] })) }
const handleSavePreset = () => { if (!presetValid.value || !editorProfile.value) return; runConfirmed(() => saveProfile({ ...editorProfile.value!, temperature: Number(presetForm.temperature), grams: Number(presetForm.grams), firstSeconds: Number(presetForm.times[0]), infusionSeconds: presetForm.times.map(Number), preset: true })) }
const handleRestorePreset = () => { const base = teaPresets.find(profile => profile.id === editorProfile.value?.id); if (!base) return; presetForm.temperature = String(base.temperature); presetForm.grams = String(base.grams); presetForm.times = base.infusionSeconds.map(String) }
const handleDelete = (profile: TeaProfile) => { state.profiles = state.profiles.filter(item => item.id !== profile.id); state.favoriteTeaIds = state.favoriteTeaIds.filter(id => id !== profile.id); if (state.selectedTeaId === profile.id) state.selectedTeaId = null }
const handleNotifications = async () => { if (!state.notification && 'Notification' in window && Notification.permission === 'default') { state.notification = await Notification.requestPermission() === 'granted'; return }; state.notification = !state.notification }
const handleWakeLock = async () => { if (!state.keepScreenOn || document.hidden || !('wakeLock' in navigator)) { await wakeLock?.release().catch(() => undefined); wakeLock = null; return }; wakeLock = await navigator.wakeLock.request('screen').catch(() => null) }
const handleVisibility = () => { syncElapsed(); void handleWakeLock() }
const handleKeyDown = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (pendingAction.value) pendingAction.value = null; else if (activeSheet.value) activeSheet.value = null; else if (drawerOpen.value) drawerOpen.value = false; else settingsOpen.value = false }
onMounted(() => { syncElapsed(); timerId = window.setInterval(syncElapsed, 250); document.addEventListener('visibilitychange', handleVisibility); window.addEventListener('keydown', handleKeyDown); void handleWakeLock() })
onBeforeUnmount(() => { window.clearInterval(timerId); window.clearTimeout(completionId); document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('keydown', handleKeyDown); void wakeLock?.release() })
</script>

<template>
  <main :class="[palette.background, palette.text, state.motionMode === 'off' ? '' : 'transition-colors duration-700', 'relative min-h-dvh overflow-hidden font-sans antialiased']">
    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
    <template v-if="!settingsOpen">
      <header class="relative z-10 flex h-[calc(64px+env(safe-area-inset-top))] items-end justify-between px-3 pb-2 pt-[env(safe-area-inset-top)]">
        <button type="button" aria-label="Выбрать чай" :class="[palette.focus, 'grid size-12 place-items-center rounded-full outline-none focus-visible:outline-2']" @click="drawerOpen = true"><span class="flex w-6 flex-col gap-1.5" aria-hidden="true"><i class="h-0.5 rounded bg-current" /><i class="h-0.5 rounded bg-current" /><i class="h-0.5 rounded bg-current" /></span></button>
        <h1 :class="['max-w-[65%] truncate text-center text-lg font-semibold', state.running ? 'opacity-[.62]' : '', state.motionMode === 'off' ? '' : 'transition-opacity duration-500']">{{ title }}</h1>
        <button type="button" aria-label="Сбросить таймер" :class="[palette.focus, 'size-12 rounded-full text-3xl outline-none focus-visible:outline-2']" @click="handleReset">↻</button>
      </header>
      <section class="relative z-[1] flex h-[calc(100dvh-64px-env(safe-area-inset-top))] flex-col items-center px-3 pb-[env(safe-area-inset-bottom)]">
        <Transition enter-active-class="transition-opacity duration-700" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-700" leave-to-class="opacity-0">
          <TeaAtmosphere :key="state.styleId" :style-id="state.styleId" :motion-mode="state.motionMode" :running="state.running" :completed-infusions="state.infusions" :interaction="interaction" />
        </Transition>
        <div class="flex-[0.45]" />
        <div data-timer-ring class="relative aspect-square w-[min(88vw,330px)] max-h-[calc(100dvh-220px)] max-w-[calc(100dvh-220px)]">
          <TeaRingEffects :style-id="state.styleId" :motion-mode="state.motionMode" :running="state.running" :just-completed="justCompleted" />
          <button type="button" :disabled="finished" :aria-label="state.running ? 'Остановить пролив' : 'Начать пролив'" :class="[palette.focus, 'absolute inset-[6%] grid place-items-center rounded-full outline-none active:scale-[0.975] focus-visible:outline-2 disabled:cursor-default']" @click="handleToggleTimer">
            <svg class="absolute inset-0 size-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" :stroke="currentStyle.primary" stroke-opacity="0.2" stroke-width="1" /><circle v-if="progress > 0" cx="18" cy="18" r="15.5" fill="none" :stroke="currentStyle.primary" stroke-width="1" stroke-linecap="round" stroke-dasharray="100" :stroke-dashoffset="100 * (1 - progress)" pathLength="100" :class="state.motionMode === 'off' ? '' : 'transition-[stroke-dashoffset] duration-300'" /></svg>
            <span class="flex flex-col items-center px-8 text-center"><span class="tabular-nums text-[clamp(3rem,18vw,5rem)] font-light leading-none">{{ displaySeconds }}</span><span :class="[palette.primary, 'mt-2 text-xl']">из {{ displayTarget }} сек</span><span class="mt-5 text-xs opacity-60">{{ statusLabel }}</span></span>
          </button>
        </div>
        <button type="button" aria-label="Настроить время пролива" :class="[palette.focus, state.running ? 'opacity-[.62]' : '', state.motionMode === 'off' ? '' : 'transition-opacity duration-500', 'mt-4 rounded-3xl px-5 py-2.5 text-center outline-none focus-visible:outline-2']" @click="handleOpenMode"><span class="block text-[21px] font-semibold">Завершено проливов: {{ state.infusions }}</span><span :class="[palette.primary, 'mt-1.5 block text-lg']">{{ finished ? 'Сбросьте таймер для новой церемонии' : `Следующий пролив · ${state.targetSeconds} сек` }}</span></button>
        <div class="flex-[0.55]" />
      </section>
    </template>

    <section v-else class="relative z-10 min-h-dvh overflow-y-auto pb-[env(safe-area-inset-bottom)]">
      <header :class="[palette.background, 'sticky top-0 z-10 flex h-[calc(64px+env(safe-area-inset-top))] items-end justify-between px-3 pb-2 pt-[env(safe-area-inset-top)]']"><button type="button" aria-label="Назад" class="size-12 rounded-full text-3xl" @click="settingsOpen = false">←</button><h1 class="pb-3 text-lg font-semibold">Настройки</h1><span class="size-12" /></header>
      <div class="mx-auto flex max-w-2xl flex-col gap-4 px-5 pb-8 pt-3">
        <h2 :class="[palette.primary, 'text-sm font-semibold']">Сигналы</h2>
        <div :class="[palette.surface, 'overflow-hidden rounded-[28px]']">
          <label v-for="setting in [{key:'sound',title:'Звук',note:'Сигнал после завершения пролива'},{key:'vibration',title:'Вибрация',note:'Плавная вибрация в конце пролива'}]" :key="setting.key" :class="[palette.border, 'flex min-h-20 cursor-pointer items-center gap-4 border-b px-4 py-3.5']">
            <span class="flex-1"><b class="block text-[17px]">{{ setting.title }}</b><small class="opacity-60">{{ setting.note }}</small></span><input v-model="state[setting.key]" type="checkbox" class="sr-only" /><span :class="[state[setting.key] ? palette.button : palette.high, 'relative h-8 w-[52px] rounded-full transition-colors']"><span :class="[state[setting.key] ? 'translate-x-5 bg-[#081018]' : 'translate-x-1 bg-current opacity-60', 'absolute top-1 size-6 rounded-full transition-transform']" /></span>
          </label>
          <label class="flex min-h-20 cursor-pointer items-center gap-4 px-4 py-3.5" @click.prevent="handleNotifications"><span class="flex-1"><b class="block text-[17px]">Показать уведомление</b><small class="opacity-60">Сообщить о завершении в фоне</small></span><input :checked="state.notification" type="checkbox" class="sr-only" /><span :class="[state.notification ? palette.button : palette.high, 'relative h-8 w-[52px] rounded-full transition-colors']"><span :class="[state.notification ? 'translate-x-5 bg-[#081018]' : 'translate-x-1 bg-current opacity-60', 'absolute top-1 size-6 rounded-full transition-transform']" /></span></label>
        </div>
        <h2 :class="[palette.primary, 'mt-1 text-sm font-semibold']">Оформление</h2>
        <label :class="[palette.surface, 'flex min-h-20 cursor-pointer items-center gap-4 rounded-[28px] px-4 py-3.5']"><span class="flex-1"><b class="block text-[17px]">Не выключать экран</b><small class="opacity-60">Экран не гаснет, пока приложение открыто</small></span><input v-model="state.keepScreenOn" type="checkbox" class="sr-only" /><span :class="[state.keepScreenOn ? palette.button : palette.high, 'relative h-8 w-[52px] rounded-full transition-colors']"><span :class="[state.keepScreenOn ? 'translate-x-5 bg-[#081018]' : 'translate-x-1 bg-current opacity-60', 'absolute top-1 size-6 rounded-full transition-transform']" /></span></label>
        <div :class="[palette.surface, 'rounded-[28px] p-4']">
          <h3 class="text-[17px] font-semibold">Декоративные анимации</h3>
          <label v-for="option in [{id:'full',label:'Полная'},{id:'reduced',label:'Спокойная'},{id:'off',label:'Выключена'}]" :key="option.id" class="mt-3 flex cursor-pointer items-center gap-3"><input v-model="state.motionMode" type="radio" :value="option.id" class="sr-only" /><span :class="[state.motionMode === option.id ? palette.primary : 'opacity-70', 'grid size-5 place-items-center rounded-full border-2 border-current']"><span v-if="state.motionMode === option.id" :class="[palette.button, 'size-2.5 rounded-full']" /></span>{{ option.label }}</label>
          <p class="mt-3 text-xs opacity-60">Спокойная: медленный фон без движения ореола. Выключена: неподвижный фон.</p><div :class="[palette.border, 'my-4 border-t']" /><h3 class="mb-3 text-[17px] font-semibold">Стиль</h3>
          <button v-for="option in styleOptions" :key="option.id" type="button" :aria-pressed="state.styleId === option.id" :class="[option.classes, state.styleId === option.id ? 'ring-2 ring-current' : '', 'mb-3 block w-full overflow-hidden rounded-2xl border text-left']" @click="state.styleId = option.id"><span class="relative flex h-20 items-center justify-center overflow-hidden"><TeaAtmosphere :style-id="option.id" :motion-mode="state.motionMode" :running="false" :completed-infusions="0" :interaction="0" preview /><span class="relative grid size-16 place-items-center"><TeaRingEffects :style-id="option.id" :motion-mode="state.motionMode" :running="state.motionMode === 'full'" :just-completed="false" /><svg class="absolute inset-[6%] size-[88%] -rotate-90" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" fill="none" :stroke="option.primary" stroke-opacity=".25" stroke-width="1.5" /><circle cx="18" cy="18" r="15.5" fill="none" :stroke="option.primary" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="65 35" /></svg><b class="text-xl">12</b></span></span><span class="flex items-center justify-between bg-black/10 px-4 py-3"><span><b class="block">{{ option.title }}</b><small class="opacity-60">{{ option.subtitle }}</small></span><small v-if="state.styleId === option.id" :class="option.accent">Выбран</small></span></button>
        </div>
        <h2 :class="[palette.primary, 'mt-1 text-sm font-semibold']">Пресеты · гайвань</h2><p class="text-sm opacity-60">В каждом пресете — 15 проливов. Время каждого можно настроить отдельно.</p><button v-for="preset in availablePresets" :key="preset.id" type="button" :class="[palette.surface, 'rounded-[24px] p-4 text-left']" @click="handleOpenEditor(preset)"><b class="block text-[17px]">{{ preset.name }}</b><small :class="palette.primary">{{ preset.temperature }}°C · {{ preset.grams }} г / 100 мл · 15 проливов</small></button>
      </div>
    </section>

    <button v-if="drawerOpen" type="button" aria-label="Закрыть меню" class="fixed inset-0 z-20 bg-black/60" @click="drawerOpen = false" />
    <aside v-if="drawerOpen" :class="[palette.background, 'fixed inset-y-0 left-0 z-30 flex w-[min(88vw,340px)] flex-col px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(10px+env(safe-area-inset-top))] shadow-2xl']" role="dialog" aria-modal="true">
      <div class="flex min-h-16 items-center"><h2 class="flex-1 text-2xl font-bold">Мои чаи</h2><button type="button" :class="[palette.selected, 'rounded-full px-4 py-2.5 font-semibold']" @click="handleOpenEditor()">Добавить</button></div><button type="button" :class="[state.selectedTeaId === null ? palette.selected : '', 'rounded-2xl px-4 py-4 text-left']" @click="handleCustomMode">Свободный режим</button><div :class="[palette.border, 'my-3 border-t']" />
      <div class="flex-1 overflow-y-auto"><p v-if="!sortedCustomProfiles.length" class="px-3 py-2 opacity-60">Добавьте любимый чай и сохраните параметры его заваривания.</p><article v-for="tea in sortedCustomProfiles" :key="tea.id" :class="[state.selectedTeaId === tea.id ? palette.selected : '', 'mb-1 rounded-2xl p-3']"><div class="flex items-start"><button type="button" class="min-w-0 flex-1 text-left" @click="handleSelect(tea)"><b class="block truncate">{{ tea.name }}</b><small :class="palette.primary">{{ tea.temperature }}°C · {{ tea.grams }} г / 100 мл</small></button><button type="button" :aria-label="'Избранное: ' + tea.name" :class="[state.favoriteTeaIds.includes(tea.id) ? palette.primary : 'opacity-30', 'size-9 text-xl']" @click="handleFavorite(tea.id)">♥</button></div><div class="mt-2 flex"><button type="button" :class="palette.primary" @click="handleOpenEditor(tea)">Изменить</button><span class="flex-1" /><button type="button" :aria-label="'Удалить ' + tea.name" class="px-2 text-xl text-[#ffb4ab]" @click="handleDelete(tea)">×</button></div></article><div :class="[palette.border, 'my-3 border-t']" /><h3 :class="[palette.primary, 'px-3 py-2 font-semibold']">Пресеты</h3><article v-for="tea in sortedPresets" :key="tea.id" :class="[state.selectedTeaId === tea.id ? palette.selected : '', 'mb-1 flex rounded-2xl p-3']"><button type="button" class="min-w-0 flex-1 text-left" @click="handleSelect(tea)"><b class="block">{{ tea.name }}</b><small :class="palette.primary">{{ tea.temperature }}°C · {{ tea.grams }} г / 100 мл</small></button><button type="button" :aria-label="'Избранное: ' + tea.name" :class="[state.favoriteTeaIds.includes(tea.id) ? palette.primary : 'opacity-30', 'size-9 text-xl']" @click="handleFavorite(tea.id)">♥</button></article></div>
      <button type="button" :class="[palette.border, 'border-t px-4 py-5 text-left']" @click="drawerOpen = false; settingsOpen = true">⚙  Настройки</button>
    </aside>

    <template v-if="activeSheet"><button type="button" aria-label="Закрыть окно" class="fixed inset-0 z-40 bg-black/60" @click="activeSheet = null" /><section :class="[palette.surface, 'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[28px] px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 shadow-2xl md:left-1/2 md:w-[580px] md:-translate-x-1/2']" role="dialog" aria-modal="true"><div :class="[palette.high, 'mx-auto mb-3 h-1 w-9 rounded-full']" />
      <template v-if="activeSheet === 'mode'"><h2 class="text-2xl font-bold">{{ selectedTea?.preset ? selectedTea.name : 'Параметры заваривания' }}</h2><template v-if="selectedTea?.preset"><p :class="[palette.primary, 'mt-2']">{{ selectedTea.temperature }}°C · {{ selectedTea.grams }} г / 100 мл · {{ state.infusionSeconds.length }} проливов</p><p class="mt-3 text-sm opacity-65">{{ selectedTea.description }}</p><button type="button" :class="[palette.primary, 'mt-3']" @click="expandedGuidance = !expandedGuidance">{{ expandedGuidance ? 'Скрыть рекомендации' : 'Как заваривать · рекомендации и источник' }}</button><div v-if="expandedGuidance" class="mt-3 text-sm leading-6 opacity-75"><p class="whitespace-pre-line">{{ getPresetGuidance(selectedTea.id) }}</p><a :href="getPresetSource(selectedTea.id)" target="_blank" rel="noopener noreferrer" :class="[palette.primary, 'mt-2 inline-block']">Открыть источник</a></div><button type="button" :class="[palette.button, 'mt-5 h-14 w-full rounded-full font-bold text-[#081018]']" @click="handleCustomMode">Перейти в свободный режим</button></template><template v-else><p class="mt-2 text-sm opacity-65">После изменения параметров церемония начнётся заново.</p><div class="mt-4 grid grid-cols-2 gap-3"><label class="text-xs">Первый пролив<input v-model="modeForm.first" type="number" min="1" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-3 py-3 text-base" /></label><label class="text-xs">Увеличение<input v-model="modeForm.increment" type="number" min="0" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-3 py-3 text-base" /></label></div><button type="button" :disabled="!modeValid" :class="[palette.button, 'mt-5 h-14 w-full rounded-full font-bold text-[#081018] disabled:opacity-40']" @click="handleSaveMode">Применить</button></template></template>
      <template v-else-if="activeSheet === 'editor'"><h2 class="text-2xl font-bold">{{ teaForm.id ? 'Настройка чая' : 'Новый чай' }}</h2><label class="mt-4 block text-xs">Название<input v-model="teaForm.name" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-3 py-3 text-base" /></label><div class="mt-3 grid grid-cols-2 gap-3"><label v-for="field in [{key:'temperature',label:'Температура'},{key:'grams',label:'Чай, г / 100 мл'},{key:'first',label:'Первый пролив'},{key:'increment',label:'Увеличение'}]" :key="field.key" class="text-xs">{{ field.label }}<input v-model="teaForm[field.key]" type="number" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-3 py-3 text-base" /></label></div><label class="mt-3 block text-xs">Описание<textarea v-model="teaForm.description" rows="3" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-3 py-3 text-base" /></label><button type="button" :disabled="!teaValid" :class="[palette.button, 'mt-4 h-14 w-full rounded-full font-bold text-[#081018] disabled:opacity-40']" @click="handleSaveTea">Сохранить чай</button></template>
      <template v-else-if="activeSheet === 'preset' && editorProfile"><h2 class="text-2xl font-bold">{{ editorProfile.name }}</h2><p class="mt-2 text-sm opacity-65">{{ editorProfile.description }}</p><div class="mt-4 grid grid-cols-2 gap-3"><label class="text-xs">Температура<input v-model="presetForm.temperature" type="number" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-3 py-3 text-base" /></label><label class="text-xs">На 100 мл, г<input v-model="presetForm.grams" type="number" step="0.1" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-3 py-3 text-base" /></label></div><button type="button" :class="[palette.primary, 'mt-3']" @click="expandedGuidance = !expandedGuidance">{{ expandedGuidance ? 'Скрыть рекомендации' : 'Как заваривать · рекомендации и источник' }}</button><div v-if="expandedGuidance" class="mt-3 text-sm leading-6 opacity-75"><p class="whitespace-pre-line">{{ getPresetGuidance(editorProfile.id) }}</p><a :href="getPresetSource(editorProfile.id)" target="_blank" rel="noopener noreferrer" :class="[palette.primary, 'mt-2 inline-block']">Открыть источник</a></div><div class="mt-4 grid grid-cols-3 gap-2"><label v-for="(_, index) in presetForm.times" :key="index" class="text-[11px]">Пролив {{ index + 1 }}<input v-model="presetForm.times[index]" type="number" class="mt-1 w-full rounded-xl border border-current/30 bg-transparent px-2 py-2.5 text-base" /></label></div><button type="button" :disabled="!presetValid" :class="[palette.button, 'mt-4 h-14 w-full rounded-full font-bold text-[#081018] disabled:opacity-40']" @click="handleSavePreset">Сохранить и выбрать</button><button type="button" :class="[palette.primary, 'mt-3 w-full py-2']" @click="handleRestorePreset">Вернуть исходные параметры</button></template>
    </section></template>

    <template v-if="pendingAction"><div class="fixed inset-0 z-[60] bg-black/70" /><section :class="[palette.surface, 'fixed left-1/2 top-1/2 z-[70] w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] p-6']" role="alertdialog" aria-modal="true"><h2 class="text-xl font-bold">Начать церемонию заново?</h2><p class="mt-2 opacity-65">Текущее время и количество проливов будут сброшены.</p><div class="mt-6 flex justify-end gap-2"><button type="button" class="rounded-full px-4 py-2" @click="pendingAction = null">Отмена</button><button type="button" :class="[palette.button, 'rounded-full px-5 py-2 font-semibold text-[#081018]']" @click="handleConfirm">Продолжить</button></div></section></template>
  </main>
</template>
