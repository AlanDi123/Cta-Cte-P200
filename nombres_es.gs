/**
 * ============================================================================
 * NOMBRES EN ESPAÑOL — comparación tolerante para el OCR
 * ============================================================================
 *
 * Por qué existe: el OCR casi nunca lee un nombre perfecto, y el comparador
 * anterior (Levenshtein sobre la cadena ENTERA) fallaba justo en lo habitual:
 *
 *   - El libro dice "G0NZALES" y el padrón tiene "GONZALEZ JUAN". Comparadas
 *     enteras, la distancia es enorme y no sugería nada.
 *   - "JUAN GONZALEZ" contra "GONZALEZ JUAN": mismas palabras, otro orden.
 *   - "Gonsales" contra "Gonzalez": suenan igual, se escriben distinto.
 *
 * Este módulo compara PALABRA POR PALABRA, sin importar el orden, con tres
 * ideas:
 *
 *   1. FONÉTICA DEL ESPAÑOL RIOPLATENSE: b/v/w, s/z/c+e,i (seseo), ll/y
 *      (yeísmo), h muda, g+e,i = j, qu/k/c = k, ch, y dobles que se colapsan.
 *      Tolera además grafías de otras lenguas habituales en los apellidos
 *      de Argentina: tx (vasco), tz, gn / ny, ph, gh (italiano).
 *   2. CONFUSIONES DE LECTURA: O/0/Q/D, I/L/1, U/V, rn/m, cl/d... cuestan
 *      menos que una sustitución cualquiera.
 *   3. PESO POR RAREZA: "GONZALEZ" aparece en muchos clientes y "ECHEVERRIA"
 *      en uno solo; acertar el rarísimo vale más que acertar el común.
 *
 * Y una regla de seguridad que importa más que la precisión: aceptar sola
 * una coincidencia (estado 'alta') exige score alto Y ventaja clara sobre la
 * segunda mejor. Si hay duda, se SUGIERE y decide la persona. Cargar una
 * deuda al cliente equivocado es mucho peor que pedir un toque de más.
 *
 * COPIA IDÉNTICA en SistemaSolVerde.html, entre los marcadores
 * NOMBRES_ES_INICIO y NOMBRES_ES_FIN. Si se edita una, hay que editar la
 * otra: el servidor y el navegador tienen que decidir igual. El flujo de
 * despliegue verifica que sean idénticas.
 * ============================================================================
 */

