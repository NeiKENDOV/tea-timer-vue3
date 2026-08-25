<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const STORAGE_KEY = 'tea-timer-vue3-state'
const defaults = {
  profiles: [], selectedTeaId: null, firstSeconds: 10, incrementSeconds: 5,
  targetSeconds: 10, currentSeconds: 0, infusions: 0, running: false,
  startedAt: null, sound: true, vibration: true, notification: true, theme: 'system'
}

const stored = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} } catch { return {} } })()
const state = reactive({ ...defaults, ...stored })
const drawerOpen = ref(false)
const sheet = ref(null)
const settingsOpen = ref(false)
const form = reactive({ id: null, name: '', temperature: 90, grams: 5, firstSeconds: 10, incrementSeconds: 5, description: '' })
const modeForm = reactive({ firstSeconds: state.firstSeconds, incrementSeconds: state.incrementSeconds })
const frame = ref('idle')
const pouring = ref(false)
const prefersDarkColorScheme = ref(false)
const themeOptions = [
  { id: 'system', label: 'Системная' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' }
]
const completionAudio = new Audio('/ding.mp3')
let timerId
let frameId
let pourId
let colorSchemeQuery

const selectedTea = computed(() => state.profiles.find(tea => tea.id === state.selectedTeaId))
const title = computed(() => selectedTea.value?.name || 'Свободный режим')
const progress = computed(() => Math.min(100, (state.currentSeconds / Math.max(1, state.targetSeconds)) * 100))
const dark = computed(() => state.theme === 'dark' || (state.theme === 'system' && prefersDarkColorScheme.value))
const formValid = computed(() => form.name.trim() && +form.temperature > 0 && +form.grams > 0 && +form.firstSeconds > 0 && +form.incrementSeconds >= 0)
const modeValid = computed(() => +modeForm.firstSeconds > 0 && +modeForm.incrementSeconds >= 0)

watch(state, value => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true })
watch(dark, value => document.documentElement.classList.toggle('dark', value), { immediate: true })

const syncElapsed = () => {
  if (!state.running || !state.startedAt) return
  state.currentSeconds = Math.floor((Date.now() - state.startedAt) / 1000)
  if (state.currentSeconds >= state.targetSeconds) completeInfusion()
}

const handleToggleTimer = () => {
  if (state.running) {
    syncElapsed()
    state.running = false
    state.startedAt = null
    stopFrameCycle()
  } else {
    state.running = true
    state.startedAt = Date.now() - state.currentSeconds * 1000
    startFrameCycle()
  }
}

const completeInfusion = () => {
  state.running = false
  state.startedAt = null
  state.currentSeconds = 0
  state.infusions++
  state.targetSeconds += state.incrementSeconds
  stopFrameCycle()
  pouring.value = true
  frame.value = 'pouring'
  clearTimeout(pourId)
  pourId = setTimeout(() => { pouring.value = false; frame.value = 'idle' }, 1300)
  signalFinished()
}

const signalFinished = () => {
  if (state.vibration && navigator.vibrate) navigator.vibrate(400)
  if (state.sound) {
    completionAudio.currentTime = 0
    completionAudio.play().catch(() => {})
  }
  if (state.notification && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then(reg => reg.showNotification('Пролив завершён', { body: `${title.value}: следующий пролив ${state.targetSeconds} сек`, icon: '/pwa-192x192.webp' }))
  }
}

const startFrameCycle = () => {
  stopFrameCycle()
  frame.value = 'filling'
  let step = 0
  frameId = setInterval(() => { frame.value = step++ % 2 ? 'breathing' : 'heating' }, 900)
}

const stopFrameCycle = () => {
  clearInterval(frameId)
  if (!pouring.value) frame.value = 'idle'
}

const handleReset = () => {
  state.running = false; state.startedAt = null; state.currentSeconds = 0
  state.targetSeconds = state.firstSeconds; state.infusions = 0
  stopFrameCycle()
}

const handleUseCustomMode = () => {
  state.selectedTeaId = null
  handleReset()
  drawerOpen.value = false
}

const handleSelectTea = tea => {
  state.selectedTeaId = tea.id
  state.firstSeconds = tea.firstSeconds
  state.incrementSeconds = tea.incrementSeconds
  handleReset()
  drawerOpen.value = false
}

