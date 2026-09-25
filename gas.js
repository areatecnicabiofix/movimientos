/**
 * js/gas.js — hace que una pantalla de Apps Script funcione en GitHub Pages SIN reescribirla.
 *
 * Reemplaza  google.script.run.withSuccessHandler(...).withFailureHandler(...).funcion(args)
 * por un envío (POST) al Apps Script, con el token de sesión del puesto.
 * El HTML original queda igual: solo se agregan 3 líneas en el <head>.
 *
 * Además muestra el ingreso (usuario + contraseña) si la tablet no tiene sesión,
 * y las llamadas que haga la pantalla al arrancar esperan a que el puesto ingrese.
 *
 * Requiere, ANTES de este archivo:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="js/config.js"></script>
 */
(function () {
  var CFG = window.BIOFIX_CFG;
  if (!CFG || !window.supabase) {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.innerHTML = '<p style="font-family:Arial;color:#b91c1c;padding:20px;">' +
        'No se pudo cargar la configuración o la librería de Supabase. Revisá la conexión y recargá.</p>';
    });
    return;
  }

  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  var resolverSesion;
  var sesionLista = new Promise(function (r) { resolverSesion = r; });
  var PANTALLA = String(window.BIOFIX_PANTALLA || '').toLowerCase();   // sector de esta página
  var ADMINS = (CFG.admins || []).map(function (x) { return String(x).toLowerCase(); });

  function sectorDe(session) {
    return String((session && session.user && session.user.email) || '').split('@')[0].toLowerCase();
  }
  function permitido(session) {
    var u = sectorDe(session);
    return !PANTALLA || u === PANTALLA || ADMINS.indexOf(u) >= 0;
  }
  function salir() { return sb.auth.signOut().then(function () { location.reload(); }); }

  /** Si el usuario es del sector de esta pantalla, sigue; si no, bloquea y ofrece salir. */
  function verificar(session) {
    if (permitido(session)) { mostrarChip(session); resolverSesion(session); return; }
    var d = document.createElement('div');
    d.id = 'bfBloqueo';
    d.setAttribute('style', 'position:fixed;inset:0;background:#f8fafc;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;');
    d.innerHTML =
      '<div style="width:340px;max-width:92vw;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:22px;text-align:center;">' +
        '<div style="font-size:16px;font-weight:700;color:#b91c1c;margin-bottom:10px;">Esta tablet está ingresada como "' + sectorDe(session) + '"</div>' +
        '<div style="font-size:14px;color:#475569;margin-bottom:16px;">Esta pantalla es de <b>' + PANTALLA + '</b>. Para usarla hay que salir e ingresar con el usuario de ' + PANTALLA + '.</div>' +
        '<button id="bfSalirB" style="width:100%;padding:11px;font-size:14px;font-weight:700;background:#0284c7;color:#fff;border:none;border-radius:8px;cursor:pointer;">Salir e ingresar con otro usuario</button>' +
      '</div>';
    document.body.appendChild(d);
    document.getElementById('bfSalirB').onclick = salir;
  }

  /** Cartelito fijo abajo a la derecha: "Puesto: mecanizado · Salir". */
  function mostrarChip(session) {
    if (document.getElementById('bfChip')) return;
    var c = document.createElement('div');
    c.id = 'bfChip';
    c.setAttribute('style', 'position:fixed;right:10px;bottom:10px;z-index:99998;background:#fff;border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;font:12px Arial,sans-serif;color:#475569;box-shadow:0 1px 4px rgba(0,0,0,.08);');
    var esAdmin = ADMINS.indexOf(sectorDe(session)) >= 0;
    c.innerHTML = 'Puesto: <b>' + sectorDe(session) + '</b> · ' +
      (esAdmin && PANTALLA ? '<a href="index.html" style="color:#0284c7;">Menú</a> · ' : '') +   // solo "tecnica" vuelve al menú
      '<a href="#" id="bfSalirC" style="color:#0284c7;">Salir</a>';
    document.body.appendChild(c);
    document.getElementById('bfSalirC').onclick = function (e) { e.preventDefault(); salir(); };
  }

  /* ---------------- ingreso ---------------- */
  function usuarioAEmail(u) {
    u = String(u || '').trim().toLowerCase();
    return u.indexOf('@') >= 0 ? u : u + '@' + CFG.dominioUsuarios;
  }

  function mostrarLogin() {
    if (document.getElementById('bfLogin')) return;
    var d = document.createElement('div');
    d.id = 'bfLogin';
    d.setAttribute('style', 'position:fixed;inset:0;background:#f8fafc;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;');
    d.innerHTML =
      '<div style="width:320px;max-width:92vw;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:22px;">' +
        '<div style="font-size:18px;font-weight:600;color:#0369a1;margin-bottom:14px;">' + (CFG.titulo || 'Bio-Fix') + '</div>' +
        '<input id="bfUser" type="text" placeholder="Usuario (ej: ' + (PANTALLA || 'mecanizado') + ')" autocapitalize="none" autocomplete="username" ' +
          'style="width:100%;box-sizing:border-box;margin-bottom:10px;padding:10px;font-size:14px;border:1px solid #e2e8f0;border-radius:6px;">' +
        '<input id="bfPass" type="password" placeholder="Contraseña" autocomplete="current-password" ' +
          'style="width:100%;box-sizing:border-box;margin-bottom:10px;padding:10px;font-size:14px;border:1px solid #e2e8f0;border-radius:6px;">' +
        '<button id="bfBtn" style="width:100%;padding:11px;font-size:14px;font-weight:700;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer;">Ingresar</button>' +
        '<div id="bfMsg" style="font-size:13px;color:#b91c1c;margin-top:10px;"></div>' +
      '</div>';
    document.body.appendChild(d);
    var go = function () {
      var btn = document.getElementById('bfBtn'), m = document.getElementById('bfMsg');
      btn.disabled = true; m.textContent = '';
      sb.auth.signInWithPassword({
        email: usuarioAEmail(document.getElementById('bfUser').value),
        password: document.getElementById('bfPass').value
      }).then(function (r) {
        btn.disabled = false;
        if (r.error) { m.textContent = 'Usuario o contraseña incorrectos.'; return; }
        d.parentNode.removeChild(d);
        verificar(r.data.session);
      });
    };
    document.getElementById('bfBtn').onclick = go;
    document.getElementById('bfPass').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  function arrancar() {
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) verificar(r.data.session); else mostrarLogin();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();

  /* ---------------- llamada al Apps Script ---------------- */
  /** Guarda cuánto tardó cada llamada (tabla api_tiempos) para saber qué conviene acelerar.
   *  No espera la respuesta: no agrega demora a la pantalla. */
  function medir(fn, t0, ok) {
    try {
      sb.from('api_tiempos').insert({ pantalla: PANTALLA || 'inicio', fn: fn, ms: Math.round(performance.now() - t0), ok: ok })
        .then(function () {}, function () {});
    } catch (e) { /* nunca romper la pantalla por la medición */ }
  }

  function llamar(fn, args) {
    return sesionLista.then(function () {
      var t0 = performance.now();   // se mide desde que hay sesión (no cuenta el tiempo de login)
      return llamarSinMedir(fn, args).then(
        function (d) { medir(fn, t0, true); return d; },
        function (e) { medir(fn, t0, false); throw e; }
      );
    });
  }

  function llamarSinMedir(fn, args) {
    return sesionLista.then(function () { return sb.auth.getSession(); }).then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { mostrarLogin(); throw new Error('Sesión vencida. Volvé a ingresar.'); }
      return fetch(CFG.apiUrl, {
        method: 'POST',
        body: JSON.stringify({ fn: fn, args: args, token: s.access_token }) // text/plain: sin preflight CORS
      });
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Apps Script respondió ' + resp.status);
      return resp.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'Error desconocido');
      return j.data;
    });
  }

  /* ---------------- lecturas rápidas desde Supabase ----------------
   * Una página puede definir window.BIOFIX_LOCAL = { nombreFuncion: function (args...) { return Promise } }
   * para que esa función se resuelva en Supabase en vez de Apps Script (mismo resultado, más rápido).
   * Con ?modo=hoja en la dirección se desactiva y todo vuelve a ir por Apps Script (plan B). */
  var MODO_HOJA = /[?&]modo=hoja\b/.test(location.search);
  function local(fn) {
    var L = window.BIOFIX_LOCAL;
    return (!MODO_HOJA && L && typeof L[fn] === 'function') ? L[fn] : null;
  }

  /* Funciones que casi no cambian (ej. catálogo): se muestran al instante desde la tablet
   * y se actualizan en segundo plano para la próxima vez. window.BIOFIX_CACHE = ['mecCatalogo'] */
  function cacheable(fn) { return (window.BIOFIX_CACHE || []).indexOf(fn) >= 0; }
  function cacheKey(fn, args) { return 'bfcache:' + PANTALLA + ':' + fn + ':' + JSON.stringify(args); }

  function ejecutar(fn, args) {
    var L = local(fn);
    if (L) {
      return sesionLista.then(function () {
        var t0 = performance.now();
        return Promise.resolve().then(function () { return L.apply(null, args); }).then(
          function (d) { medir(fn + ' [supabase]', t0, true); return d; },
          function (e) { medir(fn + ' [supabase]', t0, false); throw e; }
        );
      });
    }
    if (cacheable(fn)) {
      var k = cacheKey(fn, args), guardado = null;
      try { guardado = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
      var fresco = llamar(fn, args).then(function (d) {
        try { localStorage.setItem(k, JSON.stringify(d)); } catch (e) {}
        return d;
      });
      if (guardado != null) { fresco.catch(function () {}); return Promise.resolve(guardado); }
      return fresco;
    }
    return llamar(fn, args);
  }

  function runner(ok, fail, user) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (h) { return runner(h, fail, user); };
        if (prop === 'withFailureHandler') return function (h) { return runner(ok, h, user); };
        if (prop === 'withUserObject')     return function (u) { return runner(ok, fail, u); };
        if (typeof prop !== 'string') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          ejecutar(prop, args)
            .then(function (d) { if (ok) ok(d, user); })
            .catch(function (e) {
              var err = e instanceof Error ? e : new Error(String(e));
              if (fail) fail(err, user); else console.error(prop, err);
            });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = {
    run: runner(null, null, undefined),
    host: { close: function () {}, setHeight: function () {}, setWidth: function () {} }
  };

  window.BIOFIX = {
    supabase: sb,
    llamar: llamar,
    sesion: sesionLista,          // promesa: se cumple cuando el puesto ya ingresó y tiene permiso
    sectorDe: sectorDe,
    salir: salir
  };
})();