// ===NOMBRES_ES_INICIO===
const NombresEs = (function() {
  'use strict';

  const HONORIFICOS = {
    SR: 1, SRA: 1, SRES: 1, SRTA: 1, SRS: 1, DR: 1, DRA: 1, DON: 1, DONA: 1,
    ING: 1, LIC: 1, ARQ: 1, HNOS: 1, HNO: 1, HERMANOS: 1, FLIA: 1, FAMILIA: 1,
    SA: 1, SRL: 1, SAS: 1, CIA: 1, SOC: 1, SOCIEDAD: 1
  };
  const CONJUNCIONES = { Y: 1, E: 1 };
  // Partículas que se pegan al apellido: "DI MARCO" y "DIMARCO" son lo mismo
  const PARTICULAS = {
    DE: 1, DEL: 1, LA: 1, LAS: 1, LOS: 1, EL: 1, DA: 1, DAS: 1, DO: 1, DOS: 1,
    DI: 1, VAN: 1, VON: 1, MC: 1, MAC: 1
  };
  const DIGITO_A_LETRA = { '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G' };

  // Costo de confundir dos letras al leer. 1 = sustitución cualquiera.
  const CONFUSION = {};
  function par(a, b, costo) { CONFUSION[a + b] = costo; CONFUSION[b + a] = costo; }
  // Formas redondas, trazos verticales, curvas abiertas...
  par('O', 'Q', 0.35); par('O', 'D', 0.45); par('O', 'C', 0.5); par('O', 'G', 0.5);
  par('Q', 'G', 0.5);  par('C', 'G', 0.5);  par('D', 'Q', 0.5);
  par('I', 'L', 0.35); par('I', 'T', 0.55); par('L', 'T', 0.5); par('I', 'J', 0.5);
  par('U', 'V', 0.35); par('U', 'Y', 0.55); par('V', 'Y', 0.4);
  par('A', 'O', 0.5);  par('E', 'C', 0.5);  par('E', 'F', 0.6);
  par('M', 'N', 0.5);  par('N', 'H', 0.55); par('M', 'W', 0.55); par('N', 'R', 0.55);
  par('B', 'R', 0.6);  par('P', 'R', 0.55);
  // Suenan igual en el español rioplatense
  par('S', 'Z', 0.25); par('S', 'C', 0.25); par('Z', 'C', 0.25); par('B', 'V', 0.2);
  par('G', 'J', 0.4);  par('K', 'C', 0.25); par('K', 'Q', 0.25); par('Q', 'C', 0.35);
  par('Y', 'I', 0.3);

  function costoSustitucion(x, y) {
    if (x === y) return 0;
    const c = CONFUSION[x + y];
    return c === undefined ? 1 : c;
  }
  function costoIndel(x) {
    if (x === 'H') return 0.25;                       // la h muda se pierde y se agrega
    if (x === 'A' || x === 'E' || x === 'I' || x === 'O' || x === 'U') return 0.8;
    return 1;
  }

  /** Mayúsculas, sin acentos ni tilde de la Ñ, sin signos. D'ANGELO → DANGELO. */
  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'´`]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }

  /** G0NZALES → GONZALES. Un token que es casi todo número no es un nombre. */
  function corregirDigitos(token) {
    const letras = (token.match(/[A-Z]/g) || []).length;
    const digitos = token.length - letras;
    if (digitos === 0) return token;
    if (letras < 2 || digitos > letras) return null;
    return token.replace(/[0-9]/g, function(d) { return DIGITO_A_LETRA[d] || d; });
  }

  /**
   * Parte un nombre en palabras significativas: {t: palabra, core?: sin partícula}.
   * Saca "y", honoríficos (SR, DON, HNOS, SA...) y pega las partículas.
   */
  function tokenizar(texto) {
    const crudos = normalizar(texto).split(' ');
    const base = [];
    for (let i = 0; i < crudos.length; i++) {
      if (!crudos[i]) continue;
      const f = corregirDigitos(crudos[i]);
      if (f) base.push(f);
    }
    let util = base.filter(function(x) { return !CONJUNCIONES[x] && !HONORIFICOS[x]; });
    if (util.length === 0) util = base.filter(function(x) { return !CONJUNCIONES[x]; });
    if (util.length === 0) util = base;

    const salida = [];
    let pendiente = '';
    for (let i = 0; i < util.length; i++) {
      const x = util[i];
      if (PARTICULAS[x]) { pendiente += x; continue; }
      const tok = { t: pendiente + x };
      if (pendiente) tok.core = x;
      salida.push(tok);
      pendiente = '';
    }
    if (pendiente && salida.length === 0) salida.push({ t: pendiente });
    return salida;
  }

  // Memoria de resultados. En un padrón las mismas palabras se repiten en muchos
  // clientes (JUAN, GONZALEZ...): sin esto se recalcula lo mismo miles de veces.
  // Se vacía al llegar al tope para no crecer sin límite.
  let memoFonetica = {}, memoParecido = {}, nFonetica = 0, nParecido = 0;

  /** Clave fonética del español rioplatense (con tolerancia a grafías de otras lenguas). */
  function fonetica(token) {
    const guardada = memoFonetica[token];
    if (guardada !== undefined) return guardada;
    if (nFonetica > 20000) { memoFonetica = {}; nFonetica = 0; }
    const r = calcularFonetica(token);
    memoFonetica[token] = r; nFonetica++;
    return r;
  }

  function calcularFonetica(token) {
    // 1 = "ch", 2 = "ll"/"y" (yeísmo). Los dígitos no existen en un token ya corregido.
    const s = token
      .replace(/SCH/g, '1').replace(/TX/g, '1').replace(/CH/g, '1')
      .replace(/LL/g, '2')
      .replace(/PH/g, 'F').replace(/GH/g, 'G').replace(/TZ/g, 'S')
      .replace(/GN/g, 'N').replace(/NY/g, 'N');
    let r = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], n = s[i + 1] || '', n2 = s[i + 2] || '';
      const suave = (n === 'E' || n === 'I');
      switch (c) {
        case 'H': break;
        case 'V': case 'W': case 'B': r += 'B'; break;
        case 'Z': case 'S': r += 'S'; break;
        case 'C': r += suave ? 'S' : 'K'; break;
        case 'Q': if (n === 'U') i++; r += 'K'; break;
        case 'G':
          if (n === 'U' && (n2 === 'E' || n2 === 'I')) { i++; r += 'G'; }
          else r += suave ? 'J' : 'G';
          break;
        case 'X': r += 'KS'; break;
        case 'Y': r += ('AEIOU'.indexOf(n) > -1 && n) ? 'Y' : 'I'; break;
        case '1': r += 'X'; break;
        case '2': r += 'Y'; break;
        default: r += c;
      }
    }
    return r.replace(/(.)\1+/g, '$1');
  }

  /** Distancia de edición ponderada (con transposiciones) entre dos cadenas. */
  function distancia(a, b) {
    const n = a.length, m = b.length;
    if (n === 0) { let t = 0; for (let k = 0; k < m; k++) t += costoIndel(b[k]); return t; }
    if (m === 0) { let t = 0; for (let k = 0; k < n; k++) t += costoIndel(a[k]); return t; }
    const d = [];
    for (let i = 0; i <= n; i++) { d.push(new Array(m + 1)); }
    d[0][0] = 0;
    for (let i = 1; i <= n; i++) d[i][0] = d[i - 1][0] + costoIndel(a[i - 1]);
    for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + costoIndel(b[j - 1]);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        let v = Math.min(
          d[i - 1][j - 1] + costoSustitucion(a[i - 1], b[j - 1]),
          d[i - 1][j] + costoIndel(a[i - 1]),
          d[i][j - 1] + costoIndel(b[j - 1])
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          v = Math.min(v, d[i - 2][j - 2] + 0.7);
        }
        d[i][j] = v;
      }
    }
    return d[n][m];
  }

  function parecidoPorEdicion(a, b) {
    const largo = Math.max(a.length, b.length);
    if (largo === 0) return 1;
    const s = 1 - distancia(a, b) / largo;
    return s < 0 ? 0 : s;
  }

  /** Lecturas alternativas típicas del OCR: rn↔m, cl↔d. Solo si el patrón está. */
  function variantesDeRuido(t) {
    const v = [t];
    if (t.indexOf('RN') > -1) v.push(t.replace(/RN/g, 'M'));
    if (t.indexOf('CL') > -1) v.push(t.replace(/CL/g, 'D'));
    if (t.indexOf('VV') > -1) v.push(t.replace(/VV/g, 'W'));
    return v;
  }

  /** Parecido entre dos palabras sueltas (cadenas normalizadas): 0 a 1. */
  function parecidoTexto(a, b) {
    if (a === b) return 1;
    const clave = a + '|' + b;
    const guardado = memoParecido[clave];
    if (guardado !== undefined) return guardado;
    if (nParecido > 40000) { memoParecido = {}; nParecido = 0; }
    const r = calcularParecidoTexto(a, b);
    memoParecido[clave] = r; nParecido++;
    return r;
  }

  function calcularParecidoTexto(a, b) {
    const la = a.length, lb = b.length;
    if (la === 0 || lb === 0) return 0;
    if (la === 1 || lb === 1) {
      const corto = la === 1 ? a : b, largo = la === 1 ? b : a;
      return largo[0] === corto ? 0.5 : 0;           // inicial: "J." por JUAN
    }
    if (la <= 2 || lb <= 2) {
      const s = parecidoPorEdicion(a, b);
      return s >= 0.75 ? s * 0.9 : 0;
    }
    let mejor = parecidoPorEdicion(a, b);
    const fa = fonetica(a), fb = fonetica(b);
    if (fa === fb) {
      if (mejor < 0.93) mejor = 0.93;
    } else {
      const sf = parecidoPorEdicion(fa, fb) * 0.97;
      if (sf > mejor) mejor = sf;
    }
    // El libro suele abreviar: "HERN." por HERNANDEZ
    if (la >= 3 && la < lb && b.indexOf(a) === 0) {
      const sp = 0.55 + 0.35 * (la / lb);
      if (sp > mejor) mejor = sp;
    }
    return mejor;
  }

  /** Parecido entre dos palabras con sus variantes (sin partícula, ruido de lectura). */
  function parecidoToken(q, c) {
    const consultas = variantesDeRuido(q.t);
    if (q.core) consultas.push(q.core);
    const candidatas = [c.t];
    if (c.core) candidatas.push(c.core);
    let mejor = 0;
    for (let i = 0; i < consultas.length; i++) {
      for (let j = 0; j < candidatas.length; j++) {
        let s = parecidoTexto(consultas[i], candidatas[j]);
        if (i > 0 || j > 0) s *= 0.97;
        if (s > mejor) mejor = s;
      }
    }
    return mejor;
  }

  const PISO_PAR = 0.5;   // debajo de esto, dos palabras no cuentan como la misma

  /**
   * Puntúa una consulta contra un candidato, de 0 a 1.
   * @param {Array} Q - tokens de la consulta
   * @param {{tokens: Array, pesos: Array<number>}} cand
   */
  function puntuar(Q, cand) {
    const C = cand.tokens;
    if (Q.length === 0 || C.length === 0) return 0;

    // Asignación voraz uno a uno, de mayor a menor parecido
    const pares = [];
    for (let i = 0; i < Q.length; i++) {
      for (let j = 0; j < C.length; j++) {
        const s = parecidoToken(Q[i], C[j]);
        if (s >= PISO_PAR) pares.push({ i: i, j: j, s: s });
      }
    }
    pares.sort(function(x, y) { return y.s - x.s; });
    const usadoQ = {}, usadoC = {};
    let sumaQ = 0, sumaC = 0;
    for (let k = 0; k < pares.length; k++) {
      const p = pares[k];
      if (usadoQ[p.i] || usadoC[p.j]) continue;
      usadoQ[p.i] = true; usadoC[p.j] = true;
      sumaQ += p.s;
      sumaC += p.s * cand.pesos[p.j];
    }
    let pesoTotal = 0;
    for (let j = 0; j < C.length; j++) pesoTotal += cand.pesos[j];

    const cubreConsulta = sumaQ / Q.length;
    const cubreCandidato = pesoTotal > 0 ? sumaC / pesoTotal : 0;
    let score = 0.6 * cubreConsulta + 0.4 * cubreCandidato;

    // Palabras partidas o pegadas por el OCR: "MAR TINEZ" contra "MARTINEZ"
    if (Q.length >= 2 || C.length >= 2) {
      const cq = Q.map(function(x) { return x.t; }).join('');
      const cc = C.map(function(x) { return x.t; }).join('');
      const s = parecidoTexto(cq, cc) * 0.95;
      if (s > score) score = s;
    }
    return score > 1 ? 1 : score;
  }

  /** Prepara el padrón: tokeniza cada nombre y pesa cada palabra por su rareza. */
  function indexar(nombres) {
    const filas = [];
    const df = {};
    const vistos = {};
    for (let i = 0; i < nombres.length; i++) {
      const nombre = String(nombres[i] == null ? '' : nombres[i]).trim();
      if (!nombre || vistos[nombre]) continue;
      vistos[nombre] = true;
      const tokens = tokenizar(nombre);
      if (tokens.length === 0) continue;
      filas.push({ nombre: nombre, norm: normalizar(nombre), tokens: tokens });
      const unicos = {};
      tokens.forEach(function(t) { unicos[t.t] = true; });
      Object.keys(unicos).forEach(function(k) { df[k] = (df[k] || 0) + 1; });
    }
    const N = filas.length;
    filas.forEach(function(f) {
      f.pesos = f.tokens.map(function(t) { return 1 + Math.log((N + 1) / ((df[t.t] || 0) + 1)); });
    });
    // Índice invertido: palabra → filas que la contienen. Permite puntuar solo
    // los clientes que comparten alguna palabra parecida, en vez de todo el padrón.
    const porPalabra = {};
    filas.forEach(function(f, i) {
      const vistas = {};
      f.tokens.forEach(function(t) {
        [t.t, t.core].forEach(function(w) {
          if (w && !vistas[w]) { vistas[w] = true; (porPalabra[w] = porPalabra[w] || []).push(i); }
        });
      });
    });
    const palabras = Object.keys(porPalabra);
    const huellas = {};
    palabras.forEach(function(w) { huellas[w] = huella(w); });
    return { filas: filas, N: N, porPalabra: porPalabra, palabras: palabras, huellas: huellas };
  }

  /** Pares de letras de una palabra, tal cual y en su forma fonética. */
  function huella(palabra) {
    const h = {};
    const f = fonetica(palabra);
    for (let i = 0; i < palabra.length - 1; i++) h['r' + palabra.substr(i, 2)] = 1;
    for (let i = 0; i < f.length - 1; i++) h['f' + f.substr(i, 2)] = 1;
    return h;
  }

  function comparten(h1, h2) {
    for (const k in h1) { if (h2[k]) return true; }
    return false;
  }

  /** Filas del padrón que comparten al menos una palabra parecida con la consulta. */
  function filasCandidatas(Q, indice) {
    const consultas = [];
    Q.forEach(function(q) {
      variantesDeRuido(q.t).forEach(function(v) { consultas.push(v); });
      if (q.core) consultas.push(q.core);
    });
    if (Q.length >= 2) consultas.push(Q.map(function(x) { return x.t; }).join(''));
    const marcadas = {};
    const lista = [];
    for (let c = 0; c < consultas.length; c++) {
      const hc = huella(consultas[c]);
      for (let w = 0; w < indice.palabras.length; w++) {
        const palabra = indice.palabras[w];
        // Dos palabras parecidas casi siempre comparten algún par de letras: se
        // descartan las demás sin hacer la comparación completa, que es la cara.
        // Las cortas (hasta 3 letras) no se filtran: ahí un solo error cambia todos los pares.
        if (consultas[c].length > 3 && palabra.length > 3 && !comparten(hc, indice.huellas[palabra])) continue;
        if (parecidoTexto(consultas[c], palabra) < PISO_PAR) continue;
        const filas = indice.porPalabra[palabra];
        for (let k = 0; k < filas.length; k++) {
          if (!marcadas[filas[k]]) { marcadas[filas[k]] = true; lista.push(filas[k]); }
        }
      }
    }
    return lista;
  }

  /**
   * Candidatos del padrón para un texto leído, de mejor a peor.
   * @returns {Array<{nombre: string, score: number, exacto: boolean}>}
   */
  function buscar(consulta, indice, maximo, minimo) {
    const Q = tokenizar(consulta);
    if (Q.length === 0 || !indice || !indice.filas) return [];
    const piso = (minimo === undefined) ? PISO_PAR : minimo;
    const salida = [];
    const candidatas = filasCandidatas(Q, indice);
    for (let k = 0; k < candidatas.length; k++) {
      const f = indice.filas[candidatas[k]];
      const score = puntuar(Q, f);
      if (score >= piso) salida.push({ nombre: f.nombre, score: score, exacto: score >= 0.999 });
    }
    salida.sort(function(a, b) { return b.score - a.score; });
    return salida.slice(0, maximo || 5);
  }

  /**
   * Decide qué hacer con un nombre leído (puede haber varias lecturas del
   * mismo renglón, de distintos motores o reintentos).
   *
   *   alta  → se acepta sola: score alto Y ventaja clara sobre la segunda
   *   media → se sugiere; decide la persona
   *   baja  → sin coincidencia (probablemente un cliente nuevo)
   */
  function decidir(lecturas, indice, opciones) {
    const opc = opciones || {};
    const umbral = (opc.umbralAuto === undefined) ? 0.90 : opc.umbralAuto;
    const margen = (opc.margen === undefined) ? 0.15 : opc.margen;

    const mejorPorNombre = {};
    const vistas = {};
    const mejorDeCadaLectura = [];
    (lecturas || []).forEach(function(l) {
      const clave = normalizar(l);
      if (!clave || vistas[clave]) return;
      vistas[clave] = true;
      const res = buscar(l, indice, 6);
      if (res.length) mejorDeCadaLectura.push(res[0]);
      res.forEach(function(r) {
        if (!(mejorPorNombre[r.nombre] >= r.score)) mejorPorNombre[r.nombre] = r.score;
      });
    });

    const ranking = Object.keys(mejorPorNombre).map(function(n) {
      return { nombre: n, score: mejorPorNombre[n] };
    }).sort(function(a, b) { return b.score - a.score; });

    if (ranking.length === 0 || ranking[0].score < 0.55) {
      return { estado: 'baja', mejor: null, sugerencias: [], score: ranking.length ? ranking[0].score : 0, segundo: 0,
               conflicto: false, empate: false };
    }
    const m = ranking[0], s2 = ranking[1];
    // Con varias lecturas del mismo renglon, el mejor puntaje por nombre puede salir
    // de lecturas distintas. Si dos lecturas apuntan a CLIENTES DISTINTOS y las dos
    // calzan bien, no hay una lectura confiable: decide la persona.
    const conflicto = mejorDeCadaLectura.some(function(r) { return r.nombre !== m.nombre && r.score >= 0.85; });
    // Dos clientes igual de buenos: releer no ayuda si la hoja no trae el dato que los distingue
    const empate = !!s2 && m.score >= 0.70 && (m.score - s2.score) < 0.03;
    // Un nombre EXACTO y único se acepta siempre (aunque exista "GONZALEZ JUAN
    // CARLOS" parecido). Si no es exacto, hace falta ventaja clara sobre el
    // segundo: con dos clientes casi iguales (PAZ / PAEZ) decide la persona.
    const exactoUnico = m.score >= 0.999 && (!s2 || s2.score < 0.999);
    const clara = !s2 || (m.score - s2.score >= margen);
    const estado = (((m.score >= umbral && clara) || exactoUnico) && !conflicto) ? 'alta' : 'media';
    const piso = Math.max(0.5, m.score - 0.3);
    return {
      estado: estado,
      mejor: m,
      sugerencias: ranking.filter(function(r) { return r.score >= piso; }).slice(0, 3).map(function(r) { return r.nombre; }),
      score: m.score,
      segundo: s2 ? s2.score : 0,
      conflicto: conflicto,
      empate: empate
    };
  }

  /** Parecido entre dos nombres libres (sin padrón), de 0 a 1. Simétrico. */
  function parecidoNombres(a, b) {
    const A = tokenizar(a), B = tokenizar(b);
    if (A.length === 0 || B.length === 0) return 0;
    const unos = function(T) { return { tokens: T, pesos: T.map(function() { return 1; }) }; };
    return Math.max(puntuar(A, unos(B)), puntuar(B, unos(A)));
  }

  return {
    normalizar: normalizar,
    tokenizar: tokenizar,
    fonetica: fonetica,
    distancia: distancia,
    parecidoTexto: parecidoTexto,
    puntuar: puntuar,
    indexar: indexar,
    buscar: buscar,
    decidir: decidir,
    parecidoNombres: parecidoNombres
  };
})();
// ===NOMBRES_ES_FIN===
