/**
 * ============================================================================
 * SISTEMA DE PRUEBAS - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: test.js
 * Descripción: Funciones de prueba para validar el sistema
 *
 * ============================================================================
 */

/**
 * Ejecuta todas las pruebas del sistema
 * @returns {Object} Resultado de las pruebas
 */
function ejecutarPruebasSistema() {
  const resultados = {
    total: 0,
    exitosas: 0,
    fallidas: 0,
    pruebas: []
  };

  Logger.log('🧪 INICIANDO SUITE DE PRUEBAS DEL SISTEMA');
  Logger.log('========================================');

  // Prueba 1: Verificar configuración
  resultados.pruebas.push(ejecutarPrueba('Configuración global', probarConfiguracion));
  resultados.total++;

  // Prueba 2: Verificar spreadsheet
  resultados.pruebas.push(ejecutarPrueba('Acceso a spreadsheet', probarSpreadsheet));
  resultados.total++;

  // Prueba 3: Verificar repositorios
  resultados.pruebas.push(ejecutarPrueba('ClientesRepository', probarClientesRepository));
  resultados.total++;

  resultados.pruebas.push(ejecutarPrueba('MovimientosRepository', probarMovimientosRepository));
  resultados.total++;

  // Prueba 4: Verificar funciones de utilidad
  resultados.pruebas.push(ejecutarPrueba('Utilidades', probarUtilidades));
  resultados.total++;

  // Prueba 5: Verificar API principal
  resultados.pruebas.push(ejecutarPrueba('API obtenerDatosParaHTML', probarObtenerDatosParaHTML));
  resultados.total++;

  // Calcular estadísticas
  resultados.exitosas = resultados.pruebas.filter(p => p.exito).length;
  resultados.fallidas = resultados.total - resultados.exitosas;

  Logger.log('========================================');
  Logger.log(`📊 RESULTADO FINAL: ${resultados.exitosas}/${resultados.total} pruebas exitosas`);

  if (resultados.fallidas > 0) {
    Logger.log('❌ PRUEBAS FALLIDAS:');
    resultados.pruebas.filter(p => !p.exito).forEach(prueba => {
      Logger.log(`   - ${prueba.nombre}: ${prueba.error}`);
    });
  }

  return resultados;
}

/**
 * Ejecuta una prueba individual
 * @param {string} nombre - Nombre de la prueba
 * @param {Function} funcionPrueba - Función que ejecuta la prueba
 * @returns {Object} Resultado de la prueba
 */
function ejecutarPrueba(nombre, funcionPrueba) {
  try {
    Logger.log(`🔍 Ejecutando prueba: ${nombre}`);
    const resultado = funcionPrueba();

    if (resultado === true || resultado === undefined) {
      Logger.log(`✅ ${nombre}: EXITOSA`);
      return { nombre, exito: true };
    } else {
      Logger.log(`❌ ${nombre}: FALLIDA - ${resultado}`);
      return { nombre, exito: false, error: resultado };
    }
  } catch (error) {
    Logger.log(`❌ ${nombre}: ERROR - ${error.message}`);
    return { nombre, exito: false, error: error.message };
  }
}

/**
 * Prueba la configuración global
 */
function probarConfiguracion() {
  if (!CONFIG) throw new Error('CONFIG no está definido');
  if (!CONFIG.HOJAS) throw new Error('CONFIG.HOJAS no está definido');
  if (!CONFIG.TIPOS_MOVIMIENTO) throw new Error('CONFIG.TIPOS_MOVIMIENTO no está definido');
  return true;
}

/**
 * Prueba el acceso al spreadsheet
 */
function probarSpreadsheet() {
  const ss = getSpreadsheet();
  if (!ss) throw new Error('No se pudo obtener el spreadsheet');
  if (!ss.getName()) throw new Error('El spreadsheet no tiene nombre');
  return true;
}

/**
 * Prueba ClientesRepository
 */
