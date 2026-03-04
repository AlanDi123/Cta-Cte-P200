/**
 * ============================================================================
 * VENTA NOCTURNA - MÓDULO PRINCIPAL
 * ============================================================================
 * 
 * Módulo especializado para gestión de ventas nocturnas
 * Menús: Ventas, Reportes, Cierre, Consultas, Parametrización
 * 
 * @author Alan
 * @version 1.0.0
 */

// ============================================================================
// ESTADO DEL MÓDULO
// ============================================================================

const VentaNocturnaModule = (function() {
  'use strict';

  // Estado privado
  let currentMenu = 'ventas';
  let cachedData = {};
  let isInitialized = false;

  // ============================================================================
  // INICIALIZACIÓN
  // ============================================================================

  /**
   * Inicializa el módulo de Venta Nocturna
   */
  function init() {
    if (isInitialized) {
      console.log('[VN] Módulo ya inicializado');
      return;
    }

    console.log('[VN] Inicializando módulo de Venta Nocturna...');
    
    // Cargar configuración
    loadConfiguration();
    
    // Renderizar menú lateral
    renderSidebar();
    
    // Cargar vista por defecto (Ventas)
    loadView('ventas');
    
    isInitialized = true;
    console.log('[VN] Módulo inicializado correctamente');
  }

  /**
   * Carga la configuración del módulo
   */
  function loadConfiguration() {
    console.log('[VN] Cargando configuración...');
    // La configuración se carga desde vn_config.gs
    cachedData.config = {
      bankNames: typeof BANK_NAMES !== 'undefined' ? BANK_NAMES : [],
      emptyValues: typeof EMPTY_VALUES_CONFIG !== 'undefined' ? EMPTY_VALUES_CONFIG : [],
      moduleConstants: typeof MODULE_CONSTANTS !== 'undefined' ? MODULE_CONSTANTS : {}
    };
  }

  // ============================================================================
  // RENDERIZADO DEL SIDEBAR
  // ============================================================================

  /**
   * Renderiza el menú lateral específico para Venta Nocturna
   */
  function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const menus = [
      { id: 'ventas', icon: '💰', text: 'Ventas', shortcut: 'Ctrl+1' },
      { id: 'reportes', icon: '📊', text: 'Reportes', shortcut: 'Ctrl+2' },
      { id: 'cierre', icon: '🔒', text: 'Cierre', shortcut: 'Ctrl+3' },
      { id: 'consultas', icon: '🔍', text: 'Consultas', shortcut: 'Ctrl+4' },
      { id: 'parametrizacion', icon: '⚙️', text: 'Parametrización', shortcut: 'Ctrl+5' }
    ];

    sidebar.innerHTML = `
      <div class="menu-section">
        <div class="menu-section-title">Venta Nocturna 🌙</div>
        ${menus.map(menu => `
          <a class="menu-item ${menu.id === currentMenu ? 'active' : ''}" 
             data-vn-menu="${menu.id}"
             onclick="VentaNocturnaModule.loadMenu('${menu.id}')">
            <span class="menu-item-icon">${menu.icon}</span>
            <span class="menu-item-text">${menu.text}</span>
            <span class="menu-item-shortcut">${menu.shortcut}</span>
          </a>
        `).join('')}
      </div>
      <div class="menu-section" style="margin-top: auto;">
        <a class="menu-item" onclick="VentaNocturnaModule.exitToSplash()">
          <span class="menu-item-icon">🏠</span>
          <span class="menu-item-text">Volver al Inicio</span>
        </a>
      </div>
    `;
  }

  // ============================================================================
  // CARGA DE VISTAS
  // ============================================================================

  /**
   * Carga un menú/vista específica
   * @param {string} menuId - ID del menú a cargar
   */
  function loadMenu(menuId) {
    console.log('[VN] Cargando menú:', menuId);
    currentMenu = menuId;
    
    // Actualizar estado activo en sidebar
    const items = document.querySelectorAll('[data-vn-menu]');
    items.forEach(item => {
      item.classList.toggle('active', item.dataset.vnMenu === menuId);
    });

    // Cargar vista correspondiente
    loadView(menuId);
  }

  /**
   * Carga y renderiza una vista
   * @param {string} viewId - ID de la vista
   */
  function loadView(viewId) {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    // Mostrar loading
    mainContent.innerHTML = `
      <div class="module-view active">
        <div class="loading-container" style="display: flex; justify-content: center; align-items: center; height: 100%;">
          <div class="spinner"></div>
        </div>
      </div>
    `;

    // Simular carga asíncrona (en producción, esto cargaría datos reales)
    setTimeout(() => {
      const viewHtml = getViewHtml(viewId);
      mainContent.innerHTML = viewHtml;
      
      // Inicializar eventos específicos de la vista
      initViewEvents(viewId);
    }, 300);
  }

  /**
   * Retorna el HTML para cada vista
   * @param {string} viewId - ID de la vista
   * @returns {string} HTML de la vista
   */
  function getViewHtml(viewId) {
    switch (viewId) {
      case 'ventas':
        return getVentasView();
      case 'reportes':
        return getReportesView();
      case 'cierre':
        return getCierreView();
      case 'consultas':
        return getConsultasView();
      case 'parametrizacion':
        return getParametrizacionView();
      default:
        return getVentasView();
    }
  }

  // ============================================================================
  // VISTAS INDIVIDUALES
  // ============================================================================

  /**
   * Vista de Ventas
   */
  function getVentasView() {
    return `
      <div class="module-view active">
        <div class="module-header">
          <h1 class="module-title">
            <span>💰</span>
            Registro de Ventas
          </h1>
          <p class="module-subtitle">Sistema especializado para ventas nocturnas</p>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">
              <span>📝</span>
              Nueva Venta
            </h2>
          </div>
          <form id="vn-venta-form" onsubmit="VentaNocturnaModule.registrarVenta(event)">
            <div class="form-group">
              <label class="form-label">
                <span>🏦</span>
                Banco / Medio de Pago
              </label>
              <select class="form-select" id="vn-banco" required>
                <option value="">Seleccionar...</option>
                ${getBankOptions()}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">
                <span>💵</span>
                Monto
              </label>
              <input type="number" class="form-input" id="vn-monto" 
                     step="0.01" min="0" placeholder="$ 0.00" required>
            </div>

            <div class="form-group">
              <label class="form-label">
                <span>📄</span>
                Observaciones
              </label>
              <textarea class="form-textarea" id="vn-obs" 
                        placeholder="Detalles de la venta..."></textarea>
            </div>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">
                <span>✅</span>
                Registrar Venta
              </button>
              <button type="reset" class="btn btn-secondary">
                <span>🔄</span>
                Limpiar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  /**
   * Vista de Reportes
   */
  function getReportesView() {
    return `
      <div class="module-view active">
        <div class="module-header">
          <h1 class="module-title">
            <span>📊</span>
            Reportes
          </h1>
          <p class="module-subtitle">Consultas y estadísticas de ventas nocturnas</p>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">
              <span>📅</span>
            Reporte por Fecha
            </h2>
          </div>
          <div class="form-group">
            <label class="form-label">Desde:</label>
            <input type="date" class="form-input" id="vn-reporte-desde">
          </div>
          <div class="form-group">
            <label class="form-label">Hasta:</label>
            <input type="date" class="form-input" id="vn-reporte-hasta">
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" onclick="VentaNocturnaModule.generarReporte()">
              <span>🔍</span>
              Generar Reporte
            </button>
          </div>
        </div>

        <div id="vn-reporte-resultado" style="margin-top: 20px;"></div>
      </div>
    `;
  }

  /**
   * Vista de Cierre
   */
  function getCierreView() {
    return `
      <div class="module-view active">
        <div class="module-header">
          <h1 class="module-title">
            <span>🔒</span>
            Cierre de Caja
          </h1>
          <p class="module-subtitle">Cierre diario de ventas nocturnas</p>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">
              <span>📊</span>
              Resumen del Día
            </h2>
          </div>
          <div id="vn-cierre-resumen">
            <p style="text-align: center; color: var(--sv-texto-secundario);">
              Seleccione una fecha para realizar el cierre
            </p>
          </div>
          <div class="form-actions" style="margin-top: 20px;">
            <button class="btn btn-primary" onclick="VentaNocturnaModule.realizarCierre()">
              <span>🔒</span>
              Realizar Cierre
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Vista de Consultas
   */
  function getConsultasView() {
    return `
      <div class="module-view active">
        <div class="module-header">
          <h1 class="module-title">
            <span>🔍</span>
            Consultas
          </h1>
          <p class="module-subtitle">Búsqueda de ventas registradas</p>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">
              <span>🔎</span>
              Búsqueda
            </h2>
          </div>
          <div class="form-group">
            <label class="form-label">
              <span>🏦</span>
              Banco / Medio de Pago
            </label>
            <select class="form-select" id="vn-consulta-banco">
              <option value="">Todos</option>
              ${getBankOptions()}
            </select>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" onclick="VentaNocturnaModule.realizarConsulta()">
              <span>🔍</span>
              Buscar
            </button>
          </div>
        </div>

        <div id="vn-consulta-resultado" style="margin-top: 20px;"></div>
      </div>
    `;
  }

  /**
   * Vista de Parametrización
   */
  function getParametrizacionView() {
    return `
      <div class="module-view active">
        <div class="module-header">
          <h1 class="module-title">
            <span>⚙️</span>
            Parametrización
          </h1>
          <p class="module-subtitle">Configuración del módulo Venta Nocturna</p>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">
              <span>🏦</span>
              Bancos Configurados
            </h2>
          </div>
          <div id="vn-config-bancos">
            ${getBanksConfigList()}
          </div>
          <div class="form-actions" style="margin-top: 20px;">
            <button class="btn btn-primary" onclick="VentaNocturnaModule.agregarBanco()">
              <span>➕</span>
              Agregar Banco
            </button>
          </div>
        </div>

        <div class="card" style="margin-top: 20px;">
          <div class="card-header">
            <h2 class="card-title">
              <span>🖨️</span>
              Configuración de Impresión
            </h2>
          </div>
          <div id="vn-config-impresion">
            <p>Configuración de impresora térmica...</p>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // HELPERS DE VISTAS
  // ============================================================================

  /**
   * Obtiene opciones de bancos para selects
   */
  function getBankOptions() {
    const banks = typeof BANK_NAMES !== 'undefined' ? BANK_NAMES : ['Santander Río', 'Mercado Pago', 'Macro'];
    return banks.map(bank => `<option value="${bank}">${bank}</option>`).join('');
  }

  /**
   * Obtiene lista de bancos configurados
   */
  function getBanksConfigList() {
    const banks = typeof BANK_NAMES !== 'undefined' ? BANK_NAMES : ['Santander Río', 'Mercado Pago', 'Macro'];
    return `
      <ul style="list-style: none; padding: 0;">
        ${banks.map(bank => `
          <li style="padding: 10px; border-bottom: 1px solid var(--sv-borde); display: flex; justify-content: space-between; align-items: center;">
            <span>${bank}</span>
            <button class="btn btn-secondary" style="padding: 5px 10px;" onclick="VentaNocturnaModule.eliminarBanco('${bank}')">
              🗑️
            </button>
          </li>
        `).join('')}
      </ul>
    `;
  }

  // ============================================================================
  // EVENTOS DE VISTAS
  // ============================================================================

  /**
   * Inicializa eventos específicos para cada vista
   * @param {string} viewId - ID de la vista
   */
  function initViewEvents(viewId) {
    switch (viewId) {
      case 'ventas':
        // Eventos específicos de ventas
        break;
      case 'reportes':
        // Eventos específicos de reportes
        break;
      case 'cierre':
        // Eventos específicos de cierre
        break;
      case 'consultas':
        // Eventos específicos de consultas
        break;
      case 'parametrizacion':
        // Eventos específicos de parametrización
        break;
    }
  }

  // ============================================================================
  // ACCIONES DEL MÓDULO (EXPUESTAS GLOBALMENTE)
  // ============================================================================

  /**
   * Registrar una nueva venta
   */
  function registrarVenta(event) {
    event.preventDefault();
    console.log('[VN] Registrando venta...');
    
    const banco = document.getElementById('vn-banco').value;
    const monto = parseFloat(document.getElementById('vn-monto').value);
    const obs = document.getElementById('vn-obs').value;

    if (!banco || !monto || monto <= 0) {
      showToast('Error', 'Complete todos los campos requeridos', 'error');
      return;
    }

    // Aquí se llamaría al backend para guardar la venta
    console.log('[VN] Datos de venta:', { banco, monto, obs });
    
    showToast('Éxito', 'Venta registrada correctamente', 'success');
    
    // Limpiar formulario
    document.getElementById('vn-venta-form').reset();
  }

  /**
   * Generar reporte
   */
  function generarReporte() {
    const desde = document.getElementById('vn-reporte-desde').value;
    const hasta = document.getElementById('vn-reporte-hasta').value;
    
    console.log('[VN] Generando reporte:', { desde, hasta });
    showToast('Info', 'Reporte en generación...', 'info');
  }

  /**
   * Realizar cierre de caja
   */
  function realizarCierre() {
    console.log('[VN] Realizando cierre de caja...');
    showToast('Info', 'Procesando cierre...', 'info');
  }

  /**
   * Realizar consulta
   */
  function realizarConsulta() {
    const banco = document.getElementById('vn-consulta-banco').value;
    console.log('[VN] Realizando consulta:', { banco });
    showToast('Info', 'Buscando registros...', 'info');
  }

  /**
   * Agregar banco
   */
  function agregarBanco() {
    const nombre = prompt('Nombre del banco:');
    if (nombre) {
      console.log('[VN] Agregando banco:', nombre);
      showToast('Éxito', 'Banco agregado correctamente', 'success');
    }
  }

  /**
   * Eliminar banco
   */
  function eliminarBanco(nombre) {
    if (confirm(`¿Eliminar "${nombre}"?`)) {
      console.log('[VN] Eliminando banco:', nombre);
      showToast('Éxito', 'Banco eliminado', 'success');
    }
  }

  /**
   * Volver al splash screen
   */
  function exitToSplash() {
    if (confirm('¿Volver a la pantalla de selección de sistemas?')) {
      sessionStorage.removeItem('selectedSystem');
      location.reload();
    }
  }

  // ============================================================================
  // API PÚBLICA DEL MÓDULO
  // ============================================================================

  return {
    init: init,
    loadMenu: loadMenu,
    registrarVenta: registrarVenta,
    generarReporte: generarReporte,
    realizarCierre: realizarCierre,
    realizarConsulta: realizarConsulta,
    agregarBanco: agregarBanco,
    eliminarBanco: eliminarBanco,
    exitToSplash: exitToSplash
  };
})();

// Exportar para uso global
window.VentaNocturnaModule = VentaNocturnaModule;
