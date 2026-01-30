// Script de diagnóstico completo para el Sistema Sol & Verde
// Ejecuta todas las pruebas y valida que el sistema funciona correctamente

function ejecutarDiagnosticoCompleto() {
  console.log('🔍 INICIANDO DIAGNÓSTICO COMPLETO DEL SISTEMA SOL & VERDE');
  console.log('======================================================');

  const resultados = {
    pruebas: [],
    total: 0,
    exitosas: 0,
    fallidas: 0
  };

  // Prueba 1: Verificar que las funciones principales existen
  resultados.pruebas.push(ejecutarPrueba('Funciones principales existen', () => {
    if (typeof descomprimirRespuesta !== 'function') throw new Error('descomprimirRespuesta no existe');
    if (typeof restaurarFechas !== 'function') throw new Error('restaurarFechas no existe');
    if (typeof showToast !== 'function') throw new Error('showToast no existe');
    return true;
  }));

  // Prueba 2: Verificar descompresión de JSON sin comprimir
  resultados.pruebas.push(ejecutarPrueba('Descompresión JSON sin comprimir', () => {
    const testData = '{"success":true,"clientes":[],"movimientos":[]}';
    const result = descomprimirRespuesta(testData);
    if (!result.success) throw new Error('No se descomprimió correctamente');
    if (!Array.isArray(result.clientes)) throw new Error('Clientes no es array');
    return true;
  }));

  // Prueba 3: Verificar manejo de datos inválidos
  resultados.pruebas.push(ejecutarPrueba('Manejo de datos inválidos', () => {
    const invalidData = 'esto no es json ni base64 válido';
    const result = descomprimirRespuesta(invalidData);
    // Debería retornar los datos tal cual como fallback
    if (result !== invalidData) throw new Error('No manejó datos inválidos correctamente');
    return true;
  }));

  // Prueba 4: Verificar restauración de fechas
  resultados.pruebas.push(ejecutarPrueba('Restauración de fechas', () => {
    const testObj = {
      fecha: {_date: '2024-01-01T00:00:00.000Z'},
      nested: {
        otraFecha: {_date: '2024-01-02T00:00:00.000Z'}
      }
    };
    restaurarFechas(testObj);
    if (!(testObj.fecha instanceof Date)) throw new Error('Fecha no restaurada');
    if (!(testObj.nested.otraFecha instanceof Date)) throw new Error('Fecha anidada no restaurada');
    return true;
  }));

  // Prueba 5: Verificar que el botón de prueba existe
  resultados.pruebas.push(ejecutarPrueba('Botón de prueba del sistema', () => {
    const button = document.querySelector('button[onclick*="probarSistemaOptimizado"]');
    if (!button) throw new Error('Botón de prueba no encontrado');
    return true;
  }));

  // Prueba 6: Verificar configuración de Google Apps Script
  resultados.pruebas.push(ejecutarPrueba('Configuración Google Apps Script', () => {
    if (typeof google === 'undefined') throw new Error('Google Apps Script no disponible');
    if (typeof google.script === 'undefined') throw new Error('google.script no disponible');
    if (typeof google.script.run === 'undefined') throw new Error('google.script.run no disponible');
    return true;
  }));

  // Calcular estadísticas
  resultados.total = resultados.pruebas.length;
  resultados.exitosas = resultados.pruebas.filter(p => p.exito).length;
  resultados.fallidas = resultados.total - resultados.exitosas;

  // Mostrar resultados
  console.log('======================================================');
  console.log(`📊 RESULTADOS DEL DIAGNÓSTICO: ${resultados.exitosas}/${resultados.total} pruebas exitosas`);

  if (resultados.fallidas > 0) {
    console.log('❌ PRUEBAS FALLIDAS:');
    resultados.pruebas.filter(p => !p.exito).forEach(prueba => {
      console.log(`   - ${prueba.nombre}: ${prueba.error}`);
    });
  } else {
    console.log('✅ TODAS LAS PRUEBAS PASARON - SISTEMA LISTO');
  }

  // Mostrar notificación al usuario
  if (resultados.exitosas === resultados.total) {
    showToast('success', 'Diagnóstico Completado', `Sistema funcionando correctamente (${resultados.exitosas}/${resultados.total} pruebas)`);
  } else {
    showToast('error', 'Diagnóstico con Errores', `${resultados.fallidas} pruebas fallidas de ${resultados.total}`);
  }

  return resultados;
}

function ejecutarPrueba(nombre, funcionPrueba) {
  try {
    console.log(`🔍 Ejecutando: ${nombre}`);
    const resultado = funcionPrueba();
    if (resultado === true || resultado === undefined) {
      console.log(`✅ ${nombre}: EXITOSA`);
      return { nombre, exito: true };
    } else {
      console.log(`❌ ${nombre}: FALLIDA - ${resultado}`);
      return { nombre, exito: false, error: resultado };
    }
  } catch (error) {
    console.log(`❌ ${nombre}: ERROR - ${error.message}`);
    return { nombre, exito: false, error: error.message };
  }
}

// Ejecutar diagnóstico automáticamente cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Sistema Sol & Verde V18.0 - Iniciando diagnóstico automático...');

  // Pequeño delay para asegurar que todo esté cargado
  setTimeout(() => {
    ejecutarDiagnosticoCompleto();
  }, 1000);
});

// También exponer la función globalmente para poder ejecutarla manualmente
window.ejecutarDiagnosticoCompleto = ejecutarDiagnosticoCompleto;