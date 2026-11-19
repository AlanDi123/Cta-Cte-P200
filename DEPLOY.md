# Actualización automática del sistema

Dos capas independientes. La primera no necesita ninguna configuración; la segunda son **diez minutos, una sola vez, y nunca más**.

| | Qué actualiza | Qué hay que configurar |
|---|---|---|
| **Capa 1** | La interfaz — `SistemaSolVerde.html`, 13.800 líneas | Un clic en Configuración |
| **Capa 2** | El backend — los 16 archivos `.gs` | Tres secretos en GitHub, una vez |

---

## Capa 1 — La interfaz, sin configurar nada

### Qué hace

Con esto activado, el sistema **descarga la interfaz de la rama `main` en GitHub** en cada carga, en lugar de usar el archivo del proyecto de Apps Script. Usted hace push y el cambio ya está: no hay que desplegar.

Cubre `SistemaSolVerde.html`, que es la mayor parte del sistema y la totalidad de lo que usted ve en pantalla.

### Cómo se activa

**Configuración → Claves y Tokens → 🔄 Actualización automática de la interfaz → Activar.**

Antes de activarse hace una descarga de prueba. Si falla, **no queda activado** y le dice por qué: es preferible enterarse al configurar que descubrirlo con el sistema sirviendo una interfaz vieja.

### Lo que conviene saber

**No es instantáneo.** GitHub sirve los archivos detrás de una red de distribución con unos **5 minutos** de caché propia. El cambio aparece dentro de ese margen, no en el segundo exacto del push.

**No se puede caer.** Hay tres resguardos, en este orden:

1. Si la descarga falla o devuelve algo que no parece la interfaz → se sirve la **copia en caché**.
2. Si tampoco hay copia → se sirve el **archivo del proyecto**.
3. Cualquier excepción → también el archivo del proyecto.

La validación no es solo "¿respondió GitHub?": se comprueba que el contenido supere un tamaño mínimo y contenga una marca estructural conocida. Así, un push a medias o una página de error de GitHub **no** reemplazan la interfaz.

**El repositorio tiene que ser público** para que `raw.githubusercontent.com` responda sin credenciales. Si es privado, esta capa no funciona y hay que usar solo la Capa 2.

**No cubre el backend.** Los archivos `.gs` siguen necesitando despliegue. Para eso está la Capa 2.

### Cómo se desactiva

El mismo lugar, botón **Desactivar**. Vuelve a servir el archivo del proyecto de inmediato.

---

## Capa 2 — El backend, automático tras una configuración única

Cada push a `main` sube el código a Apps Script y actualiza el despliegue existente. **La URL `/exec` no cambia nunca**, así que nadie tiene que tocar su acceso directo.

### Antes de empezar

Necesita, en su computadora:

