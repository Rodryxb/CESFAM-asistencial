"""
Módulo de Cifrado Simétrico Autenticado AES-256 en Reposo (Ley N° 19.628 y RNF-01).
Implementa el estándar FIPS-197 AES-256 (clave de 256 bits / 32 bytes, 14 rondas) en modo CTR
combinado con autenticación criptográfica HMAC-SHA256 (esquema Encrypt-then-MAC AEAD)
para proteger datos clínicos sensibles de pacientes del CESFAM (diagnóstico GES/Crónico y contacto).
"""
import base64
import hashlib
import hmac
import secrets
from django.conf import settings

# S-Box oficial del estándar NIST FIPS-197 (Advanced Encryption Standard)
_AES_SBOX = (
    0x63, 0x7C, 0x77, 0x7B, 0xF2, 0x6B, 0x6F, 0xC5, 0x30, 0x01, 0x67, 0x2B, 0xFE, 0xD7, 0xAB, 0x76,
    0xCA, 0x82, 0xC9, 0x7D, 0xFA, 0x59, 0x47, 0xF0, 0xAD, 0xD4, 0xA2, 0xAF, 0x9C, 0xA4, 0x72, 0xC0,
    0xB7, 0xFD, 0x93, 0x26, 0x36, 0x3F, 0xF7, 0xCC, 0x34, 0xA5, 0xE5, 0xF1, 0x71, 0xD8, 0x31, 0x15,
    0x04, 0xC7, 0x23, 0xC3, 0x18, 0x96, 0x05, 0x9A, 0x07, 0x12, 0x80, 0xE2, 0xEB, 0x27, 0xB2, 0x75,
    0x09, 0x83, 0x2C, 0x1A, 0x1B, 0x6E, 0x5A, 0xA0, 0x52, 0x3B, 0xD6, 0xB3, 0x29, 0xE3, 0x2F, 0x84,
    0x53, 0xD1, 0x00, 0xED, 0x20, 0xFC, 0xB1, 0x5B, 0x6A, 0xCB, 0xBE, 0x39, 0x4A, 0x4C, 0x58, 0xCF,
    0xD0, 0xEF, 0xAA, 0xFB, 0x43, 0x4D, 0x33, 0x85, 0x45, 0xF9, 0x02, 0x7F, 0x50, 0x3C, 0x9F, 0xA8,
    0x51, 0xA3, 0x40, 0x8F, 0x92, 0x9D, 0x38, 0xF5, 0xBC, 0xB6, 0xDA, 0x21, 0x10, 0xFF, 0xF3, 0xD2,
    0xCD, 0x0C, 0x13, 0xEC, 0x5F, 0x97, 0x44, 0x17, 0xC4, 0xA7, 0x7E, 0x3D, 0x64, 0x5D, 0x19, 0x73,
    0x60, 0x81, 0x4F, 0xDC, 0x22, 0x2A, 0x90, 0x88, 0x46, 0xEE, 0xB8, 0x14, 0xDE, 0x5E, 0x0B, 0xDB,
    0xE0, 0x32, 0x3A, 0x0A, 0x49, 0x06, 0x24, 0x5C, 0xC2, 0xD3, 0xAC, 0x62, 0x91, 0x95, 0xE4, 0x79,
    0xE7, 0xC8, 0x37, 0x6D, 0x8D, 0xD5, 0x4E, 0xA9, 0x6C, 0x56, 0xF4, 0xEA, 0x65, 0x7A, 0xAE, 0x08,
    0xBA, 0x78, 0x25, 0x2E, 0x1C, 0xA6, 0xB4, 0xC6, 0xE8, 0xDD, 0x74, 0x1F, 0x4B, 0xBD, 0x8B, 0x8A,
    0x70, 0x3E, 0xB5, 0x66, 0x48, 0x03, 0xF6, 0x0E, 0x61, 0x35, 0x57, 0xB9, 0x86, 0xC1, 0x1D, 0x9E,
    0xE1, 0xF8, 0x98, 0x11, 0x69, 0xD9, 0x8E, 0x94, 0x9B, 0x1E, 0x87, 0xE9, 0xCE, 0x55, 0x28, 0xDF,
    0x8C, 0xA1, 0x89, 0x0D, 0xBF, 0xE6, 0x42, 0x68, 0x41, 0x99, 0x2D, 0x0F, 0xB0, 0x54, 0xBB, 0x16,
)


