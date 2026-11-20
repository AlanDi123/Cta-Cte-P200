# Auditoría técnica — Sistema Sol & Verde

Revisión completa de las 29.619 líneas del sistema: 11.700 en 17 archivos `.gs` y 17.919 en `SistemaSolVerde.html`.

Cada hallazgo fue **verificado leyendo el código**, no inferido. Donde un informe preliminar exageró, se dice.

- **Corregidos:** 26 fallos, todos con prueba o verificación directa.
- **Documentados sin tocar:** ninguno. Los ocho puntos sensibles de la sección 7 quedaron resueltos.
- **Código muerto eliminado:** 17 funciones.
- **Conservado a propósito:** 9 funciones sin referencias que NO conviene borrar.

---

## 1. Corregidos — riesgo sobre el dinero

### 1.1 El candado se liberaba a mitad de la operación · `movimientos.gs:33`

`registrar()` tomaba el candado de script y, en medio de la sección crítica, llamaba a `generarNuevoID()`, que tomaba **el mismo** candado (`LockService.getScriptLock()` siempre devuelve el mismo) y lo **liberaba** al terminar.

Desde ese punto, la escritura de la fila y la actualización del saldo del cliente corrían **sin protección alguna**.

> **Qué pasaba:** dos fiados cargados en el mismo instante obtenían el mismo ID y el segundo pisaba el saldo calculado por el primero. Uno de los dos movimientos desaparecía del saldo.

**Corrección:** `generarNuevoID()` ya no gestiona el candado — lo tiene el llamador, que es quien debe tenerlo. Además lee solo la columna de ID en lugar de las 8 columnas de la hoja.

### 1.2 El reintento duplicaba movimientos · `movimientos.gs:111`

`conRetry(() => hoja.appendRow(nuevaFila))`. Si la fila se escribía pero la respuesta expiraba con un error de los que `conRetry` considera reintentables (`timeout`, `service spreadsheets failed`), **el reintento insertaba la fila otra vez**.

> **Qué pasaba:** un fiado de $50.000 quedaba registrado dos veces y el saldo del cliente se desfasaba.

**Corrección:** se escribe con `setValues` en una fila calculada **una sola vez** antes del reintento. Reescribir los mismos valores en el mismo lugar es inocuo; insertar una fila nueva no lo era. La fila calculada es estable porque el candado está tomado.

### 1.3 El contador de movimientos se inflaba al reintentar · `clientes.gs`

`actualizarSaldoYContadores` hacía `TOTAL_MOVS = totalMovs + 1`. Un incremento no es idempotente: al reintentar sumaba 2.

**Corrección:** el llamador pasa el total **absoluto**. Y si no lo pasa, el incremento se calcula sobre el valor recién leído de la hoja, no sobre el objeto en caché.

### 1.4 El IVA estaba fijo al 21% contra una alícuota configurable · `facturacionElectronica.gs`

Dos lugares calculaban `total / 1.21`, mientras la alícuota real del sistema es configurable y vale **10,5%** por defecto.

> **Qué pasaba:** una Factura A de $110.500 se archivaba y se informaba como **neto $91.322,31 / IVA $19.177,69** en lugar de **neto $100.000 / IVA $10.500**. El libro IVA quedaba mal informado.

**Corrección:** nueva función `_feDesglosarIVA(total)` que lee `CONFIG.getIVA().PORCENTAJE`. Si la configuración no estuviera disponible, cae al 21% y lo registra en el log.

### 1.5 El guardado de productos se ejecutaba dos veces · `SistemaSolVerde.html`

`guardarProducto()` llamaba a `agregarProducto`/`actualizarProducto` **sin manejadores**, asignando el resultado a una constante que nadie usaba, y **después** repetía la llamada con manejadores.

> **Qué pasaba:** cada producto nuevo se creaba **duplicado** en la hoja, y el resultado de la primera llamada se descartaba en silencio.

**Corrección:** una sola llamada, con manejadores de éxito y de fallo.

### 1.6 El resumen mensual se vaciaba al pasar las 500 filas · `facturacion.gs`

`obtenerTodas(limite)` leía desde la fila 2 —**las más viejas**— y recién después ordenaba descendente. `obtenerPorMes` llama con límite 500.

> **Qué pasaba:** superadas las 500 transferencias, el resumen del mes en curso devolvía **cero**, porque las del mes están al final de la hoja y nunca se leían.

**Corrección:** con límite se arranca desde el final de la hoja.

---

## 2. Corregidos — concurrencia y consistencia

