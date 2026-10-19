"""
Servicio de Negocio Crítico 1: Motor Automático FEFO (First Expired, First Out).

Responsabilidades:
1. Bloquear automáticamente cualquier lote cuya fecha de vencimiento haya expirado (`fecha_vencimiento <= hoy`).
2. Seleccionar siempre el lote hábil (`DISPONIBLE` y vigente `fecha_vencimiento > hoy`) más próximo a vencer
   (`ORDER BY fecha_vencimiento ASC, id ASC`).
3. Ejecutar dispensaciones a pacientes (incluyendo control de cuotas GES/Crónicos, trazabilidad de retiro
   por tercero autorizado con validación Módulo 11, y Libro Digital ISP para Estupefacientes/Psicotrópicos).
4. Ejecutar reposiciones de Carros Clínicos (Carro de Paro y Carro Unidosis) desde Bodega aplicando FEFO.
5. Registrar cada transición de inventario en `MovimientoInventario` y en el grafo inmutable `ImmutableAuditDAG`.
"""
import hashlib
from dataclasses import dataclass
from datetime import timedelta
from typing import List, Optional, Tuple

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from ..models import (
    CarroClinico,
    DetalleReceta,
    Dispensacion,
    InscripcionProgramaSalud,
    LibroControladoISP,
    Lote,
    Medicamento,
    MovimientoInventario,
    Paciente,
    RecetaMedica,
    ReposicionCarro,
    StockCarroClinico,
    Usuario,
)
from ..validators import normalizar_rut_chileno, validar_rut_chileno
from .audit_dag_service import AuditDAGService


@dataclass
class AsignacionLoteFEFO:
    """Representa una asignación parcial o total de unidades desde un lote seleccionado por FEFO."""

    lote: Lote
    cantidad_asignada: int
    dias_para_vencer: int
    semaforo: str


