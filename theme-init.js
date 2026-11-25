// Runs before first paint so the saved theme never flashes. (External file: the CSP forbids inline scripts.)
try { const t = localStorage.getItem('rupiq:theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
