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
 * MENSAJES CLAROS (oct 2026) — solo cambia lo que se MUESTRA, no cómo se guarda:
 *   - "Failed to fetch" / "respondió 404" / respuestas que no son datos -> explicación en castellano.
 *   - Aviso arriba cuando la tablet se queda sin internet (y cuando vuelve).
 *   - Si un guardado tarda más de 12 s, aviso "el servidor está tardando, no cierres la pantalla".
 *   - Si la pantalla no tiene manejo de error para una llamada, el error se muestra igual (antes quedaba
 *     solo en la consola y parecía que no pasaba nada).
 *   La cola, el código único de cada guardado (rid), los reintentos y las lecturas siguen IGUAL.
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
  // Además del sector dueño, una página puede dejar entrar a otros puestos:
  // window.BIOFIX_PERMITIDOS = ['lavados']  (ej. Depósito — Lavado Final lo usa también Lavados)
  var PERMITIDOS = (window.BIOFIX_PERMITIDOS || []).map(function (x) { return String(x).toLowerCase(); });
  // window.BIOFIX_SOLO_ADMIN = true  → la pantalla es solo para técnica (ej. Envasado Paso 1 y Anexo)
  var SOLO_ADMIN = !!window.BIOFIX_SOLO_ADMIN;
  function permitido(session) {
    var u = sectorDe(session);
    if (ADMINS.indexOf(u) >= 0) return true;
    if (SOLO_ADMIN) return false;
    return !PANTALLA || u === PANTALLA || PERMITIDOS.indexOf(u) >= 0;
  }
  // Lo marcado con class="bf-solo-admin" (ej. links a pantallas de técnica) no se muestra a los puestos
  (function () {
    var st = document.createElement('style');
    st.textContent = '.bf-no-admin .bf-solo-admin{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  })();
  function salir() { return sb.auth.signOut().then(function () { location.reload(); }); }

  /** Si el usuario es del sector de esta pantalla, sigue; si no, bloquea y ofrece salir. */
  function verificar(session) {
    if (permitido(session)) {
      if (ADMINS.indexOf(sectorDe(session)) < 0) document.documentElement.classList.add('bf-no-admin');
      mostrarChip(session); resolverSesion(session); return;
    }
    var d = document.createElement('div');
    d.id = 'bfBloqueo';
    d.setAttribute('style', 'position:fixed;inset:0;background:#f8fafc;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;');
    d.innerHTML =
      '<div style="width:340px;max-width:92vw;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:22px;text-align:center;">' +
        '<div style="font-size:16px;font-weight:700;color:#b91c1c;margin-bottom:10px;">Esta tablet está ingresada como "' + sectorDe(session) + '"</div>' +
        '<div style="font-size:14px;color:#475569;margin-bottom:16px;">' + (SOLO_ADMIN ? 'Esta pantalla es solo para <b>técnica</b>.' : 'Esta pantalla es de <b>' + PANTALLA + '</b>. Para usarla hay que salir e ingresar con el usuario de ' + PANTALLA + '.') + '</div>' +
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
        if (r.error) {
          // NUEVO: sin internet no es "contraseña incorrecta"
          m.textContent = (navigator.onLine === false || /fetch|network/i.test(r.error.message || ''))
            ? 'Sin conexión: no se pudo verificar el usuario. Revisá el wifi y probá de nuevo.'
            : 'Usuario o contraseña incorrectos.';
          return;
        }
        d.parentNode.removeChild(d);
        verificar(r.data.session);
      }, function () {
        btn.disabled = false;
        m.textContent = 'Sin conexión: no se pudo verificar el usuario. Revisá el wifi y probá de nuevo.';
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

  /* ---------------- mensajes claros (NUEVO) ----------------
   * Solo cambian los textos. Los errores de red siguen siendo TypeError (así la cola los
   * reconoce igual que antes) y los 5xx siguen diciendo "respondió 5xx". */
  function errorDeConexion_() {
    return new TypeError('Sin conexión con el servidor (Failed to fetch): ' +
      (navigator.onLine === false ? 'la tablet no tiene internet.' : 'no responde el Apps Script o se cortó la señal.') +
      ' Revisá el wifi y probá de nuevo.');
  }
  function errorHttp_(st) {
    var base = 'Apps Script respondió ' + st;
    if (st === 404) return new Error(base + ': no encuentra la implementación. Revisá que esté publicada (Gestionar implementaciones → editar → "Nueva versión") y que la dirección de la configuración sea la correcta.');
    if (st === 401 || st === 403) return new Error(base + ': sin permiso. La implementación tiene que tener acceso "Cualquier usuario".');
    if (st === 429) return new Error(base + ': demasiados pedidos seguidos. Esperá unos segundos y probá de nuevo.');
    if (st >= 500) return new Error(base + ': el servidor de Google está ocupado o falló. Se puede reintentar en unos segundos.');
    return new Error(base + '.');
  }
  function errorNoEsDatos_() {
    return new Error('El Apps Script no devolvió datos (devolvió una página). Suele pasar si la implementación pide ' +
      'iniciar sesión de Google: tiene que tener acceso "Cualquier usuario". Si recién se publicó, probá de nuevo.');
  }

  /* Cartel rojo arriba a la derecha para errores que la pantalla no muestra por su cuenta. */
  function bfAvisoError_(texto) {
    if (!document.body) return;
    var d = document.getElementById('bfErr');
    if (!d) {
      d = document.createElement('div'); d.id = 'bfErr';
      d.setAttribute('style', 'position:fixed;right:10px;top:8px;z-index:99997;max-width:min(420px,92vw);background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:8px 12px;font:13px Arial,sans-serif;color:#7f1d1d;box-shadow:0 2px 8px rgba(0,0,0,.15);');
      document.body.appendChild(d);
    }
    d.innerHTML = '<b>✗ Error:</b> ' + String(texto).replace(/</g, '&lt;') +
      ' <a href="#" id="bfErrOk" style="color:#0284c7;margin-left:6px">Cerrar</a>';
    document.getElementById('bfErrOk').onclick = function (e) { e.preventDefault(); d.remove(); };
    clearTimeout(bfAvisoError_.t);
    bfAvisoError_.t = setTimeout(function () { if (d.parentNode) d.remove(); }, 20000);
  }

  /* "El servidor está tardando": aparece si un guardado lleva más de 12 s sin respuesta. */
  var LENTOS = 0;
  function lentoPintar_() {
    var d = document.getElementById('bfLento');
    if (!LENTOS) { if (d) d.remove(); return; }
    if (!document.body) return;
    if (!d) {
      d = document.createElement('div'); d.id = 'bfLento';
      d.setAttribute('style', 'position:fixed;left:50%;transform:translateX(-50%);bottom:52px;z-index:99997;max-width:92vw;background:#fffbeb;border:2px solid #f59e0b;border-radius:10px;padding:8px 14px;font:13px Arial,sans-serif;color:#78350f;box-shadow:0 2px 8px rgba(0,0,0,.15);');
      document.body.appendChild(d);
    }
    d.innerHTML = '<b>↻ Guardando…</b> el servidor está tardando más de lo normal. <b>No cierres la pantalla ni lo vuelvas a cargar.</b>';
  }
  function conAvisoLento_(p) {
    var marcado = false;
    var t = setTimeout(function () { marcado = true; LENTOS++; lentoPintar_(); }, 12000);
    function fin() { clearTimeout(t); if (marcado) { LENTOS = Math.max(0, LENTOS - 1); lentoPintar_(); } }
    return p.then(function (d) { fin(); return d; }, function (e) { fin(); throw e; });
  }

  /* ---------------- llamada al Apps Script ---------------- */
  /** Guarda cuánto tardó cada llamada (tabla api_tiempos) para saber qué conviene acelerar.
   *  No espera la respuesta: no agrega demora a la pantalla. */
  function medir(fn, t0, ok) {
    try {
      sb.from('api_tiempos').insert({ pantalla: PANTALLA || 'inicio', fn: fn, ms: Math.round(performance.now() - t0), ok: ok })
        .then(function () {}, function () {});
    } catch (e) { /* nunca romper la pantalla por la medición */ }
  }

  function llamarMedido_(fn, args, rid) {
    return sesionLista.then(function () {
      var t0 = performance.now();   // se mide desde que hay sesión (no cuenta el tiempo de login)
      return llamarSinMedir(fn, args, rid).then(
        function (d) { medir(fn, t0, true); return d; },
        function (e) { medir(fn, t0, false); throw e; }
      );
    });
  }

  /* ---------------- guardado seguro / sin conexión / por detrás ----------------
   * - Cada guardado lleva un código único (rid): si llega dos veces, el Apps Script lo hace una sola vez.
   * - Si se corta el wifi, el guardado queda en la tablet (cola) y se manda solo cuando vuelve la señal.
   * - Las funciones de window.BIOFIX_FONDO (ej. "Guardar avance") responden al instante y se mandan por detrás.
   * - Antes de cualquier otro guardado se termina de mandar la cola, para respetar el orden. */
  // Funciones que solo LEEN (no llevan código de guardado ni van a la cola)
  var RE_LECTURA = /(Obtener|Listar|Pendientes|Catalogo|Historial|Panel|Promedio|ProximoNumero|Resumen|Totales|Disponibles|Terminados|Progreso)|^bnd(Lotes|LotesCompletos|Actual|ControlEnCurso)$/;
  // obtener...() son siempre lecturas (Envasados); una página puede sumar otras con window.BIOFIX_LECTURAS = ['fn', ...]
  function esLectura(fn) { return RE_LECTURA.test(fn) || /^obtener/.test(fn) || (window.BIOFIX_LECTURAS || []).indexOf(fn) >= 0; }
  function nuevoRid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function esErrorDeRed(e) { return e && (e.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed|respondió 5\d\d|tiempo agotado/i.test(e.message || '')); }
  function enFondo(fn) { return (window.BIOFIX_FONDO || []).indexOf(fn) >= 0; }

  var COLA_KEY = 'bfcola:' + (PANTALLA || 'inicio');
  var COLA = [], COLA_ERR = [], COLA_ENVIANDO = false;
  try { COLA = JSON.parse(localStorage.getItem(COLA_KEY) || '[]') || []; } catch (e) { COLA = []; }
  function colaGuardar() { try { localStorage.setItem(COLA_KEY, JSON.stringify(COLA)); } catch (e) {} colaPintar(); }
  function colaAgregar(fn, args, rid) {
    var firma = fn + ':' + JSON.stringify(args);
    if (COLA.some(function (x) { return x.firma === firma; })) return;   // el mismo guardado ya está esperando
    COLA.push({ fn: fn, args: args, rid: rid, firma: firma, t: Date.now() });
    colaGuardar();
  }
  var colaEsperando = [];
  function colaVaciada() { return COLA.length ? new Promise(function (r) { colaEsperando.push(r); setTimeout(r, 30000); }) : Promise.resolve(); }
  function colaEnviar() {
    if (COLA_ENVIANDO || !COLA.length) { if (!COLA.length) { colaEsperando.splice(0).forEach(function (r) { r(); }); } return; }
    COLA_ENVIANDO = true; colaPintar();
    var it = COLA[0];
    llamarMedido_(it.fn, it.args, it.rid).then(function () {
      COLA.shift(); colaGuardar(); COLA_ENVIANDO = false; colaEnviar();
    }, function (e) {
      COLA_ENVIANDO = false;
      if (esErrorDeRed(e) || /EN_CURSO/.test(e.message || '')) { colaPintar(); return; }   // se reintenta más tarde
      COLA.shift(); COLA_ERR.push({ fn: it.fn, msg: e.message, t: Date.now() }); colaGuardar(); colaEnviar();
    });
  }
  setInterval(colaEnviar, 15000);
  window.addEventListener('online', colaEnviar);
  // NUEVO: el cartel de arriba también avisa cuando la tablet se queda sin internet (aunque no haya nada en cola)
  var VOLVIO_HASTA = 0;
  window.addEventListener('offline', function () { colaPintar(); });
  window.addEventListener('online', function () { VOLVIO_HASTA = Date.now() + 4000; colaPintar(); setTimeout(colaPintar, 4100); });

  function colaPintar() {
    var d = document.getElementById('bfCola');
    if (!document.body) return;
    var offline = navigator.onLine === false;
    var volvio = !offline && Date.now() < VOLVIO_HASTA;
    if (!COLA.length && !COLA_ERR.length && !offline && !volvio) { if (d) d.remove(); return; }
    if (!d) {
      d = document.createElement('div'); d.id = 'bfCola';
      d.setAttribute('style', 'position:fixed;left:50%;transform:translateX(-50%);top:8px;z-index:99997;max-width:92vw;background:#fff;border-radius:10px;padding:8px 14px;font:13px Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);');
      document.body.appendChild(d);
    }
    var html = '';
    if (COLA.length) {
      d.style.border = '2px solid ' + (offline ? '#f59e0b' : '#0284c7');
      html += '<b>' + (offline ? '⚠ Sin conexión' : (COLA_ENVIANDO ? '↻ Enviando…' : '⏳ Esperando para enviar')) + '</b> · ' +
        COLA.length + ' guardado(s) en la tablet. Se mandan solos, <b>no los vuelvas a cargar</b>.';
    } else if (offline) {
      d.style.border = '2px solid #f59e0b';
      html += '<b>⚠ Sin conexión</b> · La tablet no tiene internet. Lo que guardes queda en la tablet y se envía solo cuando vuelva la señal.';
    } else if (volvio) {
      d.style.border = '2px solid #16a34a';
      html += '<b style="color:#15803d">✓ Volvió la conexión</b>';
    }
    if (COLA_ERR.length) {
      d.style.border = '2px solid #dc2626';
      html += (html ? '<br>' : '') + '<b style="color:#b91c1c">✗ No se pudieron guardar:</b> ' +
        COLA_ERR.map(function (x) { return x.fn + ' — ' + x.msg; }).join(' · ') +
        ' <a href="#" id="bfColaOk" style="color:#0284c7;margin-left:6px">Entendido</a>';
    }
    d.innerHTML = html;
    var ok = document.getElementById('bfColaOk');
    if (ok) ok.onclick = function (e) { e.preventDefault(); COLA_ERR = []; colaPintar(); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { colaPintar(); colaEnviar(); });
  else setTimeout(function () { colaPintar(); colaEnviar(); }, 0);

  function llamar(fn, args) {
    if (esLectura(fn)) return llamarMedido_(fn, args, '');
    var rid = nuevoRid();
    if (enFondo(fn)) {                      // responde al instante, se manda por detrás
      colaAgregar(fn, args, rid); colaEnviar();
      return Promise.resolve({ ok: true, msg: 'Guardado ✓ (se termina de enviar por detrás)' });
    }
    function intentar(n) {
      return llamarMedido_(fn, args, rid).catch(function (e) {
        if (/EN_CURSO/.test(e.message || '') && n < 6) return new Promise(function (r) { setTimeout(r, 3000); }).then(function () { return intentar(n + 1); });
        if (esErrorDeRed(e)) {
          colaAgregar(fn, args, rid);
          throw new Error(/respondió 5\d\d/.test(e.message || '')
            ? 'El servidor de Google no respondió bien: quedó guardado en la tablet y se reintenta solo. No lo vuelvas a cargar.'
            : 'Sin conexión: quedó guardado en la tablet y se envía solo cuando vuelva la señal. No lo vuelvas a cargar.');
        }
        throw e;
      });
    }
    return conAvisoLento_(colaVaciada().then(function () { return intentar(0); }));   // primero lo que estaba pendiente
  }

  /* Sesión siempre al día: el permiso del puesto (token) dura 1 hora. Si la tablet estuvo suspendida
   * o sin señal, el renovador automático puede no haber corrido: acá se renueva antes de usarlo si le
   * queda menos de 2 minutos, y si igual el servidor lo rechaza, se renueva y se reintenta una vez. */
  function sesionFresca(forzar) {
    return sesionLista.then(function () { return sb.auth.getSession(); }).then(function (r) {
      var s = r.data && r.data.session;
      if (!s) return null;
      var vence = (Number(s.expires_at) || 0) * 1000;
      if (!forzar && vence - Date.now() > 120000) return s;
      return sb.auth.refreshSession().then(function (rr) {
        return (rr && rr.data && rr.data.session) || (forzar ? null : s);
      }, function () { return forzar ? null : s; });
    });
  }
  window.addEventListener('online', function () { sesionFresca(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sesionFresca(false); });

  function llamarSinMedir(fn, args, rid, reintento) {
    return sesionFresca(!!reintento).then(function (s) {
      if (!s) { mostrarLogin(); throw new Error('Sesión vencida. Volvé a ingresar.'); }
      return fetch(window.BIOFIX_API_URL || CFG.apiUrl, {   // una página puede llamar a OTRO Apps Script (ej. Envasados)
        method: 'POST',
        body: JSON.stringify({ fn: fn, args: args, token: s.access_token, rid: rid || '' }) // text/plain: sin preflight CORS
      }).catch(function () { throw errorDeConexion_(); });   // NUEVO: mensaje claro (sigue siendo TypeError)
    }).then(function (resp) {
      if (!resp.ok) throw errorHttp_(resp.status);              // NUEVO: explica 404 / 403 / 5xx
      return resp.json().catch(function () { throw errorNoEsDatos_(); });   // NUEVO: devolvió una página en vez de datos
    }).then(function (j) {
      if (j && !j.ok && !reintento && /sesi[oó]n (vencida|no iniciada)/i.test(j.error || '')) {
        return llamarSinMedir(fn, args, rid, true);            // se renueva el permiso y se prueba otra vez
      }
      if (!j || !j.ok) throw new Error((j && j.error) || 'Error desconocido');
      if (j.t) {   // botones que guardan: el Apps Script informa cuánto tardó cada parte
        try {
          sb.from('api_tiempos').insert([
            { pantalla: PANTALLA || 'inicio', fn: fn + ' [función]', ms: j.t.fn, ok: true },
            { pantalla: PANTALLA || 'inicio', fn: fn + ' [copia supabase]', ms: j.t.sync, ok: true }
          ]).then(function () {}, function () {});
        } catch (e) { /* nunca romper la pantalla por la medición */ }
      }
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
      return sesionLista.then(function () { return sesionFresca(false); }).then(function () {   // permiso al día antes de leer
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
              if (fail) fail(err, user);
              else {
                console.error(prop, err);
                // NUEVO: si la pantalla no lo muestra, se muestra igual (sin internet ya lo avisa el cartel de arriba)
                if (!(esErrorDeRed(err) && navigator.onLine === false)) bfAvisoError_(err.message);
              }
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

  /* ---------------- avisos del sector (lote parado, saldo negativo, control abierto…) ---------------- */
  var AVISOS_SECTOR = PANTALLA;
  function avisosCargar() {
    if (!PANTALLA || PANTALLA === 'supervision') return;
    sb.rpc('alertas_sector', { p_sector: AVISOS_SECTOR }).then(function (r) {
      if (r.error) return;
      avisosPintar(r.data || []);
    }, function () {});
  }
  var AVISOS_ABIERTO = false;
  function avisosPintar(lista) {
    var imp = lista.filter(function (a) { return a.gravedad !== 'baja'; });
    var b = document.getElementById('bfAvisos');
    if (!lista.length) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'bfAvisos';
      b.setAttribute('style', 'position:fixed;left:10px;bottom:10px;z-index:99998;max-width:min(520px,92vw);font:12px Arial,sans-serif;');
      document.body.appendChild(b);
    }
    var col = imp.length ? '#b45309' : '#475569', fondo = imp.length ? '#fef3c7' : '#f1f5f9';
    b.innerHTML = (AVISOS_ABIERTO ? '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:6px;max-height:50vh;overflow:auto;box-shadow:0 2px 8px rgba(0,0,0,.12);">' +
        lista.map(function (a) {
          var c = a.gravedad === 'alta' ? '#b91c1c' : (a.gravedad === 'media' ? '#92400e' : '#475569');
          return '<div style="padding:5px 0;border-bottom:1px solid #f1f5f9;"><b style="color:' + c + '">' + a.tipo + '</b>' +
            (a.lote ? ' · ' + a.lote : '') + '<div style="color:#64748b">' + (a.detalle || '') + '</div></div>';
        }).join('') + '</div>' : '') +
      '<a href="#" id="bfAvisosBtn" style="display:inline-block;background:' + fondo + ';color:' + col + ';border:1px solid ' + col + ';border-radius:999px;padding:6px 12px;font-weight:700;text-decoration:none;">⚠ ' +
        lista.length + ' aviso(s)' + (AVISOS_ABIERTO ? ' ▾' : ' ▸') + '</a>';
    document.getElementById('bfAvisosBtn').onclick = function (e) { e.preventDefault(); AVISOS_ABIERTO = !AVISOS_ABIERTO; avisosPintar(lista); };
  }
  sesionLista.then(function (session) {
    var u = sectorDe(session);   // si entra otro puesto permitido (ej. lavados en depositolf), ve SUS avisos
    if (u && u !== PANTALLA && ADMINS.indexOf(u) < 0) AVISOS_SECTOR = u;
    avisosCargar(); setInterval(avisosCargar, 5 * 60000);
  });

  /* ---------------- Tiempo real ----------------
   * Cuando alguien guarda algo, Supabase marca qué cambió (tabla "cambios": 'movimientos',
   * 'hoja:<nombre>', 'asignaciones'). Una página que define
   *   window.BIOFIX_REFRESCAR = function () { ... }     (qué recargar)
   *   window.BIOFIX_CAMBIOS   = ['movimientos', 'hoja:Control de Calidad']   (opcional: qué le importa)
   * se refresca sola a los 1-2 segundos, sin esperar a su recarga periódica. */
  sesionLista.then(function () { setTimeout(function () {   // se espera a que la página termine de definir sus funciones
    if (typeof window.BIOFIX_REFRESCAR !== 'function' || !sb.channel) return;
    var t = null;
    function interesa(clave) { var filtro = window.BIOFIX_CAMBIOS; return !filtro || filtro.some(function (f) { return String(clave || '').indexOf(f) === 0; }); }
    try {
      sb.channel('bf-cambios-' + (PANTALLA || 'x'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cambios' }, function (p) {
          var clave = (p && p.new && p.new.clave) || (p && p.old && p.old.clave);
          if (!interesa(clave)) return;
          clearTimeout(t);
          t = setTimeout(function () {
            if (document.hidden) { window.BIOFIX_PENDIENTE_REFRESCO = true; return; }
            try { window.BIOFIX_REFRESCAR(); } catch (e) { console.warn('refresco: ' + e.message); }
          }, 1500);
        })
        .subscribe();
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && window.BIOFIX_PENDIENTE_REFRESCO) {
          window.BIOFIX_PENDIENTE_REFRESCO = false;
          try { window.BIOFIX_REFRESCAR(); } catch (e) { }
        }
      });
    } catch (e) { console.warn('tiempo real no disponible: ' + e.message); }
  }, 1000); });

  window.BIOFIX = {
    supabase: sb,
    llamar: llamar,
    sesion: sesionLista,          // promesa: se cumple cuando el puesto ya ingresó y tiene permiso
    sectorDe: sectorDe,
    salir: salir
  };
})();