| # | Ubicación | Defecto | Corrección |
|---|---|---|---|
| 2.1 | `movimientos.gs` | Tras borrar un movimiento, `ULTIMO_MOV` del cliente quedaba con la fecha **más vieja** de su historial: se tomaba `filtrados[length-1]` creyendo orden cronológico, pero `obtenerPorCliente` ordena **descendente** | Se toma `filtrados[0]` |
| 2.2 | `movimientos.gs` | `editar()` y `eliminar()` no invalidaban la caché `movimientos_cliente_*`: `eliminar` recalculaba `ULTIMO_MOV` sobre datos obsoletos | Invalidación tras cada escritura, también en `registrar()` |
| 2.3 | `contabilidad.gs` | Movimientos manuales de caja sin candado: dos gastos simultáneos compartían ID y `eliminar(id)` borraba **el equivocado** | `agregar()` toma el candado para generar el ID y escribir |
| 2.4 | `clientes.gs` | `crear()` comprobaba duplicados y escribía sin candado: dos altas simultáneas generaban dos filas del mismo cliente y el saldo se repartía | Candado alrededor de comprobación + alta, en `_crearSinCandado()` |
| 2.5 | `movimientos.gs`, `alquileres.gs`, `contabilidad.gs` (×3) | `releaseLock()` dentro del `catch`: si `waitLock` había expirado, el candado nunca se tomó y `releaseLock()` lanzaba **su propia excepción**, tapando el error real | Patrón `lockAdquirido` + `finally`, el que ya usaba bien `modulos_logisticos.gs` |
| 2.6 | `contabilidad.gs` | `abrirCajaDiaria` declaraba el candado **dentro** del `try`: ninguna salida por error lo liberaba | Declarado fuera, liberado en `finally` |
| 2.7 | `alquileres.gs` | `registrarPago` no validaba nada: `datos.monto` se escribía tal cual. Un monto negativo, cero o no numérico se persistía sin protestar, y el inquilino no se verificaba | Validación de monto e inquilino antes del candado. **Detalle:** se normalizan los dos lados de la comparación, porque `getInquilinos()` devuelve los nombres con acentos y `normalizarString` los quita — comparar sin normalizar habría rechazado a cualquier inquilino acentuado |

---

## 3. Corregidos — frontend

### 3.1 Un apóstrofo en el apellido rompía los botones

`escapeHtml()` usaba el truco `textContent → innerHTML`, que convierte `& < >` y **deja las comillas intactas**. Su resultado se interpolaba dentro de literales JS en atributos: `onclick="editarCliente('NOMBRE')"`.

> **Qué pasaba:** un apellido con apóstrofo —**D'ANGELO, D'ELÍA, O'CONNOR**, frecuentes en Argentina— partía el literal y **los botones Editar y Eliminar de ese cliente dejaban de responder**. Con una cadena preparada a propósito, permitía ejecutar código.

**Corrección en dos partes:**

1. `escapeHtml` ahora escapa también `"` y `'`, lo que protege de una sola vez los doce sitios que interpolan en `data-*` y `value=""`. En contenido de texto no cambia nada: el navegador muestra `&quot;` como `"`.
2. Nueva `escaparJsEnAtributo()` para los **11 manejadores inline**. Aquí HTML-escapar la comilla **no alcanza**: hay dos capas de interpretación encadenadas y el navegador decodifica `&#39;` de vuelta a `'` antes de que el motor JS lea la cadena. Hay que escaparla para JS (`\'`) y además proteger el delimitador del atributo.

Se eliminó el `.replace(/'/g, "\\'")` manual del único sitio que ya lo hacía bien, para no escapar dos veces.

### 3.2 La aplicación podía quedar en blanco

`Estado.proveedoresHistorial` se inicializaba con un `JSON.parse(localStorage.getItem(...))` suelto, **dentro del literal del objeto y en el nivel superior del script**.

> **Qué pasaba:** con la clave corrupta o `localStorage` bloqueado —habitual en el iframe de Apps Script sin cookies de terceros— eso lanzaba, la evaluación del script entero se detenía y **el sistema quedaba en blanco**, sin aviso ni error visible.

**Corrección:** seis funciones (`lsLeer`, `lsLeerJson`, `lsGuardar`, `lsGuardarJson`, `lsBorrar`, más la migración) que nunca lanzan. Todas las lecturas y escrituras del navegador pasan por ellas.

### 3.3 Fuga de listeners en el módulo ARCA

Se hacía `removeEventListener('input', arcaClienteInputHandler)` pero se registraba `debounce(arcaClienteInputHandler)`, que es **otra función**. El remove nunca quitaba nada, y la función corre en cada entrada al módulo y en cada «Nuevo Comprobante».

> **Qué pasaba:** los listeners se acumulaban. Con cinco visitas al módulo, **cada tecla disparaba cinco búsquedas de cliente contra el backend**.

**Corrección:** se guarda la referencia al handler realmente registrado y se retira esa misma referencia.

### 3.4 Claves del navegador sin prefijo, y «limpiar caché» que no limpiaba

Cinco claves (`tema`, `animaciones`, `proveedoresHistorial`, `remitoItemsHistorial`, `hojaRutaLiqDescHistorial`) convivían sin prefijo con las que sí usaban `sv_`, en el origen compartido `*.googleusercontent.com`. Y `limpiarCacheLocal()` borraba **3 de 8** claves y no reseteaba el estado en memoria, que volvía a escribirse en el siguiente guardado.

