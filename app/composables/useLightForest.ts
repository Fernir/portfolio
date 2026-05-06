/** Режим «светлый лес»: класс на `<html>` + сохранение в localStorage. */
const STORAGE_KEY = 'port-light-forest'

export function useLightForest() {
  const lightForest = useState<boolean>('lightForest', () => false)

  function syncDom() {
    if (!import.meta.client) return
    document.documentElement.classList.toggle('light-forest', lightForest.value)
    try {
      localStorage.setItem(STORAGE_KEY, lightForest.value ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }

  onMounted(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === '1') lightForest.value = true
      if (stored === '0') lightForest.value = false
    } catch {
      /* ignore */
    }
    syncDom()
  })

  watch(lightForest, syncDom, { flush: 'post' })

  function toggleLightForest() {
    lightForest.value = !lightForest.value
  }

  return { lightForest, toggleLightForest }
}
