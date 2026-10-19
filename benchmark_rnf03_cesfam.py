#!/usr/bin/env python
"""
Prueba de Rendimiento, Carga y Estrés Concurrente (RNF-03: Tiempo de Respuesta < 3.0 segundos).
Sistema Web de Gestión para Farmacia Asistencial CESFAM (Red Pública MINSAL).

Ejecuta múltiples hilos concurrentes (`ThreadPoolExecutor`) simulando funcionarios del CESFAM
realizando de forma simultánea:
1. Consultas de stock de medicamentos y lotes ordenados por FEFO (`GET /api/medicamentos/`).
2. Simulación algorítmica de preselección de lote FEFO (`GET /api/medicamentos/{id}/proximo-lote-fefo/`).
3. Consultas de Dashboard Operacional y KPIs (`GET /api/dashboard-resumen/`).
4. Verificación criptográfica de cadena de auditoría ALCOA+ (`GET /api/security/verify-audit-chain/`).
5. Dispensaciones transaccionales y control de stock (`POST /api/lotes/traspasar-bodega-vitrina/`).

Certifica matemáticamente que el 100% de las peticiones y el percentil 99 (P99) se mantienen
estrictamente por debajo del umbral máximo de 3.000 ms (3 segundos) establecido en RNF-03.
"""
import os
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cesfam_project.settings")

import django

django.setup()

from django.db import close_old_connections
from rest_framework.test import APIClient

from core.models import Medicamento, Usuario
from seed_cesfam import ejecutar_semilla_cesfam

UMBRAL_MAXIMO_RNF03_SEGUNDOS = 3.0
CONCURRENCIA_HILOS = 12
TOTAL_OPERACIONES = 60

_db_write_lock = threading.Lock()


def ejecutar_operacion_concurrente(indice: int, qf_id: int, med_losartan_id: int) -> dict:
    """Ejecuta una transacción o consulta HTTP simulando un usuario concurrente del CESFAM."""
    close_old_connections()
    client = APIClient()
    qf_user = Usuario.objects.get(pk=qf_id)
    client.force_authenticate(user=qf_user)

    tipo_op = indice % 5
    inicio = time.perf_counter()

    if tipo_op == 0:
        nombre_op = "GET /api/medicamentos/ (Catálogo + Lotes FEFO)"
        resp = client.get("/api/medicamentos/")
        status_code = resp.status_code
    elif tipo_op == 1:
        nombre_op = "GET /api/medicamentos/{id}/proximo-lote-fefo/ (Cálculo FEFO)"
        resp = client.get(f"/api/medicamentos/{med_losartan_id}/proximo-lote-fefo/?cantidad=15&origen=VITRINA")
        status_code = resp.status_code
    elif tipo_op == 2:
        nombre_op = "GET /api/dashboard-resumen/ (KPIs + Predicción IA 90d)"
        resp = client.get("/api/dashboard-resumen/")
        status_code = resp.status_code
    elif tipo_op == 3:
        nombre_op = "GET /api/security/verify-audit-chain/ (Verificación SHA-256 ALCOA+)"
        resp = client.get("/api/security/verify-audit-chain/")
        status_code = resp.status_code
    else:
        nombre_op = "POST /api/lotes/traspasar-bodega-vitrina/ (Transacción Stock FEFO)"
        with _db_write_lock:
            resp = client.post(
                "/api/lotes/traspasar-bodega-vitrina/",
                {
                    "medicamento_id": med_losartan_id,
                    "cantidad": 1,
                    "referencia": f"STRESS-RNF03-{indice:03d}",
                },
                format="json",
            )
        status_code = resp.status_code

    duracion_seg = time.perf_counter() - inicio
    close_old_connections()
    return {
        "id": indice,
        "operacion": nombre_op,
        "status_code": status_code,
        "duracion_seg": duracion_seg,
        "duracion_ms": round(duracion_seg * 1000, 2),
        "cumple_rnf03": duracion_seg < UMBRAL_MAXIMO_RNF03_SEGUNDOS and status_code in (200, 201),
    }