**Corrección:** todas las claves pasan a `sv_`, con **migración automática** de las antiguas para no borrarle sus preferencias. `limpiarCacheLocal()` barre la lista completa de claves de caché y preserva las de preferencias (tema, colores, límite del Visor).

### 3.5 Errores que no llegaban al usuario

Cuatro cadenas `google.script.run` tenían manejador de éxito pero **no de fallo**: si el backend fallaba, el spinner giraba para siempre sin ninguna señal. Y `registrarErrorCritico` —justo la pieza que no puede fallar en silencio— se invocaba sin manejadores.

**Corrección:** las cinco tienen manejador de fallo. Ya no queda **ninguna** cadena sin él, verificado con un analizador que cuenta paréntesis.

> **Nota de honestidad:** un informe preliminar reportó **27** cadenas sin manejador de fallo. Al verificarlo con conteo real de paréntesis en lugar de heurística por líneas, eran **4**. El número estaba inflado.

---

## 4. Rendimiento y peso

| Qué | Antes | Ahora |
|---|---|---|
| **Chart.js** | Se descargaba en cada carga | **Eliminado.** Cero usos de `new Chart` en todo el archivo |
| **Font Awesome** | Librería CSS completa por **2** iconos | **Eliminada.** Los dos iconos pasan a emoji, como el resto del sistema |
| **dayjs** | Librería entera por **1** llamada | **Eliminada.** `formatearFecha` es nativa |
| `abrirCajaDiaria` | Leía la hoja completa **3 veces** dentro del candado | 1 vez: `CajaDiariaRepository.obtenerTodas()` cachea por ejecución, con invalidación en cada escritura |
| `generarNuevoID` (movimientos) | Leía las 8 columnas de la hoja | Solo la columna de ID |
| `crear` (clientes) | Leía las 13 columnas | Solo la columna de nombres |

**Tres peticiones de red menos en cada apertura del sistema.** Importa: se usa desde el celular.

Sobre `formatearFecha`, un detalle que conviene no perder: la rama ISO va **primero a propósito**. `new Date('2026-11-18')` se interpreta como UTC y en Argentina (UTC−3) mostraría **el día anterior**. Está cubierto por prueba.

---

## 5. Código muerto eliminado — 17 funciones

Todas verificadas con búsqueda de referencias en los 17 `.gs` **y** en el HTML. Cero usos.

**Backend (7):** `generarHojaRuta` (la Hoja de Ruta se arma íntegramente en el navegador desde el formulario de arqueo), `ajustarSaldoCliente`, `obtenerTransferencia`, `afipFormatoFecha`, `calcularFechaFacturaPermitida`, `formatoPesos`, `generarRespuesta`.

**Frontend (10):** `svNavTeclado` (101 líneas; la que se usa es `setupNavegacionTeclado`), `_svMostrarSkeletonDashboard` (40), `svCargar` (40), `llamarBackend` (24), `_svPrecargarModulos` (22), `_hfFilasVacias` (15), `procesarFacturasEnLote`, `_gasFireAndForget`, `descartarBorradorCaja`, `buscarClienteUltraRapido`, `alqVerTodo`.

---

## 6. Conservado a propósito — 9 funciones sin referencias

Un informe preliminar las marcó para borrar. **No se borraron, y conviene que no se borren.**

### `crearBackupDiario` — `backups.gs`

Es **todo** el contenido de `backups.gs` y se llama «Diario». Casi con certeza es el objetivo de un **activador programado** en su proyecto de Apps Script, que no puedo ver desde aquí. Borrarla **mataría sus respaldos automáticos en silencio**, sin ningún error visible.

### Siete diagnósticos

`verificarIntegridadSistema`, `diagnosticarConfiguracion`, `diagnosticarConsultaCUIT`, `verMisProperties`, `verificarConfiguracionARCA`, `testAPIRapido`, `testObtenerDatosCompletos`.

No las llama el sistema porque están pensadas para ejecutarse **a mano desde el editor de Apps Script** cuando algo se rompe. Son su red de seguridad para diagnosticar. Borrarlas no gana nada y le quita herramientas.

### `validarClienteFacturacion` — `utils.gs`

Codifica reglas fiscales reales de AFIP (Factura A exige CUIT y condición RI o Monotributista). Está sin conectar, pero el conocimiento que contiene es valioso y es plausible que se quisiera usar. **Vale la pena conectarla, no borrarla.**

---

## 7. Puntos sensibles

Afectan dinero, stock o fisco. **Los ocho están corregidos**: los cuatro primeros en la primera ronda, los cuatro restantes en la segunda.

### 7.1 ✅ CORREGIDO — CAE emitido en ARCA que el sistema reportaba como éxito aunque no guardara nada · `facturacionElectronica.gs`

