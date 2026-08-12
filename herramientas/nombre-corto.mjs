#!/usr/bin/env node
/* Crea (o actualiza) un nombre corto: micarta.weissailab.com/<nombre>
 *
 *   node herramientas/nombre-corto.mjs laespiga "https://micarta.weissailab.com/#/c/N4Ig..."
 *
 * Escribe <nombre>/index.html con una redirección al link completo de la carta.
 * No hay servidor: el nombre corto es un archivo estático más. Por eso solo lo
 * puede crear quien tiene permiso de escritura en el repo, y por eso es el
 * gancho pago: cuando el dueño cambia precios, hay que volver a correr esto.
 *
 * Para qué sirve de verdad: los QR impresos apuntan al nombre corto, no a la
 * carta. Cuando el dueño cambia un precio solo se actualiza este archivo, y lo
 * que está pegado en las mesas y en la vitrina sigue funcionando.
 *
 * Mesas: <nombre>/?m=4 lleva a la carta con la mesa 4 marcada. Un solo archivo
 * atiende todas las mesas.
 *
 * Después:  git add . && git commit -m "..." && git push
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Nombres que chocarían con archivos de la app o con rutas que quiero libres. */
const RESERVADOS = new Set([
  'app', 'vendor', 'og', 'index', 'assets', 'herramientas', 'cname',
  'readme', 'api', 'admin', 'static', 'n', 'micarta', 'www'
]);

const [, , nombreCrudo, link] = process.argv;

if (!nombreCrudo || !link) {
  console.error('Uso: node herramientas/nombre-corto.mjs <nombre> "<link completo de la carta>"');
  process.exit(1);
}

const nombre = String(nombreCrudo).trim().toLowerCase();

if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(nombre)) {
  console.error(`"${nombre}" no sirve: usa entre 2 y 24 caracteres, solo letras sin tilde, números y guiones.`);
  process.exit(1);
}
if (RESERVADOS.has(nombre)) {
  console.error(`"${nombre}" está reservado por la app. Escoge otro.`);
  process.exit(1);
}
if (!/^https:\/\/micarta\.weissailab\.com\/#\/c\/.+/.test(link)) {
  console.error('El link debe ser el link PÚBLICO de una carta:\n  https://micarta.weissailab.com/#/c/...');
  process.exit(1);
}

/* Si vino con mesa pegada la quitamos: la mesa la decide el ?m= de quien entra. */
const destino = link.replace(/\/m\/\d+$/, '');

const carpeta = join(RAIZ, nombre);
const yaExistia = existsSync(carpeta);

/* La redirección se hace en el navegador porque Pages no sabe hacer 301 y el
   fragmento (#) nunca llegaría al servidor de todos modos. El <noscript> deja
   un enlace visible por si acaso. */
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cargando la carta…</title>
<link rel="canonical" href="${destino}">
<meta name="robots" content="noindex">
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:#faf8f6;
       font:400 16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#6f6a60}
  a{color:#E23E2E;font-weight:700}
</style>
<script>
/* ?m=4 viene del QR de la mesa 4. Un solo archivo sirve a todas las mesas. */
(function(){
  var d = ${JSON.stringify(destino)};
  var m = (location.search.match(/[?&]m=(\\d{1,3})(?:&|$)/) || [])[1];
  location.replace(m ? d + '/m/' + m : d);
})();
</script>
</head>
<body>
<p>Abriendo la carta… <noscript><a href="${destino}">Toca aquí para verla</a></noscript></p>
</body>
</html>
`;

mkdirSync(carpeta, { recursive: true });
writeFileSync(join(carpeta, 'index.html'), html, 'utf8');

console.log(`${yaExistia ? 'Actualizado' : 'Creado'}: https://micarta.weissailab.com/${nombre}`);
console.log(`Apunta a: ${link.slice(0, 60)}…`);
console.log('\nFalta publicarlo:\n  git add . && git commit -m "nombre corto: ' + nombre + '" && git push');
