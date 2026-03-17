# Validación Final en Sandbox - Sistema Fiscal Sol & Verde

**Fecha**: 2026-03-16  
**Branch**: `fix/fiscal-audit-2026-03-16`  
**Estado**: ✅ LISTO PARA SANDBOX TESTING

---

## 📋 Checklist de Validación en Sandbox

### 1. Transferencias No Registradas

#### Test 1.1: Crear transferencia con cliente no registrado
```javascript
// Desde consola de Apps Script o frontend
const resultado = TransferenciasRepository.agregar({
  fecha: '2026-03-16',
  cliente: 'PEREZ JUAN',  // Cliente que NO existe en CLIENTES
  monto: 15000,
  banco: 'Galicia',
  cuit: '20149543407',  // CUIT opcional proporcionado
  obs: 'Pago transferencia'
});

// RESULTADO ESPERADO:
{
  id: X,
  cliente: 'PEREZ JUAN',
  clienteRegistrado: false,
  nombreOriginal: 'PEREZ JUAN',
  cuitProporcionado: '20149543407',
  esNoRegistrado: true,  // ← Flag explícito
  obs: '[NO_REGISTRADO] {"noRegistrado":true,"nombreOriginal":"PEREZ JUAN","cuitProporcionado":"20149543407","fechaIngreso":"16/03/2026"} | Pago transferencia'
}
```

**Criterio de aceptación**: 
- ✅ `esNoRegistrado: true`
- ✅ Metadata `[NO_REGISTRADO]` en obs
- ✅ `cuitProporcionado` guardado

#### Test 1.2: Obtener transferencias no registradas
```javascript
const noRegistradas = TransferenciasRepository.obtenerNoRegistradas(10);
console.log('No registradas:', noRegistradas.length);

// RESULTADO ESPERADO:
// Array con transferencias donde esNoRegistrado=true
```

**Criterio de aceptación**:
- ✅ Filtra correctamente no registradas
- ✅ Incluye metadata parseada

#### Test 1.3: Parsear metadata existente
```javascript
const obs = '[NO_REGISTRADO] {"noRegistrado":true,"nombreOriginal":"PEREZ JUAN"} | Otra nota';
const metadata = TransferenciasRepository.parsearMetadataNoRegistrado(obs);

// RESULTADO ESPERADO:
{
  noRegistrado: true,
  nombreOriginal: 'PEREZ JUAN',
  cuitProporcionado: null,
  fechaIngreso: '...'
}
```

---

### 2. Auto-detección de Condición IVA

#### Test 2.1: Consultar CUIT de Responsable Inscripto
```javascript
const resultado = AfipService.consultarCUIT('20149543407');

// RESULTADO ESPERADO (si es RI):
{
  encontrado: true,
  cuit: '20149543407',
  razonSocial: '...',
  condicionIVA: 'RI',
  condicionTexto: 'Responsable Inscripto',
  pendienteVerificacion: false,
  fuenteDeteccion: 'RI'  // ← Trazabilidad
}
```

**Criterio de aceptación**:
- ✅ `condicionIVA: 'RI'`
- ✅ `fuenteDeteccion: 'RI'`
- ✅ `pendienteVerificacion: false`

#### Test 2.2: Consultar CUIT de Monotributista
```javascript
const resultado = AfipService.consultarCUIT('20XXXXXXXXX');  // CUIT de monotributista

// RESULTADO ESPERADO:
{
  encontrado: true,
  condicionIVA: 'M',
  condicionTexto: 'Monotributista',
  fuenteDeteccion: 'Monotributo',
  categoriaMonotributo: 'A'  // Si está disponible
}
```

#### Test 2.3: Consultar CUIT de Consumidor Final (sin inscripción)
```javascript
const resultado = AfipService.consultarCUIT('27XXXXXXXXX');  // CUIT sin inscripción

// RESULTADO ESPERADO:
{
  encontrado: true,
  condicionIVA: 'CF',
  condicionTexto: 'Consumidor Final',
  pendienteVerificacion: false,
  fuenteDeteccion: 'Default'
}
```