class FEFOService:
    """Motor algorítmico FEFO (First Expired, First Out) para Farmacia Asistencial CESFAM."""

    @classmethod
    @transaction.atomic
    def sincronizar_y_bloquear_lotes_vencidos(
        cls,
        actor_user: Optional[Usuario] = None,
    ) -> List[Lote]:
        """
        Escanea el inventario y bloquea automáticamente todos los lotes cuya fecha de vencimiento
        sea menor o igual a la fecha actual (`fecha_vencimiento <= hoy`), cambiando su estado
        a `VENCIDO` y dejando constancia inmutable en `ImmutableAuditDAG`.
        """
        hoy = timezone.localdate()
        lotes_expirados = list(
            Lote.objects.select_for_update()
            .filter(fecha_vencimiento__lte=hoy)
            .exclude(estado_lote=Lote.EstadoLote.VENCIDO)
        )

        for lote in lotes_expirados:
            estado_anterior = lote.estado_lote
            lote.estado_lote = Lote.EstadoLote.VENCIDO
            lote.observaciones_qf = (
                f"{lote.observaciones_qf} | [BLOQUEO AUTOMÁTICO FEFO {hoy.isoformat()}: Lote vencido]"
            ).strip(" |")
            lote.save()

            AuditDAGService.registrar_evento(
                action_type="BLOQUEO_AUTOMATICO_LOTE_VENCIDO_FEFO",
                entity_type="Lote",
                entity_id=lote.numero_lote,
                actor_user=actor_user,
                payload={
                    "numero_lote": lote.numero_lote,
                    "medicamento": lote.medicamento.nombre_generico,
                    "codigo_cenabast": lote.medicamento.codigo_cenabast,
                    "fecha_vencimiento": lote.fecha_vencimiento.isoformat(),
                    "estado_anterior": estado_anterior,
                    "estado_nuevo": Lote.EstadoLote.VENCIDO,
                    "stock_bodega_inmovilizado": lote.stock_bodega,
                    "stock_vitrina_inmovilizado": lote.stock_vitrina,
                },
            )

        return lotes_expirados

    @classmethod
    def obtener_lotes_habiles_fefo(
        cls,
        medicamento: Medicamento,
        origen: str = "VITRINA",
        lock_for_update: bool = False,
    ) -> List[Lote]:
        """
        Retorna la lista de lotes hábiles para un medicamento ordenados estrictamente por FEFO
        (`fecha_vencimiento ASC, id ASC`), excluyendo lotes vencidos o bloqueados.
        """
        hoy = timezone.localdate()
        qs = Lote.objects.filter(
            medicamento=medicamento,
            estado_lote=Lote.EstadoLote.DISPONIBLE,
            fecha_vencimiento__gt=hoy,
        )
        if lock_for_update:
            qs = qs.select_for_update()

        if origen == "VITRINA":
            qs = qs.filter(stock_vitrina__gt=0)
        elif origen == "BODEGA":
            qs = qs.filter(stock_bodega__gt=0)
        else:
            qs = qs.filter(stock_bodega__gt=0) | qs.filter(stock_vitrina__gt=0)

        return list(qs.order_by("fecha_vencimiento", "id"))

    @classmethod
    def seleccionar_lotes_fefo(
        cls,
        *,
        medicamento: Medicamento,
        cantidad_requerida: int,
        origen: str = "VITRINA",
        lock_for_update: bool = False,
    ) -> List[AsignacionLoteFEFO]:
        """
        Algoritmo central FEFO:
        1. Sincroniza y bloquea cualquier lote vencido.
        2. Obtiene únicamente lotes con `estado_lote == 'DISPONIBLE'` y `fecha_vencimiento > hoy`.
        3. Ordena ascendentemente por `fecha_vencimiento` (el que vence antes sale primero).
        4. Asigna las unidades requeridas comenzando por el lote más próximo a vencer.
        5. Si el stock hábil total no cubre `cantidad_requerida`, lanza `ValidationError`
           impidiendo usar lotes vencidos.
        """
        if cantidad_requerida <= 0:
            raise ValidationError("La cantidad requerida para selección FEFO debe ser mayor a cero.")

        cls.sincronizar_y_bloquear_lotes_vencidos()

        lotes_habiles = cls.obtener_lotes_habiles_fefo(
            medicamento=medicamento,
            origen=origen,
            lock_for_update=lock_for_update,
        )

        asignaciones: List[AsignacionLoteFEFO] = []
        restante = cantidad_requerida

        for lote in lotes_habiles:
            disponible = lote.stock_vitrina if origen == "VITRINA" else lote.stock_bodega
            if disponible <= 0:
                continue

            tomar = min(restante, disponible)
            asignaciones.append(
                AsignacionLoteFEFO(
                    lote=lote,
                    cantidad_asignada=tomar,
                    dias_para_vencer=lote.dias_para_vencer,
                    semaforo=lote.semaforo_vencimiento,
                )
            )
            restante -= tomar
            if restante == 0:
                break

        if restante > 0:
            stock_habil_total = cantidad_requerida - restante
            lotes_vencidos_count = Lote.objects.filter(
                medicamento=medicamento,
                fecha_vencimiento__lte=timezone.localdate(),
            ).count()
            raise ValidationError(
                f"Stock hábil FEFO insuficiente en {origen} para '{medicamento.nombre_generico}': "
                f"se solicitaron {cantidad_requerida} unidades, pero solo existen {stock_habil_total} "
                f"unidades vigentes disponibles (Lotes vencidos bloqueados por FEFO: {lotes_vencidos_count})."
            )

        return asignaciones

    @classmethod
    @transaction.atomic
    def traspasar_bodega_a_vitrina_fefo(
        cls,
        *,
        medicamento: Medicamento,
        cantidad: int,
        usuario_responsable: Usuario,
        referencia: str = "TRASPASO-FEFO-INTERNO",
    ) -> List[MovimientoInventario]:
        """
        Abastece la Vitrina de Dispensación desde la Bodega Central seleccionando
        automáticamente el lote hábil más próximo a vencer (FEFO).
        """
        asignaciones = cls.seleccionar_lotes_fefo(
            medicamento=medicamento,
            cantidad_requerida=cantidad,
            origen="BODEGA",
            lock_for_update=True,
        )

        movimientos = []
        for item in asignaciones:
            lote = item.lote
            lote.stock_bodega -= item.cantidad_asignada
            lote.stock_vitrina += item.cantidad_asignada
            lote.save()

            mov = MovimientoInventario.objects.create(
                tipo_movimiento=MovimientoInventario.TipoMovimiento.TRASPASO_BODEGA_VITRINA,
                medicamento=medicamento,
                lote=lote,
                cantidad=item.cantidad_asignada,
                ubicacion_origen="BODEGA",
                ubicacion_destino="VITRINA",
                stock_bodega_resultante=lote.stock_bodega,
                stock_vitrina_resultante=lote.stock_vitrina,
                usuario_responsable=usuario_responsable,
                referencia_operacion=referencia,
            )
            movimientos.append(mov)

            AuditDAGService.registrar_evento(
                action_type="TRASPASO_BODEGA_VITRINA_FEFO",
                entity_type="Lote",
                entity_id=lote.numero_lote,
                actor_user=usuario_responsable,
                payload={
                    "medicamento": medicamento.nombre_generico,
                    "numero_lote": lote.numero_lote,
                    "fecha_vencimiento": lote.fecha_vencimiento.isoformat(),
                    "cantidad_traspasada": item.cantidad_asignada,
                    "stock_bodega_resultante": lote.stock_bodega,
                    "stock_vitrina_resultante": lote.stock_vitrina,
                },
            )
        return movimientos

    @classmethod
    @transaction.atomic
    def dispensar_medicamento_fefo(
        cls,
        *,
        receta: RecetaMedica,
        medicamento: Medicamento,
        cantidad_a_dispensar: int,
        usuario_dispensador: Usuario,
        usuario_autorizador_qf: Optional[Usuario] = None,
        inscripcion_programa: Optional[InscripcionProgramaSalud] = None,
        es_retiro_tercero: bool = False,
        tercero_nombre: str = "",
        tercero_rut: str = "",
        tercero_parentesco: str = "",
        tercero_telefono: str = "",
        observaciones: str = "",
        ip_address: str = "127.0.0.1",
    ) -> List[Dispensacion]:
        """
        Ejecuta una dispensación asistencial aplicando el motor FEFO y todas las reglas
        sanitarias de salud pública:
        - Valida vigencia de la receta médica.
        - Si el fármaco es controlado (Estupefaciente/Psicotrópico), exige receta RETENIDA
          y autorización de un Químico Farmacéutico (QF), generando asiento en `LibroControladoISP`.
        - Si es retiro por tercero autorizado (RF-11), valida RUT Módulo 11 del tercero.
        - Si corresponde a programa GES/AUGE o Crónicos (RF-10), valida y descuenta cuota.
        - Selecciona automáticamente el(los) lote(s) hábil(es) más próximo(s) a vencer (FEFO).
        - Registra cada evento en `ImmutableAuditDAG` (ALCOA+).
        """
        if not receta.esta_vigente:
            raise ValidationError(
                f"La receta '{receta.folio_receta}' no se encuentra vigente o ya fue dispensada en su totalidad."
            )

        # Validación de rol del dispensador (solo Técnico en Farmacia o Químico Farmacéutico)
        if usuario_dispensador.codigo_rol not in ("TECNICO", "QF", "ADMIN"):
            raise ValidationError(
                f"El usuario '{usuario_dispensador.username}' con rol '{usuario_dispensador.codigo_rol}' "
                "no posee atribuciones para dispensar medicamentos."
            )

        # Validación estricta de Medicamento Controlado (Decreto 404/405 ISP)
        if medicamento.es_controlado:
            if receta.tipo_receta != RecetaMedica.TipoReceta.RETENIDA:
                raise ValidationError(
                    f"El medicamento controlado '{medicamento.nombre_generico}' ({medicamento.tipo_controlado}) "
                    "exige obligatoriamente una Receta Retenida."
                )
            if not usuario_autorizador_qf and usuario_dispensador.codigo_rol == "QF":
                usuario_autorizador_qf = usuario_dispensador
            if not usuario_autorizador_qf or usuario_autorizador_qf.codigo_rol != "QF":
                raise ValidationError(
                    f"La dispensación de '{medicamento.nombre_generico}' ({medicamento.tipo_controlado}) "
                    "requiere autorización explícita de un Químico Farmacéutico (QF)."
                )

        # Validación de Retiro por Tercero Autorizado (RF-11)
        if es_retiro_tercero:
            if not tercero_nombre.strip() or not tercero_rut.strip() or not tercero_parentesco.strip():
                raise ValidationError(
                    "Para retiro por tercero autorizado es obligatorio indicar nombre, RUT y parentesco."
                )
            validar_rut_chileno(tercero_rut)
            tercero_rut = normalizar_rut_chileno(tercero_rut)

        # Validación y actualización de detalle de receta si existe
        detalle = DetalleReceta.objects.select_for_update().filter(
            receta=receta,
            medicamento=medicamento,
        ).first()
        if detalle and cantidad_a_dispensar > detalle.saldo_pendiente:
            raise ValidationError(
                f"La cantidad solicitada ({cantidad_a_dispensar}) excede el saldo pendiente de la receta "
                f"({detalle.saldo_pendiente} unidades)."
            )

        # Validación y descuento de cuota en Programa de Salud (GES/AUGE o Crónicos - RF-10)
        numero_cuota_aplicada = None
        if not inscripcion_programa and receta.programa_salud:
            inscripcion_programa = (
                InscripcionProgramaSalud.objects.select_for_update()
                .filter(
                    paciente=receta.paciente,
                    programa=receta.programa_salud,
                    medicamento=medicamento,
                    estado=InscripcionProgramaSalud.EstadoInscripcion.ACTIVA,
                )
                .first()
            )

        if inscripcion_programa:
            if not inscripcion_programa.tiene_cuota_disponible:
                raise ValidationError(
                    f"El paciente {receta.paciente.nombre_completo} no posee cuotas disponibles "
                    f"en el programa '{inscripcion_programa.programa.nombre}'."
                )
            inscripcion_programa.cuotas_consumidas += 1
            numero_cuota_aplicada = inscripcion_programa.cuotas_consumidas
            inscripcion_programa.fecha_ultimo_retiro = timezone.localdate()
            inscripcion_programa.fecha_proximo_retiro = timezone.localdate() + timedelta(
                days=inscripcion_programa.programa.periodicidad_retiro_dias
            )
            if inscripcion_programa.cuotas_pendientes == 0:
                inscripcion_programa.estado = InscripcionProgramaSalud.EstadoInscripcion.FINALIZADA
            inscripcion_programa.save()

        # Selección automática de lote(s) mediante motor FEFO desde Vitrina
        asignaciones = cls.seleccionar_lotes_fefo(
            medicamento=medicamento,
            cantidad_requerida=cantidad_a_dispensar,
            origen="VITRINA",
            lock_for_update=True,
        )

        dispensaciones_creadas: List[Dispensacion] = []
        timestamp_str = timezone.now().strftime("%Y%m%d%H%M%S%f")

        for idx, item in enumerate(asignaciones, start=1):
            lote = item.lote
            saldo_anterior_lote = lote.stock_total
            lote.stock_vitrina -= item.cantidad_asignada
            lote.save()
            saldo_posterior_lote = lote.stock_total

            codigo_disp = f"DISP-{timestamp_str}-{receta.id}-{idx}"
            dispensacion = Dispensacion.objects.create(
                codigo_dispensacion=codigo_disp,
                receta=receta,
                detalle_receta=detalle,
                paciente=receta.paciente,
                medicamento=medicamento,
                lote=lote,
                inscripcion_programa=inscripcion_programa,
                usuario_dispensador=usuario_dispensador,
                usuario_autorizador_qf=usuario_autorizador_qf,
                cantidad_dispensada=item.cantidad_asignada,
                numero_cuota_aplicada=numero_cuota_aplicada,
                es_retiro_tercero=es_retiro_tercero,
                tercero_nombre=tercero_nombre,
                tercero_rut=tercero_rut,
                tercero_parentesco=tercero_parentesco,
                tercero_telefono=tercero_telefono,
                observaciones=observaciones,
            )
            dispensaciones_creadas.append(dispensacion)

            # Registro en MovimientoInventario (RF-17)
            MovimientoInventario.objects.create(
                tipo_movimiento=MovimientoInventario.TipoMovimiento.DISPENSACION_PACIENTE,
                medicamento=medicamento,
                lote=lote,
                cantidad=item.cantidad_asignada,
                ubicacion_origen="VITRINA",
                ubicacion_destino=f"PACIENTE:{receta.paciente.rut}",
                stock_bodega_resultante=lote.stock_bodega,
                stock_vitrina_resultante=lote.stock_vitrina,
                usuario_responsable=usuario_dispensador,
                referencia_operacion=codigo_disp,
            )

            # Si es medicamento controlado (Estupefaciente / Psicotrópico), registrar en Libro Digital ISP
            if medicamento.es_controlado and usuario_autorizador_qf:
                folio_isp = f"ISP-{medicamento.tipo_controlado[:4]}-{timestamp_str}-{idx}"
                firma_qf = hashlib.sha256(
                    f"{folio_isp}|{usuario_autorizador_qf.rut}|{lote.numero_lote}|{item.cantidad_asignada}".encode(
                        "utf-8"
                    )
                ).hexdigest()
                LibroControladoISP.objects.create(
                    folio_libro_isp=folio_isp,
                    dispensacion=dispensacion,
                    medicamento=medicamento,
                    lote=lote,
                    receta_retenida=receta,
                    quimico_farmaceutico=usuario_autorizador_qf,
                    tipo_controlado=medicamento.tipo_controlado,
                    saldo_anterior_lote=saldo_anterior_lote,
                    cantidad_egresada=item.cantidad_asignada,
                    saldo_posterior_lote=saldo_posterior_lote,
                    paciente_rut=receta.paciente.rut,
                    medico_prescriptor_rut=receta.medico_prescriptor_rut,
                    firma_electronica_qf_sha256=firma_qf,
                )

            # Registro Inmutable en el DAG de Auditoría ALCOA+ (Criterio 2.1.4.9)
            AuditDAGService.registrar_evento(
                action_type=(
                    "DISPENSACION_CONTROLADO_ISP_FEFO"
                    if medicamento.es_controlado
                    else "DISPENSACION_ASISTENCIAL_FEFO"
                ),
                entity_type="Dispensacion",
                entity_id=codigo_disp,
                actor_user=usuario_dispensador,
                ip_address=ip_address,
                payload={
                    "codigo_dispensacion": codigo_disp,
                    "folio_receta": receta.folio_receta,
                    "tipo_receta": receta.tipo_receta,
                    "paciente_rut": receta.paciente.rut,
                    "paciente_nombre": receta.paciente.nombre_completo,
                    "tramo_fonasa": receta.paciente.tramo_fonasa,
                    "medicamento_codigo_cenabast": medicamento.codigo_cenabast,
                    "medicamento_nombre": medicamento.nombre_generico,
                    "es_controlado_isp": medicamento.es_controlado,
                    "tipo_controlado": medicamento.tipo_controlado,
                    "lote_seleccionado_fefo": lote.numero_lote,
                    "lote_fecha_vencimiento": lote.fecha_vencimiento.isoformat(),
                    "lote_semaforo": item.semaforo,
                    "cantidad_dispensada": item.cantidad_asignada,
                    "stock_vitrina_antes": lote.stock_vitrina + item.cantidad_asignada,
                    "stock_vitrina_despues": lote.stock_vitrina,
                    "programa_salud": (
                        inscripcion_programa.programa.codigo_minsal if inscripcion_programa else None
                    ),
                    "numero_cuota_aplicada": numero_cuota_aplicada,
                    "retiro_tercero": {
                        "es_retiro_tercero": es_retiro_tercero,
                        "tercero_rut": tercero_rut if es_retiro_tercero else None,
                        "tercero_nombre": tercero_nombre if es_retiro_tercero else None,
                        "tercero_parentesco": tercero_parentesco if es_retiro_tercero else None,
                    },
                    "autorizador_qf_rut": (
                        usuario_autorizador_qf.rut if usuario_autorizador_qf else None
                    ),
                },
            )

        if detalle:
            detalle.cantidad_dispensada += cantidad_a_dispensar
            detalle.save()
            # Actualizar estado general de la receta
            todos_los_detalles = list(receta.detalles.all())
            if all(d.saldo_pendiente == 0 for d in todos_los_detalles):
                receta.estado = RecetaMedica.EstadoReceta.DISPENSADA_TOTAL
            else:
                receta.estado = RecetaMedica.EstadoReceta.DISPENSADA_PARCIAL
            receta.save()

        return dispensaciones_creadas

    @classmethod
    @transaction.atomic
    def aprobar_y_ejecutar_reposicion_carro_fefo(
        cls,
        *,
        reposicion: ReposicionCarro,
        usuario_ejecutor: Usuario,
        nuevo_sello_seguridad: str,
        ip_address: str = "127.0.0.1",
    ) -> ReposicionCarro:
        """
        Ejecuta la aprobación de una solicitud de reposición de Carro Clínico (Carro de Paro
        o Carro Unidosis - Historia de Usuario 2), descontando automáticamente desde Bodega
        el lote hábil más próximo a vencer (FEFO) y actualizando el stock del carro.
        """
        if reposicion.estado != ReposicionCarro.EstadoReposicion.SOLICITADA:
            raise ValidationError(
                f"La solicitud de reposición '{reposicion.codigo_solicitud}' ya fue procesada ({reposicion.estado})."
            )

        if usuario_ejecutor.codigo_rol not in ("TECNICO", "QF", "ADMIN"):
            raise ValidationError(
                "Solo un Técnico en Farmacia o Químico Farmacéutico puede aprobar y ejecutar reposiciones de carros."
            )

        carro = CarroClinico.objects.select_for_update().get(pk=reposicion.carro_id)

        for detalle in reposicion.detalles.select_related("medicamento").all():
            asignaciones = cls.seleccionar_lotes_fefo(
                medicamento=detalle.medicamento,
                cantidad_requerida=detalle.cantidad_solicitada,
                origen="BODEGA",
                lock_for_update=True,
            )

            lote_principal = asignaciones[0].lote
            for item in asignaciones:
                lote = item.lote
                lote.stock_bodega -= item.cantidad_asignada
                lote.save()

                MovimientoInventario.objects.create(
                    tipo_movimiento=MovimientoInventario.TipoMovimiento.REPOSICION_CARRO,
                    medicamento=detalle.medicamento,
                    lote=lote,
                    cantidad=item.cantidad_asignada,
                    ubicacion_origen="BODEGA",
                    ubicacion_destino=f"CARRO:{carro.codigo_carro}",
                    stock_bodega_resultante=lote.stock_bodega,
                    stock_vitrina_resultante=lote.stock_vitrina,
                    usuario_responsable=usuario_ejecutor,
                    referencia_operacion=reposicion.codigo_solicitud,
                )

            detalle.cantidad_repuesta = detalle.cantidad_solicitada
            detalle.lote_origen_fefo = lote_principal
            detalle.save()

            dotacion, _ = StockCarroClinico.objects.select_for_update().get_or_create(
                carro=carro,
                medicamento=detalle.medicamento,
                defaults={
                    "lote_asignado": lote_principal,
                    "cantidad_estandar": detalle.cantidad_solicitada,
                    "cantidad_actual": 0,
                },
            )
            dotacion.lote_asignado = lote_principal
            dotacion.cantidad_actual += detalle.cantidad_repuesta
            dotacion.save()

        reposicion.aprobado_por = usuario_ejecutor
        reposicion.estado = ReposicionCarro.EstadoReposicion.APROBADA_EJECUTADA
        reposicion.nuevo_sello_seguridad = nuevo_sello_seguridad
        reposicion.fecha_ejecucion = timezone.now()
        reposicion.save()

        carro.codigo_sello_seguridad = nuevo_sello_seguridad
        carro.estado = CarroClinico.EstadoCarro.SELLADO_OPERATIVO
        carro.ultima_revision = timezone.now()
        carro.save()

        AuditDAGService.registrar_evento(
            action_type="REPOSICION_CARRO_CLINICO_FEFO",
            entity_type="ReposicionCarro",
            entity_id=reposicion.codigo_solicitud,
            actor_user=usuario_ejecutor,
            ip_address=ip_address,
            payload={
                "codigo_solicitud": reposicion.codigo_solicitud,
                "carro_codigo": carro.codigo_carro,
                "tipo_carro": carro.tipo_carro,
                "solicitado_por_rut": reposicion.solicitado_por.rut,
                "aprobado_por_rut": usuario_ejecutor.rut,
                "nuevo_sello_seguridad": nuevo_sello_seguridad,
                "items_repuestos": [
                    {
                        "medicamento": d.medicamento.nombre_generico,
                        "cantidad_repuesta": d.cantidad_repuesta,
                        "lote_fefo_asignado": (
                            d.lote_origen_fefo.numero_lote if d.lote_origen_fefo else None
                        ),
                    }
                    for d in reposicion.detalles.select_related("medicamento", "lote_origen_fefo")
                ],
            },
        )
        return reposicion