const handleOpenModeSheet = () => {
  modeForm.firstSeconds = state.firstSeconds
  modeForm.incrementSeconds = state.incrementSeconds
  sheet.value = 'mode'
}

const handleSaveMode = () => {
  state.selectedTeaId = null
  state.firstSeconds = +modeForm.firstSeconds
  state.incrementSeconds = +modeForm.incrementSeconds
  handleReset()
  sheet.value = null
}

const handleOpenEditor = (tea = null) => {
  Object.assign(form, tea || { id: null, name: '', temperature: 90, grams: 5, firstSeconds: 10, incrementSeconds: 5, description: '' })
  sheet.value = 'editor'
}

const handleSaveTea = () => {
  const tea = { ...form, id: form.id || Date.now(), name: form.name.trim(), temperature: +form.temperature, grams: +form.grams, firstSeconds: +form.firstSeconds, incrementSeconds: +form.incrementSeconds, description: form.description.trim() }
  state.profiles = [...state.profiles.filter(item => item.id !== tea.id), tea]
  handleSelectTea(tea)
  sheet.value = null
}

const handleDeleteTea = tea => {
  state.profiles = state.profiles.filter(item => item.id !== tea.id)
  if (state.selectedTeaId === tea.id) handleUseCustomMode()
}

const handleToggleNotifications = async () => {
  if (!state.notification && 'Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    state.notification = permission === 'granted'
  } else state.notification = !state.notification
}

const handleColorSchemeChange = event => {
  prefersDarkColorScheme.value = event.matches
}

const handleKeyDown = event => {
  if (event.key !== 'Escape') return
  if (sheet.value) sheet.value = null
  else if (settingsOpen.value) settingsOpen.value = false
  else drawerOpen.value = false
}

onMounted(() => {
  colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  prefersDarkColorScheme.value = colorSchemeQuery.matches
  colorSchemeQuery.addEventListener('change', handleColorSchemeChange)
  if (state.running) { syncElapsed(); if (state.running) startFrameCycle() }
  timerId = setInterval(syncElapsed, 250)
  document.addEventListener('visibilitychange', syncElapsed)
  window.addEventListener('keydown', handleKeyDown)
})
onBeforeUnmount(() => {
  clearInterval(timerId); clearInterval(frameId); clearTimeout(pourId)
  document.removeEventListener('visibilitychange', syncElapsed)
  window.removeEventListener('keydown', handleKeyDown)
  colorSchemeQuery?.removeEventListener('change', handleColorSchemeChange)
})
</script>