function probarClientesRepository() {
  if (!ClientesRepository) throw new Error('ClientesRepository no está definido');

  // Probar getHoja
  const hoja = ClientesRepository.getHoja();
  if (!hoja) throw new Error('No se pudo obtener la hoja de clientes');

  // Probar obtenerTodos
  const clientes = ClientesRepository.obtenerTodos();
  if (!Array.isArray(clientes)) throw new Error('obtenerTodos no retorna array');

  return true;
}

/**
 * Prueba MovimientosRepository
 */
function probarMovimientosRepository() {
  if (!MovimientosRepository) throw new Error('MovimientosRepository no está definido');

  // Probar getHoja
  const hoja = MovimientosRepository.getHoja();
  if (!hoja) throw new Error('No se pudo obtener la hoja de movimientos');

  // Probar obtenerRecientes
  const movimientos = MovimientosRepository.obtenerRecientes(5);
  if (!Array.isArray(movimientos)) throw new Error('obtenerRecientes no retorna array');

  return true;
}

/**
 * Prueba funciones de utilidad
 */
function probarUtilidades() {
  // Probar normalizarString
  const normalized = normalizarString('  HOLA  mundo  ');
  if (normalized !== 'HOLA MUNDO') throw new Error('normalizarString no funciona correctamente');

  // Probar estipoMovimientoValido
  if (!estipoMovimientoValido('DEBE')) throw new Error('estipoMovimientoValido falla con DEBE');
  if (!estipoMovimientoValido('HABER')) throw new Error('estipoMovimientoValido falla con HABER');
  if (estipoMovimientoValido('INVALIDO')) throw new Error('estipoMovimientoValido acepta tipo inválido');

  // Probar esMontoValido
  if (!esMontoValido(100)) throw new Error('esMontoValido falla con monto válido');
  if (esMontoValido(-100)) throw new Error('esMontoValido acepta monto negativo');
  if (esMontoValido(0)) throw new Error('esMontoValido acepta cero');

  return true;
}

/**
 * Prueba la función principal obtenerDatosParaHTML
 */
function probarObtenerDatosParaHTML() {
  const resultado = obtenerDatosParaHTML();

  if (!resultado) throw new Error('obtenerDatosParaHTML retorna null/undefined');
  if (typeof resultado !== 'object') throw new Error('obtenerDatosParaHTML no retorna objeto');

  if (resultado.success !== true && resultado.success !== false) {
    throw new Error('obtenerDatosParaHTML no tiene propiedad success válida');
  }

  if (!Array.isArray(resultado.clientes)) throw new Error('clientes no es array');
  if (!Array.isArray(resultado.movimientos)) throw new Error('movimientos no es array');

  return true;
}

/**
 * Prueba de carga de datos reales
 */
function probarCargaDatosReales() {
  Logger.log('🔍 Probando carga de datos reales...');

  try {
    // Probar obtener clientes
    const clientes = ClientesRepository.obtenerTodos();
    Logger.log(`📊 Clientes encontrados: ${clientes.length}`);

    // Probar obtener movimientos
    const movimientos = MovimientosRepository.obtenerRecientes(10);
    Logger.log(`📊 Movimientos encontrados: ${movimientos.length}`);

    // Probar obtener datos para HTML
    const datosHTML = obtenerDatosParaHTML();
    Logger.log(`📊 Datos para HTML - Success: ${datosHTML.success}`);
    Logger.log(`📊 Datos para HTML - Clientes: ${datosHTML.clientes.length}`);
    Logger.log(`📊 Datos para HTML - Movimientos: ${datosHTML.movimientos.length}`);

    return {
      clientesCount: clientes.length,
      movimientosCount: movimientos.length,
      datosHTMLSuccess: datosHTML.success
    };

  } catch (error) {
    Logger.log(`❌ Error en carga de datos: ${error.message}`);
    throw error;
  }
}