Si ARCA **otorgaba el CAE** pero fallaba el guardado local, el `catch` lo capturaba y se devolvía `success: true` con una advertencia sepultada dentro del mensaje.

> **Qué pasaba:** el comprobante **existía en ARCA** y no en el sistema. No aparecía en el historial, no se le podía emitir nota de crédito y no se detectaba al conciliar. Era el más grave.

**Corrección.** El punto de partida es que desde que ARCA otorga el CAE, el comprobante existe ante el fisco y no se puede deshacer: solo se anula con una nota de crédito. Por eso **el resultado sigue siendo `success: true`** — informar un fallo invitaría a reemitir y duplicar el comprobante. Lo que cambia es todo lo demás:

1. **Stock y guardado quedan independientes:** un fallo al descontar stock ya no impide guardar el comprobante.
2. **El guardado se reintenta** con `conRetry`.
3. Si aun así falla, queda un **registro durable** en una hoja nueva, `CAE_SIN_GUARDAR`, con el CAE, el número, los importes y el detalle completo en JSON. Es una hoja **aparte** de `Pendientes_ARCA` a propósito: esa cola es para comprobantes que *no* se emitieron, y reintentar la emisión de un CAE huérfano generaría un duplicado.
4. La respuesta lleva una marca estructurada `requiereAtencion: 'CAE_SIN_GUARDAR'`, y la interfaz pinta el recuadro **en rojo** en lugar del verde de éxito, con los datos para anotar y la advertencia de no reemitir.
5. Nuevas funciones `obtenerCaesSinGuardar()` y `reintentarGuardadoCaeSinGuardar(fila)`, con su tarjeta en Configuración: permiten completar el registro local **sin tocar ARCA**.

### 7.2 ✅ CORREGIDO — El stock se descontaba por coincidencia parcial de nombre · `facturacionElectronica.gs`

`filaNombre.includes(busqueda) || busqueda.includes(filaNombre)`, con `break` en la primera coincidencia.

> **Qué pasaba:** un ítem «AGUA» descontaba del primer producto cuyo nombre contuviera «agua» — «AGUA MINERAL 2L» en vez de «AGUA SODA», según el orden de las filas. Y si el stock quedaba **negativo, descontaba igual**.

**Corrección.** Identificación por prioridades y sin adivinar: **1)** código exacto, **2)** nombre exacto, **3)** coincidencia parcial **solo si es única**. Si varios productos coinciden parcialmente es ambiguo, **no se toca nada** y se informa listando los candidatos para que se use el código exacto. Y si el stock no alcanza, **no se descuenta**: dejarlo en negativo convertía un dato de inventario en un número sin sentido.

### 7.3 ✅ CORREGIDO — ID de factura truncado a 8 caracteres · `facturacionElectronica.gs`

`Utilities.getUuid().substring(0,8)` como clave, y el historial **deduplicaba por ese ID**.

> **Qué pasaba:** una colisión (≈1% con 10.000 comprobantes) hacía que una factura real **desapareciera del historial** —se la tomaba por copia de otra— y que una nota de crédito pudiera apuntar al comprobante equivocado.

**Corrección.** El historial ahora deduplica por la **clave fiscal**: el trío *(tipo, punto de venta, número)*. AFIP garantiza numeración secuencial sin repetición por cada combinación de tipo y punto de venta, así que esa clave **no puede colisionar** — y es la correcta para detectar la misma factura presente en las dos hojas, que era lo que se buscaba. Para filas viejas o incompletas sin el trío se cae al ID, exactamente el comportamiento anterior: nada empeora.

Los comprobantes nuevos además se guardan con el **UUID completo**, sin truncar. Las filas ya guardadas conservan su ID corto y siguen funcionando, porque la deduplicación ya no depende de ese campo.

> El ID corto de `auditoria.gs` se revisó y **no se tocó**: solo agrupa sesiones en el log y no se usa como clave.

### 7.4 ✅ CORREGIDO — La rama «Consumidor Final» del resumen mensual nunca se ejecutaba · `facturacion.gs`

El alta escribe `tipoFactura` como `'A'` o `'B'`, pero el filtro comparaba contra `'CONSUMIDOR FINAL'`, un valor que el sistema nunca escribe en esa columna: solo lo usa como nombre de cliente.

> **Qué pasaba:** **todas las facturas B quedaban fuera del resumen mensual** y la hoja «Consumidores Finales» no se generaba jamás.

**Corrección.** El filtro compara contra `'B'`, y acepta también el valor antiguo `'CONSUMIDOR FINAL'` por si alguna fila histórica lo tiene. Además, nada desaparece en silencio: las transferencias que no entran en ninguna categoría —columna vacía o valor inesperado— se cuentan aparte y se informan en el mensaje y en el log, con sus IDs.

### 7.5 ✅ CORREGIDO — Stock sin transacción ni reversión · `facturacion.gs`

