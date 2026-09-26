// Resolve the saved choice before first paint. Keep light as the default.
(() => {
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
    const picker = document.createElement('div')
    picker.className = 'theme-picker'
    button.before(picker)
    picker.append(button)
    const menu = document.createElement('div')
    menu.id = 'theme-menu'
    menu.className = 'theme-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', 'Appearance')
    menu.hidden = true
    const icons = { system: 'settings', light: 'sun', dark: 'moon' }
    const options = choices.map(choice => {
      const option = document.createElement('button')
      option.type = 'button'
      option.setAttribute('role', 'menuitemradio')
      option.tabIndex = -1
      option.innerHTML = `<span class="theme-icon theme-icon-${icons[choice]}" aria-hidden="true"></span><span>${choice[0].toUpperCase() + choice.slice(1)}</span><span class="theme-check" aria-hidden="true">✓</span>`
      option.onclick = () => {
        theme = choice
        try { localStorage.setItem('inuvair-theme', theme) } catch {}
        apply()
        update()
        close(true)
      }
      menu.append(option)
      return option
    })
    picker.append(menu)
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-controls', menu.id)
    button.setAttribute('aria-expanded', 'false')
    const update = () => {
      button.innerHTML = `<span class="theme-icon theme-icon-${icons[theme]}" aria-hidden="true"></span>`
      button.title = `Appearance: ${theme}`
      button.setAttribute('aria-label', `Appearance: ${theme}`)
      options.forEach((option, i) => option.setAttribute('aria-checked', String(choices[i] === theme)))
    }
    const close = (restoreFocus = false) => {
      menu.hidden = true
      button.setAttribute('aria-expanded', 'false')
      if (restoreFocus) button.focus()
    }
    const open = () => {
      menu.hidden = false
      button.setAttribute('aria-expanded', 'true')
      options[choices.indexOf(theme)].focus()
    }
    button.onclick = () => menu.hidden ? open() : close()
    button.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); event.stopPropagation() }
    })
    picker.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true) }
      if (event.key === 'Tab') close()
      if (menu.hidden || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const index = options.indexOf(document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2
        : (index + (event.key === 'ArrowDown' ? 1 : 2)) % 3
      options[next].focus()
    })
    document.addEventListener('click', event => { if (!picker.contains(event.target)) close() })
    picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) close() })
    update()
    button.hidden = false
  })
})()
