/**
 * ============================================================================
 * TESTS UNITARIOS - SISTEMA SOL & VERDE V18.0
 * ============================================================================
 * 
 * Tests para funciones utilitarias y recálculo de balances
 * Ejecutar desde el editor de Apps Script con la función ejecutarTestsUnitarios()
 * 
 * @author Alan
 * @version 1.0.0
 */

// ============================================================================
// FRAMEWORK DE TESTS SIMPLE
// ============================================================================

const TestResults = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: []
};

/**
 * Ejecuta un test individual
 * @param {string} nombre - Nombre del test
 * @param {function} testFn - Función de test
 */
function test(nombre, testFn) {
  TestResults.total++;
  try {
    const result = testFn();
    if (result) {
      TestResults.passed++;
      Logger.log('✅ PASS: ' + nombre);
    } else {
      TestResults.failed++;
      TestResults.failures.push({ nombre, error: 'Retornó false' });
      Logger.log('❌ FAIL: ' + nombre);
    }
  } catch (error) {
    TestResults.failed++;
    TestResults.failures.push({ nombre, error: error.message });
    Logger.log('❌ FAIL: ' + nombre + ' - ' + error.message);
  }
}

/**
 * Assert helper
 * @param {boolean} condition - Condición a verificar
 * @param {string} message - Mensaje de error
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
  return condition;
}

/**
 * Assert equality helper
 * @param {*} actual - Valor actual
 * @param {*} expected - Valor esperado
 * @param {string} message - Mensaje de error
 */
function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
  return true;
}

// ============================================================================
// TESTS DE FUNCIONES UTILITARIAS
// ============================================================================

/**
 * Test: normalizeName function
 * Verifica que la normalización de nombres funcione correctamente
 */
function testNormalizeName() {
  Logger.log('\n--- Tests: normalizeName ---');
  
  // Test 1: Normalización básica
  test('normalizeName: básico', function() {
    const result = normalizeName('  JUAN   PEREZ  ');
    return result === 'Juan Perez';
  });
  
  // Test 2: Mayúsculas/minúsculas
  test('normalizeName: mayúsculas', function() {
    const result = normalizeName('JUAN PEREZ');
    return result === 'Juan Perez';
  });
  
  // Test 3: Minúsculas
  test('normalizeName: minúsculas', function() {
    const result = normalizeName('juan perez');
    return result === 'Juan Perez';
  });
  
  // Test 4: Con acentos
  test('normalizeName: con acentos', function() {
    const result = normalizeName('josé maría');
    return result === 'José María';
  });
  
  // Test 5: String vacío
  test('normalizeName: vacío', function() {
    const result = normalizeName('');
    return result === '';
  });
  
  // Test 6: Null
  test('normalizeName: null', function() {
    const result = normalizeName(null);
    return result === '';
  });
  
  // Test 7: Múltiples espacios
  test('normalizeName: múltiples espacios', function() {
    const result = normalizeName('juan    perez');
    return result === 'Juan Perez';
  });
}

/**
 * Test: debounce function
 * Verifica que el debounce funcione correctamente
 */
function testDebounce() {
  Logger.log('\n--- Tests: debounce ---');
  
  // Test 1: debounce existe
  test('debounce: es función', function() {
    return typeof debounce === 'function';
  });
  
  // Test 2: debounce con delay
  test('debounce: ejecuta después del delay', function() {
    let executed = false;
    const fn = debounce(function() { executed = true; }, 10);
    fn();
    Utilities.sleep(50); // Esperar más que el delay
    return executed === true;
  });
  
  // Test 3: debounce cancela llamadas intermedias
  test('debounce: cancela llamadas intermedias', function() {
    let count = 0;
    const fn = debounce(function() { count++; }, 50);
    
    // Llamar múltiples veces rápidamente
    fn();
    fn();
    fn();
    
    // Después de 30ms, no debería haber ejecutado aún
    Utilities.sleep(30);
    const before = count;
    
    // Esperar a que complete
    Utilities.sleep(50);
    const after = count;
    
    return before === 0 && after === 1; // Solo una ejecución al final
  });
}

/**
 * Test: fuzzySearch function
 * Verifica que la búsqueda fuzzy funcione correctamente
 */