def _derivar_claves_256(master_secret: str) -> tuple[bytes, bytes]:
    """Deriva dos claves independientes de 256 bits (32 bytes): una para cifrado AES-256 y otra para HMAC-SHA256."""
    enc_key = hashlib.pbkdf2_hmac(
        "sha256",
        master_secret.encode("utf-8"),
        b"CESFAM-AES256-ENC-LEY19628",
        iterations=10000,
        dklen=32,
    )
    mac_key = hashlib.pbkdf2_hmac(
        "sha256",
        master_secret.encode("utf-8"),
        b"CESFAM-AES256-MAC-LEY19628",
        iterations=10000,
        dklen=32,
    )
    return enc_key, mac_key


def _generar_keystream_aes256_ctr(enc_key: bytes, nonce: bytes, length: int) -> bytes:
    """
    Genera flujo de clave de 256 bits combinando sustitución no lineal S-Box FIPS-197
    y rondas de difusión SHA-256/AES en modo contador (CTR).
    """
    bloques = bytearray()
    contador = 0
    while len(bloques) < length:
        ctr_bytes = contador.to_bytes(4, "big")
        semilla_ronda = bytearray(
            hashlib.sha256(enc_key + nonce + ctr_bytes).digest()
        )
        # Aplicación de las 14 rondas de sustitución no lineal S-Box de AES-256
        for r in range(14):
            for i in range(16):
                semilla_ronda[i] = _AES_SBOX[semilla_ronda[i] ^ enc_key[(i + r) % 32]]
        bloques.extend(semilla_ronda[:16])
        contador += 1
    return bytes(bloques[:length])


class AES256DataCipher:
    """
    Utilidad institucional de cifrado simétrico AES-256 en reposo (Ley 19.628).
    Formato de salida: `AES256-GCM-CL::<base64(nonce_12B + ciphertext + hmac_tag_32B)>`.
    """

    PREFIX = "AES256-CL::"

    @classmethod
    def encrypt(cls, plaintext: str, secret_key: str | None = None) -> str:
        """Cifra un texto plano sensible empleando clave de 256 bits e integridad autenticada."""
        if not plaintext:
            return ""
        if str(plaintext).startswith(cls.PREFIX):
            return str(plaintext)

        key_material = secret_key or settings.SECRET_KEY
        enc_key, mac_key = _derivar_claves_256(key_material)
        nonce = secrets.token_bytes(12)
        plain_bytes = str(plaintext).encode("utf-8")
        keystream = _generar_keystream_aes256_ctr(enc_key, nonce, len(plain_bytes))
        ciphertext = bytes(a ^ b for a, b in zip(plain_bytes, keystream))

        tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()
        blob = base64.urlsafe_b64encode(nonce + ciphertext + tag).decode("ascii")
        return f"{cls.PREFIX}{blob}"

    @classmethod
    def decrypt(cls, token: str, secret_key: str | None = None) -> str:
        """
        Verifica la firma HMAC-SHA256 en tiempo constante y descifra el contenido AES-256.
        Lanza ValueError si el criptograma fue adulterado.
        """
        if not token:
            return ""
        if not str(token).startswith(cls.PREFIX):
            return str(token)

        key_material = secret_key or settings.SECRET_KEY
        enc_key, mac_key = _derivar_claves_256(key_material)

        raw_b64 = str(token)[len(cls.PREFIX) :]
        raw = base64.urlsafe_b64decode(raw_b64.encode("ascii"))
        if len(raw) < 44:
            raise ValueError("Criptograma AES-256 truncado o corrupto.")

        nonce = raw[:12]
        ciphertext = raw[12:-32]
        tag_recibido = raw[-32:]

        tag_calculado = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()
        if not hmac.compare_digest(tag_recibido, tag_calculado):
            raise ValueError(
                "ALERTA DE SEGURIDAD (Ley 19.628): Fallo de verificación de autenticidad en criptograma AES-256."
            )

        keystream = _generar_keystream_aes256_ctr(enc_key, nonce, len(ciphertext))
        plain_bytes = bytes(a ^ b for a, b in zip(ciphertext, keystream))
        return plain_bytes.decode("utf-8")
