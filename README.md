# Bythfod via Eistedglobal

Simulación animada del **Programa del Día de un eisteddfod FICTICIO**
("Eisteddfod Bythfod · Porth Awel"): tres sesiones, 46 ítems, participantes,
piezas, autores y lugares todos inventados (estructura inspirada en los
programas reales de los eisteddfodau patagónicos, sin usar sus datos), jurado
con devoluciones, premios — todo escrito en vivo en la base de
[eistedglobal](../web/revamps/eistedglobal-revamp) (edición sandbox **2099**).

Tres paneles:

1. **Escenario** — el renderer NES de la demo previa de este repo (preservada
   en el commit `4d8cbce`), ahora vendorizado como módulos ES en `js/render/`
   (`stage` · `synth` · `music`).
2. **Jury cam** — primer plano oscuro del beirniad en su mesa (mic, papeles,
   botella), activo durante la deliberación y el anuncio de premios.
3. **Tablero de resultados** — pantalla de sala que lee la API: orden del día,
   NAWR/NESAF y ganadores *confirmados por la base de datos* (el POST del premio
   viaja a SQLite y vuelve por polling ≤3 s).

## Correr

```bash
# 1. API eistedglobal (puerto 3000) — una sola vez: npm run seed
cd ../web/revamps/eistedglobal-revamp/api && npm run seed && npm run dev

# 2. La sim (puerto 8123)
cd bythfod && npm run serve                     # npx http-server -p 8123 -c-1

# 3. Abrir http://localhost:8123
#    → seed + credenciales (admin/admin1234) → CONECTAR Y PREPARAR
#    → o COMENZAR (sin conexión) para correr sin API
```

El Angular admin (puerto 4200) puede correr en paralelo para **ver las tablas**
(login admin/admin1234 → Competitions/Registrations/Works filtrando año 2099):

```bash
cd ../web/revamps/eistedglobal-revamp/app && npx ng serve
```

Cambios hechos en eistedglobal (ambos solo-dev): `api/.env` permite ambos
orígenes (`CORS_ORIGIN=http://localhost:4200,http://localhost:8123`, con
`app.ts` aceptando lista separada por comas) y `app/src/environments/environment.ts`
ahora apunta al API local (`http://localhost:3000/api`) en vez del productivo —
revertir esa línea si querés que `ng serve` vuelva a pegarle al servidor real.

Controles: `Espacio` o PAUSA/SEGUIR · velocidad ×0.5–×4 · PROGRAMA abre el
listado (click en un ítem = saltar a él) · SONIDO on/off · selector de tema.

## Herramientas headless

```bash
node --test                      # suite completa (node 22, sin dependencias)
node tools/e2e.mjs --seed 42     # login→reset→publicar→premiar→verificar
node tools/verify.mjs            # tabla del sandbox directo de la API
```

Correr `e2e` dos veces prueba la idempotencia del reset: la edición 2099 se
reutiliza (no hay DELETE de ediciones), las competencias `BY2099NN` se
actualizan por PUT (una competencia con inscripciones nunca puede borrarse:
FK + soft-drop), los works se borran y las inscripciones se dan de baja.
**Residuo esperado**: inscripciones dropped y participantes `SIM-*` inactivos se
acumulan invisibles para la UI — aceptable para un año sandbox.

## Arquitectura

```
js/core     rng · names · program (los 46 ítems ficticios) · roster (sorteo)
            timeline (ítem → segmentos) · engine (máquina de fases pura,
            emite efectos-datos) · feedback (frases del jurado, seam para LLM)
js/api      client (fetch tipado, re-login en 401, cola serializada)
            sandbox (categorías→edición→reset→publicar→premiar)
            poller (ventana rodante de works → tablero)
js/render   synth+music+stage (vendorizados de bythfod) · jury · board · hud
```

El engine es puro (`step(state, dt) → effects[]`): main.js interpreta los
efectos (piezas del sintetizador, POST de premios, líneas del jurado). La API
es la autoridad sobre resultados; el engine, sobre el tiempo.

## TODO(vos) — contribuciones de aprendizaje

Cuatro funciones cortas quedan como stubs con contrato documentado y **tests en
rojo ya escritos** (`node --test` los lista como `# TODO`). Mientras tanto corren
fallbacks provisorios (orden impreso, gana el primero):

1. `drawPlacements` — js/core/roster.js — quién gana y cuándo queda desierto
2. `shuffleKeepingFixed` — js/core/roster.js — barajar sin mover las ceremonias
3. `pickFragment` — js/core/feedback.js — anti-repetición de frases del jurado
4. `nextPollDelay` — js/api/poller.js — backoff del polling (opcional)

Implementá una, corré `node --test`, y el fallback se retira solo.
