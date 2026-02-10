/**
 * ============================================================================
 * SCRIPT DE DIAGNÓSTICO - MÓDULO DE PRODUCTOS
 * ============================================================================
 * Ejecuta esta función desde Google Apps Script para diagnosticar problemas
 * con la carga de productos.
 *
 * INSTRUCCIONES:
 * 1. Copiar este archivo completo a Google Apps Script
 * 2. Ejecutar la función: diagnosticarModuloProductos()
 * 3. Ver el resultado en View > Logs (Ctrl+Enter)
 */

function diagnosticarModuloProductos() {
  Logger.log('='.repeat(80));
  Logger.log('DIAGNÓSTICO DEL MÓDULO DE PRODUCTOS');
  Logger.log('='.repeat(80));
  Logger.log('');

  // TEST 1: Verificar si existe getSpreadsheet
  Logger.log('TEST 1: Verificar función getSpreadsheet()');
  try {
    if (typeof getSpreadsheet !== 'function') {
      Logger.log('❌ CRÍTICO: La función getSpreadsheet() NO EXISTE');
      Logger.log('   Solución: Copiar el archivo main.gs a Google Apps Script');
      return;
    }
    Logger.log('✅ La función getSpreadsheet() existe');
  } catch (e) {
    Logger.log('❌ ERROR: ' + e.message);
    return;
  }
  Logger.log('');

  // TEST 2: Verificar SPREADSHEET_ID
  Logger.log('TEST 2: Verificar SPREADSHEET_ID');
  try {
    const props = PropertiesService.getScriptProperties();
    const spreadsheetId = props.getProperty('SPREADSHEET_ID');

    if (!spreadsheetId) {
      Logger.log('❌ CRÍTICO: SPREADSHEET_ID no está configurado');
      Logger.log('   Solución: Ejecutar la función inicializarSistema() desde main.gs');
      Logger.log('   O establecer manualmente: File > Project properties > Script properties');
      Logger.log('   Agregar: Key=SPREADSHEET_ID, Value=TU_ID_DE_GOOGLE_SHEETS');
      return;
    }

    Logger.log('✅ SPREADSHEET_ID configurado: ' + spreadsheetId);
  } catch (e) {
    Logger.log('❌ ERROR: ' + e.message);
    return;
  }
  Logger.log('');

  // TEST 3: Verificar acceso al Spreadsheet
  Logger.log('TEST 3: Verificar acceso al Google Sheets');
  try {
    const ss = getSpreadsheet();
    if (!ss) {
      Logger.log('❌ CRÍTICO: No se pudo obtener el Spreadsheet');
      Logger.log('   Posibles causas:');
      Logger.log('   - SPREADSHEET_ID incorrecto');
      Logger.log('   - Sin permisos para acceder al archivo');
      return;
    }
    Logger.log('✅ Acceso exitoso al Spreadsheet: ' + ss.getName());
    Logger.log('   ID: ' + ss.getId());
  } catch (e) {
    Logger.log('❌ ERROR: ' + e.message);
    return;
  }
  Logger.log('');

  // TEST 4: Verificar si existe CONFIG_FACTURACION
  Logger.log('TEST 4: Verificar CONFIG_FACTURACION');
  try {
    if (typeof CONFIG_FACTURACION === 'undefined') {
      Logger.log('❌ CRÍTICO: CONFIG_FACTURACION NO EXISTE');
      Logger.log('   Solución: Copiar el archivo facturacion.gs a Google Apps Script');
      return;
    }
    Logger.log('✅ CONFIG_FACTURACION existe');
    Logger.log('   Hojas configuradas:');
    Logger.log('   - PRODUCTOS: ' + CONFIG_FACTURACION.HOJAS.PRODUCTOS);
    Logger.log('   - TRANSFERENCIAS: ' + CONFIG_FACTURACION.HOJAS.TRANSFERENCIAS);
  } catch (e) {
    Logger.log('❌ ERROR: ' + e.message);
    return;
  }
  Logger.log('');

  // TEST 5: Verificar si existe la hoja Productos
  Logger.log('TEST 5: Verificar hoja "Productos"');
  try {
    const ss = getSpreadsheet();
    const hojaProductos = ss.getSheetByName(CONFIG_FACTURACION.HOJAS.PRODUCTOS);

    if (!hojaProductos) {
      Logger.log('⚠️ ADVERTENCIA: La hoja "Productos" NO EXISTE');
      Logger.log('   La hoja se creará automáticamente al agregar el primer producto');
      Logger.log('   O puedes crearla manualmente con las siguientes columnas:');
      Logger.log('   ID | NOMBRE | PRECIO | STOCK | ACTIVO');
    } else {
      Logger.log('✅ La hoja "Productos" existe');
      const lastRow = hojaProductos.getLastRow();
      Logger.log('   Filas totales: ' + lastRow);

      if (lastRow <= 1) {
        Logger.log('   ⚠️ La hoja está vacía (solo tiene cabeceras)');
        Logger.log('   Agrega productos desde la interfaz web');
      } else {
        Logger.log('   ✅ Productos encontrados: ' + (lastRow - 1));
      }
    }
  } catch (e) {
    Logger.log('❌ ERROR: ' + e.message);
    return;
  }
  Logger.log('');

  // TEST 6: Verificar ProductosRepository
  Logger.log('TEST 6: Verificar ProductosRepository');
  try {
    if (typeof ProductosRepository === 'undefined') {
      Logger.log('❌ CRÍTICO: ProductosRepository NO EXISTE');
      Logger.log('   Solución: Copiar el archivo facturacion.gs a Google Apps Script');
      return;
    }
    Logger.log('✅ ProductosRepository existe');
  } catch (e) {
    Logger.log('❌ ERROR: ' + e.message);
    return;
  }
  Logger.log('');

  // TEST 7: Intentar obtener productos
  Logger.log('TEST 7: Intentar obtener productos con ProductosRepository.obtenerTodos()');
  try {
    const productos = ProductosRepository.obtenerTodos();
    Logger.log('✅ Función ejecutada correctamente');
    Logger.log('   Productos obtenidos: ' + productos.length);

    if (productos.length > 0) {
      Logger.log('   Primer producto:');
      Logger.log('   - ID: ' + productos[0].id);
      Logger.log('   - Nombre: ' + productos[0].nombre);
      Logger.log('   - Precio: $' + productos[0].precio);
      Logger.log('   - Stock: ' + productos[0].stock);
      Logger.log('   - Activo: ' + productos[0].activo);
    } else {
      Logger.log('   ⚠️ No hay productos en la hoja');
    }
  } catch (e) {
    Logger.log('❌ ERROR al obtener productos: ' + e.message);
    Logger.log('   Stack: ' + e.stack);
    return;
  }
  Logger.log('');

  // TEST 8: Verificar función obtenerDatosFacturacion
  Logger.log('TEST 8: Verificar obtenerDatosFacturacion()');
  try {
    if (typeof obtenerDatosFacturacion !== 'function') {
      Logger.log('❌ CRÍTICO: La función obtenerDatosFacturacion() NO EXISTE');
      Logger.log('   Solución: Copiar el archivo facturacion.gs a Google Apps Script');
      return;
    }
    Logger.log('✅ La función obtenerDatosFacturacion() existe');
  } catch (e) {
    Logger.log('❌ ERROR: ' + e.message);
    return;
  }
  Logger.log('');

  // TEST 9: Ejecutar obtenerDatosFacturacion
  Logger.log('TEST 9: Ejecutar obtenerDatosFacturacion() - PRUEBA REAL');
  try {
    const resultado = obtenerDatosFacturacion();

    if (!resultado) {
      Logger.log('❌ CRÍTICO: obtenerDatosFacturacion() devolvió NULL o UNDEFINED');
      Logger.log('   Esto es exactamente el problema que ves en el frontend');
      Logger.log('   Revisa si hay errores en la función');
      return;
    }

    Logger.log('✅ obtenerDatosFacturacion() devolvió un resultado');
    Logger.log('   Tipo de resultado: ' + typeof resultado);
    Logger.log('   Contenido:');
    Logger.log(JSON.stringify(resultado, null, 2));

    if (resultado.success) {
      Logger.log('   ✅ success: true');
      Logger.log('   📦 Productos: ' + (resultado.productos || []).length);
      Logger.log('   💳 Transferencias: ' + (resultado.transferencias || []).length);
    } else {
      Logger.log('   ❌ success: false');
      Logger.log('   Error: ' + resultado.error);
    }
  } catch (e) {
    Logger.log('❌ ERROR al ejecutar obtenerDatosFacturacion():');
    Logger.log('   Mensaje: ' + e.message);
    Logger.log('   Stack: ' + e.stack);
    return;
  }
  Logger.log('');

  Logger.log('='.repeat(80));
  Logger.log('DIAGNÓSTICO COMPLETADO');
  Logger.log('='.repeat(80));
  Logger.log('');
  Logger.log('RESUMEN:');
  Logger.log('Si todos los tests pasaron (✅), el problema está en el frontend.');
  Logger.log('Si algún test falló (❌), sigue las instrucciones de "Solución".');
  Logger.log('');
  Logger.log('PRÓXIMOS PASOS:');
  Logger.log('1. Si obtenerDatosFacturacion() devuelve NULL:');
  Logger.log('   → Faltan archivos .gs en Google Apps Script');
  Logger.log('2. Si la hoja "Productos" está vacía:');
  Logger.log('   → Agrega productos desde el botón "+ Nuevo Producto"');
  Logger.log('3. Si todo está OK pero el frontend falla:');
  Logger.log('   → Verifica que copiaste el SistemaSolVerde.html actualizado');
  Logger.log('   → Verifica que hiciste Deploy > New deployment');
  Logger.log('   → Verifica que hiciste Ctrl+Shift+R en el navegador');
}

/**
 * Función de prueba simple para verificar que el script se copió correctamente
 */
function testRapido() {
  Logger.log('✅ El script de diagnóstico se copió correctamente');
  Logger.log('Ahora ejecuta: diagnosticarModuloProductos()');
}
