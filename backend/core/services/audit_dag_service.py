"""
Servicio de Trazabilidad Avanzada con Tecnología DAG (Directed Acyclic Graph)
bajo Norma Sanitaria ALCOA+ del Instituto de Salud Pública (ISP).
"""
from typing import Any, Dict, Optional
from django.utils import timezone
from ..models import ImmutableAuditDAG, Usuario


class AuditDAGService:
    """
    Gestiona la escritura append-only y la verificación criptográfica SHA-256
    de la tabla no estructurada `ImmutableAuditDAG` (JSONB con índice GIN).
    """

    @staticmethod
    def registrar_evento(
        *,
        action_type: str,
        entity_type: str,
        entity_id: Any,
        payload: Dict[str, Any],
        actor_user: Optional[Usuario] = None,
        ip_address: str = "127.0.0.1",
    ) -> ImmutableAuditDAG:
        """
        Registra un nuevo nodo inmutable en el DAG de auditoría encadenado por SHA-256
        al registro previo inmediato.
        """
        actor_rut = actor_user.rut if actor_user else "SISTEMA-AUTOMATICO"
        actor_role = actor_user.codigo_rol if actor_user else "SYSTEM_DAEMON"

        enriquecido = {
            **payload,
            "_alcoa_atribuible_rut": actor_rut,
            "_alcoa_atribuible_rol": actor_role,
            "_alcoa_timestamp_iso": timezone.now().isoformat(),
            "_alcoa_standard": "ISP-CHILE-ALCOA-PLUS",
        }

        nodo = ImmutableAuditDAG(
            actor_user=actor_user,
            actor_rut=actor_rut,
            actor_role=actor_role,
            ip_address=ip_address,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=str(entity_id),
            payload_json=enriquecido,
        )
        nodo.save()
        return nodo

    @staticmethod
    def verificar_integridad_cadena() -> Dict[str, Any]:
        """
        Recorre íntegramente los nodos de `ImmutableAuditDAG` verificando:
        1. Que el primer nodo apunte al hash génesis ('0'*64).
        2. Que el `previous_hash` de cada nodo coincida exactamente con el `current_hash` del nodo anterior.
        3. Que el recálculo criptográfico SHA-256 del contenido JSONB coincida con `current_hash`.
        """
        nodos = list(ImmutableAuditDAG.objects.order_by("id"))
        hash_esperado_previo = ImmutableAuditDAG.GENESIS_HASH
        errores = []

        for idx, nodo in enumerate(nodos):
            if nodo.previous_hash != hash_esperado_previo:
                errores.append(
                    {
                        "nodo_id": nodo.id,
                        "event_uuid": str(nodo.event_uuid),
                        "tipo_error": "RUPTURA_CADENA_PREVIOUS_HASH",
                        "esperado": hash_esperado_previo,
                        "encontrado": nodo.previous_hash,
                    }
                )

            timestamp_iso = nodo.payload_json.get(
                "_alcoa_timestamp_iso",
                nodo.timestamp.isoformat(),
            )
            hash_recalculado = ImmutableAuditDAG.calcular_hash_sha256(
                event_uuid=str(nodo.event_uuid),
                timestamp_iso=timestamp_iso,
                actor_rut=nodo.actor_rut,
                actor_role=nodo.actor_role,
                action_type=nodo.action_type,
                entity_type=nodo.entity_type,
                entity_id=str(nodo.entity_id),
                payload_json=nodo.payload_json,
                previous_hash=nodo.previous_hash,
            )

            if hash_recalculado != nodo.current_hash:
                errores.append(
                    {
                        "nodo_id": nodo.id,
                        "event_uuid": str(nodo.event_uuid),
                        "tipo_error": "ADULTERACION_PAYLOAD_SHA256",
                        "esperado": hash_recalculado,
                        "encontrado": nodo.current_hash,
                    }
                )

            hash_esperado_previo = nodo.current_hash

        return {
            "normativa": "ALCOA+ / Instituto de Salud Pública de Chile (ISP)",
            "algoritmo_criptografico": "SHA-256 Chained DAG",
            "total_nodos_auditados": len(nodos),
            "cadena_integra": len(errores) == 0,
            "ultimo_hash_verificado": hash_esperado_previo,
            "anomalia_detectada": errores,
        }
