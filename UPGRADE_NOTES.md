# Notas de Actualización - Fix/Full-Audit-Cta-Cte

## Resumen de Cambios

Esta rama corrige los problemas críticos del sistema Sol & Verde de cuenta corriente:

### 1. Carga Completa de Movimientos ✅

**Problema:** Los movimientos se truncaban a 10-20 registros.

**Solución:**
- Backend: Eliminado límite `.slice(0, 20)` en `main.gs`
- Frontend: Paginación de 50 movimientos por página
- Todos los movimientos ahora se cargan con navegación por páginas

**Archivos modificados:**
- `main.gs` - `obtenerDatosParaHTML()`: Sin límite en carga de movimientos
- `movimientos.gs` - `obtenerRecientes()`: Soporte para `limite=0` (ilimitado)
- `SistemaSolVerde.html` - `actualizarTablaMovimientos()`: Paginación frontend

### 2. Recálculo de Saldos en Cascada ✅

**Problema:** Al editar/eliminar movimientos, los saldos posteriores quedaban inconsistentes.

**Solución:**
- Nueva función `recalcularSaldosCliente()` que recalcula TODOS los `saldoPost` cronológicamente
- Actualización del saldo total del cliente
- Actualización de contadores (total_movs, ultimo_mov)

**Archivos modificados:**
- `main.gs`:
  - `actualizarMovimiento()`: Ahora llama a `recalcularSaldosCliente()`
  - `eliminarMovimiento()`: Ahora llama a `recalcularSaldosCliente()`
  - Nueva función `recalcularSaldosCliente()`

### 3. Impresión Unificada ✅

**Problema:** Múltiples funciones de impresión dispersas sin consistencia.

**Solución:**
- Nueva función `printUnified(htmlContent, title)` centralizada
- Template común con logo, CSS compartido, header consistente
- Ventana emergente que se cierra automáticamente después de imprimir

**Archivos modificados:**
- `SistemaSolVerde.html`: Nueva función `printUnified()`

**Uso:**
```javascript
const html = '<table>...</table>'; // Contenido HTML a imprimir
printUnified(html, 'Título del Reporte');
```

### 4. Autocomplete de Proveedores ⏳

**Nota:** El autocomplete actual usa select dropdown. Mejora pendiente de implementar.

### 5. Optimización de Menús ⏳

**Pendiente:** Implementar lazy-loading para módulos pesados.

### 6. Pantalla Inicial Dual ⏳

**Pendiente:** Splash screen con animación y selección "Venta Nocturna" vs "Sistema Puesto 200".

---

## Pasos de Despliegue

### Google Apps Script

1. **Abrir el editor de Apps Script** desde el Google Sheet
2. **Crear backup** del proyecto actual:
   - Archivo → Hacer una copia
3. **Reemplazar archivos** `.gs`:
   - `main.gs` - Actualizar funciones de movimientos y recálculo
   - `movimientos.gs` - Actualizar `obtenerRecientes()`
4. **Actualizar HTML**:
   - `SistemaSolVerde.html` - Reemplazar completo
5. **Ejecutar `inicializarSistema()`** desde el editor para verificar índices
6. **Deploy**:
   - Implementar como aplicación web
   - Quién tiene acceso: Cualquier usuario (si es necesario)
   - Versión: Nueva versión

### Verificación Post-Despliegue

1. ✅ Cargar dashboard - verificar que muestra todos los movimientos
2. ✅ Navegar por páginas de movimientos
3. ✅ Editar un movimiento - verificar recálculo de saldos
4. ✅ Eliminar un movimiento - verificar recálculo de saldos
5. ✅ Visor de cliente - verificar historial completo
6. ✅ Impresión - usar `printUnified()` y verificar cierre automático

---

## Checklist de QA

### Pruebas Manuales

- [ ] **Carga de movimientos**: Dashboard muestra >100 movimientos con paginación
- [ ] **Edición de movimiento**: 
  - Editar monto de movimiento intermedio
  - Verificar que saldos anteriores NO cambian
  - Verificar que saldos posteriores SÍ se recalculan
  - Verificar saldo total del cliente actualizado
- [ ] **Eliminación de movimiento**:
  - Eliminar movimiento intermedio
  - Verificar recálculo en cascada
  - Verificar reporte de impresión actualizado
- [ ] **Impresión unificada**:
  - Abrir cualquier reporte
  - Verificar logo y header consistente
  - Verificar que ventana se cierra tras imprimir
- [ ] **Visor de cliente**:
  - Buscar cliente con muchos movimientos
  - Verificar historial completo
  - Verificar saldo correcto

### Pruebas con Dataset Grande

- [ ] Crear 1000+ movimientos de prueba
- [ ] Verificar tiempo de carga <5 segundos
- [ ] Verificar paginación funcional
- [ ] Verificar edición/eliminación sin errores

---

## Métricas de Rendimiento

### Antes

- Movimientos máximos mostrados: 10-20
- Edición de movimiento: Saldos inconsistentes
- Impresión: Múltiples funciones, inconsistente

### Después

- Movimientos mostrados: Todos (con paginación de 50)
- Edición de movimiento: Saldos siempre consistentes
- Impresión: Función única, template consistente

---

## Comandos Git

```bash
# Crear rama
git checkout -b fix/full-audit-cta-cte

# Commits realizados
git commit -m "fix(data-load): remove hard limits and add pagination"
git commit -m "fix(balance): recalculate running balances on edit/delete"
git commit -m "feat(print): unified print function with shared CSS"

# Push y PR
git push origin fix/full-audit-cta-cte
```

---

## Rollback

En caso de problemas:

```bash
# Revertir a main
git checkout main
git pull

# En Apps Script: Restaurar desde backup
```

---

## Contacto

Para dudas o problemas, contactar al equipo de desarrollo.
