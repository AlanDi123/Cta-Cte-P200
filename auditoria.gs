// ============================================================================
// MÓDULO: AUDITORÍA FINANCIERA
// Bitácora inmutable de todas las mutaciones financieras del sistema.
// Patrón: fire-and-forget (fallo de auditoría NO bloquea la operación)
// Hoja: AUDITORIA (se crea automáticamente si no existe)
// ============================================================================

const AuditLogger = {

  NOMBRE_HOJA: 'AUDITORIA',

  HEADERS: [
    'TIMESTAMP',       // A: DateTime de la operación
    'USUARIO',         // B: Email del usuario
    'MODULO',          // C: 'MOVIMIENTOS', 'CAJA', 'CONTABILIDAD', 'VN_PAGOS', etc.
    'OPERACION',       // D: 'CREAR', 'EDITAR', 'ELIMINAR', 'CERRAR_CAJA', etc.
    'ENTIDAD_ID',      // E: ID del registro afectado
    'ENTIDAD_DESC',    // F: Descripción legible (ej: 'Cliente: GARCIA JOSE')
    'VALOR_ANTES',     // G: JSON del estado anterior (null en CREAR)
    'VALOR_DESPUES',   // H: JSON del estado posterior (null en ELIMINAR)
    'MONTO_IMPACTO',   // I: Monto financiero impactado (para queries rápidas)
    'IP_SESSION'       // J: Session ID para correlación
  ],

  _getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(this.NOMBRE_HOJA);

    if (!hoja) {
      hoja = ss.insertSheet(this.NOMBRE_HOJA);
      hoja.appendRow(this.HEADERS);
      const headerRange = hoja.getRange(1, 1, 1, this.HEADERS.length);
      headerRange.setFontWeight('bold')
                 .setBackground('#263238')
                 .setFontColor('#ECEFF1');
      hoja.setFrozenRows(1);
      hoja.setColumnWidth(7, 300); // VALOR_ANTES más ancha
      hoja.setColumnWidth(8, 300); // VALOR_DESPUES más ancha
      Logger.log('[AUDITORIA] Hoja AUDITORIA creada automáticamente.');
    }

    return hoja;
  },

  /**
   * Registra una entrada de auditoría.
   * Fire-and-forget: los errores se loguean pero NO se propagan.
   *
   * @param {Object} entrada
   * @param {string} entrada.modulo - Ej: 'MOVIMIENTOS'
   * @param {string} entrada.operacion - Ej: 'CREAR'
   * @param {string|number} entrada.entidadId - ID del registro
   * @param {string} entrada.entidadDesc - Descripción legible
   * @param {Object|null} entrada.antes - Estado anterior (null para creaciones)
   * @param {Object|null} entrada.despues - Estado posterior (null para eliminaciones)
   * @param {number} [entrada.montoImpacto=0] - Monto financiero del cambio
   */
  registrar: function(entrada) {
    try {
      const hoja = this._getHoja();
      const timestamp = new Date();
      let usuario = '';
      try { usuario = Session.getActiveUser().getEmail(); } catch(e) { usuario = 'sistema'; }

      const sessionId = Utilities.getUuid().substring(0, 8); // ID corto de sesión

      const fila = [
        timestamp,
        usuario,
        (entrada.modulo     || 'DESCONOCIDO').toUpperCase(),
        (entrada.operacion  || 'DESCONOCIDA').toUpperCase(),
        String(entrada.entidadId   || ''),
        String(entrada.entidadDesc || ''),
        entrada.antes    !== null && entrada.antes    !== undefined ? JSON.stringify(entrada.antes)    : '',
        entrada.despues  !== null && entrada.despues  !== undefined ? JSON.stringify(entrada.despues)  : '',
        Number(entrada.montoImpacto) || 0,
        sessionId
      ];

      hoja.appendRow(fila);

    } catch (e) {
      // NUNCA propagar errores de auditoría — son logs, no operaciones críticas
      Logger.log('[AUDITORIA] ADVERTENCIA: Fallo al registrar auditoría: ' + e.message +
                 ' | Entrada: ' + JSON.stringify(entrada || {}));
    }
  },

  /**
   * Recupera las últimas N entradas de auditoría.
   * @param {number} limite - Cantidad de registros (default: 50)
   * @param {string} [modulo] - Filtrar por módulo (opcional)
   * @returns {Array<Object>}
   */
  obtenerUltimos: function(limite, modulo) {
    limite = limite || 50;
    try {
      const hoja = this._getHoja();
      const datos = hoja.getDataRange().getValues();
      let filas = datos.slice(1).reverse(); // más recientes primero

      if (modulo) {
        filas = filas.filter(f => f[2] === modulo.toUpperCase());
      }

      return filas.slice(0, limite).map(f => ({
        timestamp:    f[0],
        usuario:      f[1],
        modulo:       f[2],
        operacion:    f[3],
        entidadId:    f[4],
        entidadDesc:  f[5],
        antes:        f[6] ? (() => { try { return JSON.parse(f[6]); } catch(e) { return f[6]; } })() : null,
        despues:      f[7] ? (() => { try { return JSON.parse(f[7]); } catch(e) { return f[7]; } })() : null,
        montoImpacto: f[8],
        sessionId:    f[9]
      }));
    } catch (e) {
      Logger.log('[AUDITORIA] Error al obtener registros: ' + e.message);
      return [];
    }
  }
};
