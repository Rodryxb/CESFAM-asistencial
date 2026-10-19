/**
 * Validador Chileno de RUT mediante Algoritmo Módulo 11 (Frontend TypeScript).
 * Simétrico al validador de Django en `backend/core/validators.py`.
 */

export function calcularDVModulo11(cuerpoNumerico: string): string {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  const reverso = cuerpoNumerico.split("").reverse();

  for (let i = 0; i < reverso.length; i++) {
    suma += parseInt(reverso[i], 10) * factores[i % factores.length];
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

export function validarRutChilenoModulo11(rut: string): {
  esValido: boolean;
  rutNormalizado: string;
  mensajeError?: string;
} {
  const limpio = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 7 || limpio.length > 10) {
    return {
      esValido: false,
      rutNormalizado: rut,
      mensajeError: "Longitud de RUT inválida (ej: 12345678-5).",
    };
  }

  const cuerpo = limpio.slice(0, -1);
  const dvIngresado = limpio.slice(-1);

  if (!/^\d+$/.test(cuerpo)) {
    return {
      esValido: false,
      rutNormalizado: rut,
      mensajeError: "El cuerpo del RUT debe ser numérico.",
    };
  }

  const dvEsperado = calcularDVModulo11(cuerpo);
  if (dvIngresado !== dvEsperado) {
    return {
      esValido: false,
      rutNormalizado: `${cuerpo}-${dvIngresado}`,
      mensajeError: `Dígito verificador inválido según Módulo 11 (esperado: -${dvEsperado}).`,
    };
  }

  return {
    esValido: true,
    rutNormalizado: `${parseInt(cuerpo, 10)}-${dvEsperado}`,
  };
}
