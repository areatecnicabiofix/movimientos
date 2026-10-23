/* =====================================================================
 * CARTEL "EN MANTENIMIENTO" — Bio-Fix (repo movimientos)
 *
 * Lee la tabla "mantenimiento" de Supabase. Si está activa para esta pantalla,
 * tapa toda la pantalla con un cartel y no deja usarla. Se entera AL INSTANTE
 * cuando la activás o desactivás (y además revisa cada 1 minuto por las dudas).
 * Cuando se desactiva, la pantalla se recarga sola para tomar el código nuevo.
 *
 * Para que el área técnica pueda seguir probando mientras está el cartel:
 *   abrir cualquier pantalla con  ?mantenimiento=saltar   (queda guardado en ese navegador)
 *   y para volver a ver el cartel: ?mantenimiento=respetar
 * ===================================================================== */
(function () {
  var CFG = window.BIOFIX_CFG || {};
  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseKey) return;

  // --- saltear el cartel en este navegador (técnica) ---
  var saltar = false;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('mantenimiento') === 'saltar') localStorage.setItem('biofix_saltar_mant', '1');
    if (q.get('mantenimiento') === 'respetar') localStorage.removeItem('biofix_saltar_mant');
    saltar = localStorage.getItem('biofix_saltar_mant') === '1';
  } catch (e) {}

  var pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (pagina.indexOf('.') < 0) pagina = 'index.html';
  if (pagina === 'mantenimiento.html') return;   // el panel de ON/OFF nunca se bloquea

  // Cliente propio, sin sesión (no se mezcla con el login de gas.js)
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'biofix-mantenimiento' }
  });

  var estabaBloqueada = false;

  function aplica(r) {
    if (!r || !r.activo) return false;
    var p = r.pantallas;
    if (!p || !p.length) return true;                       // vacío = todas las pantallas
    return p.map(function (x) { return String(x).trim().toLowerCase(); }).indexOf(pagina) >= 0;
  }

  function cuandoHayBody(fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  function pintar(r) {
    cuandoHayBody(function () {
      var viejo = document.getElementById('biofix-mant');
      var on = aplica(r);
      if (!on) {
        if (viejo) viejo.remove();
        if (estabaBloqueada && !saltar) location.reload();    // terminó el mantenimiento: carga el código nuevo
        estabaBloqueada = false;
        return;
      }
      var msg = (r.mensaje && String(r.mensaje).trim()) || 'Estamos actualizando el sistema. Volvé a intentar en unos minutos.';
      if (viejo) viejo.remove();
      var el = document.createElement('div');
      el.id = 'biofix-mant';
      if (saltar) {
        // Técnica: solo un aviso chico arriba, la pantalla se puede usar
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#f59e0b;color:#111;' +
          'font:bold 13px Arial,sans-serif;text-align:center;padding:6px';
        el.textContent = 'MANTENIMIENTO ACTIVO (vos lo estás salteando): ' + msg;
      } else {
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.92);display:flex;' +
          'align-items:center;justify-content:center;padding:24px';
        el.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;padding:28px 24px;' +
          'text-align:center;font-family:Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.4)">' +
          '<div style="font-size:48px;line-height:1">🛠️</div>' +
          '<div style="font-size:22px;font-weight:bold;color:#0f172a;margin:12px 0 8px">Pantalla en mantenimiento</div>' +
          '<div id="biofix-mant-msg" style="font-size:16px;color:#334155;white-space:pre-line"></div>' +
          '<div style="font-size:12px;color:#94a3b8;margin-top:16px">Se habilita sola cuando termine. No hace falta recargar.</div>' +
          '</div>';
        el.querySelector('#biofix-mant-msg').textContent = msg;
        // bloquea teclado y clics de la pantalla de atrás
        el.addEventListener('keydown', function (e) { e.stopPropagation(); e.preventDefault(); }, true);
        estabaBloqueada = true;
      }
      document.body.appendChild(el);
    });
  }

  function leer() {
    sb.from('mantenimiento').select('activo,mensaje,pantallas').eq('id', 1).maybeSingle()
      .then(function (res) { if (!res.error) pintar(res.data); });
  }

  leer();
  setInterval(leer, 60000);
  try {
    sb.channel('biofix-mantenimiento')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mantenimiento' }, function (p) { pintar(p.new); })
      .subscribe();
  } catch (e) {}
})();
