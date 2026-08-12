/* MiCarta — carta digital con QR y pedidos por WhatsApp.
   Todo vive en el link: no hay servidor ni base de datos.
   Weiss AI Lab */
(function () {
  'use strict';

  var NEQUI = '3171715071';
  var SOPORTE_WA = '573171715071';
  var APP = document.getElementById('app');

  /* Las fotos viajan dentro del link, así que cada byte se paga en el largo del
     link. Presupuesto por foto y tope de fotos para que no se vuelva inmanejable. */
  var MAX_FOTO = 3600;    // caracteres del dataURL de una foto
  var MAX_FOTOS = 12;     // 12 x 3600 deja el link por debajo del tope
  var TOPE_QR = 2850;     // pasado esto ya no cabe un QR
  var TOPE_LINK = 45000;  // pasado esto el link se vuelve un problema real

  var THEMES = [
    { n: 'Brasa',   a: '#E23E2E', s: '#fdeceb' },
    { n: 'Selva',   a: '#1F8A5B', s: '#e8f5ef' },
    { n: 'Mango',   a: '#EA6A08', s: '#fdf0e5' },
    { n: 'Uva',     a: '#6D3AC9', s: '#f0eafc' },
    { n: 'Océano',  a: '#1F5FD8', s: '#e9f0fd' },
    { n: 'Rosa',    a: '#DB2777', s: '#fdeaf3' },
    { n: 'Café',    a: '#7A4E2D', s: '#f5eee8' },
    { n: 'Noche',   a: '#171717', s: '#ededed' }
  ];

  var EMOJIS = ['🍔','🍗','🌭','🍕','🌮','🥗','🍟','🍜','🍲','🥘','🍚','🥩','🐟','🍤','🥚','🥪','🥐','🍞','🧀','🍰','🍮','🍦','🍪','🍩','☕','🥤','🧃','🍺','🍷','💅','💄','👗','👟','👜','💍','🧴','🧼','🌸','🎁','📱','🔧','🐶','🏠','✂️','🕯️','🍫'];

  /* ---------------- utilidades ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    n = Math.round(Number(n) || 0);
    return '$' + n.toLocaleString('es-CO');
  }

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  /* Normaliza a formato internacional colombiano: 3171715071 -> 573171715071 */
  function waNum(raw) {
    var d = digits(raw);
    if (!d) return '';
    if (d.length === 10 && d[0] === '3') return '57' + d;
    if (d.length === 12 && d.slice(0, 2) === '57') return d;
    if (d.length === 13 && d.slice(0, 3) === '573') return d.slice(1);
    return d;
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    setTimeout(function () {
      t.classList.remove('on');
      setTimeout(function () { t.remove(); }, 300);
    }, 2200);
  }

  function copy(text, msg) {
    var done = function () { toast(msg || 'Copiado'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copia manual: ' + text); }
      ta.remove();
    }
  }

  /* ---------------- modelo ---------------- */

  var MAX_MESAS = 60;

  function nuevaCarta() {
    return {
      n: '', t: '', w: '', e: '🍔', c: 0, a: '', h: '',
      dom: 0, domc: 0, mesas: 0,
      g: [{ n: 'Para empezar', i: [item()] }]
    };
  }

  function item() { return { n: '', d: '', p: 0, e: '', x: 0 }; }

  /* ---------------- fotos ---------------- */

  function pedirFoto(listo) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.addEventListener('change', function () {
      if (inp.files && inp.files[0]) listo(inp.files[0]);
    });
    inp.click();
  }

  /* Recorta al cuadrado desde el centro y comprime al tamaño pedido. */
  function aCuadro(img, px, q) {
    var lado = Math.min(img.width, img.height);
    var c = document.createElement('canvas');
    c.width = px; c.height = px;
    c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, px, px);
    var d = c.toDataURL('image/webp', q);
    /* Safari viejo no codifica webp y devuelve un PNG enorme sin avisar. */
    if (d.slice(0, 15) !== 'data:image/webp') d = c.toDataURL('image/jpeg', q);
    return d;
  }

  /* Baja calidad y tamaño hasta que la foto entre en el presupuesto. Una foto
     de comida limpia se queda en 176px; una muy ruidosa cae hasta 112px. */
  function comprimirFoto(file, listo, fallo) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var intentos = [[200, .5], [176, .5], [176, .4], [144, .45], [144, .35], [112, .45], [112, .3]];
      var d = null;
      for (var i = 0; i < intentos.length; i++) {
        d = aCuadro(img, intentos[i][0], intentos[i][1]);
        if (d.length <= MAX_FOTO) break;
      }
      listo(d);
    };
    img.onerror = function () { URL.revokeObjectURL(url); fallo(); };
    img.src = url;
  }

  function contarFotos(st) {
    return st.g.reduce(function (a, g) {
      return a + g.i.filter(function (i) { return i.f; }).length;
    }, 0);
  }

  function pesoLink(st) {
    return (location.origin + location.pathname + '#/c/').length + encode(st).length;
  }

  function demo() {
    return {
      n: 'Asadero El Buen Sabor', t: 'Pollo a la brasa y carne al carbón',
      w: '3001234567', e: '🍗', c: 0, a: 'Cra 12 #34-56, Barrio Centro', h: 'Todos los días 11am – 9pm',
      dom: 1, domc: 4000,
      g: [
        { n: 'Pollo a la brasa', i: [
          { n: 'Pollo entero', d: 'Con papa criolla y ensalada', p: 42000, e: '🍗', x: 0 },
          { n: 'Medio pollo', d: 'Con papa y ensalada', p: 23000, e: '🍗', x: 0 },
          { n: 'Cuarto de pollo', d: 'Presa, papa y ensalada', p: 13000, e: '🍗', x: 0 }
        ]},
        { n: 'A la parrilla', i: [
          { n: 'Churrasco 300g', d: 'Con papa, arepa y guacamole', p: 34000, e: '🥩', x: 0 },
          { n: 'Costillas BBQ', d: 'Media porción con yuca frita', p: 28000, e: '🍖', x: 0 },
          { n: 'Trucha al ajillo', d: 'Con patacón y ensalada', p: 26000, e: '🐟', x: 1 }
        ]},
        { n: 'Bebidas', i: [
          { n: 'Limonada de coco', d: 'Jarra 1 litro', p: 12000, e: '🥤', x: 0 },
          { n: 'Gaseosa personal', d: '', p: 4000, e: '🥤', x: 0 },
          { n: 'Cerveza', d: 'Nacional, bien fría', p: 5000, e: '🍺', x: 0 }
        ]}
      ]
    };
  }

  function encode(state) {
    return LZString.compressToEncodedURIComponent(JSON.stringify(state));
  }

  function decode(str) {
    try {
      var raw = LZString.decompressFromEncodedURIComponent(str);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || !Array.isArray(o.g)) return null;
      return o;
    } catch (e) { return null; }
  }

  /* El número de mesa va pegado al final del link: la carta es la misma para
     todas las mesas, solo cambia el sufijo, así que el QR casi no crece. */
  function linkPublico(state, mesa) {
    return location.origin + location.pathname + '#/c/' + encode(state) +
      (mesa ? '/m/' + mesa : '');
  }
  function linkMesas(state) {
    return location.origin + location.pathname + '#/mesas/' + encode(state);
  }
  function linkEdicion(state) {
    return location.origin + location.pathname + '#/e/' + encode(state);
  }

  function tema(state) { return THEMES[Number(state.c) || 0] || THEMES[0]; }

  function pintarTema(state) {
    var t = tema(state);
    document.documentElement.style.setProperty('--acc', t.a);
    document.documentElement.style.setProperty('--acc-soft', t.s);
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', t.a);
  }

  function guardar(state) {
    try { localStorage.setItem('micarta:draft', JSON.stringify(state)); } catch (e) {}
  }
  function borrador() {
    try {
      var s = localStorage.getItem('micarta:draft');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  /* ---------------- router ---------------- */

  var S = null; // estado del editor

  /* Cada vista se monta en un contenedor nuevo: así los listeners se van
     con el nodo viejo y no se acumulan al navegar entre vistas. */
  function mount(html) {
    var root = document.createElement('div');
    root.innerHTML = html;
    APP.replaceChildren(root);
    return root;
  }

  function router() {
    var h = location.hash || '';
    var mc = h.match(/^#\/c\/([^\/]+)(?:\/m\/(\d+))?$/);
    if (mc) {
      var d = decode(mc[1]);
      if (d) return vistaCarta(d, Number(mc[2]) || 0);
      return vistaError();
    }
    var mm = h.match(/^#\/mesas\/([^\/]+)$/);
    if (mm) {
      var carta = decode(mm[1]);
      if (carta) return vistaMesas(carta);
      return vistaError();
    }
    var me = h.match(/^#\/e\/(.+)$/);
    if (me) {
      var e = decode(me[1]);
      if (e) { S = e; return vistaEditor(); }
      return vistaError();
    }
    if (h === '#/nueva') { S = S || borrador() || nuevaCarta(); return vistaEditor(); }
    if (h === '#/publicado') { return S ? vistaPublicado(S) : (location.hash = '#/nueva'); }
    document.title = 'MiCarta — tu carta digital con QR, gratis';
    document.documentElement.style.setProperty('--acc', THEMES[0].a);
    document.documentElement.style.setProperty('--acc-soft', THEMES[0].s);
    return vistaLanding();
  }

  function barra(extra) {
    return '<div class="top"><div class="wrap">' +
      '<a class="brand" href="#"><i>🧾</i>MiCarta</a><div class="sp"></div>' +
      (extra || '') + '</div></div>';
  }

  function pie() {
    return '<div class="foot wrap">Hecho en Colombia por <a href="https://weissailab.com" target="_blank" rel="noopener">Weiss AI Lab</a> · ' +
      'Tu carta viaja dentro del link: no guardamos nada en ningún servidor.<br>' +
      '¿Quieres que tu negocio conteste solo por WhatsApp? Escríbenos: ' +
      '<a href="https://wa.me/' + SOPORTE_WA + '?text=' + encodeURIComponent('Hola, vi MiCarta y quiero un asistente de WhatsApp para mi negocio') + '" target="_blank" rel="noopener">' + SOPORTE_WA.slice(2) + '</a></div>';
  }

  /* ---------------- landing ---------------- */

  function vistaLanding() {
    var hayBorrador = borrador();
    mount(barra('<a class="btn sm" href="#/nueva">Crear mi carta</a>') +
      '<div class="wrap"><div class="hero">' +
        '<div class="kicker">☕ Gratis · sin registro · sin instalar nada</div>' +
        '<h1>Tu carta digital con <em>código QR</em>, en 3 minutos</h1>' +
        '<p class="sub">Arma la carta o el catálogo de tu negocio, imprime el QR y pégalo en la mesa o en el mostrador. ' +
        'Tus clientes miran los precios en su celular y el pedido te llega directo al WhatsApp, ya sumado.</p>' +
        '<div class="cta">' +
          '<a class="btn" href="#/nueva">Crear mi carta gratis</a>' +
          '<a class="btn ghost" href="#/c/' + encode(demo()) + '">Ver un ejemplo real</a>' +
        '</div>' +
        (hayBorrador ? '<p class="hint" style="margin-top:16px">Tienes una carta a medio hacer. <a href="#/nueva" style="color:var(--acc);font-weight:700">Seguir donde ibas →</a></p>' : '') +
      '</div>' +
      '<div class="feats">' +
        '<div class="feat"><i>📱</i><b>El pedido llega listo</b><span>El cliente arma su pedido y le llega a tu WhatsApp con cantidades, dirección y el total ya sumado. Se acabó el "¿cuánto es todo?".</span></div>' +
        '<div class="feat"><i>🖨️</i><b>QR listo para imprimir</b><span>Te descargas el código QR y hasta un aviso para poner en la mesa o pegar en la vitrina. Sin diseñador.</span></div>' +
        '<div class="feat"><i>✏️</i><b>Cambias precios cuando quieras</b><span>¿Subió el pollo? Entras, cambias el precio y listo. Vuelves a imprimir solo si cambias tu link.</span></div>' +
      '</div>' +
      '<div class="steps"><h2>Cómo funciona</h2><ol>' +
        '<li><strong>Escribes tu carta.</strong> Nombre del negocio, tu WhatsApp y tus productos con precio.</li>' +
        '<li><strong>Te damos dos links y un QR.</strong> Uno para tus clientes y otro solo tuyo, para editar después.</li>' +
        '<li><strong>Lo pegas donde quieras.</strong> En el estado de WhatsApp, en la mesa, en la puerta, en Instagram.</li>' +
        '<li><strong>Te llegan los pedidos.</strong> Cada cliente te escribe con el pedido armado y sumado.</li>' +
      '</ol></div>' +
      '</div>' + pie());
  }

  function vistaError() {
    mount(barra() + '<div class="pub"><div style="font-size:52px">😕</div>' +
      '<h2 class="big">Este link no se pudo abrir</h2>' +
      '<p class="sub">Puede que se haya cortado al copiarlo o al enviarlo por chat. Pídele a quien te lo mandó que lo comparta completo.</p>' +
      '<a class="btn" href="#/nueva">Crear mi propia carta</a></div>' + pie());
  }

  /* ---------------- editor ---------------- */

  function setPath(obj, path, val) {
    var ps = path.split('.'), o = obj;
    for (var i = 0; i < ps.length - 1; i++) o = o[ps[i]];
    o[ps[ps.length - 1]] = val;
  }

  function vistaEditor() {
    pintarTema(S);
    document.title = 'Armando tu carta — MiCarta';
    var root = mount(barra('<button class="btn sm" data-act="publicar">Publicar carta →</button>') +
      '<div class="wrap"><div class="ed">' +
        '<div class="main">' + panelNegocio() + panelCarta() +
          '<div id="medidor"></div>' +
          '<button class="btn wide" data-act="publicar" style="padding:16px;font-size:16.5px">Publicar y ver mi QR →</button>' +
          '<p class="hint" style="text-align:center;margin-top:10px">Se guarda solo en tu celular mientras escribes.</p>' +
        '</div>' +
        '<div class="side"><div class="phone-lbl">ASÍ LO VE TU CLIENTE</div>' +
          '<div class="phone"><div class="screen" id="preview"></div></div>' +
        '</div>' +
      '</div></div>' + pie());

    renderPreview();

    root.addEventListener('input', function (ev) {
      var el = ev.target, k = el.getAttribute('data-k');
      if (!k) return;
      var v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
      if (el.getAttribute('data-num')) {
        v = digits(v);
        el.value = v ? Number(v).toLocaleString('es-CO') : '';
        v = Number(v) || 0;
      }
      setPath(S, k, v);
      guardar(S);
      if (k === 'c') pintarTema(S);
      /* El costo del domicilio solo existe si hace domicilios: hay que repintar el panel. */
      if (k === 'dom') return vistaEditor();
      renderPreview();
    });

    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      var gi = Number(b.getAttribute('data-g'));
      var ii = Number(b.getAttribute('data-i'));

      if (act === 'publicar') return publicar();
      if (act === 'tema') { S.c = Number(b.getAttribute('data-v')); guardar(S); return vistaEditor(); }
      if (act === 'emo-set') {
        var inp = APP.querySelector('[data-k="' + b.getAttribute('data-t') + '"]');
        if (inp) { inp.value = b.textContent; setPath(S, b.getAttribute('data-t'), b.textContent); guardar(S); renderPreview(); }
        return;
      }
      if (act === 'quitar-foto') {
        ev.stopPropagation();
        delete S.g[gi].i[ii].f;
        guardar(S);
        return vistaEditor();
      }
      if (act === 'foto') {
        var actual = S.g[gi].i[ii];
        if (!actual.f && contarFotos(S) >= MAX_FOTOS) {
          return toast('Máximo ' + MAX_FOTOS + ' fotos: el link se vuelve muy pesado');
        }
        toast('Preparando la foto…');
        return pedirFoto(function (file) {
          comprimirFoto(file, function (dataUrl) {
            S.g[gi].i[ii].f = dataUrl;
            guardar(S);
            vistaEditor();
            toast('Foto lista (' + Math.round(dataUrl.length / 1024) + ' KB)');
          }, function () { toast('No pude leer esa imagen, prueba con otra'); });
        });
      }
      if (act === 'add-cat') { S.g.push({ n: '', i: [item()] }); guardar(S); return vistaEditor(); }
      if (act === 'del-cat') {
        if (S.g.length === 1) return toast('Necesitas al menos una categoría');
        if (!confirm('¿Borrar la categoría "' + (S.g[gi].n || 'sin nombre') + '" con todos sus productos?')) return;
        S.g.splice(gi, 1); guardar(S); return vistaEditor();
      }
      if (act === 'add-item') { S.g[gi].i.push(item()); guardar(S); vistaEditor(); return focoUltimo(gi); }
      if (act === 'del-item') { S.g[gi].i.splice(ii, 1); if (!S.g[gi].i.length) S.g[gi].i.push(item()); guardar(S); return vistaEditor(); }
      if (act === 'up-item' && ii > 0) { var a = S.g[gi].i; a.splice(ii - 1, 0, a.splice(ii, 1)[0]); guardar(S); return vistaEditor(); }
      if (act === 'down-item') { var b2 = S.g[gi].i; if (ii < b2.length - 1) { b2.splice(ii + 1, 0, b2.splice(ii, 1)[0]); guardar(S); return vistaEditor(); } return; }
      if (act === 'out-item') { S.g[gi].i[ii].x = S.g[gi].i[ii].x ? 0 : 1; guardar(S); return vistaEditor(); }
      if (act === 'demo') { S = demo(); guardar(S); return vistaEditor(); }
      if (act === 'limpiar') {
        if (!confirm('¿Empezar de cero? Se borra lo que llevas escrito.')) return;
        S = nuevaCarta(); guardar(S); return vistaEditor();
      }
    });
  }

  function focoUltimo(gi) {
    var els = APP.querySelectorAll('[data-cat="' + gi + '"] .item input[data-nombre]');
    if (els.length) els[els.length - 1].focus();
  }

  function panelNegocio() {
    var sw = THEMES.map(function (t, i) {
      return '<button class="sw" data-act="tema" data-v="' + i + '" title="' + t.n + '" aria-pressed="' + (Number(S.c) === i) + '" style="background:' + t.a + '"></button>';
    }).join('');
    var emos = EMOJIS.slice(0, 22).map(function (e) {
      return '<button class="ic" data-act="emo-set" data-t="e" style="font-size:17px">' + e + '</button>';
    }).join('');

    return '<div class="panel">' +
      '<h2>Tu negocio</h2><p class="psub">Esto es lo que ve el cliente arriba de la carta.</p>' +
      '<div class="row"><div class="field" style="flex:0 0 92px">' +
        '<label>Ícono</label><input class="inp" data-k="e" maxlength="2" value="' + esc(S.e) + '" style="text-align:center;font-size:22px;padding:9px">' +
      '</div><div class="field" style="flex:1">' +
        '<label>Nombre del negocio *</label><input class="inp" data-k="n" placeholder="Asadero El Buen Sabor" value="' + esc(S.n) + '">' +
      '</div></div>' +
      '<div class="emo-strip">' + emos + '</div>' +
      '<div class="field"><label>Frase corta</label>' +
        '<input class="inp" data-k="t" placeholder="Pollo a la brasa y carne al carbón" value="' + esc(S.t) + '"></div>' +
      '<div class="field"><label>WhatsApp donde recibes los pedidos *</label>' +
        '<input class="inp" data-k="w" inputmode="tel" placeholder="3001234567" value="' + esc(S.w) + '">' +
        '<p class="hint">Solo el número, sin espacios. Si es colombiano le ponemos el 57 solos.</p></div>' +
      '<div class="row"><div class="field"><label>Dirección o barrio</label>' +
        '<input class="inp" data-k="a" placeholder="Cra 12 #34-56" value="' + esc(S.a) + '"></div>' +
      '<div class="field"><label>Horario</label>' +
        '<input class="inp" data-k="h" placeholder="Lun a Sáb, 8am – 8pm" value="' + esc(S.h) + '"></div></div>' +
      '<div class="field"><label>Color</label><div class="swatches">' + sw + '</div></div>' +
      '<div class="field"><label>Mesas en el local</label>' +
        '<input class="inp" data-k="mesas" data-num="1" inputmode="numeric" placeholder="0" value="' + (S.mesas ? Number(S.mesas).toLocaleString('es-CO') : '') + '">' +
        '<p class="hint">Si pones un número, te genero un QR distinto para cada mesa y el pedido ' +
        'te llega diciendo de qué mesa es. Déjalo vacío si no atiendes en el local.</p></div>' +
      '<div class="field" style="margin-bottom:0"><label>Domicilio</label>' +
        '<label style="display:flex;gap:9px;align-items:center;font-weight:600;font-size:14.5px;margin-bottom:8px">' +
          '<input type="checkbox" data-k="dom" ' + (S.dom ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--acc)"> Hago domicilios</label>' +
        (S.dom ? '<input class="inp" data-k="domc" data-num="1" inputmode="numeric" placeholder="Costo del domicilio" value="' + (S.domc ? Number(S.domc).toLocaleString('es-CO') : '') + '"><p class="hint">Déjalo vacío si el domicilio es gratis o si depende del barrio.</p>' : '') +
      '</div></div>';
  }

  function panelCarta() {
    var cats = S.g.map(function (g, gi) {
      var items = g.i.map(function (it, ii) {
        var izq = it.f
          ? '<button class="emo foto" data-act="foto" data-g="' + gi + '" data-i="' + ii + '" title="Cambiar la foto">' +
              '<img src="' + esc(it.f) + '" alt=""><span class="x" data-act="quitar-foto" data-g="' + gi + '" data-i="' + ii + '" title="Quitar la foto">✕</span></button>'
          : '<input class="emo" data-k="g.' + gi + '.i.' + ii + '.e" maxlength="2" value="' + esc(it.e) + '" placeholder="🍽️" title="Ícono">';

        return '<div class="item' + (it.x ? ' out' : '') + '">' + izq +
          '<div class="body">' +
            '<input class="inp" data-nombre="1" data-k="g.' + gi + '.i.' + ii + '.n" placeholder="Nombre del producto" value="' + esc(it.n) + '">' +
            '<div class="row">' +
              '<input class="inp" data-k="g.' + gi + '.i.' + ii + '.d" placeholder="Qué trae (opcional)" value="' + esc(it.d) + '" style="flex:1.6">' +
              '<input class="inp" data-k="g.' + gi + '.i.' + ii + '.p" data-num="1" inputmode="numeric" placeholder="Precio" value="' + (it.p ? Number(it.p).toLocaleString('es-CO') : '') + '" style="flex:1">' +
            '</div>' +
            (it.x ? '<span class="tag">AGOTADO</span>' : '') +
          '</div>' +
          '<div class="tools">' +
            '<button class="ic" data-act="foto" data-g="' + gi + '" data-i="' + ii + '" title="' + (it.f ? 'Cambiar la foto' : 'Ponerle foto') + '">📷</button>' +
            '<button class="ic" data-act="up-item" data-g="' + gi + '" data-i="' + ii + '" title="Subir">▲</button>' +
            '<button class="ic" data-act="down-item" data-g="' + gi + '" data-i="' + ii + '" title="Bajar">▼</button>' +
            '<button class="ic" data-act="out-item" data-g="' + gi + '" data-i="' + ii + '" title="Marcar agotado">' + (it.x ? '✅' : '🚫') + '</button>' +
            '<button class="ic" data-act="del-item" data-g="' + gi + '" data-i="' + ii + '" title="Borrar">🗑</button>' +
          '</div></div>';
      }).join('');

      return '<div class="cat" data-cat="' + gi + '">' +
        '<div class="cat-h">' +
          '<input class="inp" data-k="g.' + gi + '.n" placeholder="Categoría (ej: Bebidas)" value="' + esc(g.n) + '">' +
          '<button class="ic" data-act="del-cat" data-g="' + gi + '" title="Borrar categoría">🗑</button>' +
        '</div>' + items +
        '<button class="btn soft sm" data-act="add-item" data-g="' + gi + '">+ Agregar producto</button>' +
      '</div>';
    }).join('');

    return '<div class="panel"><h2>Tu carta</h2>' +
      '<p class="psub">Agrupa por categorías: Entradas, Platos, Bebidas… o Uñas, Pestañas, Cejas. Lo que vendas.</p>' +
      cats +
      '<div class="row" style="margin-top:14px">' +
        '<button class="btn ghost sm" data-act="add-cat">+ Nueva categoría</button>' +
        '<button class="btn ghost sm" data-act="demo">Ver ejemplo lleno</button>' +
        '<button class="btn ghost sm" data-act="limpiar">Empezar de cero</button>' +
      '</div></div>';
  }

  function renderPreview() {
    var p = document.getElementById('preview');
    /* Si tiene mesas, la previa muestra la mesa 1 para que vea lo que ve el cliente. */
    if (p) p.innerHTML = cartaHTML(S, true, Number(S.mesas) ? 1 : 0);
    var m = document.getElementById('medidor');
    if (m) m.innerHTML = medidorHTML(S);
  }

  /* El link es el archivo: conviene que el dueño vea cuánto pesa y qué pierde. */
  function medidorHTML(st) {
    var largo = pesoLink(st);
    var fotos = contarFotos(st);
    if (largo > TOPE_LINK) {
      return '<div class="med rojo"><b>El link quedó demasiado pesado</b>' +
        'Con ' + fotos + ' fotos son ' + Math.round(largo / 1024) + ' KB y algunos celulares no lo abren. ' +
        'Quítale fotos a los productos menos importantes.</div>';
    }
    if (largo > TOPE_QR) {
      return '<div class="med ambar"><b>Con fotos no cabe el código QR</b>' +
        'El link funciona perfecto para mandar por WhatsApp o Instagram (' + Math.round(largo / 1024) + ' KB), ' +
        'pero para el QR de la mesa toca sin fotos. Quítalas y el QR vuelve solo.</div>';
    }
    return '<div class="med verde"><b>Cabe en un código QR</b>' +
      'Van ' + largo + ' de ' + TOPE_QR + ' caracteres. Si le pones fotos, el QR ya no cabe pero el link sigue sirviendo.</div>';
  }

  function publicar() {
    if (!String(S.n).trim()) { toast('Ponle el nombre a tu negocio'); return scrollTo(0, 0); }
    if (!waNum(S.w)) { toast('Falta tu número de WhatsApp'); return scrollTo(0, 0); }
    var hayProducto = S.g.some(function (g) { return g.i.some(function (i) { return String(i.n).trim(); }); });
    if (!hayProducto) return toast('Agrega al menos un producto');
    S.g = S.g.filter(function (g) { return g.i.some(function (i) { return String(i.n).trim(); }); });
    S.g.forEach(function (g) { g.i = g.i.filter(function (i) { return String(i.n).trim(); }); });
    guardar(S);
    location.hash = '#/publicado';
  }

  /* ---------------- vista pública de la carta ---------------- */

  function cartaHTML(st, preview, mesa) {
    var t = tema(st);
    var meta = [];
    if (mesa) meta.push('<span class="mesa">🍽️ Mesa ' + mesa + '</span>');
    if (st.h) meta.push('<span>🕒 ' + esc(st.h) + '</span>');
    if (st.a) meta.push('<span>📍 ' + esc(st.a) + '</span>');
    if (st.dom) meta.push('<span>🛵 Domicilio' + (Number(st.domc) ? ' ' + money(st.domc) : '') + '</span>');

    var body = '';
    var vivos = st.g.filter(function (g) { return g.i.length; });
    if (!vivos.length) {
      body = '<div class="c-empty">Aquí van a salir tus productos.<br>Agrégalos en el panel de la izquierda.</div>';
    } else {
      vivos.forEach(function (g, gi) {
        body += '<div class="c-cat" id="cat' + gi + '">' + esc(g.n || 'Menú') + '</div>';
        g.i.forEach(function (it, ii) {
          body += '<div class="c-item' + (it.x ? ' out' : '') + '" data-add="' + gi + '.' + ii + '">' +
            (it.f
              ? '<div class="e foto" data-ver="' + gi + '.' + ii + '"><img src="' + esc(it.f) + '" alt="' + esc(it.n) + '" loading="lazy"></div>'
              : '<div class="e">' + esc(it.e || '🍽️') + '</div>') +
            '<div class="d"><b>' + esc(it.n || 'Producto') + '</b>' +
              (it.d ? '<small>' + esc(it.d) + '</small>' : '') +
              (it.x ? '<small style="color:var(--acc);font-weight:700">Agotado por hoy</small>' : '') +
            '</div>' +
            '<div class="p">' + (Number(it.p) ? money(it.p) : '') + '</div>' +
            '<div class="add" data-slot="' + gi + '.' + ii + '">+</div>' +
          '</div>';
        });
      });
    }

    var tabs = vivos.length > 1
      ? '<div class="c-tabs">' + vivos.map(function (g, i) {
          return '<button class="c-tab' + (i === 0 ? ' on' : '') + '" data-tab="' + i + '">' + esc(g.n || 'Menú') + '</button>';
        }).join('') + '</div>'
      : '';

    return '<div class="carta" style="--acc:' + t.a + ';--acc-soft:' + t.s + '">' +
      '<div class="c-head">' +
        '<div class="logo">' + esc(st.e || '🍽️') + '</div>' +
        '<h1>' + esc(st.n || 'Tu negocio') + '</h1>' +
        (st.t ? '<p class="t">' + esc(st.t) + '</p>' : '') +
        (meta.length ? '<div class="c-meta">' + meta.join('') + '</div>' : '') +
      '</div>' + tabs +
      '<div class="c-body">' + body + '</div>' +
      '<div class="c-bar" id="cbar"></div>' +
      '<div class="c-foot">Carta hecha con <a href="' + (preview ? '#' : location.origin + location.pathname) + '" target="_blank" rel="noopener">MiCarta</a> · gratis para tu negocio</div>' +
    '</div>';
  }

  function vistaCarta(st, mesa) {
    pintarTema(st);
    document.title = (mesa ? 'Mesa ' + mesa + ' — ' : '') + (st.n || 'Carta') + (st.t ? ' — ' + st.t : '');
    var root = mount('<div style="max-width:560px;margin:0 auto;background:#fff;min-height:100vh">' + cartaHTML(st, false, mesa) + '</div>');

    var carrito = {}; // "gi.ii" -> cantidad

    function totalItems() {
      return Object.keys(carrito).reduce(function (a, k) { return a + carrito[k]; }, 0);
    }
    function totalPesos() {
      return Object.keys(carrito).reduce(function (a, k) {
        var p = k.split('.'); return a + (Number(st.g[p[0]].i[p[1]].p) || 0) * carrito[k];
      }, 0);
    }

    function pintarSlots() {
      APP.querySelectorAll('[data-slot]').forEach(function (el) {
        var k = el.getAttribute('data-slot');
        var q = carrito[k] || 0;
        var p = k.split('.');
        var it = st.g[p[0]].i[p[1]];
        if (it.x) { el.className = 'add'; el.textContent = '+'; return; }
        if (q > 0) {
          el.className = 'qty';
          el.innerHTML = '<button data-q="-1">−</button><b>' + q + '</b><button data-q="1">+</button>';
        } else {
          el.className = 'add';
          el.textContent = '+';
        }
      });
      var bar = document.getElementById('cbar');
      var n = totalItems();
      if (n > 0) {
        bar.innerHTML = '<button class="btn" data-act="ver-pedido"><span class="n">' + n + '</span> Hacer el pedido · ' + money(totalPesos()) + '</button>';
      } else {
        bar.innerHTML = waNum(st.w)
          ? '<a class="btn ghost" href="https://wa.me/' + waNum(st.w) + '?text=' + encodeURIComponent(
              mesa ? 'Hola, estoy en la mesa ' + mesa + ' de ' + (st.n || '') + ' 👋' : 'Hola ' + (st.n || '') + ', vi su carta 👋'
            ) + '" target="_blank" rel="noopener">💬 ' + (mesa ? 'Llamar al mesero' : 'Escribir por WhatsApp') + '</a>'
          : '';
      }
    }
    pintarSlots();

    root.addEventListener('click', function (ev) {
      var tab = ev.target.closest('[data-tab]');
      if (tab) {
        APP.querySelectorAll('.c-tab').forEach(function (t) { t.classList.remove('on'); });
        tab.classList.add('on');
        var el = document.getElementById('cat' + tab.getAttribute('data-tab'));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      var q = ev.target.closest('[data-q]');
      if (q) {
        var slot = q.closest('[data-slot]').getAttribute('data-slot');
        carrito[slot] = Math.max(0, (carrito[slot] || 0) + Number(q.getAttribute('data-q')));
        if (!carrito[slot]) delete carrito[slot];
        return pintarSlots();
      }
      var ver = ev.target.closest('[data-ver]');
      if (ver) return hojaProducto(ver.getAttribute('data-ver'));
      var fila = ev.target.closest('[data-add]');
      if (fila && ev.target.closest('.add')) {
        var k = fila.getAttribute('data-add'), p = k.split('.');
        if (st.g[p[0]].i[p[1]].x) return toast('Ese está agotado por hoy');
        carrito[k] = (carrito[k] || 0) + 1;
        return pintarSlots();
      }
      if (ev.target.closest('[data-act="ver-pedido"]')) return hojaPedido();
    });

    /* Tocar la foto abre el producto en grande: es media razón de ponerle foto. */
    function hojaProducto(k) {
      var p = k.split('.'), it = st.g[p[0]].i[p[1]];
      var sh = document.createElement('div');
      sh.className = 'sheet';
      sh.innerHTML = '<div class="bd" data-cerrar="1"></div><div class="pn detalle">' +
        '<img class="grande" src="' + esc(it.f) + '" alt="' + esc(it.n) + '">' +
        '<h3>' + esc(it.n) + '</h3>' +
        (it.d ? '<p class="cs">' + esc(it.d) + '</p>' : '') +
        '<div class="line tot"><span>' + (Number(it.p) ? money(it.p) : 'Pregúntanos') + '</span></div>' +
        (it.x
          ? '<p class="hint" style="text-align:center">Agotado por hoy</p>'
          : '<button class="btn wide" data-agregar="1" style="padding:15px;font-size:16px">Agregar al pedido</button>') +
        '<button class="btn ghost wide sm" data-cerrar="1" style="margin-top:8px">Volver a la carta</button>' +
      '</div>';
      document.body.appendChild(sh);
      sh.addEventListener('click', function (e) {
        if (e.target.closest('[data-agregar]')) {
          carrito[k] = (carrito[k] || 0) + 1;
          pintarSlots();
          sh.remove();
          return toast('Agregado');
        }
        if (e.target.closest('[data-cerrar]')) sh.remove();
      });
    }

    function hojaPedido() {
      var lineas = Object.keys(carrito).map(function (k) {
        var p = k.split('.'), it = st.g[p[0]].i[p[1]];
        return { n: it.n, q: carrito[k], p: Number(it.p) || 0, k: k };
      });
      var sub = totalPesos();
      /* Sentado en la mesa no hay domicilio ni dirección que pedir. */
      var dom = (!mesa && st.dom) ? (Number(st.domc) || 0) : 0;

      var sh = document.createElement('div');
      sh.className = 'sheet';
      sh.innerHTML = '<div class="bd" data-cerrar="1"></div><div class="pn">' +
        '<h3>' + (mesa ? 'Tu pedido · Mesa ' + mesa : 'Tu pedido') + '</h3>' +
        lineas.map(function (l) {
          return '<div class="line"><span>' + l.q + '× ' + esc(l.n) + '</span><b>' + money(l.p * l.q) + '</b></div>';
        }).join('') +
        (dom ? '<div class="line"><span>Domicilio</span><b>' + money(dom) + '</b></div>' : '') +
        '<div class="line tot"><span>Total</span><span>' + money(sub + dom) + '</span></div>' +
        '<div class="field" style="margin-top:16px"><label>Tu nombre</label><input class="inp" id="f-nom" placeholder="Cómo te llamas"></div>' +
        (!mesa && st.dom ? '<div class="field"><label>Dirección para el domicilio</label><input class="inp" id="f-dir" placeholder="Dirección y barrio (o escribe: recojo en el local)"></div>' : '') +
        '<div class="field"><label>Alguna nota</label><textarea class="inp" id="f-not" placeholder="Sin cebolla, bien caliente, etc."></textarea></div>' +
        (mesa ? '<p class="hint" style="margin:-6px 0 12px">Le llega al WhatsApp del negocio con el número de tu mesa. El mesero te lo confirma.</p>' : '') +
        '<button class="btn wide" id="f-env" style="padding:15px;font-size:16px">' +
          (mesa ? 'Mandar el pedido a la barra' : 'Enviar pedido por WhatsApp') + '</button>' +
        '<button class="btn ghost wide sm" data-cerrar="1" style="margin-top:8px">Seguir mirando la carta</button>' +
      '</div>';
      document.body.appendChild(sh);

      sh.addEventListener('click', function (e) {
        if (e.target.closest('[data-cerrar]')) sh.remove();
      });
      sh.querySelector('#f-env').addEventListener('click', function () {
        var nom = (sh.querySelector('#f-nom') || {}).value || '';
        var dir = (sh.querySelector('#f-dir') || {}).value || '';
        var not = (sh.querySelector('#f-not') || {}).value || '';
        /* La mesa va de primero y sola: es lo que el mesero necesita ver de un vistazo. */
        var txt = mesa
          ? '*🍽️ MESA ' + mesa + '*\n' + (st.n || '') + '\n\n'
          : '*Pedido — ' + (st.n || '') + '*\n\n';
        lineas.forEach(function (l) { txt += '• ' + l.q + 'x ' + l.n + ' — ' + money(l.p * l.q) + '\n'; });
        txt += '\nSubtotal: ' + money(sub) + '\n';
        if (dom) txt += 'Domicilio: ' + money(dom) + '\n';
        txt += '*TOTAL: ' + money(sub + dom) + '*\n';
        if (nom.trim()) txt += '\nNombre: ' + nom.trim();
        if (dir.trim()) txt += '\nDirección: ' + dir.trim();
        if (not.trim()) txt += '\nNota: ' + not.trim();
        txt += mesa
          ? '\n\n_Pedido tomado desde el QR de la mesa ' + mesa + '_'
          : '\n\n_Pedido armado desde su carta digital_';
        window.open('https://wa.me/' + waNum(st.w) + '?text=' + encodeURIComponent(txt), '_blank');
        sh.remove();
      });
    }
  }

  /* ---------------- publicado: link + QR ---------------- */

  function qrCanvas(texto, px) {
    var qr = null;
    ['M', 'L'].forEach(function (lvl) {
      if (qr) return;
      try { var q = qrcode(0, lvl); q.addData(texto); q.make(); qr = q; } catch (e) {}
    });
    if (!qr) return null;
    var n = qr.getModuleCount();
    var quiet = 4;
    var cell = Math.max(2, Math.floor(px / (n + quiet * 2)));
    var size = cell * (n + quiet * 2);
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    }
    cv.setAttribute('data-modulos', n);
    return cv;
  }

  function bajar(canvas, nombre) {
    try {
      var a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      toast('Descargado');
    } catch (e) { toast('No se pudo descargar aquí; toma un pantallazo'); }
  }

  function aviso(st, url) {
    var W = 1000, H = 1414; // proporción hoja carta
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var t = tema(st);

    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = t.a; g.fillRect(0, 0, W, 300);

    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.font = '700 96px ui-sans-serif,system-ui,Segoe UI,Arial';
    g.fillText(st.e || '🍽️', W / 2, 130);
    g.font = '800 54px ui-sans-serif,system-ui,Segoe UI,Arial';
    var nombre = (st.n || 'Nuestro menú');
    if (nombre.length > 26) g.font = '800 40px ui-sans-serif,system-ui,Segoe UI,Arial';
    g.fillText(nombre, W / 2, 215);
    if (st.t) { g.font = '400 26px ui-sans-serif,system-ui,Segoe UI,Arial'; g.fillText(st.t.slice(0, 46), W / 2, 258); }

    g.fillStyle = '#17150f';
    g.font = '800 62px ui-sans-serif,system-ui,Segoe UI,Arial';
    g.fillText('Mira la carta', W / 2, 400);
    g.fillText('y pide desde tu celular', W / 2, 472);

    var q = qrCanvas(url, 620);
    if (q) {
      var x = (W - 620) / 2;
      g.fillStyle = '#fff';
      g.strokeStyle = t.a; g.lineWidth = 6;
      g.fillRect(x - 20, 520, 660, 660);
      g.strokeRect(x - 20, 520, 660, 660);
      g.drawImage(q, x, 540, 620, 620);
    }

    g.fillStyle = '#6f6a60';
    g.font = '600 30px ui-sans-serif,system-ui,Segoe UI,Arial';
    g.fillText('Apunta la cámara de tu celular al código', W / 2, 1245);
    if (waNum(st.w)) {
      g.fillStyle = t.a;
      g.font = '800 40px ui-sans-serif,system-ui,Segoe UI,Arial';
      g.fillText('WhatsApp ' + digits(st.w).slice(-10), W / 2, 1305);
    }
    g.fillStyle = '#b8b2a8';
    g.font = '400 22px ui-sans-serif,system-ui,Segoe UI,Arial';
    g.fillText('Hecho con MiCarta · weissailab.com', W / 2, 1372);
    return cv;
  }

  /* Hoja para imprimir: un aviso por mesa, 4 por página. Se imprime desde el
     navegador en vez de descargar 20 PNG sueltos. */
  function vistaMesas(st) {
    pintarTema(st);
    var total = Math.min(MAX_MESAS, Number(st.mesas) || 0);
    document.title = 'Avisos de mesa — ' + (st.n || 'MiCarta');
    if (!total) { location.hash = '#/nueva'; return; }

    var paginas = '';
    for (var desde = 1; desde <= total; desde += 4) {
      var tarjetas = '';
      for (var m = desde; m < desde + 4 && m <= total; m++) {
        tarjetas += '<div class="tarjeta">' +
          '<div class="neg">' + esc(st.e || '🍽️') + ' ' + esc(st.n || '') + '</div>' +
          '<div class="num">Mesa ' + m + '</div>' +
          '<div class="qr" data-qr="' + m + '"></div>' +
          '<div class="ins"><b>Escanea y mira la carta</b>Arma tu pedido desde el celular y ' +
          'te lo confirmamos en la mesa.</div>' +
        '</div>';
      }
      paginas += '<div class="pagina">' + tarjetas + '</div>';
    }

    var root = mount(
      '<div class="noprint barra-print">' +
        '<a class="btn ghost sm" href="#/publicado">← Volver</a>' +
        '<span>' + total + ' avisos · 4 por hoja</span>' +
        '<button class="btn sm" data-act="imprimir">🖨️ Imprimir</button>' +
      '</div>' +
      '<p class="noprint aviso-print">Imprime, recorta y pon uno en cada mesa. Si el papel se ' +
      'moja o se ensucia, plastifícalo o métele un acetato: es lo único que va a tocar el cliente.</p>' +
      '<div class="hojas">' + paginas + '</div>');

    root.querySelectorAll('[data-qr]').forEach(function (caja) {
      var m = Number(caja.getAttribute('data-qr'));
      var q = qrCanvas(linkPublico(st, m), 560);
      if (!q) { caja.textContent = 'La carta es muy larga para un QR'; return; }
      var img = new Image();
      img.src = q.toDataURL('image/png');
      img.alt = 'QR de la mesa ' + m;
      caja.appendChild(img);
    });

    root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-act="imprimir"]')) window.print();
    });
  }

  function vistaPublicado(st) {
    pintarTema(st);
    var pub = linkPublico(st);
    var edi = linkEdicion(st);
    var wa = waNum(st.w);
    document.title = 'Tu carta está lista — MiCarta';

    var root = mount(barra('<a class="btn ghost sm" href="' + esc(edi) + '">← Seguir editando</a>') +
      '<div class="pub">' +
      '<div style="font-size:52px">🎉</div>' +
      '<h2 class="big">¡Tu carta está lista!</h2>' +
      '<p class="sub">Ya puedes mandarla por WhatsApp o imprimir el QR.</p>' +

      '<div class="card"><h3>1. El link para tus clientes</h3>' +
        '<p class="cs">Este es el que compartes: en el estado de WhatsApp, en la bio de Instagram, en los grupos.</p>' +
        '<div class="linkbox"><code id="lnk">' + esc(pub) + '</code></div>' +
        '<div class="grid2">' +
          '<button class="btn" data-act="copiar-pub">Copiar link</button>' +
          '<a class="btn ghost" href="' + esc(pub) + '" target="_blank" rel="noopener">Verla como cliente</a>' +
        '</div>' +
        '<button class="btn soft wide sm" data-act="compartir" style="margin-top:10px">📤 Compartir ahora</button>' +
      '</div>' +

      '<div class="card"><h3>2. Tu código QR</h3>' +
        '<p class="cs">Imprímelo y pégalo en la mesa, en la vitrina o en la puerta. El cliente apunta la cámara y ve la carta.</p>' +
        '<div id="qrbox"></div>' +
        '<div class="grid2">' +
          '<button class="btn ghost" data-act="bajar-qr">Descargar QR</button>' +
          '<button class="btn" data-act="bajar-aviso">Descargar aviso 🖨️</button>' +
        '</div>' +
        '<p class="hint" style="text-align:center">El aviso sale listo para imprimir en hoja tamaño carta.</p>' +
      '</div>' +

      (Number(st.mesas) ? '<div class="card"><h3>3. Un QR para cada mesa 🍽️</h3>' +
        '<p class="cs">Cada mesa lleva su propio código. Cuando el cliente pide, a ti te llega el ' +
        'pedido escrito y arriba, en grande, de qué mesa es. El mesero deja de anotar y pasa a confirmar.</p>' +
        '<a class="btn wide" href="' + esc(linkMesas(st)) + '">Ver los ' + Math.min(MAX_MESAS, Number(st.mesas)) + ' avisos para imprimir</a>' +
        '<p class="hint" style="text-align:center;margin-top:8px">Salen 4 por hoja, listos para recortar.</p>' +
      '</div>' : '') +

      '<div class="card" style="background:var(--acc-soft);border-color:transparent">' +
        '<h3>' + (Number(st.mesas) ? '4' : '3') + '. ⚠️ Guarda tu link secreto de edición</h3>' +
        '<p class="cs">Con este link vuelves a editar precios y productos. <b>Si lo pierdes, tienes que hacer la carta otra vez.</b> Mándatelo a ti mismo por WhatsApp ahora mismo.</p>' +
        '<div class="grid2">' +
          '<button class="btn" data-act="guardar-wa">Mandármelo a mi WhatsApp</button>' +
          '<button class="btn ghost" data-act="copiar-edi">Copiar link de edición</button>' +
        '</div>' +
      '</div>' +

      '<div class="card"><h3>' + (Number(st.mesas) ? '5' : '4') + '. Ponle un nombre corto a tu link</h3>' +
        '<p class="cs">En vez del link largo, tu carta queda en una dirección que la gente puede escribir de memoria ' +
        'o dictar por teléfono. Sirve para la bio de Instagram y para el letrero del local.</p>' +
        '<div class="corto"><span>micarta.weissailab.com/</span>' +
          '<input class="inp" id="f-corto" placeholder="tunegocio" maxlength="24" autocapitalize="off" autocomplete="off" spellcheck="false"></div>' +
        '<p class="hint" id="corto-aviso">Letras sin tildes, números y guiones. Entre 2 y 24 caracteres.</p>' +
        '<button class="btn wide" data-act="pedir-corto">Pedir mi nombre corto</button>' +
        '<p class="hint" style="text-align:center;margin-top:8px">Lo dejo listo yo y te confirmo por WhatsApp.</p>' +
      '</div>' +

      '<div class="card nequi"><h3>¿Te sirvió? 🙏</h3>' +
        '<p class="cs">MiCarta es gratis y sin publicidad. Si te ahorró una tarde y unos pesos de impresión, mándame lo que consideres a Nequi. Con eso sigue siendo gratis para el que viene detrás.</p>' +
        '<div class="num">Nequi ' + NEQUI + '</div>' +
        '<div class="grid2">' +
          '<button class="btn" data-act="copiar-nequi">Copiar el número</button>' +
          '<a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/' + SOPORTE_WA + '?text=' + encodeURIComponent('¡Hola! Ya hice mi carta con MiCarta y te acabo de enviar un aporte a Nequi 🙌') + '">Ya lo hice ✅</a>' +
        '</div>' +
      '</div>' +

      '<div class="card"><h3>¿Prefieres que se la deje lista?</h3>' +
        '<p class="cs">Le paso yo toda la carta desde su menú o sus fotos, le pongo fotos reales de sus productos y le entrego el aviso impreso en PDF. También monto el asistente de WhatsApp que contesta solo, cotiza y toma pedidos 24/7.</p>' +
        '<a class="btn wide" target="_blank" rel="noopener" href="https://wa.me/' + SOPORTE_WA + '?text=' + encodeURIComponent('Hola, quiero que me dejen lista la carta digital de mi negocio: ' + (st.n || '')) + '">Escribirme por WhatsApp</a>' +
      '</div>' +

      '<a class="btn ghost" href="' + esc(edi) + '">← Volver a editar mi carta</a>' +
      '</div>' + pie());

    var box = document.getElementById('qrbox');
    var q = qrCanvas(pub, 640);
    if (q) {
      var img = new Image();
      img.src = q.toDataURL('image/png');
      img.alt = 'Código QR de la carta';
      box.appendChild(img);
      /* Un QR muy denso obliga a acercar mucho el celular: avisamos antes de imprimir. */
      if (Number(q.getAttribute('data-modulos')) > 110) {
        var av = document.createElement('p');
        av.className = 'hint';
        av.style.textAlign = 'center';
        av.innerHTML = '⚠️ Tu carta es larga, así que el QR quedó con muchos cuadritos y hay que acercarle bien el celular. ' +
          'Si lo vas a pegar en la pared, acorta las descripciones e imprímelo grande (media hoja).';
        box.parentNode.insertBefore(av, box.nextSibling);
      }
    } else {
      box.innerHTML = '<div class="med ambar" style="text-align:left"><b>Esta carta no cabe en un código QR</b>' +
        (contarFotos(st)
          ? 'Las fotos ocupan casi todo el espacio del link. Si necesitas el QR para pegar en la mesa, quítales la foto a los productos y vuelve a publicar.'
          : 'Quítale algunos productos o acorta las descripciones y vuelve a publicar.') +
        ' El link de arriba funciona igual de bien para WhatsApp e Instagram.</div>';
    }

    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'pedir-corto') {
        var campo = document.getElementById('f-corto');
        var n = String(campo.value || '').trim().toLowerCase().replace(/\s+/g, '');
        var aviso = document.getElementById('corto-aviso');
        if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(n)) {
          campo.focus();
          aviso.style.color = 'var(--acc)';
          aviso.textContent = 'Ese nombre no sirve: entre 2 y 24 caracteres, letras sin tildes, números y guiones.';
          return;
        }
        campo.value = n;
        window.open('https://wa.me/' + SOPORTE_WA + '?text=' + encodeURIComponent(
          'Hola, quiero el nombre corto *micarta.weissailab.com/' + n + '* para la carta de ' +
          (st.n || 'mi negocio') + '.\n\nEste es mi link:\n' + pub), '_blank');
        return;
      }
      if (a === 'copiar-pub') return copy(pub, 'Link copiado ✅');
      if (a === 'copiar-edi') return copy(edi, 'Link de edición copiado ✅');
      if (a === 'copiar-nequi') return copy(NEQUI, 'Número de Nequi copiado 🙏');
      if (a === 'bajar-qr') { var c = qrCanvas(pub, 1200); if (c) bajar(c, 'QR-' + (st.n || 'carta').replace(/\W+/g, '-') + '.png'); return; }
      if (a === 'bajar-aviso') return bajar(aviso(st, pub), 'Aviso-' + (st.n || 'carta').replace(/\W+/g, '-') + '.png');
      if (a === 'guardar-wa') {
        var txt = '📌 GUARDA ESTE MENSAJE\n\nCarta de ' + (st.n || '') + '\n\n👉 Link para clientes:\n' + pub +
          '\n\n🔒 Link para editar (no lo compartas):\n' + edi;
        window.open('https://wa.me/' + (wa || '') + '?text=' + encodeURIComponent(txt), '_blank');
        return;
      }
      if (a === 'compartir') {
        var datos = { title: st.n || 'Nuestra carta', text: 'Mira nuestra carta y pide por WhatsApp 👇', url: pub };
        if (navigator.share) navigator.share(datos).catch(function () {});
        else copy(pub, 'Link copiado ✅');
      }
    });
  }

  /* ---------------- arranque ---------------- */
  window.addEventListener('hashchange', function () { window.scrollTo(0, 0); router(); });
  router();
})();