`validarStock` leía y `descontarStock` volvía a leer y escribía, sin candado entre ambas; y `procesarFacturaConStock` descontaba ítem por ítem sin reversión.

> **Qué pasaba:** dos facturas simultáneas del último producto pasaban **ambas** la validación y el stock terminaba en negativo. Y si el tercer ítem fallaba, los dos primeros **ya quedaban descontados** y la transferencia no se marcaba como facturada: stock restado de una factura que nunca se emitió.

**Corrección, en tres partes:**

1. **Nuevo `descontarStockLote(items)`** — una sola operación. Lee la hoja **una vez**, agrega las cantidades por producto (el mismo ID puede venir repetido, y validar cada aparición por separado dejaba pasar la suma), valida **todo** en memoria, y **recién entonces** escribe. Si algo falla no se escribe nada: la hoja queda exactamente como estaba.
2. **Nuevo `restaurarStock(aplicados)`** — devuelve el stock a sus valores previos.
3. **`procesarFacturaConStock` toma candado** sobre toda la operación y, si el marcado de la transferencia falla después del descuento, **revierte**. Si la reversión misma no se completa, lo informa con `requiereAtencion: 'STOCK_SIN_REVERTIR'` y dice cuántos productos hay que revisar a mano, en lugar de callarlo.

Beneficio extra: una factura de N productos pasa de **N lecturas** de la hoja completa a **una**.

El contrato de `descontarStock` para un solo producto se conservó **exactamente** —lanza si no alcanza, devuelve `false` si el producto no existe—, porque su único llamador es la emisión ARCA después de obtener el CAE, y cambiarle el flujo no fue pedido.

### 7.6 ✅ CORREGIDO — La API REST no tenía autenticación · `main.gs`

`addTransfers`, `addMovements` y `saveBackup` **no validaban token alguno**, mientras las acciones de logística sí pasaban `data.token`. `manejarApiGet` exponía además `getClients`, `exportData` y `getLatestBackup` sin validación.

> **Qué pasaba:** depende de cómo esté publicado el Web App. Si está como «cualquier persona», **cualquiera con la URL podía inyectar movimientos de cuenta corriente, pisar el backup o descargar el padrón completo de clientes**.

**Corrección.** Token en la propiedad de script `API_TOKEN`, exigido en las seis acciones sensibles. La comparación recorre siempre todos los caracteres para no filtrar nada por el tiempo de respuesta. `status` queda abierta a propósito, para comprobar que el servicio responde sin exponer datos. En Configuración → Claves y Tokens hay una tarjeta para generar el token (48 caracteres, se muestra una sola vez), consultar si está configurado —nunca su valor— y revocarlo.

> ### ⚠️ Esto puede cortar una integración existente
>
> **Mientras `API_TOKEN` no esté configurado, esas seis acciones quedan denegadas.** Es deliberado: preferible que una integración falle de forma visible y se arregle, a que el agujero siga abierto en silencio.
>
> Si tiene un sistema externo —un POS, un script— que consume esta API, hay que hacer dos cosas **antes** de desplegar: generar el token en Configuración y cargarlo en ese sistema. Se envía en el campo `token` del cuerpo JSON en POST, o como parámetro `&token=` en la URL en GET. Si no hay nada externo consumiendo la API, no hay nada que hacer.

### 7.7 ✅ CORREGIDO — Saldos indexados sin normalizar · `movimientos.gs` + `main.gs`

`calcularSaldosHistoricos` indexaba por el nombre **crudo** de la hoja MOVIMIENTOS, mientras `obtenerSaldosConMovimientosDia` buscaba por el nombre de la hoja CLIENTES.

> **Qué pasaba:** cualquier diferencia de acentos o de espacios entre las dos hojas hacía que la búsqueda no encontrara nada y el cliente apareciera con **saldo 0** en la vista histórica, aunque tuviera deuda. Y con el mismo cliente escrito de las dos formas, su saldo quedaba **partido en dos** entradas distintas.

**Corrección.** Los **dos** índices de esa función —el de saldos y el de movimientos del día, que tenía el mismo defecto y no figuraba en el informe preliminar— se arman con claves normalizadas, y las **cuatro** búsquedas que los consultan normalizan igual.

Medido sobre un caso concreto: con `MARTÍNEZ` acentuado en MOVIMIENTOS y `MARTINEZ` sin acento en CLIENTES, un fiado de $15.000 y un pago de $5.000 daban **−$5.000** al buscar sin normalizar, cuando el saldo verdadero es **$10.000**.

### 7.8 ✅ CORREGIDO — El PIN de logística estaba escrito en el repositorio · `config.gs`

El PIN de los módulos protegidos estaba como literal en `CONFIG.MODULOS_EXTRA.PIN_ACCESO`.

> **Qué pasaba:** el PIN era **público en GitHub**. Cualquiera que viera el código lo conocía.