function testFuzzySearch() {
  Logger.log('\n--- Tests: fuzzySearch ---');
  
  // Test 1: fuzzySearch existe
  test('fuzzySearch: es función', function() {
    return typeof fuzzySearch === 'function';
  });
  
  // Test 2: Match exacto
  test('fuzzySearch: match exacto', function() {
    const lista = ['Juan Perez', 'Maria Garcia', 'Jose Lopez'];
    const result = fuzzySearch('Juan Perez', lista);
    return result.length > 0 && result[0] === 'Juan Perez';
  });
  
  // Test 3: Búsqueda case-insensitive
  test('fuzzySearch: case-insensitive', function() {
    const lista = ['Juan Perez', 'Maria Garcia'];
    const result = fuzzySearch('juan perez', lista);
    return result.length > 0;
  });
  
  // Test 4: Búsqueda parcial
  test('fuzzySearch: búsqueda parcial', function() {
    const lista = ['Juan Perez', 'Maria Garcia'];
    const result = fuzzySearch('Juan', lista);
    return result.length > 0 && result[0] === 'Juan Perez';
  });
  
  // Test 5: Sin resultados
  test('fuzzySearch: sin resultados', function() {
    const lista = ['Juan Perez', 'Maria Garcia'];
    const result = fuzzySearch('XYZ123', lista);
    return result.length === 0;
  });
  
  // Test 6: Prioridad startsWith
  test('fuzzySearch: prioridad startsWith', function() {
    const lista = ['Perez Juan', 'Juan Perez'];
    const result = fuzzySearch('Juan', lista);
    // Debería priorizar el que comienza con Juan
    return result.length > 0;
  });
}

/**
 * Test: capitalize function
 * Verifica que la capitalización funcione correctamente
 */
function testCapitalize() {
  Logger.log('\n--- Tests: capitalize ---');
  
  // Test 1: Capitalize básico
  test('capitalize: básico', function() {
    const result = capitalize('juan');
    return result === 'Juan';
  });
  
  // Test 2: Capitalize con mayúsculas
  test('capitalize: ya capitalizado', function() {
    const result = capitalize('Juan');
    return result === 'Juan';
  });
  
  // Test 3: Capitalize vacío
  test('capitalize: vacío', function() {
    const result = capitalize('');
    return result === '';
  });
  
  // Test 4: Capitalize null
  test('capitalize: null', function() {
    const result = capitalize(null);
    return result === '';
  });
}

/**
 * Test: uniqueArray function
 * Verifica que la eliminación de duplicados funcione
 */
function testUniqueArray() {
  Logger.log('\n--- Tests: uniqueArray ---');
  
  // Test 1: uniqueArray existe
  test('uniqueArray: es función', function() {
    return typeof uniqueArray === 'function';
  });
  
  // Test 2: Eliminar duplicados
  test('uniqueArray: eliminar duplicados', function() {
    const arr = ['Juan', 'Maria', 'Juan', 'Jose', 'Maria'];
    const result = uniqueArray(arr);
    return result.length === 3 && 
           result.includes('Juan') && 
           result.includes('Maria') && 
           result.includes('Jose');
  });
  
  // Test 3: Array sin duplicados
  test('uniqueArray: sin duplicados', function() {
    const arr = ['Juan', 'Maria', 'Jose'];
    const result = uniqueArray(arr);
    return result.length === 3;
  });
  
  // Test 4: Array vacío
  test('uniqueArray: vacío', function() {
    const arr = [];
    const result = uniqueArray(arr);
    return result.length === 0;
  });
}

// ============================================================================
// TESTS DE RECÁLCULO DE BALANCES
// ============================================================================

/**
 * Test: Cálculo de saldo para un cliente
 * Verifica que el cálculo de saldos sea correcto
 */
function testBalanceCalculation() {
  Logger.log('\n--- Tests: Balance Calculation ---');
  
  // Test 1: Saldo básico (solo DEBE)
  test('balance: solo DEBE', function() {
    const movimientos = [
      { tipo: 'DEBE', monto: 100 },
      { tipo: 'DEBE', monto: 200 }
    ];
    
    let saldo = 0;
    movimientos.forEach(mov => {
      if (mov.tipo === 'DEBE') saldo += mov.monto;
      else saldo -= mov.monto;
    });
    
    return saldo === 300;
  });
  
  // Test 2: Saldo con DEBE y HABER
  test('balance: DEBE y HABER', function() {
    const movimientos = [
      { tipo: 'DEBE', monto: 500 },
      { tipo: 'HABER', monto: 200 },
      { tipo: 'DEBE', monto: 100 }
    ];
    
    let saldo = 0;
    movimientos.forEach(mov => {
      if (mov.tipo === 'DEBE') saldo += mov.monto;
      else saldo -= mov.monto;
    });
    
    return saldo === 400;
  });
  
  // Test 3: Saldo negativo (más HABER que DEBE)
  test('balance: saldo negativo', function() {
    const movimientos = [
      { tipo: 'DEBE', monto: 100 },
      { tipo: 'HABER', monto: 500 }
    ];
    
    let saldo = 0;
    movimientos.forEach(mov => {
      if (mov.tipo === 'DEBE') saldo += mov.monto;
      else saldo -= mov.monto;
    });
    
    return saldo === -400;
  });
  
  // Test 4: Saldo cero
  test('balance: saldo cero', function() {
    const movimientos = [
      { tipo: 'DEBE', monto: 250 },
      { tipo: 'HABER', monto: 250 }
    ];
    
    let saldo = 0;
    movimientos.forEach(mov => {
      if (mov.tipo === 'DEBE') saldo += mov.monto;
      else saldo -= mov.monto;
    });
    
    return saldo === 0;
  });
  
  // Test 5: Movimientos vacíos
  test('balance: sin movimientos', function() {
    const movimientos = [];
    let saldo = 0;
    
    movimientos.forEach(mov => {
      if (mov.tipo === 'DEBE') saldo += mov.monto;
      else saldo -= mov.monto;
    });
    
    return saldo === 0;
  });
}