#### Test 2.4: Consultar CUIT de persona jurídica sin inscripción (PENDIENTE)
```javascript
const resultado = AfipService.consultarCUIT('30XXXXXXXXX');  // SJ sin inscripción

// RESULTADO ESPERADO:
{
  encontrado: true,
  condicionIVA: 'CF',  // Fallback seguro
  condicionTexto: 'Consumidor Final (pendiente verificación - persona jurídica)',
  pendienteVerificacion: true,  // ← Para UI
  fuenteDeteccion: 'Heurística'
}
```

**Criterio de aceptación**:
- ✅ `pendienteVerificacion: true`
- ✅ No bloquea facturación (CF fallback)
- ✅ Log `[AUTO-DETECCION]` generado

---

### 3. Validación de Payload AFIP

#### Test 3.1: Validar payload correcto
```javascript
const payloadCorrecto = {
  params: {
    FECAEReq: {
      FeCabReq: {
        CantReg: 1,
        PtoVta: 11,
        CbteTipo: 6  // Factura B
      },
      FeDetReq: {
        FECAEDetRequest: {
          Concepto: 1,
          DocTipo: 99,  // Consumidor Final
          DocNro: 0,
          CbteDesde: 123,
          CbteHasta: 123,
          CbteFch: '20260316',  // Fecha válida
          ImpTotal: 1105.00,
          ImpNeto: 1000.00,
          ImpIVA: 105.00,
          Iva: {
            AlicIva: [{
              Id: 4,
              BaseImp: 1000.00,
              Importe: 105.00  // 10.5%
            }]
          }
        }
      }
    }
  }
};

const validacion = AfipService.validarPayloadEmision(payloadCorrecto);

// RESULTADO ESPERADO:
{
  valido: true,
  errores: [],
  advertencias: []
}
```

#### Test 3.2: Validar payload con fecha inválida (> 5 días)
```javascript
const payloadFechaInvalida = {
  params: {
    FECAEReq: {
      FeDetReq: {
        FECAEDetRequest: {
          Concepto: 1,  // Productos
          CbteFch: '20260301'  // > 5 días atrás
        }
      }
    }
  }
};

const validacion = AfipService.validarPayloadEmision(payloadFechaInvalida);

// RESULTADO ESPERADO:
{
  valido: false,
  errores: ['Fecha de comprobante (20260301) supera los 5 días permitidos para productos. Días: 15']
}
```

#### Test 3.3: Validar payload con importes inconsistentes
```javascript
const payloadImportesInvalidos = {
  params: {
    FECAEReq: {
      FeDetReq: {
        FECAEDetRequest: {
          ImpTotal: 1000,  // ≠ 1000 + 105
          ImpNeto: 1000,
          ImpIVA: 105
        }
      }
    }
  }
};

const validacion = AfipService.validarPayloadEmision(payloadImportesInvalidos);

// RESULTADO ESPERADO:
{
  valido: false,
  errores: ['Importes inconsistentes: Total (1000) ≠ Neto (1000) + IVA (105)']
}
```

#### Test 3.4: Validar Factura A sin CUIT
```javascript
const payloadFacturaASinCUIT = {
  params: {
    FECAEReq: {
      FeCabReq: {
        CbteTipo: 1  // Factura A
      },
      FeDetReq: {
        FECAEDetRequest: {
          DocTipo: 99,  // Debería ser 80 (CUIT)
          DocNro: 0     // Debería tener CUIT
        }
      }
    }
  }
};

const validacion = AfipService.validarPayloadEmision(payloadFacturaASinCUIT);

// RESULTADO ESPERADO:
{
  valido: false,
  errores: ['Factura A/NC A requiere DocNro (CUIT del receptor)']
}
```

---

### 4. Emisión Completa con Validación

#### Test 4.1: Emitir factura con payload válido
```javascript
const resultado = AfipService.emitirComprobante({
  cbteTipo: 6,  // Factura B
  clienteCuit: '',  // Consumidor Final
  importeNeto: 1000,
  fechaTransferencia: '2026-03-16'  // Fecha válida
});

// RESULTADO ESPERADO:
{
  cae: '123456789012345',
  caeVto: '20260326',
  cbteNro: 124,
  resultado: 'A',
  avisoFecha: null  // o mensaje si se ajustó fecha
}

// LOGS ESPERADOS:
// [CALCULO FECHA ARCA] Fecha transferencia: 16/03/2026, Días de diferencia: 0
// [CALCULO FECHA ARCA] Fecha dentro de rango permitido. Usando fecha original: 16/03/2026
// [EMISION FACTURA] Payload validado OK - Enviando a ARCA...
// [EMISION FACTURA] CAE OBTENIDO EXITOSAMENTE - CAE: 123456789012345, CbteNro: 124
```

