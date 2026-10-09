// Resolve the saved choice before first paint. Keep light as the default.
(() => {
  let animations = 'on'
  try { if (localStorage.getItem('inuvair-animations') === 'off') animations = 'off' } catch {}
  document.documentElement.dataset.animations = animations
  window.setAnimations = enabled => {
    animations = enabled ? 'on' : 'off'
    document.documentElement.dataset.animations = animations
    try { localStorage.setItem('inuvair-animations', animations) } catch {}
  }
  const choices = ['system', 'light', 'dark']
  const system = matchMedia('(prefers-color-scheme: dark)')
  let theme = 'light'
  try {
    const saved = localStorage.getItem('inuvair-theme')
    if (choices.includes(saved)) theme = saved
  } catch {}
  const apply = () => {
    document.documentElement.dataset.theme = theme === 'system'
      ? (system.matches ? 'dark' : 'light') : theme
  }
  apply()
  system.addEventListener('change', apply)

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle')
    if (!button) return
    const icons = { system: 'settings', light: 'sun', dark: 'moon' }
    const update = () => {
      const next = choices[(choices.indexOf(theme) + 1) % choices.length]
      button.innerHTML = `<span class="theme-icon theme-icon-${icons[theme]}" aria-hidden="true"></span>`
      button.title = `Appearance: ${theme}. Switch to ${next}`
      button.setAttribute('aria-label', button.title)
    }
    button.onclick = () => {
      theme = choices[(choices.indexOf(theme) + 1) % choices.length]
      try { localStorage.setItem('inuvair-theme', theme) } catch {}
      apply()
      update()
    }
    update()
    button.hidden = false
  })
})()