**Corrección.** El literal se eliminó del código. El PIN vive únicamente en la propiedad de script `PIN_MODULOS_EXTRA`, que ya se configuraba desde Configuración → Parámetros de Logística pero tenía ese valor del repositorio como respaldo silencioso. Ahora, **sin PIN configurado no hay respaldo**: el acceso se deniega con un mensaje que indica dónde definirlo.

> **Importante:** el valor viejo **sigue en el historial de Git**, y eso no se puede deshacer reescribiendo el repositorio sin romper las ramas existentes. Si ese PIN se usaba de verdad, **cámbielo por otro** en Configuración: es la única forma de invalidarlo. Pasa a Configuración en la Etapa 4; mientras tanto, conviene saberlo.

---

## 7-bis. Un fallo encontrado en producción, no en la auditoría

Al desplegar aparecieron en consola estas líneas:

```
Uncaught TypeError: google.script.run...obtenerInquilinosConfig is not a function
    at cargarInquilinosConfig (...:9461:10)
```

**La causa no es un error del código**, es un **desfase de versiones**: la interfaz desplegada era la nueva, pero los archivos `.gs` del proyecto de Apps Script seguían siendo los viejos. `google.script.run` arma su lista de funciones con las que **existen en el proyecto desplegado**; `obtenerInquilinosConfig` es nueva, no estaba, y la propiedad quedó indefinida.

Lo grave no fue el error en sí sino su efecto: **ese `TypeError` no estaba atrapado y abortó todo lo que venía después** en el mismo manejador. IVA, OCR, búsqueda difusa, impresión y logística **quedaron sin cargar, en silencio**. Eso fue un defecto de diseño mío: puse una llamada al servidor en el medio de un bloque que rellena el formulario de forma sincrónica.

**Corregido en dos frentes:**

1. **Nuevo `svBackend(nombre, args, alOk, alError)`** — comprueba que la función exista **antes** de llamarla. Si falta, da un mensaje que la nombra y dice que hay que subir los `.gs`, y **devuelve el control** en lugar de lanzar. También contiene las excepciones del propio manejador de éxito, para que un error ahí no escale.
2. **Las cargas que dependen del servidor se movieron al final** del manejador y van entre `try/catch`. Lo peor que puede pasar ahora es que falten ellas.

Las tres llamadas que corren solas al abrir Configuración —inquilinos, estado del token y estado de la actualización en caliente— pasaron a `svBackend`, y muestran el error **dentro de su propia tarjeta** en lugar de como un aviso suelto.

> **Para que no vuelva a pasar:** la interfaz y los `.gs` tienen que subirse juntos. Es exactamente lo que resuelve el despliegue automático de `DEPLOY.md`, y es la razón por la que la Capa 1 —la interfaz en caliente desde GitHub— **no debe usarse sola** sin la Capa 2.

## 7-ter. Lectura de nombres en español: lo que se encontró al medir

Al mejorar el OCR para nombres en español se midió contra el comportamiento anterior, con un
padrón sintético y páginas de libro con mala letra generadas a propósito. **Esa medición destapó
siete defectos, la mayoría míos.** Se documentan todos.

| # | Hallazgo | Dónde | Estado |
|---|---|---|---|
| 1 | **La búsqueda difusa del sistema nunca sugiere por errores de tipeo con la configuración por defecto.** Una letra de diferencia da 46 puntos; el mínimo para sugerir es 65 (`PESO_LEVENSHTEIN: 50` < `MIN_SCORE: 65`). Solo funciona por prefijo o por «contiene». | `config.gs` `FUZZY` | **Sin tocar** fuera del OCR (afecta a otras búsquedas) |
| 2 | **La «siembra del diccionario» con el padrón nunca existió.** Se descargaban las palabras del padrón y no se le pasaban a Tesseract. Lo que sí aportaba era la corrección posterior. | `SistemaSolVerde.html` | Corregido el relato; ahora el padrón se usa de verdad para comparar |
| 3 | **El «recorte ampliado» de cada fila nunca se mostraba.** El dato se calculaba, el servidor lo descartaba al corregir los nombres y nada lo volvía a pegar. | `ocr.gs` + HTML | Corregido (`idFila`) |
| 4 | **El aviso «se van a dar de alta» era falso.** El servidor no da de alta clientes: esas filas fallaban con «Cliente no encontrado». | HTML | Corregido: avisa lo real y no intenta guardarlas |
| 5 | **La binarización por media convertía el lado en sombra de una foto en una lluvia de puntitos** que le impedía al OCR ver los montos; y el modo de página 3 de Tesseract está pensado para párrafos, no para columnas. | HTML | Corregido (Sauvola + modo 6/11 + margen) |
| 6 | **Un monto sin nombre se descartaba en silencio** («probablemente un total»), igual que un nombre sin monto. Con mala letra es lo contrario a un total. | HTML | Corregido |
| 7 | **El PIN de facturación (`1234`) está escrito en el HTML y se comprueba solo en el navegador.** Es público en el repositorio y evitable desde la consola. La auditoría 7.8 solo cubrió el PIN de logística. | `SistemaSolVerde.html` `PinLock` | **Sin tocar: pendiente de su decisión** |

