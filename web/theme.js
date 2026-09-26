// Apply the saved choice before first paint. Light is the default.
(() => {
  let theme = 'light'
  try { if (localStorage.getItem('inuvair-theme') === 'dark') theme = 'dark' } catch {}
  document.documentElement.dataset.theme = theme

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle')
    if (!button) return
    const update = () => {
      const dark = document.documentElement.dataset.theme === 'dark'
      button.textContent = dark ? 'Light mode' : 'Dark mode'
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode')
    }
    button.onclick = () => {
      theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = theme
      try { localStorage.setItem('inuvair-theme', theme) } catch {}
      update()
    }
    update()
    button.hidden = false
  })
})()