#### Test 4.2: Emitir factura con payload inválido (debe fallar)
```javascript
try {
  const resultado = AfipService.emitirComprobante({
    cbteTipo: 1,  // Factura A
    clienteCuit: '',  // SIN CUIT → ERROR
    importeNeto: 1000
  });
} catch (error) {
  console.log('Error esperado:', error.message);
  // Error: 'Factura A requiere CUIT del cliente...'
}
```

---

## ✅ Criterios de Aceptación para Merge

### Bloqueantes (CRÍTICOS)
- [ ] Test 1.1: Transferencia no registrada crea metadata correctamente
- [ ] Test 2.1: Consulta de CUIT RI devuelve `fuenteDeteccion: 'RI'`
- [ ] Test 2.4: Persona jurídica sin inscripción marca `pendienteVerificacion: true`
- [ ] Test 3.2: Payload con fecha inválida es rechazado
- [ ] Test 4.1: Emisión completa loguea `CAE OBTENIDO EXITOSAMENTE`

### No Bloqueantes (Recomendados)
- [ ] Test 1.2: `obtenerNoRegistradas()` filtra correctamente
- [ ] Test 3.1: Payload válido pasa validación sin errores
- [ ] Test 3.3: Importes inconsistentes son detectados

---

## 📊 Resultados de Tests

| Test | Estado | Observaciones |
|------|--------|---------------|
| 1.1 Transferencia no registrada | ⏳ PENDIENTE | |
| 1.2 Obtener no registradas | ⏳ PENDIENTE | |
| 1.3 Parsear metadata | ⏳ PENDIENTE | |
| 2.1 CUIT RI | ⏳ PENDIENTE | |
| 2.2 CUIT Monotributo | ⏳ PENDIENTE | |
| 2.3 CUIT CF | ⏳ PENDIENTE | |
| 2.4 CUIT SJ pendiente | ⏳ PENDIENTE | |
| 3.1 Payload válido | ⏳ PENDIENTE | |
| 3.2 Fecha inválida | ⏳ PENDIENTE | |
| 3.3 Importes inconsistentes | ⏳ PENDIENTE | |
| 3.4 Factura A sin CUIT | ⏳ PENDIENTE | |
| 4.1 Emisión válida | ⏳ PENDIENTE | |
| 4.2 Emisión inválida | ⏳ PENDIENTE | |

---

## 🔧 Instrucciones para Ejecutar Tests

### Opción A: Desde Google Apps Script Console
1. Abrir Google Sheet del sistema
2. Extensiones → Apps Script
3. Pegar código de test en consola
4. Ejecutar y verificar resultados

### Opción B: Desde Frontend
1. Abrir consola del navegador
2. Ejecutar funciones via `google.script.run`
3. Verificar respuestas

### Opción C: Tests Automatizados (Recomendado)
1. Crear archivo `test_fiscal.gs`
2. Implementar tests con framework QUnit o similar
3. Ejecutar suite completo

---

## 📝 Notas Importantes

1. **Sandbox vs Producción**:
   - Usar `environment: 'dev'` para tests
   - Verificar que modo test esté activo
   - No usar CUITs reales en sandbox

2. **Logs**:
   - Revisar Stackdriver Logging para ver logs completos
   - Filtrar por `[AUTO-DETECCION]`, `[EMISION FACTURA]`, etc.

3. **CUITs de Test**:
   - `20409378472`: CUIT de test de AfipSDK (modo dev)
   - `20149543407`: CUIT real (solo producción)

---

**Estado**: ✅ LISTO PARA TESTING  
**Próximo Paso**: Ejecutar tests en sandbox y reportar resultados  
**Merge**: Autorizado después de validar tests críticos
