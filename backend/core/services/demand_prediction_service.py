"""
Servicio de Negocio Crítico 2: Algoritmo de Predicción de Demanda a 90 Días y
Sugerencia Automática de Abastecimiento CENABAST (Sección 3.1.3 de Evaluación 1).

Cruza:
1. Cuotas pendientes de pacientes adscritos a Programas de Salud (GES/AUGE y Pacientes Crónicos)
   en un horizonte móvil de 90 días.
2. Patrón histórico de dispensación ambulatoria y consumo en Carros Clínicos (Paro y Unidosis).
3. Stock útil actual (Bodega + Vitrina de lotes vigentes), descontando lotes vencidos (bloqueados por FEFO)
   y alertando sobre lotes próximos a vencer dentro de la ventana de 90 días.
4. Genera sugerencias de solicitud de abastecimiento a CENABAST (Ley 21.198) con margen de seguridad técnico (+15%).
"""
import math
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from ..models import (
    DetalleReposicionCarro,
    Dispensacion,
    InscripcionProgramaSalud,
    Lote,
    Medicamento,
)


class DemandPredictionService:
    """
    Motor predictivo de demanda farmacéutica asistencial a 90 días (IA / Heurística Analítica APS).
    """

    HORIZONTE_DIAS = 90
    FACTOR_SEGURIDAD_CENABAST = 0.15  # +15% margen de seguridad asistencial

    @classmethod
    def analizar_medicamento_90_dias(
        cls,
        medicamento: Medicamento,
        horizonte_dias: int = HORIZONTE_DIAS,
    ) -> Dict[str, Any]:
        """
        Ejecuta el modelo predictivo de 90 días para un medicamento específico del arsenal CESFAM.
        """
        hoy = timezone.localdate()
        fecha_limite_ventana = hoy + timedelta(days=horizonte_dias)

        # 1. Análisis de Lotes por estado FEFO y Semáforo Sanitario
        lotes = list(Lote.objects.filter(medicamento=medicamento))
        stock_bodega_habil = 0
        stock_vitrina_habil = 0
        stock_vencido_bloqueado = 0
        stock_riesgo_vencimiento_90d = 0

        resumen_semaforo = {"VERDE": 0, "AMARILLO": 0, "ROJO": 0}

        for lote in lotes:
            semaforo = lote.semaforo_vencimiento
            resumen_semaforo[semaforo] = resumen_semaforo.get(semaforo, 0) + lote.stock_total

            if lote.esta_vencido or lote.estado_lote != Lote.EstadoLote.DISPONIBLE:
                stock_vencido_bloqueado += lote.stock_total
            else:
                stock_bodega_habil += lote.stock_bodega
                stock_vitrina_habil += lote.stock_vitrina
                if lote.fecha_vencimiento <= fecha_limite_ventana:
                    stock_riesgo_vencimiento_90d += lote.stock_total

        stock_util_actual = stock_bodega_habil + stock_vitrina_habil

        # 2. Demanda Comprometida por Cuotas Pendientes de Pacientes GES/AUGE y Crónicos (Próximos 90 días)
        inscripciones_activas = (
            InscripcionProgramaSalud.objects.select_related("programa", "paciente")
            .filter(
                medicamento=medicamento,
                estado=InscripcionProgramaSalud.EstadoInscripcion.ACTIVA,
                fecha_vencimiento_cobertura__gte=hoy,
            )
        )

        pacientes_ges_count = 0
        pacientes_cronicos_count = 0
        cuotas_comprometidas_90d = 0
        demanda_programas_90d = 0

        for insc in inscripciones_activas:
            cuotas_ventana = insc.calcular_cuotas_en_ventana_dias(dias_horizonte=horizonte_dias)
            if cuotas_ventana > 0:
                unidades_paciente_90d = cuotas_ventana * insc.dosis_mensual_unidades
                cuotas_comprometidas_90d += cuotas_ventana
                demanda_programas_90d += unidades_paciente_90d
                if insc.programa.tipo_programa == "GES_AUGE":
                    pacientes_ges_count += 1
                else:
                    pacientes_cronicos_count += 1

        # 3. Consumo Histórico Basal (Agudo / Morbilidad / Carros Clínicos) en ventana equivalente
        inicio_historico = timezone.now() - timedelta(days=horizonte_dias)
        dispensaciones_sin_programa = (
            Dispensacion.objects.filter(
                medicamento=medicamento,
                inscripcion_programa__isnull=True,
                fecha_dispensacion__gte=inicio_historico,
            ).aggregate(total=Sum("cantidad_dispensada"))["total"]
            or 0
        )
        consumo_carros = (
            DetalleReposicionCarro.objects.filter(
                medicamento=medicamento,
                reposicion__fecha_solicitud__gte=inicio_historico,
            ).aggregate(total=Sum("cantidad_solicitada"))["total"]
            or 0
        )

        # Si es fármaco de morbilidad aguda o carro de paro sin cuotas crónicas, proyectar base mínima asistencial
        demanda_basal_no_programada_90d = dispensaciones_sin_programa + consumo_carros
        if demanda_programas_90d == 0 and demanda_basal_no_programada_90d < medicamento.stock_minimo_alerta:
            demanda_basal_no_programada_90d = max(
                demanda_basal_no_programada_90d,
                medicamento.stock_minimo_alerta,
            )

        demanda_total_proyectada_90d = demanda_programas_90d + demanda_basal_no_programada_90d

        # 4. Cálculo de Autonomía, Riesgo de Quiebre y Sugerencia de Abastecimiento CENABAST
        consumo_diario_estimado = (
            demanda_total_proyectada_90d / float(horizonte_dias)
            if demanda_total_proyectada_90d > 0
            else 0.0
        )
        dias_autonomia = (
            int(round(stock_util_actual / consumo_diario_estimado))
            if consumo_diario_estimado > 0
            else 999
        )

        margen_seguridad_unidades = int(
            math.ceil(demanda_total_proyectada_90d * cls.FACTOR_SEGURIDAD_CENABAST)
        )
        requerimiento_bruto_90d = demanda_total_proyectada_90d + margen_seguridad_unidades
        balance_proyectado_90d = stock_util_actual - demanda_total_proyectada_90d
        deficit_bruto_cenabast = max(0, requerimiento_bruto_90d - stock_util_actual)

        # Redondeo a múltiplo logístico estándar CENABAST (10 para inyectables, 100 para formas sólidas)
        multiplo_cenabast = (
            10
            if medicamento.forma_farmaceutica
            in ("SOLUCION_INYECTABLE", "SUSPENSION_INYECTABLE")
            else 100
        )
        sugerencia_compra_cenabast = (
            int(math.ceil(deficit_bruto_cenabast / multiplo_cenabast) * multiplo_cenabast)
            if deficit_bruto_cenabast > 0
            else 0
        )

        # Clasificación de Nivel de Riesgo de Quiebre de Stock
        if (
            stock_util_actual <= medicamento.stock_critico_alerta
            or dias_autonomia < 30
        ):
            nivel_riesgo = "CRITICO"
            accion_recomendada = (
                "SOLICITUD URGENTE CENABAST / INTERCAMBIO RED APS: Riesgo inminente de quiebre "
                "de stock (< 30 días de autonomía o bajo umbral crítico)."
            )
        elif (
            stock_util_actual < demanda_total_proyectada_90d
            or dias_autonomia < 60
        ):
            nivel_riesgo = "ALTO"
            accion_recomendada = (
                "PROGRAMAR PEDIDO CENABAST PRIORITARIO: El stock hábil actual no alcanza a cubrir "
                "las cuotas comprometidas GES/Crónicos de los próximos 90 días."
            )
        elif (
            stock_util_actual < requerimiento_bruto_90d
            or stock_riesgo_vencimiento_90d > 0
        ):
            nivel_riesgo = "MEDIO"
            accion_recomendada = (
                "INCLUIR EN PROGRAMACIÓN MENSUAL CENABAST: Cubre demanda basal pero requiere "
                "recomponer el margen de seguridad del 15% o rotar lotes en semáforo amarillo."
            )
        else:
            nivel_riesgo = "OPTIMO"
            accion_recomendada = (
                "ABASTECIMIENTO ÓPTIMO: Stock hábil cubre el 100% de las cuotas GES/Crónicos "
                "de los próximos 90 días más el margen de seguridad técnico."
            )

        return {
            "medicamento_id": medicamento.id,
            "codigo_cenabast": medicamento.codigo_cenabast,
            "nombre_generico": medicamento.nombre_generico,
            "concentracion": medicamento.concentracion,
            "forma_farmaceutica": medicamento.forma_farmaceutica,
            "es_controlado_isp": medicamento.es_controlado,
            "tipo_controlado": medicamento.tipo_controlado,
            "horizonte_analisis_dias": horizonte_dias,
            "inventario_actual": {
                "stock_bodega_habil": stock_bodega_habil,
                "stock_vitrina_habil": stock_vitrina_habil,
                "stock_util_total": stock_util_actual,
                "stock_vencido_bloqueado_fefo": stock_vencido_bloqueado,
                "stock_vence_dentro_90_dias": stock_riesgo_vencimiento_90d,
                "distribucion_semaforo_lotes": resumen_semaforo,
            },
            "proyeccion_demanda_90_dias": {
                "pacientes_ges_activos": pacientes_ges_count,
                "pacientes_cronicos_activos": pacientes_cronicos_count,
                "cuotas_pendientes_90_dias": cuotas_comprometidas_90d,
                "demanda_programas_ges_cronicos_unidades": demanda_programas_90d,
                "demanda_basal_morbilidad_carros_unidades": demanda_basal_no_programada_90d,
                "demanda_total_proyectada_90_dias": demanda_total_proyectada_90d,
                "margen_seguridad_15_pct": margen_seguridad_unidades,
                "requerimiento_bruto_90_dias": requerimiento_bruto_90d,
            },
            "indicadores_riesgo_y_abastecimiento": {
                "consumo_diario_estimado": round(consumo_diario_estimado, 2),
                "dias_autonomia_estimados": dias_autonomia,
                "balance_proyectado_90_dias": balance_proyectado_90d,
                "nivel_riesgo_quiebre": nivel_riesgo,
                "sugerencia_abastecimiento_cenabast_unidades": sugerencia_compra_cenabast,
                "multiplo_embalaje_cenabast": multiplo_cenabast,
                "normativa_abastecimiento": "Ley N° 21.198 CENABAST - Sector Público APS",
                "accion_recomendada": accion_recomendada,
            },
        }

    @classmethod
    def generar_reporte_prediccion_global(
        cls,
        horizonte_dias: int = HORIZONTE_DIAS,
    ) -> Dict[str, Any]:
        """
        Genera el informe consolidado de Predicción de Demanda a 90 días y sugerencias CENABAST
        para todo el arsenal farmacológico activo del CESFAM.
        """
        medicamentos = Medicamento.objects.select_related("categoria").filter(activo=True)
        resultados = [
            cls.analizar_medicamento_90_dias(med, horizonte_dias=horizonte_dias)
            for med in medicamentos
        ]

        # Ordenar por criticidad (CRITICO -> ALTO -> MEDIO -> OPTIMO)
        prioridad_orden = {"CRITICO": 0, "ALTO": 1, "MEDIO": 2, "OPTIMO": 3}
        resultados.sort(
            key=lambda r: (
                prioridad_orden.get(
                    r["indicadores_riesgo_y_abastecimiento"]["nivel_riesgo_quiebre"], 9
                ),
                r["indicadores_riesgo_y_abastecimiento"]["dias_autonomia_estimados"],
            )
        )

        conteo_riesgo = {"CRITICO": 0, "ALTO": 0, "MEDIO": 0, "OPTIMO": 0}
        total_unidades_sugeridas_cenabast = 0
        for r in resultados:
            riesgo = r["indicadores_riesgo_y_abastecimiento"]["nivel_riesgo_quiebre"]
            conteo_riesgo[riesgo] = conteo_riesgo.get(riesgo, 0) + 1
            total_unidades_sugeridas_cenabast += r["indicadores_riesgo_y_abastecimiento"][
                "sugerencia_abastecimiento_cenabast_unidades"
            ]

        return {
            "establecimiento": settings.CESFAM_CONFIG["ESTABLECIMIENTO_NOMBRE"],
            "fecha_generacion": timezone.now().isoformat(),
            "horizonte_prediccion_dias": horizonte_dias,
            "resumen_ejecutivo": {
                "total_medicamentos_evaluados": len(resultados),
                "distribucion_riesgo_quiebre": conteo_riesgo,
                "total_unidades_a_solicitar_cenabast": total_unidades_sugeridas_cenabast,
            },
            "predicciones_por_medicamento": resultados,
        }
