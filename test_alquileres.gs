/**
 * ============================================================================
 * SCRIPT DE DIAGNÓSTICO - MÓDULO DE ALQUILERES
 * ============================================================================
 *
 * INSTRUCCIONES:
 * 1. Copiar este archivo a Google Apps Script Editor
 * 2. Ejecutar la función testModuloAlquileres()
 * 3. Ver los resultados en View > Logs
 *
 * Este script verifica que:
 * - Las configuraciones estén correctamente definidas
 * - Las hojas se creen correctamente
 * - Las funciones retornen datos válidos
 * ============================================================================
 */

function testModuloAlquileres() {
  Logger.log('========================================');
  Logger.log('DIAGNÓSTICO DEL MÓDULO DE ALQUILERES');
  Logger.log('========================================\n');

  // Test 1: Verificar configuración
  Logger.log('✓ Test 1: Verificando configuración...');
  try {
    Logger.log('  - CONFIG.HOJAS.ALQUILERES: ' + CONFIG.HOJAS.ALQUILERES);
    Logger.log('  - CONFIG.HOJAS.ALQUILERES_CONFIG: ' + CONFIG.HOJAS.ALQUILERES_CONFIG);
    Logger.log('  - CONFIG.INQUILINOS: ' + JSON.stringify(CONFIG.INQUILINOS));
    Logger.log('  - CONFIG.TIPOS_ALQUILER: ' + JSON.stringify(CONFIG.TIPOS_ALQUILER));
    Logger.log('  ✅ Configuración OK\n');
  } catch (error) {
    Logger.log('  ❌ ERROR en configuración: ' + error.message + '\n');
    return;
  }

  // Test 2: Verificar hojas
  Logger.log('✓ Test 2: Verificando hojas...');
  try {
    var ss = getSpreadsheet();
    var hojaAlquileres = ss.getSheetByName(CONFIG.HOJAS.ALQUILERES);
    var hojaConfig = ss.getSheetByName(CONFIG.HOJAS.ALQUILERES_CONFIG);

    if (!hojaAlquileres) {
      Logger.log('  ⚠️  Hoja ALQUILERES no existe, se creará automáticamente');
    } else {
      Logger.log('  - Hoja ALQUILERES existe ✓');
      Logger.log('    Filas: ' + hojaAlquileres.getLastRow());
    }

    if (!hojaConfig) {
      Logger.log('  ⚠️  Hoja ALQUILERES_CONFIG no existe, se creará automáticamente');
    } else {
      Logger.log('  - Hoja ALQUILERES_CONFIG existe ✓');
      Logger.log('    Filas: ' + hojaConfig.getLastRow());
    }

    Logger.log('  ✅ Hojas OK\n');
  } catch (error) {
    Logger.log('  ❌ ERROR con hojas: ' + error.message + '\n');
  }

  // Test 3: Verificar AlquileresRepository
  Logger.log('✓ Test 3: Verificando AlquileresRepository...');
  try {
    if (typeof AlquileresRepository === 'undefined') {
      Logger.log('  ❌ AlquileresRepository no está definido');
      Logger.log('  → Asegúrate de que alquileres.gs esté en el proyecto\n');
      return;
    }
    Logger.log('  - AlquileresRepository definido ✓');
    Logger.log('  ✅ Repository OK\n');
  } catch (error) {
    Logger.log('  ❌ ERROR: ' + error.message + '\n');
    return;
  }

  // Test 4: Verificar obtenerTodosInquilinos
  Logger.log('✓ Test 4: Verificando obtenerTodosInquilinos()...');
  try {
    var inquilinos = AlquileresRepository.obtenerTodosInquilinos();
    Logger.log('  - Tipo de retorno: ' + (Array.isArray(inquilinos) ? 'Array ✓' : typeof inquilinos + ' ❌'));
    Logger.log('  - Cantidad de inquilinos: ' + inquilinos.length);

    if (inquilinos.length === 0) {
      Logger.log('  ⚠️  No hay inquilinos. Las hojas se inicializarán con datos por defecto.');
    } else {
      for (var i = 0; i < inquilinos.length; i++) {
        Logger.log('  - Inquilino ' + (i+1) + ': ' + inquilinos[i].inquilino);
        Logger.log('    Monto semanal: ' + inquilinos[i].montoSemanal);
        Logger.log('    Monto efectivo: ' + inquilinos[i].montoEfectivo);
        Logger.log('    Saldo: ' + inquilinos[i].saldo);
      }
    }
    Logger.log('  ✅ obtenerTodosInquilinos() OK\n');
  } catch (error) {
    Logger.log('  ❌ ERROR en obtenerTodosInquilinos: ' + error.message + '\n');
  }

  // Test 5: Verificar obtenerDatosAlquileres (API pública)
  Logger.log('✓ Test 5: Verificando obtenerDatosAlquileres()...');
  try {
    var result = obtenerDatosAlquileres();
    Logger.log('  - result.success: ' + result.success);

    if (!result.success) {
      Logger.log('  ❌ ERROR: ' + result.error);
      return;
    }

    Logger.log('  - result.inquilinos tipo: ' + (Array.isArray(result.inquilinos) ? 'Array ✓' : typeof result.inquilinos + ' ❌'));
    Logger.log('  - result.inquilinos length: ' + (result.inquilinos ? result.inquilinos.length : 'undefined'));
    Logger.log('  - result.movimientosRecientes tipo: ' + (Array.isArray(result.movimientosRecientes) ? 'Array ✓' : typeof result.movimientosRecientes));

    if (result.inquilinos && result.inquilinos.length > 0) {
      Logger.log('  - Primer inquilino: ' + JSON.stringify(result.inquilinos[0]));
    }

    Logger.log('  ✅ obtenerDatosAlquileres() OK\n');
  } catch (error) {
    Logger.log('  ❌ ERROR en obtenerDatosAlquileres: ' + error.message);
    Logger.log('  Stack: ' + error.stack + '\n');
  }

  // Test 6: Verificar serializarParaWeb
  Logger.log('✓ Test 6: Verificando serializarParaWeb()...');
  try {
    if (typeof serializarParaWeb === 'undefined') {
      Logger.log('  ❌ serializarParaWeb no está definido');
      Logger.log('  → Asegúrate de que utils.gs esté en el proyecto\n');
      return;
    }

    var testArray = [{nombre: 'Test', fecha: new Date()}];
    var resultado = serializarParaWeb(testArray);
    Logger.log('  - Tipo de entrada: Array');
    Logger.log('  - Tipo de salida: ' + (Array.isArray(resultado) ? 'Array ✓' : typeof resultado + ' ❌'));
    Logger.log('  ✅ serializarParaWeb() OK\n');
  } catch (error) {
    Logger.log('  ❌ ERROR en serializarParaWeb: ' + error.message + '\n');
  }

  // Resumen final
  Logger.log('========================================');
  Logger.log('DIAGNÓSTICO COMPLETADO');
  Logger.log('========================================');
  Logger.log('');
  Logger.log('Si todos los tests pasaron ✅, el módulo debería funcionar correctamente.');
  Logger.log('');
  Logger.log('PASOS SIGUIENTES:');
  Logger.log('1. Si hay errores ❌, revisar los mensajes arriba');
  Logger.log('2. Asegurarse de que todos los archivos .gs estén en Google Apps Script');
  Logger.log('3. Después de corregir, volver a ejecutar este test');
  Logger.log('4. Una vez que todos los tests pasen, desplegar la aplicación web');
  Logger.log('========================================');
}

/**
 * Test rápido para verificar solo la API
 */
function testAPIRapido() {
  Logger.log('Test rápido de API...');
  try {
    var result = obtenerDatosAlquileres();
    Logger.log('Success: ' + result.success);
    if (result.success) {
      Logger.log('Inquilinos: ' + JSON.stringify(result.inquilinos, null, 2));
    } else {
      Logger.log('Error: ' + result.error);
    }
  } catch (error) {
    Logger.log('EXCEPTION: ' + error.message);
    Logger.log('Stack: ' + error.stack);
  }
}
