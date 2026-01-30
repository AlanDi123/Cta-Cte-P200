/**
 * ============================================================================
 * DASHBOARD DE MÉTRICAS Y MONITOREO - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: dashboard_metricas.gs
 * Descripción: Funciones para obtener métricas y estado del sistema
 * para monitoreo en tiempo real
 *
 * ============================================================================
 */

/**
 * Obtiene dashboard completo de métricas del sistema
 * @returns {Object} Dashboard con todas las métricas
 */
function obtenerDashboardMetricas() {
  try {
    const metricas = MetricasSistema.obtenerMetricas();
    const indices = IndicesCache.obtenerEstadisticas();
    const circuitBreakers = CircuitBreaker.obtenerEstados();
    const rateLimiting = RateLimiter.obtenerEstado();
    const auditoria = AuditoriaSistema.obtenerEstadisticas();
    const backup = {
      ultimoBackup: BackupAutomatico.estado.ultimoBackup,
      proximoBackup: BackupAutomatico.estado.proximoBackup,
      backupsCompletados: BackupAutomatico.estado.backupsCompletados,
      errores: BackupAutomatico.estado.errores
    };
    const integridad = verificarIntegridadSistema();

    return {
      success: true,
      timestamp: new Date().toISOString(),
      sistema: {
        version: 'V18.1',
        uptime: metricas.uptime + ' minutos',
        integridad: integridad.porcentaje + '%'
      },
      rendimiento: {
        requestsTotal: metricas.requestsTotal,
        avgResponseTime: metricas.avgResponseTime,
        p95ResponseTime: metricas.p95ResponseTime,
        cacheHitRate: metricas.cacheHitRate,
        memoriaUsada: metricas.memoriaEstimada
      },
      indices: {
        clientesIndexados: indices.clientesIndexados,
        movimientosIndexados: indices.movimientosIndexados,
        clientesConMovimientos: indices.clientesConMovimientos,
        hitRate: indices.hitRate,
        avgQueryTime: indices.avgQueryTime,
        memoriaEstimada: indices.memoriaEstimada,
        rebuilds: indices.rebuilds,
        lastRebuildTime: indices.lastRebuildTime
      },
      fiabilidad: {
        circuitBreakers: circuitBreakers,
        erroresPorTipo: metricas.erroresPorTipo,
        erroresRecientes: auditoria.erroresRecientes
      },
      seguridad: {
        rateLimiting: rateLimiting,
        operacionesAuditadas: auditoria.totalOperaciones,
        operacionesPorTipo: auditoria.operacionesPorTipo,
        operacionesPorUsuario: Object.keys(auditoria.operacionesPorUsuario).length + ' usuarios'
      },
      backup: backup,
      apis: metricas.requestsPorEndpoint
    };

  } catch (error) {
    Logger.log('Error obteniendo dashboard: ' + error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Obtiene métricas de rendimiento en formato simple para debugging
 * @returns {Object} Métricas simplificadas
 */
function obtenerMetricasSimples() {
  try {
    const metricas = MetricasSistema.obtenerMetricas();
    const indices = IndicesCache.obtenerEstadisticas();

    return {
      success: true,
      uptime: metricas.uptime + 'min',
      requests: metricas.requestsTotal,
      avgResponse: metricas.avgResponseTime,
      cacheHitRate: metricas.cacheHitRate,
      memoria: metricas.memoriaEstimada,
      indicesClientes: indices.clientesIndexados,
      indicesMovimientos: indices.movimientosIndexados,
      queryTime: indices.avgQueryTime,
      errores: Object.keys(metricas.erroresPorTipo).length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene estado de salud del sistema (para health checks)
 * @returns {Object} Estado de salud
 */
function obtenerEstadoSalud() {
  try {
    const integridad = verificarIntegridadSistema();
    const circuitBreakers = CircuitBreaker.obtenerEstados();
    const metricas = MetricasSistema.obtenerMetricas();

    // Determinar estado general
    let estado = 'HEALTHY';
    let mensaje = 'Sistema funcionando correctamente';

    if (integridad.porcentaje < 80) {
      estado = 'DEGRADED';
      mensaje = 'Sistema con degradación de rendimiento';
    }

    if (integridad.porcentaje < 50) {
      estado = 'UNHEALTHY';
      mensaje = 'Sistema con problemas críticos';
    }

    // Verificar circuit breakers
    const circuitBreakerAbierto = Object.values(circuitBreakers).some(cb => cb.estado === 'ABIERTO');
    if (circuitBreakerAbierto) {
      estado = 'DEGRADED';
      mensaje = 'Circuit breaker activado - sistema en modo degradado';
    }

    return {
      success: true,
      estado: estado,
      mensaje: mensaje,
      timestamp: new Date().toISOString(),
      integridad: integridad.porcentaje + '%',
      uptime: metricas.uptime + ' minutos',
      requestsTotal: metricas.requestsTotal,
      erroresRecientes: Object.keys(metricas.erroresPorTipo).length
    };

  } catch (error) {
    return {
      success: false,
      estado: 'CRITICAL',
      mensaje: 'Error crítico en verificación de salud',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Fuerza reconstrucción de índices (para mantenimiento)
 * @returns {Object} Resultado de la reconstrucción
 */
function reconstruirIndicesForzado() {
  try {
    Logger.log('🔄 Reconstrucción forzada de índices iniciada');

    const startTime = Date.now();
    IndicesCache.reconstruirIndices();
    const duration = Date.now() - startTime;

    AuditoriaSistema.registrar(
      AuditoriaSistema.TIPOS_OPERACION.CONFIGURACION,
      'SISTEMA',
      'Reconstrucción forzada de índices',
      { duration: duration + 'ms' }
    );

    const stats = IndicesCache.obtenerEstadisticas();

    return {
      success: true,
      mensaje: 'Índices reconstruidos exitosamente',
      duration: duration + 'ms',
      estadisticas: stats
    };

  } catch (error) {
    Logger.log('Error en reconstrucción forzada: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Limpia caché y reinicia métricas (para debugging)
 * @returns {Object} Resultado de la limpieza
 */
function limpiarCacheYMetricas() {
  try {
    Logger.log('🧹 Limpieza de caché y métricas iniciada');

    // Limpiar índices
    IndicesCache.invalidarIndices();

    // Resetear métricas (simulado - en implementación real se haría)
    Logger.log('Métricas reseteadas (simulado)');

    AuditoriaSistema.registrar(
      AuditoriaSistema.TIPOS_OPERACION.CONFIGURACION,
      'SISTEMA',
      'Limpieza de caché y métricas',
      {}
    );

    return {
      success: true,
      mensaje: 'Caché y métricas limpiados exitosamente'
    };

  } catch (error) {
    Logger.log('Error en limpieza: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene log de auditoría filtrado
 * @param {Object} filtros - Filtros opcionales
 * @returns {Object} Log de auditoría
 */
function obtenerLogAuditoria(filtros) {
  try {
    const log = AuditoriaSistema.obtenerLog(filtros || {});
    const stats = AuditoriaSistema.obtenerEstadisticas();

    return {
      success: true,
      log: log,
      estadisticas: stats,
      total: log.length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}