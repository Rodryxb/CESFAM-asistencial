"""
Servicio de Interoperabilidad en Salud HL7 FHIR R4 (Perfil Core Chile - MINSAL / FONASA).
Construye, valida y persiste los recursos no estructurados JSONB (`Patient`, `Coverage`,
`MedicationRequest` y `OperationOutcome`) en la tabla `HL7FHIRValidationLog` con índices GIN.
"""
from typing import Optional
from django.utils import timezone
from ..models import HL7FHIRValidationLog, Paciente, RecetaMedica, Usuario
from .audit_dag_service import AuditDAGService


class HL7FHIRService:
    """
    Simulador y validador transaccional del Bus de Interoperabilidad MINSAL / FONASA
    bajo estándar HL7 FHIR Release 4 (R4-CL).
    """

    @staticmethod
    def construir_recurso_patient(paciente: Paciente) -> dict:
        """Construye un recurso HL7 FHIR R4 'Patient' conforme a la Guía de Implementación CL Core MINSAL."""
        mapa_genero = {"F": "female", "M": "male", "I": "other"}
        return {
            "resourceType": "Patient",
            "id": f"cl-core-patient-{paciente.id}",
            "meta": {
                "profile": [
                    "https://hl7chile.cl/fhir/ig/clcore/StructureDefinition/CorePacienteCl"
                ],
                "lastUpdated": timezone.now().isoformat(),
            },
            "identifier": [
                {
                    "use": "official",
                    "type": {
                        "coding": [
                            {
                                "system": "https://hl7chile.cl/fhir/ig/clcore/CodeSystem/CSTipoIdentificador",
                                "code": "01",
                                "display": "RUN - Rol Único Nacional (Módulo 11)",
                            }
                        ]
                    },
                    "system": "urn:oid:2.16.152.1.2.1.1",
                    "value": paciente.rut,
                }
            ],
            "active": paciente.activo,
            "name": [
                {
                    "use": "official",
                    "family": paciente.apellidos,
                    "given": paciente.nombres.split(),
                }
            ],
            "telecom": [{"system": "phone", "value": paciente.telefono, "use": "mobile"}],
            "gender": mapa_genero.get(paciente.sexo, "unknown"),
            "birthDate": paciente.fecha_nacimiento.isoformat(),
            "address": [
                {
                    "use": "home",
                    "text": paciente.direccion,
                    "country": "CL",
                    "extension": [
                        {
                            "url": "https://interoperabilidad.minsal.cl/fhir/StructureDefinition/SectorCESFAM",
                            "valueString": paciente.sector_cesfam,
                        }
                    ],
                }
            ],
        }

    @staticmethod
    def construir_recurso_coverage(paciente: Paciente, receta: Optional[RecetaMedica] = None) -> dict:
        """
        Construye un recurso HL7 FHIR R4 'Coverage' validando la cobertura pública FONASA
        (Copago Cero / Gratuidad APS) y garantías explícitas GES/AUGE o Crónicos.
        CERO Isapres ni aseguradoras privadas.
        """
        programa_codigo = (
            receta.programa_salud.codigo_minsal
            if receta and receta.programa_salud
            else "APS-FOFAR-GENERAL"
        )
        programa_nombre = (
            receta.programa_salud.nombre
            if receta and receta.programa_salud
            else "Fondo de Farmacia para Enfermedades Crónicas No Transmisibles (FOFAR)"
        )
        return {
            "resourceType": "Coverage",
            "id": f"fonasa-coverage-{paciente.rut}",
            "status": "active" if paciente.activo else "cancelled",
            "type": {
                "coding": [
                    {
                        "system": "https://interoperabilidad.minsal.cl/fhir/CodeSystem/PrevisionSaludPublica",
                        "code": f"FONASA-{paciente.tramo_fonasa}",
                        "display": f"Fondo Nacional de Salud - Tramo {paciente.tramo_fonasa} (Sector Público)",
                    }
                ]
            },
            "beneficiary": {
                "reference": f"Patient/cl-core-patient-{paciente.id}",
                "identifier": {"system": "urn:oid:2.16.152.1.2.1.1", "value": paciente.rut},
            },
            "payor": [
                {
                    "identifier": {"system": "urn:oid:2.16.152.1.10.1", "value": "61603000-0"},
                    "display": "FONASA - Fondo Nacional de Salud (Ministerio de Salud de Chile)",
                }
            ],
            "class": [
                {
                    "type": {"coding": [{"code": "tramo-fonasa"}]},
                    "value": paciente.tramo_fonasa,
                    "name": f"Tramo FONASA {paciente.tramo_fonasa} - Copago Cero Red Pública",
                },
                {
                    "type": {"coding": [{"code": "programa-minsal"}]},
                    "value": programa_codigo,
                    "name": programa_nombre,
                },
            ],
            "costToBeneficiary": [
                {
                    "type": {"text": "Dispensación Gratuita Atención Primaria de Salud (APS)"},
                    "valueMoney": {"value": 0, "currency": "CLP"},
                }
            ],
        }

    @staticmethod
    def construir_recurso_medication_request(
        paciente: Paciente,
        receta: Optional[RecetaMedica] = None,
    ) -> dict:
        """Construye un recurso HL7 FHIR R4 'MedicationRequest' para la prescripción clínica."""
        if not receta:
            return {
                "resourceType": "MedicationRequest",
                "status": "completed",
                "intent": "order",
                "subject": {"reference": f"Patient/cl-core-patient-{paciente.id}"},
                "note": [{"text": "Validación preventiva de cobertura sin receta específica adjunta."}],
            }

        items_prescritos = []
        for det in receta.detalles.select_related("medicamento").all():
            items_prescritos.append(
                {
                    "codigo_cenabast": det.medicamento.codigo_cenabast,
                    "codigo_atc": det.medicamento.codigo_atc,
                    "nombre_generico": det.medicamento.nombre_generico,
                    "concentracion": det.medicamento.concentracion,
                    "es_controlado_isp": det.medicamento.es_controlado,
                    "tipo_controlado": det.medicamento.tipo_controlado,
                    "posologia": det.posologia,
                    "cantidad_prescrita": det.cantidad_prescrita,
                    "saldo_pendiente": det.saldo_pendiente,
                }
            )

        return {
            "resourceType": "MedicationRequest",
            "id": f"minsal-medreq-{receta.folio_receta}",
            "identifier": [
                {
                    "system": "https://snre.minsal.cl/folio-receta",
                    "value": receta.folio_receta,
                }
            ],
            "status": "active" if receta.esta_vigente else "completed",
            "intent": "order",
            "category": [
                {
                    "coding": [
                        {
                            "system": "https://interoperabilidad.minsal.cl/fhir/CodeSystem/TipoReceta",
                            "code": receta.tipo_receta,
                            "display": receta.get_tipo_receta_display(),
                        }
                    ]
                }
            ],
            "subject": {
                "reference": f"Patient/cl-core-patient-{paciente.id}",
                "display": paciente.nombre_completo,
            },
            "authoredOn": receta.fecha_emision.isoformat(),
            "requester": {
                "identifier": {
                    "system": "urn:oid:2.16.152.1.2.1.1",
                    "value": receta.medico_prescriptor_rut,
                },
                "display": receta.medico_prescriptor_nombre,
            },
            "reasonCode": [{"text": receta.diagnostico_cie10}],
            "dispenseRequest": {
                "validityPeriod": {
                    "start": receta.fecha_emision.isoformat(),
                    "end": receta.fecha_vencimiento.isoformat(),
                },
                "containedMedications": items_prescritos,
            },
        }

    @classmethod
    def validar_y_registrar_interoperabilidad(
        cls,
        *,
        paciente: Paciente,
        receta: Optional[RecetaMedica] = None,
        actor_user: Optional[Usuario] = None,
    ) -> HL7FHIRValidationLog:
        """
        Ejecuta la validación de interoperabilidad con MINSAL/FONASA, almacena los recursos
        no estructurados JSONB (`Patient`, `Coverage`, `MedicationRequest`) con índices GIN
        y registra el evento en el grafo de auditoría inmutable `ImmutableAuditDAG`.
        """
        patient_res = cls.construir_recurso_patient(paciente)
        coverage_res = cls.construir_recurso_coverage(paciente, receta)
        medreq_res = cls.construir_recurso_medication_request(paciente, receta)

        cobertura_ok = paciente.activo and (receta.esta_vigente if receta else True)
        estado = (
            HL7FHIRValidationLog.EstadoValidacionFHIR.VALIDADO
            if cobertura_ok
            else HL7FHIRValidationLog.EstadoValidacionFHIR.OBSERVADO
        )

        outcome_res = {
            "resourceType": "OperationOutcome",
            "issue": [
                {
                    "severity": "information" if cobertura_ok else "warning",
                    "code": "informational" if cobertura_ok else "business-rule",
                    "diagnostics": (
                        f"Paciente RUN {paciente.rut} validado exitosamente en FONASA Tramo "
                        f"{paciente.tramo_fonasa} con beneficio de dispensación gratuita 100% en CESFAM."
                    ),
                }
            ],
        }

        fhir_log = HL7FHIRValidationLog.objects.create(
            paciente=paciente,
            receta=receta,
            tramo_fonasa_confirmado=paciente.tramo_fonasa,
            cobertura_gratuita_confirmada=cobertura_ok,
            estado_validacion=estado,
            patient_resource=patient_res,
            coverage_resource=coverage_res,
            medication_request_resource=medreq_res,
            operation_outcome_resource=outcome_res,
        )

        AuditDAGService.registrar_evento(
            action_type="VALIDACION_BUS_HL7_FHIR_MINSAL",
            entity_type="HL7FHIRValidationLog",
            entity_id=fhir_log.transaction_uuid,
            actor_user=actor_user,
            payload={
                "paciente_rut": paciente.rut,
                "tramo_fonasa": paciente.tramo_fonasa,
                "folio_receta": receta.folio_receta if receta else None,
                "estado_validacion_fhir": estado,
                "fhir_resources_persisted": ["Patient", "Coverage", "MedicationRequest"],
            },
        )
        return fhir_log
