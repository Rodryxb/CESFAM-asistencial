"""
Validadores normativos para el Sistema Web de Gestión Farmacia Asistencial CESFAM.
Incluye el algoritmo oficial Módulo 11 para validación de Rol Único Tributario (RUT) chileno
de Usuarios institucionales, Pacientes beneficiarios, Médicos prescriptores y Terceros autorizados.
"""
import hashlib
import re
from django.core.exceptions import ValidationError


def calcular_dv_modulo_11(cuerpo_numerico: str) -> str:
    """
    Calcula el dígito verificador (DV) de un RUT chileno mediante el algoritmo Módulo 11.
    Secuencia multiplicadora de derecha a izquierda: 2, 3, 4, 5, 6, 7.
    """
    if not cuerpo_numerico or not cuerpo_numerico.isdigit():
        raise ValidationError("El cuerpo del RUT debe contener exclusivamente dígitos numéricos.")

    factores = [2, 3, 4, 5, 6, 7]
    suma = 0
    for idx, digito in enumerate(reversed(cuerpo_numerico)):
        factor = factores[idx % len(factores)]
        suma += int(digito) * factor

    resto = 11 - (suma % 11)
    if resto == 11:
        return "0"
    if resto == 10:
        return "K"
    return str(resto)


def normalizar_rut_chileno(valor: str) -> str:
    """
    Normaliza cualquier representación de RUT chileno al formato estándar 'XXXXXXXX-DV'
    (sin puntos, con guion y dígito verificador en mayúscula).
    """
    if not valor:
        return ""
    limpio = re.sub(r"[^0-9kK]", "", str(valor).strip()).upper()
    if len(limpio) < 2:
        return valor.strip().upper()
    cuerpo, dv = limpio[:-1], limpio[-1]
    return f"{int(cuerpo)}-{dv}" if cuerpo.isdigit() else valor.strip().upper()


def validar_rut_chileno(valor: str) -> None:
    """
    Validador de Django para RUT chileno aplicando estrictamente el algoritmo Módulo 11.
    Lanza ValidationError si el formato o el dígito verificador es inválido.
    """
    if not valor or not str(valor).strip():
        raise ValidationError("El RUT no puede estar vacío.")

    limpio = re.sub(r"[^0-9kK]", "", str(valor).strip()).upper()
    if len(limpio) < 7 or len(limpio) > 10:
        raise ValidationError(
            f"El RUT '{valor}' tiene una longitud inválida. Ejemplo válido: 12345678-5."
        )

    cuerpo, dv_ingresado = limpio[:-1], limpio[-1]
    if not cuerpo.isdigit() or int(cuerpo) < 100000:
        raise ValidationError(f"El cuerpo numérico del RUT '{valor}' no es válido.")

    dv_calculado = calcular_dv_modulo_11(cuerpo)
    if dv_ingresado != dv_calculado:
        raise ValidationError(
            f"RUT chileno inválido ('{valor}'): según Módulo 11 el dígito verificador "
            f"esperado para {cuerpo} es '{dv_calculado}', pero se recibió '{dv_ingresado}'."
        )


def cifrar_dato_sensible_ley19628(texto_plano: str, salt: str = "CESFAM-LEY19628-AES256") -> str:
    """
    Cifra simétricamente datos clínicos sensibles en reposo mediante AES-256 autenticado
    en cumplimiento estricto de la Ley N° 19.628 sobre Protección de la Vida Privada (RNF-01).
    """
    if not texto_plano:
        return ""
    from .security.crypto_aes256 import AES256DataCipher

    return AES256DataCipher.encrypt(texto_plano)


def descifrar_dato_sensible_ley19628(criptograma: str) -> str:
    """Descifra un campo protegido por AES-256 bajo Ley N° 19.628 para roles clínicos autorizados."""
    if not criptograma:
        return ""
    from .security.crypto_aes256 import AES256DataCipher

    return AES256DataCipher.decrypt(criptograma)