- **Node.js** instalado (https://nodejs.org).
- Ser **dueño o editor** del proyecto de Apps Script.

### Paso 1 · Habilitar la API de Apps Script

Entre a **https://script.google.com/home/usersettings** y active **Google Apps Script API**.

Sin esto, `clasp` no puede subir nada y el error que da no es evidente.

### Paso 2 · Instalar clasp e iniciar sesión

En una terminal de su computadora:

```bash
npm install -g @google/clasp@2.4.2
clasp login
```

Se abre el navegador y le pide autorizar. Use **la misma cuenta de Google** que es dueña del proyecto de Apps Script.

Eso deja un archivo de credenciales en su carpeta personal:

- **Windows:** `C:\Users\SU_USUARIO\.clasprc.json`
- **Mac o Linux:** `~/.clasprc.json`

### Paso 3 · Obtener los tres datos

**`SCRIPT_ID`** — Abra el proyecto en https://script.google.com y mire la URL:

```
https://script.google.com/home/projects/AQUI_ESTA_EL_SCRIPT_ID/edit
```

También está en **Configuración del proyecto → ID de la secuencia de comandos**.

**`DEPLOYMENT_ID`** — En el editor de Apps Script: **Implementar → Administrar implementaciones**. Elija la implementación de tipo *Aplicación web* que ya está en uso y copie su **ID de implementación**.

> Este es el dato que mantiene la URL estable. Si lo omite, el workflow sube el código pero **no lo publica**, y se lo avisa en el registro de la Action.

**`CLASPRC_JSON`** — El contenido **completo** del archivo del paso 2. Ábralo con el Bloc de notas y copie todo, incluidas las llaves `{ }`.

### Paso 4 · Cargar los secretos en GitHub

Vaya a **https://github.com/AlanDi123/Cta-Cte-P200/settings/secrets/actions** y cree tres secretos con **New repository secret**:

| Nombre | Contenido |
|---|---|
| `SCRIPT_ID` | El ID del proyecto |
| `DEPLOYMENT_ID` | El ID de la implementación web |
| `CLASPRC_JSON` | Todo el contenido de `.clasprc.json` |

Los nombres tienen que escribirse **exactamente así**, en mayúsculas.

### Paso 5 · Probarlo

En **Actions → Desplegar a Apps Script → Run workflow**. Si sale verde, listo: desde ahora cada push a `main` despliega solo.

---

## Subida manual (cuando Actions no está disponible)

La Capa 2 depende de GitHub Actions. Si no se puede usar (por ejemplo, por haber agotado
la cuota del mes), el código se sube a mano. **Es seguro**, pero tiene una trampa que ya
causó errores: los archivos **nuevos** no reemplazan a ninguno, hay que *crearlos*.

### Los archivos del proyecto

Son **17 archivos `.gs`** más `SistemaSolVerde.html` y `appsscript.json`:

`afipModule` · `alquileres` · `auditoria` · `backups` · `caja` · `clientes` · `config` ·
`contabilidad` · `facturacion` · `facturacionElectronica` · `main` · `modulos_logisticos` ·
`movimientos` · **`nombres_es`** · **`ocr`** · `test_alquileres` · `utils`

Los dos en negrita son **nuevos** y hay que crearlos con **+ → Script**, con *exactamente*
ese nombre (sin `.gs`; el editor lo agrega) y pegar el contenido completo.

### Archivos que ya no existen

- **`claude`** (era `claude.gs`): **hay que borrarlo.** Si queda junto a `ocr`, `ImageCache`
  queda declarado dos veces y Apps Script descarta `ocr` entero: el síntoma es
  `OcrService is not defined`.

### Orden y comprobación

1. Subir **todos** los `.gs` y el `SistemaSolVerde.html` **juntos**. La interfaz nueva con
   un servidor viejo (o al revés) deja partes de la pantalla sin funcionar.
2. **Implementar → Administrar implementaciones → editar → Versión nueva → Implementar.**
   Guardar los archivos no basta: el Web App sirve la última *versión desplegada*.
3. Recargar el sistema con **Ctrl+F5**.
4. Abrir **Configuración → OCR de imágenes** y usar el botón de prueba. Si falta un archivo,
   el mensaje dice *cuál* es.

> `nombres_es.gs` tiene una copia idéntica dentro de `SistemaSolVerde.html`. Si se edita
> una, hay que editar la otra: el servidor y el navegador tienen que decidir igual.

---

## Qué hace el workflow, en orden

1. **Verifica la sintaxis de los 16 archivos `.gs`.**
2. **Verifica el JavaScript embebido en el HTML** (unas 13.800 líneas).
3. **Busca credenciales filtradas** en el código.
4. Sube el código con `clasp push --force`.
5. Actualiza **el mismo despliegue** con `clasp deploy -i`, para que la URL no cambie.
6. Borra las credenciales del runner, incluso si algo falló antes.

**Si cualquiera de las tres verificaciones falla, no se despliega.** Es un sistema contable en producción: subir código roto es mucho peor que no subir nada.

---

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `User has not enabled the Apps Script API` | Falta el paso 1. |
| `401 Unauthorized` o `invalid_grant` | El token caducó o se revocó. Corra `clasp login` otra vez y actualice el secreto `CLASPRC_JSON`. |
| Sube pero la URL sigue vieja | Falta `DEPLOYMENT_ID`, o apunta a una implementación que no es la que usa. Revise **Administrar implementaciones**. |
| `Falta el secreto ...` | El nombre del secreto está mal escrito. Tienen que ser `SCRIPT_ID`, `DEPLOYMENT_ID` y `CLASPRC_JSON`, en mayúsculas. |
| La Action no arranca con el push | Las Actions están desactivadas en el repositorio: **Settings → Actions → General → Allow all actions**. |
| `Syntax error` en la verificación | El código no compila. El registro dice qué archivo y qué línea. Se corrige y se vuelve a pushear. |

---

## Sobre la seguridad del token

`CLASPRC_JSON` contiene un token que **da acceso a sus proyectos de Apps Script**. Google lo advierte expresamente.

- Un secreto de GitHub no se puede volver a leer una vez guardado, y no aparece en los registros.
- El workflow lo borra del runner al terminar, incluso si falló.
- Para revocarlo: **https://myaccount.google.com/permissions** y quite el acceso de *Google Apps Script API*. Después vuelva a correr `clasp login` y actualice el secreto.
- Conviene rotarlo cada tanto.

---

## Fuentes

- [clasp — documentación oficial de Google](https://developers.google.com/apps-script/guides/clasp)
- [CI/CD con clasp y GitHub Actions](https://www.8apps.co/blog/shipping-google-workspace-addon-clasp-github-actions)
