(function () {
  try {
    var themes = {
      paper: ['#f4ede1', true],
      parchment: ['#ede2cd', true],
      eink: ['#dfdfdf', true],
      pure: ['#f1f5f9', true],
      sakura: ['#fbf1f3', true],
      midnight: ['#06090f', false],
      amber: ['#14100c', false],
      amoled: ['#000000', false],
      forest: ['#0c1813', false],
      nordic: ['#15181e', false]
    };
    var saved = localStorage.getItem('otium_theme') || localStorage.getItem('tirs_theme') || 'nordic';
    var entry = themes[saved] || themes.nordic;
    var root = document.documentElement;
    root.className = 'theme-' + (themes[saved] ? saved : 'nordic');
    root.style.colorScheme = entry[1] ? 'light' : 'dark';
    root.style.backgroundColor = entry[0];
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', entry[0]);
    var bridge = window.OtiumTheme;
    if (bridge && bridge.setTheme) {
      bridge.setTheme(entry[1] ? 'light' : 'dark', entry[0], entry[1]);
    }
  } catch (error) {}
})();