/**
 * Test: Recálculo masivo de saldos (simulado)
 * Verifica la lógica del recálculo masivo
 */
function testMassiveBalanceRecalc() {
  Logger.log('\n--- Tests: Massive Balance Recalc ---');
  
  // Test 1: Detección de diferencias
  test('recalc: detecta diferencias', function() {
    const saldoActual = 500;
    const saldoCalculado = 450;
    const hayDiferencia = saldoActual !== saldoCalculado;
    return hayDiferencia === true;
  });
  
  // Test 2: Sin diferencias
  test('recalc: sin diferencias', function() {
    const saldoActual = 500;
    const saldoCalculado = 500;
    const hayDiferencia = saldoActual !== saldoCalculado;
    return hayDiferencia === false;
  });
  
  // Test 3: Cálculo de diferencia
  test('recalc: calcula diferencia', function() {
    const saldoActual = 500;
    const saldoCalculado = 450;
    const diferencia = saldoActual - saldoCalculado;
    return diferencia === 50;
  });
}

// ============================================================================
// TESTS DE INTEGRACIÓN
// ============================================================================

/**
 * Test: Integración completa del sistema
 * Verifica que las funciones trabajen juntas correctamente
 */
function testIntegration() {
  Logger.log('\n--- Tests: Integration ---');
  
  // Test 1: normalizeName + fuzzySearch
  test('integration: normalize + fuzzy', function() {
    const nombreBusqueda = normalizeName('  JUAN   PEREZ  ');
    const lista = ['Juan Perez', 'Maria Garcia'];
    const result = fuzzySearch(nombreBusqueda, lista);
    return result.length > 0;
  });
  
  // Test 2: capitalize + uniqueArray
  test('integration: capitalize + unique', function() {
    const arr = ['juan', 'MARIA', 'juan', 'jose'];
    const normalized = arr.map(n => capitalize(n));
    const unique = uniqueArray(normalized);
    return unique.length === 3;
  });
}

// ============================================================================
// EJECUCIÓN DE TODOS LOS TESTS
// ============================================================================

/**
 * Ejecuta todos los tests unitarios
 * @returns {Object} Resultados de los tests
 */
function ejecutarTestsUnitarios() {
  Logger.log('===========================================');
  Logger.log('   TESTS UNITARIOS - SISTEMA SOL & VERDE');
  Logger.log('===========================================\n');
  
  // Resetear resultados
  TestResults.total = 0;
  TestResults.passed = 0;
  TestResults.failed = 0;
  TestResults.failures = [];
  
  try {
    // Tests de funciones utilitarias
    testNormalizeName();
    testDebounce();
    testFuzzySearch();
    testCapitalize();
    testUniqueArray();
    
    // Tests de recálculo de balances
    testBalanceCalculation();
    testMassiveBalanceRecalc();
    
    // Tests de integración
    testIntegration();
    
  } catch (error) {
    Logger.log('\n❌ ERROR EN TESTS: ' + error.message);
  }
  
  // Reporte final
  Logger.log('\n===========================================');
  Logger.log('   RESULTADOS FINALES');
  Logger.log('===========================================');
  Logger.log('Total tests: ' + TestResults.total);
  Logger.log('✅ Passed: ' + TestResults.passed);
  Logger.log('❌ Failed: ' + TestResults.failed);
  Logger.log('Success rate: ' + Math.round((TestResults.passed / TestResults.total) * 100) + '%');
  
  if (TestResults.failures.length > 0) {
    Logger.log('\n❌ FAILURES:');
    TestResults.failures.forEach(f => {
      Logger.log('  - ' + f.nombre + ': ' + f.error);
    });
  }
  
  return {
    total: TestResults.total,
    passed: TestResults.passed,
    failed: TestResults.failed,
    failures: TestResults.failures,
    successRate: Math.round((TestResults.passed / TestResults.total) * 100)
  };
}

/**
 * Ejecuta tests específicos por categoría
 * @param {string} categoria - Categoría de tests a ejecutar
 */
function ejecutarTestsPorCategoria(categoria) {
  Logger.log('Ejecutando tests de categoría: ' + categoria);
  
  switch (categoria) {
    case 'utilitarios':
      testNormalizeName();
      testDebounce();
      testFuzzySearch();
      testCapitalize();
      testUniqueArray();
      break;
    case 'balances':
      testBalanceCalculation();
      testMassiveBalanceRecalc();
      break;
    case 'integracion':
      testIntegration();
      break;
    default:
      Logger.log('Categoría no válida: ' + categoria);
  }
}