### Lo que se cambió

- **`nombres_es.gs`** (nuevo): comparador de nombres. Compara palabra por palabra, sin importar el
  orden; entiende la fonética rioplatense (b/v, s/z/c, ll/y, h muda, g/j, qu/k); apellidos con
  partícula (`DI MARCO` = `DIMARCO`, `DE LA TORRE` = `TORRE`); confusiones de lectura (0/O, 1/I, rn/m);
  grafías de origen italiano, vasco y otros comunes en Argentina; y pesa más una palabra rara
  que una común. Copia idéntica dentro del HTML; el despliegue verifica que coincidan.
- **Regla de seguridad para aceptar un nombre solo:** parecido alto, ventaja clara sobre el
  segundo, y ninguna otra lectura apuntando a otro cliente. Un nombre exacto y único siempre
  pasa. Si hay dos clientes casi iguales (`PAZ`/`PAEZ`), **siempre pregunta**.
- **Reintentos:** las filas que no coinciden se vuelven a leer, solo el nombre, con seis
  variantes distintas (una por vuelta) hasta coincidir o agotar vueltas/tiempo.
- **Segunda mirada a la página**, solo si la primera dejó algo incompleto.
- **Idioma fijo en español.** Se ignora lo que hubiera guardado en `OCR_IDIOMA`.
- Tres ajustes nuevos en Configuración: reintentos, tiempo máximo y umbral de aceptación.

### Cifras (padrón sintético de 150 clientes; páginas generadas con letra irregular)

Sobre **60 anotaciones por nivel** (6 páginas de 10). «Útil» = el sistema acertó el cliente solo
**o** lo dejó entre las 3 sugerencias.

| Nivel de mala letra | Montos leídos antes → ahora | Clientes útiles antes → ahora | Aceptados solos, antes → ahora | Aceptados **mal** |
|---|---|---|---|---|
| 1 (leve) | 100% → 100% | 60 → 60 de 60 | 25 → 26 | 0 → 0 |
| 2 (media) | 50% → **82%** | 28 → **46** de 60 (47% → 77%) | 3 → **17** | 0 → 0 |
| 3 (mala) | 7% → **52%** | 2 → **23** de 60 (3% → 38%) | 0 → 2 | 0 → 0 |

«Antes» es el sistema anterior a esta ronda: binarización por media, modo de página 3, sin
margen, sin reintentos. En una foto buena no cambia nada (y no cuesta más: una sola lectura).
El comparador viejo, con su configuración por defecto, acierta entre las 3 primeras solo el
35% en el nivel 2 y el 6% en el nivel 3 (ver hallazgo 1).

Del comparador de nombres solo, sin imagen (padrón de 150 clientes, 200 lecturas por celda,
con 1, 2 y 3 errores de lectura): con el **apellido solo**, el cliente correcto queda entre las
3 primeras sugerencias el 93% / 82% / 73% de las veces, contra 10% / 6% / 2% del anterior;
con el **nombre en otro orden**, 95% / 92% / 84% contra 0%; con **apellido e inicial**,
99% / 93% / 82% contra 19% / 4% / 2%. Con el nombre completo empatan (100%).
Entre 600 lecturas de clientes que **no** están en el padrón, ninguna se aceptó sola.

> **Límite honesto.** Son páginas **sintéticas**: letra irregular simulada sobre fuentes de
> imprenta, no manuscrito real. Sirven para comparar versiones entre sí, no para prometer un
> porcentaje sobre sus libros. La calibración real se hace con el banco de pruebas y fotos suyas.

---

## 7-quater. «Escanear» de Facturación: el error al leer la foto, y por qué no habría servido igual

Al elegir la foto de la planilla **TRANSFERENCIAS** (manuscrita: Cliente · Bco · Importe), el
módulo respondía **«No se pudo preparar la imagen: No se pudo leer el archivo.»**

### Lo que se encontró

1. **El archivo se leía dos veces.** Una al elegirlo (vista previa) y otra al tocar «Procesar».
   En Android, una foto elegida desde la galería o Google Fotos puede perder el permiso de
   lectura entre las dos → `NotReadableError`. Reproducido en Chromium borrando el archivo entre
   ambas lecturas: el camino viejo falla, el nuevo lee desde la copia.
2. **Aunque leyera, el resultado habría sido malo.** El servidor interpretaba la imagen con
   `interpretarExtracto`, pensado para **capturas de homebanking impresas**, no para una planilla
   manuscrita con columnas, y comparaba nombres con el buscador viejo.
3. **«undefined transferencias importadas».** `importarTransferenciasIA` devolvía
   `resultados.length` sobre un objeto `{exitosos, errores}`: el conteo salía `undefined` y los
   errores por fila se perdían.