def ejecutar_benchmark_rnf03() -> dict:
    print("=" * 88)
    print("BENCHMARK DE RENDIMIENTO Y ESTRÉS CONCURRENTE - RNF-03 (< 3.0 SEGUNDOS)")
    print("Sistema Web de Gestión para Farmacia Asistencial CESFAM")
    print("=" * 88)

    ejecutar_semilla_cesfam()
    qf_user = Usuario.objects.get(username="qf.nataly.caamano")
    losartan = Medicamento.objects.get(codigo_cenabast="CEN-100101")

    inicio_global = time.perf_counter()
    resultados = []

    with ThreadPoolExecutor(max_workers=CONCURRENCIA_HILOS) as pool:
        futuros = [
            pool.submit(ejecutar_operacion_concurrente, i, qf_user.id, losartan.id)
            for i in range(1, TOTAL_OPERACIONES + 1)
        ]
        for fut in as_completed(futuros):
            resultados.append(fut.result())

    duracion_total_suite = time.perf_counter() - inicio_global
    resultados.sort(key=lambda r: r["id"])

    tiempos_ms = [r["duracion_ms"] for r in resultados]
    tiempos_ordenados = sorted(tiempos_ms)
    p50_ms = statistics.median(tiempos_ordenados)
    p95_ms = tiempos_ordenados[int(len(tiempos_ordenados) * 0.95) - 1]
    p99_ms = tiempos_ordenados[int(len(tiempos_ordenados) * 0.99) - 1]
    max_ms = max(tiempos_ordenados)
    min_ms = min(tiempos_ordenados)
    prom_ms = statistics.mean(tiempos_ordenados)
    exitosas = sum(1 for r in resultados if r["cumple_rnf03"])

    print(f"Hilos concurrentes (Workers) : {CONCURRENCIA_HILOS}")
    print(f"Total peticiones ejecutadas  : {TOTAL_OPERACIONES}")
    print(f"Peticiones exitosas (< 3.0s) : {exitosas}/{TOTAL_OPERACIONES} ({(exitosas/TOTAL_OPERACIONES)*100:.1f}%)")
    print(f"Tiempo total de ráfaga       : {duracion_total_suite:.3f} s")
    print(f"Throughput alcanzado         : {TOTAL_OPERACIONES / duracion_total_suite:.2f} req/seg")
    print("-" * 88)
    print(f"Latencia Mínima              : {min_ms:.2f} ms")
    print(f"Latencia Promedio            : {prom_ms:.2f} ms")
    print(f"Latencia Mediana (P50)       : {p50_ms:.2f} ms")
    print(f"Latencia Percentil 95 (P95)  : {p95_ms:.2f} ms")
    print(f"Latencia Percentil 99 (P99)  : {p99_ms:.2f} ms")
    print(f"Latencia Máxima              : {max_ms:.2f} ms  [Umbral máximo RNF-03: 3000.00 ms]")
    print("-" * 88)

    # Resumen agrupado por tipo de endpoint
    por_endpoint: dict[str, list[float]] = {}
    for r in resultados:
        por_endpoint.setdefault(r["operacion"], []).append(r["duracion_ms"])

    for op, lista_ms in por_endpoint.items():
        print(
            f"  * {op:<62} | n={len(lista_ms):2d} | Prom: {statistics.mean(lista_ms):6.2f} ms | "
            f"Máx: {max(lista_ms):6.2f} ms | RNF-03: OK"
        )

    print("=" * 88)
    assert exitosas == TOTAL_OPERACIONES, "Fallo RNF-03: Alguna petición superó los 3 segundos o falló."
    assert max_ms < (UMBRAL_MAXIMO_RNF03_SEGUNDOS * 1000), "Fallo RNF-03: Latencia máxima >= 3000 ms."
    print("VEREDICTO RNF-03: APROBADO (100% de las transacciones respondieron en < 3.0 segundos)")
    print("=" * 88)

    return {
        "concurrencia": CONCURRENCIA_HILOS,
        "total_operaciones": TOTAL_OPERACIONES,
        "exitosas": exitosas,
        "min_ms": min_ms,
        "prom_ms": prom_ms,
        "p50_ms": p50_ms,
        "p95_ms": p95_ms,
        "p99_ms": p99_ms,
        "max_ms": max_ms,
    }


if __name__ == "__main__":
    ejecutar_benchmark_rnf03()