<template>
  <main class="app-shell">
    <template v-if="!settingsOpen">
      <header class="topbar">
        <button class="icon-button" aria-label="Выбрать чай" @click="drawerOpen = true">
          <span></span><span></span><span></span>
        </button>
        <h1>{{ title }}</h1>
        <button class="icon-button reset" aria-label="Сбросить таймер" @click="handleReset">↻</button>
      </header>

      <section class="timer-screen">
        <div class="hero-spacer"></div>
        <button class="timer-orb" :class="{ running: state.running }" :style="{ '--progress': `${progress * 3.6}deg` }" :aria-label="state.running ? 'Остановить пролив' : 'Начать пролив'" @click="handleToggleTimer">
          <span class="pulse pulse-one"></span><span class="pulse pulse-two"></span>
          <span class="progress-ring"><span class="orb-inner"><img :src="`/tea-${frame}.png`" alt="" /></span></span>
        </button>
        <button class="timer-details" aria-label="Изменить параметры заваривания" @click="handleOpenModeSheet">
          <span class="time"><strong>{{ state.currentSeconds }}</strong><span> / {{ state.targetSeconds }} сек</span></span>
          <span class="infusions">Количество проливов: {{ state.infusions }}</span>
          <span class="next">Следующий пролив +{{ state.incrementSeconds }} сек</span>
        </button>
        <div class="hero-spacer bottom"></div>
      </section>
    </template>

    <template v-else>
      <header class="topbar"><button class="back-button" aria-label="Назад" @click="settingsOpen = false">←</button><h1>Настройки</h1><span class="header-space"></span></header>
      <section class="settings">
        <p class="section-label">СИГНАЛЫ</p>
        <div class="settings-card">
          <label class="setting-row"><span><b>Звук</b><small>Сигнал после завершения пролива</small></span><input v-model="state.sound" type="checkbox"><i></i></label>
          <label class="setting-row"><span><b>Вибрация</b><small>Короткий отклик после завершения</small></span><input v-model="state.vibration" type="checkbox"><i></i></label>
          <label class="setting-row" @click.prevent="handleToggleNotifications"><span><b>Показать уведомление</b><small>Сообщить о завершении в фоне</small></span><input :checked="state.notification" type="checkbox"><i></i></label>
        </div>
        <p class="section-label">ОФОРМЛЕНИЕ</p>
        <div class="theme-card"><b>Тема</b><div class="theme-options"><button v-for="option in themeOptions" :key="option.id" :class="{ active: state.theme === option.id }" :aria-pressed="state.theme === option.id" @click="state.theme = option.id">{{ option.label }}</button></div></div>
      </section>
    </template>

    <Transition name="fade"><div v-if="drawerOpen" class="scrim" @click="drawerOpen = false"></div></Transition>
    <Transition name="drawer">
      <aside v-if="drawerOpen" class="drawer">
        <div class="drawer-title"><h2>Мои чаи</h2><button class="tonal-button" @click="handleOpenEditor()">Добавить</button></div>
        <button class="drawer-item" :class="{ selected: state.selectedTeaId === null }" @click="handleUseCustomMode"><span class="tea-glyph">♨</span>Свободный режим</button>
        <hr>
        <p v-if="!state.profiles.length" class="empty">Здесь появятся сохранённые параметры любимых чаёв.</p>
        <div class="tea-list">
          <button v-for="tea in state.profiles" :key="tea.id" class="tea-card" :class="{ selected: state.selectedTeaId === tea.id }" @click="handleSelectTea(tea)">
            <span class="tea-name">{{ tea.name }}</span>
            <span class="tea-actions"><span role="button" tabindex="0" :aria-label="`Изменить чай ${tea.name}`" @click.stop="handleOpenEditor(tea)" @keydown.enter.stop="handleOpenEditor(tea)" @keydown.space.prevent.stop="handleOpenEditor(tea)">Изм.</span><span class="delete" role="button" tabindex="0" :aria-label="`Удалить чай ${tea.name}`" @click.stop="handleDeleteTea(tea)" @keydown.enter.stop="handleDeleteTea(tea)" @keydown.space.prevent.stop="handleDeleteTea(tea)">×</span></span>
            <small>{{ tea.temperature }}° · {{ tea.grams }} г · {{ tea.firstSeconds }} + {{ tea.incrementSeconds }} сек</small>
          </button>
        </div>
        <button class="drawer-item settings-link" @click="drawerOpen = false; settingsOpen = true"><span>⚙</span>Настройки</button>
      </aside>
    </Transition>

    <Transition name="fade"><div v-if="sheet" class="scrim sheet-scrim" @click="sheet = null"></div></Transition>
    <Transition name="sheet">
      <section v-if="sheet" class="bottom-sheet">
        <div class="handle"></div>
        <template v-if="sheet === 'mode'">
          <h2>Параметры заваривания</h2>
          <p>Изменение параметров переведёт таймер в свободный режим.</p>
          <div class="field-grid">
            <label>Первый пролив<div><input v-model="modeForm.firstSeconds" type="number" min="1"><span>сек</span></div></label>
            <label>Увеличение<div><input v-model="modeForm.incrementSeconds" type="number" min="0"><span>сек</span></div></label>
          </div>
          <button class="primary-button" :disabled="!modeValid" @click="handleSaveMode">Применить</button>
        </template>
        <template v-else>
          <h2>{{ form.id ? 'Настройка чая' : 'Новый чай' }}</h2>
          <label class="text-field">Название<input v-model="form.name" autocomplete="off"></label>
          <div class="field-grid">
            <label>Температура<div><input v-model="form.temperature" type="number"><span>°C</span></div></label>
            <label>Чай<div><input v-model="form.grams" type="number" step="0.1"><span>г / 100 мл</span></div></label>
            <label>Первый пролив<div><input v-model="form.firstSeconds" type="number"><span>сек</span></div></label>
            <label>Увеличение<div><input v-model="form.incrementSeconds" type="number"><span>сек</span></div></label>
          </div>
          <label class="text-field">Описание<textarea v-model="form.description" rows="3"></textarea></label>
          <button class="primary-button" :disabled="!formValid" @click="handleSaveTea">Сохранить чай</button>
        </template>
      </section>
    </Transition>
  </main>
</template>
