"""
Servicio de Generación y Exportación de Reportes Institucionales en PDF y Excel (RF-16).
Genera documentos PDF nativos (`%PDF-1.4`) y planillas compatibles con Microsoft Excel (CSV UTF-8 con BOM)
para:
1. Inventario Bodega/Vitrina y Semáforo de Lotes FEFO.
2. Historial de Dispensaciones GES/AUGE y Pacientes Crónicos.
3. Libro Digital Oficial de Estupefacientes y Psicotrópicos (ISP).
4. Sugerencias de Abastecimiento CENABAST (Predicción de Demanda a 90 días).
"""
import csv
import io
from django.utils import timezone
from ..models import Dispensacion, LibroControladoISP, Lote
from .demand_prediction_service import DemandPredictionService


class ReportExportService:
    """Generador institucional de reportes exportables en PDF y Excel para el CESFAM."""

    @staticmethod
    def generar_excel_csv_bytes(tipo_reporte: str = "inventario_fefo") -> bytes:
        """
        Genera una planilla estructurada compatible con Microsoft Excel (UTF-8 con BOM `\\ufeff`).
        """
        buffer = io.StringIO()
        buffer.write("\ufeff")  # BOM para apertura directa en Microsoft Excel con tildes
        writer = csv.writer(buffer, delimiter=";")

        ahora_str = timezone.now().strftime("%Y-%m-%d %H:%M:%S")
        writer.writerow(["SISTEMA WEB DE GESTION FARMACIA ASISTENCIAL CESFAM - MINSAL"])
        writer.writerow(["Tipo de Reporte", tipo_reporte.upper(), "Fecha Generacion", ahora_str])
        writer.writerow([])

        if tipo_reporte == "dispensaciones":
            writer.writerow(
                [
                    "Folio Dispensacion",
                    "Fecha",
                    "Paciente RUT",
                    "Paciente Nombre",
                    "Medicamento",
                    "Lote FEFO",
                    "Cantidad",
                    "Retiro Tercero",
                    "Tercero RUT",
                ]
            )
            for d in Dispensacion.objects.select_related("paciente", "medicamento", "lote").all():
                writer.writerow(
                    [
                        d.codigo_dispensacion,
                        d.fecha_dispensacion.strftime("%Y-%m-%d %H:%M"),
                        d.paciente.rut,
                        d.paciente.nombre_completo,
                        d.medicamento.nombre_generico,
                        d.lote.numero_lote,
                        d.cantidad_dispensada,
                        "SI" if d.es_retiro_tercero else "NO",
                        d.tercero_rut or "-",
                    ]
                )
        elif tipo_reporte == "libro_isp":
            writer.writerow(
                [
                    "Folio Libro ISP",
                    "Tipo Controlado",
                    "Medicamento",
                    "Lote",
                    "Saldo Anterior",
                    "Egreso",
                    "Saldo Posterior",
                    "Paciente RUT",
                    "Q.F. Autorizador",
                ]
            )
            for reg in LibroControladoISP.objects.select_related(
                "medicamento", "lote", "quimico_farmaceutico"
            ).all():
                writer.writerow(
                    [
                        reg.folio_libro_isp,
                        reg.tipo_controlado,
                        reg.medicamento.nombre_generico,
                        reg.lote.numero_lote,
                        reg.saldo_anterior_lote,
                        reg.cantidad_egresada,
                        reg.saldo_posterior_lote,
                        reg.paciente_rut,
                        reg.quimico_farmaceutico.rut,
                    ]
                )
        elif tipo_reporte == "prediccion_cenabast":
            reporte = DemandPredictionService.generar_reporte_prediccion_global(horizonte_dias=90)
            writer.writerow(
                [
                    "Codigo CENABAST",
                    "Medicamento",
                    "Stock Habil Actual",
                    "Demanda 90 Dias",
                    "Autonomia (Dias)",
                    "Nivel Riesgo",
                    "Sugerencia Compra CENABAST",
                ]
            )
            for item in reporte["predicciones_por_medicamento"]:
                writer.writerow(
                    [
                        item["codigo_cenabast"],
                        f"{item['nombre_generico']} {item['concentracion']}",
                        item["inventario_actual"]["stock_util_total"],
                        item["proyeccion_demanda_90_dias"]["demanda_total_proyectada_90_dias"],
                        item["indicadores_riesgo_y_abastecimiento"]["dias_autonomia_estimados"],
                        item["indicadores_riesgo_y_abastecimiento"]["nivel_riesgo_quiebre"],
                        item["indicadores_riesgo_y_abastecimiento"][
                            "sugerencia_abastecimiento_cenabast_unidades"
                        ],
                    ]
                )
        else:
            writer.writerow(
                [
                    "Codigo CENABAST",
                    "Medicamento",
                    "Numero Lote",
                    "Fecha Vencimiento",
                    "Dias para Vencer",
                    "Semaforo FEFO",
                    "Estado Lote",
                    "Stock Bodega",
                    "Stock Vitrina",
                    "Stock Total",
                ]
            )
            for lote in Lote.objects.select_related("medicamento").all():
                writer.writerow(
                    [
                        lote.medicamento.codigo_cenabast,
                        lote.medicamento.nombre_generico,
                        lote.numero_lote,
                        lote.fecha_vencimiento.isoformat(),
                        lote.dias_para_vencer,
                        lote.semaforo_vencimiento,
                        lote.estado_lote,
                        lote.stock_bodega,
                        lote.stock_vitrina,
                        lote.stock_total,
                    ]
                )

        return buffer.getvalue().encode("utf-8")

    @staticmethod
    def generar_pdf_bytes(tipo_reporte: str = "inventario_fefo") -> bytes:
        """
        Construye un documento binario PDF 1.4 estándar (`%PDF-1.4`) con el resumen ejecutivo
        de la Farmacia Asistencial CESFAM sin requerir librerías externas de compilación C.
        """
        lineas = [
            "REPUBLICA DE CHILE - MINISTERIO DE SALUD (MINSAL)",
            "SISTEMA WEB DE GESTION FARMACIA ASISTENCIAL CESFAM",
            f"REPORTE OFICIAL: {tipo_reporte.upper()} | FECHA: {timezone.localdate().isoformat()}",
            "------------------------------------------------------------------------",
        ]

        for lote in Lote.objects.select_related("medicamento").all()[:12]:
            lineas.append(
                f"Lote {lote.numero_lote} | {lote.medicamento.nombre_generico[:22]} | "
                f"Vence: {lote.fecha_vencimiento} [{lote.semaforo_vencimiento}] | "
                f"Bod:{lote.stock_bodega} Vit:{lote.stock_vitrina}"
            )

        lineas.append("------------------------------------------------------------------------")
        lineas.append("Documento emitido bajo Norma Sanitaria ALCOA+ ISP y Ley 21.198 CENABAST.")

        # Construcción del stream de texto PostScript/PDF
        contenido_stream = ["BT", "/F1 10 Tf", "40 760 Td", "14 TL"]
        for linea in lineas:
            segura = (
                linea.encode("ascii", "replace")
                .decode("ascii")
                .replace("\\", "\\\\")
                .replace("(", "\\(")
                .replace(")", "\\)")
            )
            contenido_stream.append(f"({segura}) Tj T*")
        contenido_stream.append("ET")
        stream_bytes = "\n".join(contenido_stream).encode("ascii")

        objetos = [
            b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
            f"4 0 obj << /Length {len(stream_bytes)} >> stream\n".encode("ascii")
            + stream_bytes
            + b"\nendstream endobj\n",
            b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        ]

        pdf = bytearray(b"%PDF-1.4\n")
        offsets = []
        for obj in objetos:
            offsets.append(len(pdf))
            pdf.extend(obj)

        xref_pos = len(pdf)
        pdf.extend(f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode("ascii"))
        for off in offsets:
            pdf.extend(f"{off:010d} 00000 n \n".encode("ascii"))

        pdf.extend(
            f"trailer << /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
                "ascii"
            )
        )
        return bytes(pdf)
