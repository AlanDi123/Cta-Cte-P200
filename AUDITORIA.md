# Auditoría técnica — Sistema Sol & Verde

Revisión completa de las 29.619 líneas del sistema: 11.700 en 17 archivos `.gs` y 17.919 en `SistemaSolVerde.html`.

Cada hallazgo fue **verificado leyendo el código**, no inferido. Donde un informe preliminar exageró, se dice.

- **Corregidos:** 18 fallos, todos con prueba o verificación directa.
- **Documentados sin tocar:** 8, porque afectan dinero, stock o fisco y requieren su decisión.
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

## 7. Pendientes de su decisión — 8 puntos, sin tocar

Afectan dinero, stock o fisco. No se modificaron.

### 7.1 CAE emitido en ARCA que el sistema reporta como éxito aunque no guarde nada · `facturacionElectronica.gs`

Si ARCA **otorga el CAE** pero falla el guardado local, el `catch` lo captura y se devuelve `success: true` con una advertencia dentro del mensaje.

> **Consecuencia:** el comprobante **existe en ARCA** y no en su sistema. No aparece en el historial, no se le puede emitir nota de crédito y no se detecta al conciliar. Es el más grave de esta lista.

### 7.2 El stock se descuenta por coincidencia parcial de nombre · `facturacionElectronica.gs`

`filaNombre.includes(busqueda) || busqueda.includes(filaNombre)`, con `break` en la primera coincidencia.

> **Consecuencia:** un ítem «AGUA» descuenta del primer producto cuyo nombre contenga «agua» — «AGUA MINERAL 2L» en vez de «AGUA SODA». Y si el stock queda **negativo, descuenta igual** y solo registra una advertencia en el log.

### 7.3 ID de factura truncado a 8 caracteres · `facturacionElectronica.gs`

`Utilities.getUuid().substring(0,8)` como clave, y el historial **deduplica por ese ID**.

> **Consecuencia:** una colisión (≈1% con 10.000 comprobantes) hace que una factura real **desaparezca del historial** y que una nota de crédito apunte a la factura equivocada.

### 7.4 La rama «Consumidor Final» del resumen mensual nunca se ejecuta · `facturacion.gs`

El alta escribe `tipoFactura` como `'A'` o `'B'`, pero el filtro compara contra `'CONSUMIDOR FINAL'`, que solo se usa como nombre de cliente.

> **Consecuencia:** **todas las facturas B quedan fuera del resumen mensual** y la hoja «Consumidores Finales» nunca se genera.

### 7.5 Stock sin transacción ni reversión · `facturacion.gs`

`validarStock` lee y `descontarStock` vuelve a leer y escribe, sin candado entre ambas; y `procesarFacturaConStock` descuenta ítem por ítem sin reversión.

> **Consecuencia:** dos facturas simultáneas del último producto pasan ambas la validación. Y si el tercer ítem falla, los dos primeros ya quedaron descontados y la transferencia **no** se marca como facturada.

### 7.6 `doPost` sin autenticación en las acciones financieras · `main.gs`

`addTransfers`, `addMovements` y `saveBackup` **no validan token alguno**, mientras las acciones de logística sí pasan `data.token` por `_validarTokenVales`. `manejarApiGet` expone además `getClients` y `exportData` sin validación.

> **Consecuencia:** depende de cómo esté publicado el Web App. Si está como «cualquier persona», **cualquiera con la URL puede inyectar movimientos de cuenta corriente, pisar el backup o descargar su padrón de clientes**. Convendría que me confirme esa configuración.

### 7.7 Saldos indexados sin normalizar · `movimientos.gs` + `main.gs`

`calcularSaldosHistoricos` indexa por el nombre crudo de la hoja, mientras `obtenerSaldosConMovimientosDia` busca por el nombre de la hoja CLIENTES.

> **Consecuencia:** cualquier diferencia de acentos o espacios hace que ese cliente aparezca con **saldo 0** en la vista histórica.

### 7.8 El PIN de logística está escrito en el repositorio · `config.gs`

`PIN_ACCESO: '4646'`.

> **Consecuencia:** el PIN es **público en GitHub**. Pasa a Configuración en la Etapa 4; mientras tanto, conviene saberlo.

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
