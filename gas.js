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
        '<input id="bfUser" type="text" placeholder="Usuario (ej: mecanizado)" autocapitalize="none" autocomplete="username" ' +
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
        resolverSesion(r.data.session);
      });
    };
    document.getElementById('bfBtn').onclick = go;
    document.getElementById('bfPass').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  function arrancar() {
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) resolverSesion(r.data.session); else mostrarLogin();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();

  /* ---------------- llamada al Apps Script ---------------- */
  function llamar(fn, args) {
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

  function runner(ok, fail, user) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (h) { return runner(h, fail, user); };
        if (prop === 'withFailureHandler') return function (h) { return runner(ok, h, user); };
        if (prop === 'withUserObject')     return function (u) { return runner(ok, fail, u); };
        if (typeof prop !== 'string') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          llamar(prop, args)
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
    salir: function () { return sb.auth.signOut().then(function () { location.reload(); }); }
  };
})();
