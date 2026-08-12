# MiCarta

Carta digital con código QR y pedidos por WhatsApp, para negocios pequeños en Colombia.
Gratis, sin registro, sin instalar nada.

**En vivo:** https://micarta.weissailab.com/
(la dirección vieja, `weissailab.github.io/micarta`, redirige aquí conservando el fragmento,
así que los QR ya impresos siguen sirviendo)

## Qué hace

El dueño de un negocio arma su carta en el navegador (3 minutos), y recibe:

- un **link público** para mandar por WhatsApp, poner en la bio de Instagram o en el estado;
- un **código QR** en PNG y un **aviso tamaño carta listo para imprimir**, para pegar en la mesa o la vitrina;
- un **link privado de edición** para cambiar precios después.

El cliente final abre la carta en su celular, arma el pedido con cantidades, y le llega al
WhatsApp del negocio ya redactado y sumado, con domicilio, nombre, dirección y notas.

## Cómo está hecho (y por qué no hay servidor)

La carta completa se comprime con LZ-string y viaja **dentro del link**, en el fragmento
(`#/c/...`). No hay backend, ni base de datos, ni cuentas de usuario:

- costo de operación: **cero**, para siempre;
- no se guarda ni un dato personal de nadie en ningún servidor;
- el negocio es dueño de su carta: es su link.

La contrapartida es que **si el dueño pierde su link de edición, pierde la carta**. Por eso
la pantalla de publicación insiste en mandárselo a sí mismo por WhatsApp, y el editor guarda
un borrador en `localStorage` mientras se escribe.

| Archivo | Qué hay adentro |
|---|---|
| `index.html` | Cascarón, metadatos y favicon en línea |
| `app.css` | Estilos, 8 temas de color, layout de celular |
| `app.js` | Ruteo por hash, editor, vista pública, carrito, QR y aviso imprimible |
| `vendor/lz-string.min.js` | Compresión del estado al link (MIT) |
| `vendor/qrcode.js` | Generador de QR de Kazuhiko Arase (MIT) |

Sin build, sin dependencias en tiempo de ejecución, sin CDN: se sirve como archivos estáticos.

### Límites conocidos

- Caben hasta ~120 productos en un QR (versión 40, nivel L). Pasado eso el link sigue
  funcionando pero el QR ya no se genera, y la app lo dice en pantalla.
- Arriba de ~110 módulos el QR queda denso y hay que acercarle el celular; la app avisa
  y recomienda imprimirlo grande.
- No hay fotos de productos: solo íconos. Meter imágenes en el link lo haría gigante.

## Verificado

- Carrito, totales y domicilio: suma correcta y mensaje de WhatsApp bien formado.
- Número colombiano de 10 dígitos normalizado a `57...`.
- QR generado, **decodificado de vuelta** con jsQR y comparado contra el link: coincide exacto.
- Ida y vuelta de los dos links (público y de edición) restaurando la carta completa.

## Cómo correrlo local

```bash
python -m http.server 4190 --directory .
```

## Monetización

No hay pasarela de pago ni cobro obligatorio, a propósito: eso mataría la adopción y
obligaría a tener backend. En cambio:

1. **Aporte voluntario** a Nequi `3171715071` en la pantalla de publicación, justo en el
   momento de mayor gratitud (cuando el dueño acaba de ver su QR funcionando).
2. **Servicio pago por WhatsApp**: "te la dejo lista" — pasar la carta desde una foto del
   menú, fotos reales, PDF de impresión.
3. **Puerta de entrada al producto real**: cada carta lleva al pie el asistente de WhatsApp
   de Weiss AI Lab. El que pone una carta digital es exactamente el que necesita que su
   WhatsApp conteste solo.

---

Hecho por [Weiss AI Lab](https://weissailab.com) · Licencia MIT