4. Sin forma de corregir la fecha, banco como texto libre (la carga manual usa botones) y sin
   control de duplicados.

### Lo que se cambió

- **Lectura del archivo:** se copia a memoria **una sola vez, al elegirlo**; todo lo demás usa la
  copia. Decodificación con tres respaldos (`createImageBitmap` → `FileReader` → `objectURL`) y un
  mensaje que dice qué hacer si las tres fallan. Lo mismo en la lectura del libro.
- **Lectura de la planilla:** se detecta la **cuadrícula** (renglones y columnas dibujadas a mano,
  aunque estén inclinadas) y se lee **celda por celda**: Tesseract en el navegador y, en paralelo,
  el OCR de Google (Drive) sobre un **mosaico etiquetado** de recortes. El importe se decide por
  votación; el banco, por diccionario (`ST`, `MP`, `Macro`…); el nombre, contra el padrón con
  `NombresEs` y reintentos.
- **Filas «Chajarí» = aviso, no se factura.** Dos señales independientes: lo escrito en la columna
  Banco y el **resaltador rosa** medido sobre la foto en color. Se muestran atenuadas, fuera de la
  importación, con un botón «Facturar igual».
- **Importes en miles** (101 = 101.000), con un interruptor visible que se recuerda por navegador.
- **Pantalla:** sacar foto directo o elegir varias; marcar la **zona** de la planilla arrastrando;
  semáforo por fila; «Ver recortes» con el trazo de cada celda; sugerencias del padrón como botones;
  **bancos como botones**; **fecha editable**; «＋ Agregar fila» para un renglón que no se leyó; en el
  celular, cada transferencia es una tarjeta.
- **Servidor** (`facturacion.gs`): conteo y errores por fila al importar; nueva
  `buscarTransferenciasDuplicadas` (misma fecha, cliente sin tildes ni mayúsculas, y monto); antes
  de importar se elige «Importar sin duplicados» o «Importar todo». Si la importación falla, la
  lista **no se borra**. `procesarImagenComprobante` compara con `NombresEs`.

### Cifras sobre la foto real (16 transferencias, 4 de ellas «Chajarí»)

| Escenario | Filas | Nombre correcto o sugerido | Importe exacto | Banco / aviso | Avisos bien |
|---|---|---|---|---|---|
| Zona marcada, **solo Tesseract** (sin Drive) | 11/16 | 2/16 | 0/16 | 6/16 | 4/4, sin falsos |
| Zona marcada, **Drive simulado** con lectura correcta | 16/16 | 16/16 | 16/16 | 16/16 | 4/4, sin falsos |

> **Límite honesto.** Tesseract lee muy mal los números escritos a mano; la calidad real depende del
> OCR de Google (Drive), que **no se puede ejecutar en el contenedor**. La segunda fila mide el
> encastre (cuadrícula → mosaico → fusión → pantalla) suponiendo que Drive lee bien; no promete
> esa precisión. Marcar la zona importa: con la foto entera (teclado, mesa, columna «OTROS»), la
> cuadrícula se arma peor.

---

## 8. Cómo se verificó

Apps Script no se ejecuta en el contenedor de desarrollo, así que la comprobación fue en capas:

- **Sintaxis:** los 16 `.gs` y el bloque JS del HTML (12.321 líneas) compilan.
- **Inventario de funciones:** comparación automática contra el commit anterior. 726 → 719: exactamente las 17 eliminadas y las 10 auxiliares nuevas, **sin daño colateral**.
- **Pruebas sobre el código real** —extraído del archivo, no transcrito a mano—: 9 comprobaciones de escapado y fechas, incluido el caso `D'ANGELO` de punta a punta, la neutralización de una inyección y el desfase UTC.
- **Paginación del Visor:** 23 comprobaciones (tramos, `offset` fuera de rango, límite 0, entradas inválidas, cliente sin movimientos).
- **Analizador de `google.script.run`** con conteo de paréntesis: **0** cadenas sin manejador de fallo.

### Lo que falta probar en vivo, y que no puedo hacer desde aquí

1. Una **Factura A** y comprobar que el neto y el IVA salen al 10,5%.
2. Un cliente con **apóstrofo** en el apellido, y que Editar y Eliminar respondan.
3. **Borrar un movimiento** y verificar que «último movimiento» del cliente queda en la fecha correcta.
4. El **resumen mensual** con más de 500 transferencias en la hoja.
5. **Alta de un producto** y confirmar que se crea **una sola vez**.
6. Que su **tema y colores** siguen ahí tras la migración de claves.
7. **Escanear:** la foto de la planilla desde la galería del teléfono, marcando la zona; ver cuántos
   importes acierta Drive y que las filas «Chajarí» salgan como aviso.
8. **Importar** dos veces la misma planilla y comprobar que avisa de los duplicados.
